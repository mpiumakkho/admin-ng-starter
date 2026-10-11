import { Injectable } from '@angular/core';

import {
  activeRoleIds, administratorRemains, allows, branchesWith, canGiveRole, canManageRole, canManageUser, Grants, grantsOf, holdsAll,
  permissionsOf, roleAssignmentState, roleConflict, SELF_EDITABLE_FIELDS,
} from './access-rules';
import { AdminApi, AdminApiError } from './admin-api';
import { ALL_PERMISSIONS, DEFAULT_ASSIGNMENT_RULES, DEFAULT_SETTINGS, REASON_ACTIONS, ROLE_TONES, STATUS_META } from './catalog';
import { AdminData, BUILT_IN_ROLES, createMockData, createMockSessions, EmailLink, SAMPLE_ROLE_CONFLICTS } from './mock-data';
import {
  Activity, ActivityAction, ActivityChange, ActivityRange, AdminSettings, Branch, BranchChanges, BranchDraft, fullName, PasswordPolicy,
  Permission, ReasonAction, Role, RoleAssignment, RoleAssignmentBatch, RoleAssignmentChanges, RoleAssignmentDraft, RoleAssignmentRules,
  RoleConflict, RoleConflictDraft, RoleDraft, RoleGrant, TwoFactorConfirmation, TwoFactorSetup, User, UserChanges, UserDraft, UserSession, UserStatus,
} from './models';
import { createSecret, otpauthUri, verifyTotp } from './totp';
import { uuidV7 } from './uuid';

const STORAGE_KEY = 'admin-data-v7';
/** This browser's session id: kept in sessionStorage, or in localStorage with "Keep me signed in" */
const SESSION_KEY = 'admin-session';
/** The name authenticator apps show next to the codes */
const ISSUER = 'Admin';
/** How often a session's "last seen" time is brought up to date */
const SEEN_EVERY_MS = 60_000;
// A short pause on every call, so loading states show as they would against a real server
const LATENCY_MS = 250;
/** The sample sign-in takes any password this long, until someone sets their own */
const MIN_PASSWORD_LENGTH = 6;
/** How long a password reset link works; invitations follow the settings */
const RESET_LINK_MS = 60 * 60_000;
/** How many earlier passwords are kept per user, for the settings' passwordHistory */
const HISTORY_KEPT = 24;
const DAY_MS = 24 * 60 * 60_000;
/** The longest reason an assignment may give */
const MAX_REASON_LENGTH = 500;
/** Recovery codes: how many, and the letters and digits they are made of, without the ones easy to mix up */
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** User fields the activity log tracks, in the order it lists them; also every field PATCH /users/:id may set */
const USER_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'department', 'branchId', 'status', 'avatar'] as const;
/** A branch code: short letters, digits and dashes */
const BRANCH_CODE = /^[A-Za-z0-9-]{1,10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * AdminApi backed by localStorage, seeded with sample data on first use. It plays the server's part: it knows
 * who is signed in, checks their permissions (see access-rules.ts) and writes the activity log.
 * Clear the "admin-data-v7" key in the browser to start over.
 */
@Injectable()
export class LocalAdminApi extends AdminApi {
  private data: AdminData = this.read();
  // A real server reads these from the request. Here every request comes from this browser on this machine.
  private readonly client = { ip: '127.0.0.1', ...describeBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent) };

  /* Session */

  async getSession(): Promise<User | null> {
    // Another tab may have changed the data; reading it again keeps this tab from writing back an old copy
    this.data = this.read();
    const current = this.currentSession();
    if (!current) {
      clearSession();
    }
    return this.respond(current?.user ?? null);
  }

  async signIn(email: string, password: string, remember: boolean, code?: string): Promise<User> {
    this.data = this.read();
    const user = this.data.users.find(item => item.email.toLowerCase() === email.trim().toLowerCase());
    // The sample accepts any password of the right length, or the one the person set; a server checks the real one
    if (!user || !(await this.passwordMatches(user.id, password))) {
      await this.respond(undefined);
      throw new AdminApiError('invalid_credentials');
    }
    if (user.status !== 'active') {
      await this.respond(undefined);
      throw new AdminApiError(user.status === 'suspended' ? 'account_suspended' : 'invite_pending');
    }
    await this.checkCode(user, code);
    const now = new Date().toISOString();
    const signedIn = { ...user, lastActiveAt: now };
    this.data.users = this.data.users.map(item => item.id === user.id ? signedIn : item);
    const session: UserSession = { id: `s-${crypto.randomUUID().slice(0, 12)}`, userId: user.id, createdAt: now, lastSeenAt: now, ...this.client };
    this.data.sessions = [...this.data.sessions, session];
    this.data.verifiedAt = { ...this.data.verifiedAt, [session.id]: now };
    this.log(user.id, 'auth.sign_in', fullName(user), user.id);
    clearSession();
    writeStore(remember ? localStorage : sessionStorage, SESSION_KEY, session.id);
    return this.respond(signedIn);
  }

  async signOut(): Promise<void> {
    this.data = this.read();
    const current = this.currentSession();
    this.data.sessions = this.data.sessions.filter(session => session.id !== current?.session.id);
    clearSession();
    return this.respond(undefined);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const actor = this.actor();
    if (!(await this.passwordMatches(actor.id, currentPassword))) {
      await this.respond(undefined);
      throw new AdminApiError('invalid_credentials');
    }
    await this.checkNewPassword(actor.id, newPassword);
    await this.savePassword(actor.id, newPassword);
    // Anyone who knew the old password is signed out everywhere else
    const here = this.currentSession()?.session.id;
    this.data.sessions = this.data.sessions.filter(session => session.userId !== actor.id || session.id === here);
    this.log(actor.id, 'user.password_changed', fullName(actor), actor.id);
    return this.respond(undefined);
  }

  async reauthenticate(password: string, code?: string): Promise<void> {
    const actor = this.actor();
    if (!(await this.passwordMatches(actor.id, String(password ?? '')))) {
      await this.respond(undefined);
      throw new AdminApiError('invalid_credentials');
    }
    await this.checkCode(actor, code);
    const session = this.currentSession()!.session;
    this.data.verifiedAt = { ...this.data.verifiedAt, [session.id]: new Date().toISOString() };
    return this.respond(undefined);
  }

  /* Links in emails. There is no mail server here: each email is written to the browser console instead. */

  async acceptInvitation(token: string, password: string): Promise<void> {
    this.data = this.read();
    const { user, setPassword } = await this.useLink(token, 'invite', password);
    await setPassword();
    this.log(user.id, 'user.password_changed', fullName(user), user.id);
    if (user.status === 'invited') {
      this.data.users = this.data.users.map(item => item.id === user.id ? { ...item, status: 'active' } : item);
      this.log(user.id, 'user.activated', fullName(user), user.id, [{ field: 'status', from: 'invited', to: 'active' }]);
    }
    return this.respond(undefined);
  }

  /** Answers the same whether or not the email belongs to someone, so the answer gives nothing away */
  async requestPasswordReset(email: string): Promise<void> {
    this.data = this.read();
    check(typeof email === 'string');
    const user = this.data.users.find(item => item.email.toLowerCase() === email.trim().toLowerCase());
    // Someone invited gets the invitation again; a suspended account gets nothing
    if (user?.status === 'active') {
      this.sendLink(user, 'reset');
    } else if (user?.status === 'invited') {
      this.sendLink(user, 'invite');
    }
    return this.respond(undefined);
  }

  async confirmPasswordReset(token: string, password: string): Promise<void> {
    this.data = this.read();
    const { user, setPassword } = await this.useLink(token, 'reset', password);
    await setPassword();
    // Whoever knew the old password is signed out everywhere
    this.data.sessions = this.data.sessions.filter(session => session.userId !== user.id);
    this.log(user.id, 'user.password_changed', fullName(user), user.id);
    return this.respond(undefined);
  }

  async getPasswordPolicy(): Promise<PasswordPolicy> {
    this.data = this.read();
    const { passwordMinLength, passwordHistory } = this.data.settings;
    return this.respond({ minLength: passwordMinLength, history: passwordHistory });
  }

  /* Users */

  async listUsers(): Promise<User[]> {
    const actor = this.actor();
    const grants = this.grants(actor);
    if (grants.organization.has('users.view')) {
      return this.respond(this.data.users);
    }
    // Through branches, their people (API.md, "Branch administrators"); without it, people still see their own account
    const branches = branchesWith(grants, 'users.view');
    return this.respond(this.data.users.filter(user => user.id === actor.id || (!!user.branchId && branches.includes(user.branchId))));
  }

  async createUser(input: UserDraft): Promise<User> {
    const actor = this.actor('users.create');
    const draft = userDraft(input);
    this.assertCanCreate(actor, draft);
    // A new user's roles are roles given
    this.assertReauthenticated();
    return this.respond(this.addUser(actor, draft));
  }

  async createUsers(input: UserDraft[]): Promise<User[]> {
    const actor = this.actor('users.create');
    if (!Array.isArray(input)) {
      throw new AdminApiError('invalid_request');
    }
    const drafts = input.map(userDraft);
    // Check every row before adding any, so a refused import changes nothing
    const emails = new Set<string>();
    for (const draft of drafts) {
      this.assertCanCreate(actor, draft);
      const email = draft.email.trim().toLowerCase();
      if (emails.has(email)) {
        throw new AdminApiError('email_taken');
      }
      emails.add(email);
    }
    this.assertReauthenticated();
    return this.respond(drafts.map(draft => this.addUser(actor, draft)));
  }

  async updateUser(id: string, input: UserChanges): Promise<User> {
    const actor = this.actor();
    const current = this.findManageable(actor, id, 'users.edit');
    const changes = userChanges(input);
    const grants = this.grants(actor);
    // Without users.edit over them, people can still change their own name, phone and photo
    if (!allows(grants, 'users.edit', current.branchId ?? null)) {
      const changed = (Object.keys(changes) as (keyof UserChanges)[]).filter(field => changes[field] !== current[field]);
      if (id !== actor.id || changed.some(field => !(SELF_EDITABLE_FIELDS as readonly string[]).includes(field))) {
        throw new AdminApiError('forbidden');
      }
    }
    // Moved only where the actor has users.edit too: a branch administrator keeps people in their branches
    if (changes.branchId !== undefined && changes.branchId !== (current.branchId ?? null) && !allows(grants, 'users.edit', changes.branchId)) {
      throw new AdminApiError('forbidden');
    }
    if (changes.email !== undefined) {
      this.assertEmailFree(changes.email, id);
      if (changes.email.toLowerCase() !== current.email.toLowerCase()) {
        this.assertEmailDomain(changes.email);
      }
    }
    const statusChanged = changes.status !== undefined && changes.status !== current.status;
    if (id === actor.id && statusChanged) {
      throw new AdminApiError('self_change');
    }
    if (changes.branchId !== undefined && changes.branchId !== current.branchId) {
      this.assertOpenBranch(changes.branchId);
    }
    const user = { ...current, ...changes };
    this.commitUsers(this.data.users.map(item => item.id === id ? user : item));
    const diff = USER_FIELDS.filter(field => current[field] !== user[field]).map<ActivityChange>(field =>
      // Photos are data URLs: too big to keep, so the log only notes that it changed
      field === 'avatar' ? { field } : { field, from: current[field], to: user[field] });
    this.log(actor.id, 'user.updated', fullName(user), id, diff);
    return this.respond(user);
  }

  async setUserStatus(ids: string[], status: UserStatus, reason?: string): Promise<User[]> {
    const actor = this.actor('users.edit');
    if (ids.includes(actor.id)) {
      throw new AdminApiError('self_change');
    }
    ids.forEach(id => this.findManageable(actor, id, 'users.edit'));
    const why = this.requireReason('status', reason);
    this.commitUsers(this.data.users.map(user => ids.includes(user.id) ? { ...user, status } : user), false);
    const changed: User[] = [];
    this.data.users = this.data.users.map(user => {
      if (!ids.includes(user.id) || user.status === status) {
        return user;
      }
      const updated = { ...user, status };
      changed.push(updated);
      if (status === 'suspended') {
        this.data.sessions = this.data.sessions.filter(session => session.userId !== user.id);
      }
      this.log(actor.id, status === 'suspended' ? 'user.suspended' : 'user.activated', fullName(user), user.id, [
        { field: 'status', from: user.status, to: status },
      ], why);
      return updated;
    });
    return this.respond(changed);
  }

  async deleteUsers(ids: string[], reason?: string): Promise<void> {
    const actor = this.actor('users.delete');
    if (ids.includes(actor.id)) {
      throw new AdminApiError('self_change');
    }
    const users = ids.map(id => this.findManageable(actor, id, 'users.delete'));
    this.assertReauthenticated();
    const why = this.requireReason('delete', reason);
    this.commitUsers(this.data.users.filter(user => !ids.includes(user.id)), false);
    for (const user of users) {
      this.log(actor.id, 'user.deleted', fullName(user), undefined, [
        { field: 'email', from: user.email },
        { field: 'roles', added: [], removed: activeRoleIds(user) },
      ], why);
    }
    this.data.users = this.data.users.filter(user => !ids.includes(user.id));
    this.data.sessions = this.data.sessions.filter(session => !ids.includes(session.userId));
    return this.respond(undefined);
  }

  async resetPassword(id: string, reason?: string): Promise<void> {
    const actor = this.actor('users.edit');
    const user = this.findManageable(actor, id, 'users.edit');
    // Your own needs no reason, nor a recent sign-in
    if (id !== actor.id) {
      this.assertReauthenticated();
    }
    const why = id === actor.id ? '' : this.requireReason('resetSignIn', reason);
    this.log(actor.id, 'user.password_reset', fullName(user), id, undefined, why);
    this.sendLink(user, 'reset');
    // The old password stops working, so the sessions it opened end too
    if (id !== actor.id) {
      this.data.sessions = this.data.sessions.filter(session => session.userId !== id);
    }
    return this.respond(undefined);
  }

  async resendInvite(id: string): Promise<void> {
    const actor = this.actor('users.create');
    const user = this.findManageable(actor, id, 'users.create');
    if (user.status !== 'invited') {
      throw new AdminApiError('not_invited');
    }
    this.log(actor.id, 'user.invited', fullName(user), id);
    this.sendLink(user, 'invite');
    return this.respond(undefined);
  }

  /* Role assignments */

  async assignRole(input: RoleAssignmentDraft): Promise<User> {
    const actor = this.actor('users.edit');
    const { userId, ...grant } = fields(input, ['userId', ...GRANT_FIELDS]);
    check(typeof userId === 'string');
    const user = this.findManageable(actor, userId as string, 'users.edit');
    if (user.id === actor.id) {
      throw new AdminApiError('self_change');
    }
    this.assertReauthenticated();
    const assignment = this.newAssignment(actor, user, grantInput(grant));
    const updated = { ...user, roles: [...user.roles, assignment] };
    this.commitUsers(this.data.users.map(item => item.id === user.id ? updated : item));
    this.logAssignment(actor.id, 'role_assignment.added', updated, assignment);
    return this.respond(updated);
  }

  async updateRoleAssignment(id: string, input: RoleAssignmentChanges): Promise<User> {
    const actor = this.actor('users.edit');
    const changes = fields(input, ['endsAt', 'reason']) as RoleAssignmentChanges;
    check(changes.endsAt === undefined || changes.endsAt === null || isInstant(changes.endsAt));
    check(changes.reason === undefined || (typeof changes.reason === 'string' && changes.reason.length <= MAX_REASON_LENGTH));
    const { user, assignment: current } = this.findAssignment(actor, id);
    const role = this.assertChangeable(actor, current);
    this.assertReauthenticated();
    const now = Date.now();
    const assignment: RoleAssignment = {
      ...current,
      ...(changes.endsAt !== undefined ? { endsAt: changes.endsAt } : {}),
      ...(changes.reason !== undefined ? { reason: changes.reason.trim() } : {}),
    };
    if (assignment.endsAt !== current.endsAt) {
      // Moving the end: still after the start, and in the future; to end it now, remove it
      const end = assignment.endsAt === null ? Infinity : new Date(assignment.endsAt).getTime();
      check(end > now && end > new Date(assignment.startsAt).getTime());
      assertWithinRules(role.assignment, Math.max(new Date(assignment.startsAt).getTime(), now), assignment.endsAt);
      if (roleConflict(this.conflicts(), user.roles.filter(item => item.id !== id), assignment.roleId, assignment, now)) {
        throw new AdminApiError('role_conflict');
      }
      // Renewed after it expired: it is logged again when it ends
      this.data.expiryLogged = (this.data.expiryLogged ?? []).filter(item => item !== id);
    }
    if (role.assignment.reasonRequired && !assignment.reason) {
      throw new AdminApiError('reason_required');
    }
    const updated = { ...user, roles: user.roles.map(item => item.id === id ? assignment : item) };
    this.commitUsers(this.data.users.map(item => item.id === user.id ? updated : item));
    const diff = (['endsAt', 'reason'] as const)
      .filter(field => current[field] !== assignment[field])
      .map<ActivityChange>(field => ({ field, from: current[field], to: assignment[field] }));
    if (diff.length) {
      this.log(actor.id, 'role_assignment.updated', fullName(user), user.id, [{ field: 'roleId', to: assignment.roleId }, ...diff]);
    }
    return this.respond(updated);
  }

  async removeRoleAssignment(id: string, reason?: string): Promise<User> {
    const actor = this.actor('users.edit');
    const { user, assignment } = this.findAssignment(actor, id);
    this.assertChangeable(actor, assignment);
    this.assertReauthenticated();
    const why = this.requireReason('removeRole', reason);
    const updated = { ...user, roles: user.roles.filter(item => item.id !== id) };
    this.commitUsers(this.data.users.map(item => item.id === user.id ? updated : item));
    this.data.expiryLogged = (this.data.expiryLogged ?? []).filter(item => item !== id);
    this.log(actor.id, 'role_assignment.removed', fullName(user), user.id, [{ field: 'roleId', from: assignment.roleId }], why);
    return this.respond(updated);
  }

  async assignRoles(userIds: string[], input: RoleAssignmentBatch): Promise<User[]> {
    const actor = this.actor('users.edit');
    check(Array.isArray(userIds) && userIds.every(id => typeof id === 'string'));
    const change = fields(input, ['add', 'removeRoleId', 'reason']);
    // A reason goes with taking a role away; a role given has its own
    check(('add' in change) !== ('removeRoleId' in change) && !('add' in change && 'reason' in change));
    const ids = [...new Set(userIds)];
    if (ids.includes(actor.id)) {
      throw new AdminApiError('self_change');
    }
    const users = ids.map(id => this.findManageable(actor, id, 'users.edit'));
    this.assertReauthenticated();
    const now = Date.now();
    const holds = (user: User, roleId: string, branchId?: string | null) => user.roles.some(item => item.roleId === roleId
      && (branchId === undefined || item.branchId === branchId) && roleAssignmentState(item, now) !== 'expired');
    const added: [User, RoleAssignment][] = [];
    const changed: User[] = [];
    let why = '';
    let next = this.data.users;
    if ('add' in change) {
      const grant = grantInput(fields(change['add'], GRANT_FIELDS));
      for (const user of users.filter(item => !holds(item, grant.roleId, grant.branchId ?? null))) {
        const assignment = this.newAssignment(actor, user, grant);
        const updated = { ...user, roles: [...user.roles, assignment] };
        added.push([updated, assignment]);
        changed.push(updated);
        next = next.map(item => item.id === user.id ? updated : item);
      }
    } else {
      const roleId = change['removeRoleId'];
      check(typeof roleId === 'string');
      if (!this.data.roles.some(role => role.id === roleId)) {
        throw new AdminApiError('not_found');
      }
      // Each assignment taken away in its scope, all checked before any goes
      users.forEach(user => user.roles.filter(item => item.roleId === roleId && roleAssignmentState(item, now) !== 'expired')
        .forEach(item => this.assertChangeable(actor, item)));
      why = this.requireReason('removeRole', change['reason']);
      for (const user of users.filter(item => holds(item, roleId as string))) {
        const updated = { ...user, roles: user.roles.filter(item => item.roleId !== roleId || roleAssignmentState(item, now) === 'expired') };
        changed.push(updated);
        next = next.map(item => item.id === user.id ? updated : item);
      }
    }
    this.commitUsers(next);
    for (const [user, assignment] of added) {
      this.logAssignment(actor.id, 'role_assignment.added', user, assignment);
    }
    if ('removeRoleId' in change) {
      for (const user of changed) {
        this.log(actor.id, 'role_assignment.removed', fullName(user), user.id, [{ field: 'roleId', from: change['removeRoleId'] as string }], why);
      }
    }
    return this.respond(changed);
  }

  /* Conflicting roles */

  async listRoleConflicts(): Promise<RoleConflict[]> {
    this.actor();
    return this.respond(this.conflicts());
  }

  async createRoleConflict(input: RoleConflictDraft): Promise<RoleConflict> {
    const actor = this.actor('roles.manage');
    const changes = this.roleConflictChanges(input);
    check(changes.name !== undefined && changes.roleIds !== undefined);
    const rule: RoleConflict = {
      id: `rc-${crypto.randomUUID().slice(0, 8)}`, name: changes.name!, description: changes.description ?? '', roleIds: changes.roleIds!,
    };
    this.data.roleConflicts = [...this.conflicts(), rule];
    this.log(actor.id, 'role_conflict.created', rule.name, rule.id, [
      { field: 'name', to: rule.name },
      ...(rule.description ? [{ field: 'description', to: rule.description }] : []),
      { field: 'roles', added: rule.roleIds, removed: [] },
    ]);
    return this.respond(rule);
  }

  async updateRoleConflict(id: string, input: Partial<RoleConflictDraft>): Promise<RoleConflict> {
    const actor = this.actor('roles.manage');
    const current = this.findRoleConflict(id);
    const rule = { ...current, ...this.roleConflictChanges(input) };
    this.data.roleConflicts = this.conflicts().map(item => item.id === id ? rule : item);
    const diff: ActivityChange[] = (['name', 'description'] as const)
      .filter(field => current[field] !== rule[field])
      .map(field => ({ field, from: current[field], to: rule[field] }));
    const added = rule.roleIds.filter(roleId => !current.roleIds.includes(roleId));
    const removed = current.roleIds.filter(roleId => !rule.roleIds.includes(roleId));
    if (added.length || removed.length) {
      diff.push({ field: 'roles', added, removed });
    }
    if (diff.length) {
      this.log(actor.id, 'role_conflict.updated', rule.name, id, diff);
    }
    return this.respond(rule);
  }

  async deleteRoleConflict(id: string): Promise<void> {
    const actor = this.actor('roles.manage');
    const rule = this.findRoleConflict(id);
    this.data.roleConflicts = this.conflicts().filter(item => item.id !== id);
    this.log(actor.id, 'role_conflict.deleted', rule.name, undefined, [{ field: 'roles', added: [], removed: rule.roleIds }]);
    return this.respond(undefined);
  }

  private conflicts(): RoleConflict[] {
    return this.data.roleConflicts ?? [];
  }

  private findRoleConflict(id: string): RoleConflict {
    const rule = this.conflicts().find(item => item.id === id);
    if (!rule) {
      throw new AdminApiError('not_found');
    }
    return rule;
  }

  /** A rule's fields: a name, a description, and two to twenty different roles that exist */
  private roleConflictChanges(input: unknown): Partial<RoleConflictDraft> {
    const changes = fields(input, ['name', 'description', 'roleIds']);
    check(changes['name'] === undefined || (typeof changes['name'] === 'string' && !!changes['name'].trim() && changes['name'].length <= 100));
    check(changes['description'] === undefined || (typeof changes['description'] === 'string' && changes['description'].length <= 500));
    const roleIds = changes['roleIds'];
    check(roleIds === undefined || (Array.isArray(roleIds) && roleIds.every(roleId => typeof roleId === 'string')
      && new Set(roleIds).size === roleIds.length && roleIds.length >= 2 && roleIds.length <= 20));
    if (Array.isArray(roleIds) && roleIds.some(roleId => !this.data.roles.some(role => role.id === roleId))) {
      throw new AdminApiError('not_found');
    }
    return {
      ...(changes['name'] !== undefined ? { name: (changes['name'] as string).trim() } : {}),
      ...(changes['description'] !== undefined ? { description: (changes['description'] as string).trim() } : {}),
      ...(roleIds !== undefined ? { roleIds: roleIds as string[] } : {}),
    };
  }

  /* Branches */

  async listBranches(): Promise<Branch[]> {
    this.actor(undefined, true);
    return this.respond(this.data.branches);
  }

  async createBranch(input: BranchDraft): Promise<Branch> {
    const actor = this.actor('branches.manage');
    const changes = branchChanges(input);
    check(changes.code !== undefined && changes.name !== undefined && changes.active === undefined);
    this.assertCodeFree(changes.code!);
    const branch: Branch = { id: `b-${crypto.randomUUID().slice(0, 8)}`, code: changes.code!, name: changes.name!, active: true, createdAt: new Date().toISOString() };
    this.data.branches = [...this.data.branches, branch];
    this.log(actor.id, 'branch.created', branch.name, branch.id, [{ field: 'code', to: branch.code }, { field: 'name', to: branch.name }]);
    return this.respond(branch);
  }

  async updateBranch(id: string, input: BranchChanges): Promise<Branch> {
    const actor = this.actor('branches.manage');
    const current = this.findBranch(id);
    const changes = branchChanges(input);
    if (changes.code !== undefined) {
      this.assertCodeFree(changes.code, id);
    }
    const branch = { ...current, ...changes };
    this.data.branches = this.data.branches.map(item => item.id === id ? branch : item);
    const diff = (['code', 'name', 'active'] as const)
      .filter(field => current[field] !== branch[field])
      .map<ActivityChange>(field => ({ field, from: String(current[field]), to: String(branch[field]) }));
    if (diff.length) {
      this.log(actor.id, 'branch.updated', branch.name, id, diff);
    }
    return this.respond(branch);
  }

  /** Refused while people belong to it or hold a role there now or later; its ended assignments go with it */
  async deleteBranch(id: string): Promise<void> {
    const actor = this.actor('branches.manage');
    const branch = this.findBranch(id);
    const now = Date.now();
    const inUse = this.data.users.some(user => user.branchId === id
      || user.roles.some(item => item.branchId === id && roleAssignmentState(item, now) !== 'expired'));
    if (inUse) {
      throw new AdminApiError('branch_in_use');
    }
    this.data.branches = this.data.branches.filter(item => item.id !== id);
    this.data.users = this.data.users.map(user => user.roles.some(item => item.branchId === id)
      ? { ...user, roles: user.roles.filter(item => item.branchId !== id) } : user);
    this.log(actor.id, 'branch.deleted', branch.name, undefined, [{ field: 'code', from: branch.code }]);
    return this.respond(undefined);
  }

  /* Roles */

  async listRoles(): Promise<Role[]> {
    this.actor(undefined, true);
    return this.respond(this.data.roles);
  }

  async createRole(input: RoleDraft): Promise<Role> {
    const actor = this.actor('roles.manage');
    const changes = roleChanges(input);
    const draft: Required<RoleDraft> = {
      name: '', description: '', tone: 'neutral', permissions: [], ...changes, assignment: changes.assignment ?? { ...DEFAULT_ASSIGNMENT_RULES },
    };
    if (!draft.name.trim()) {
      throw new AdminApiError('invalid_request');
    }
    if (!holdsAll(this.permissions(actor), draft.permissions)) {
      throw new AdminApiError('forbidden');
    }
    const role: Role = { ...draft, id: `r-${crypto.randomUUID().slice(0, 8)}`, system: false };
    this.data.roles = [...this.data.roles, role];
    this.log(actor.id, 'role.created', role.name, role.id, [{ field: 'permissions', added: role.permissions, removed: [] }]);
    return this.respond(role);
  }

  async updateRole(id: string, input: Partial<RoleDraft>): Promise<Role> {
    const actor = this.actor('roles.manage');
    const current = this.data.roles.find(role => role.id === id);
    if (!current) {
      throw new AdminApiError('not_found');
    }
    // Nobody changes a role that allows more than their own
    if (!canManageRole(this.permissions(actor), current)) {
      throw new AdminApiError('forbidden');
    }
    const changes = roleChanges(input);
    // A built-in role's name, description and permissions come from the code: only its color and rules change
    if (current.system && (['name', 'description', 'permissions'] as const).some(field =>
      changes[field] !== undefined && JSON.stringify(changes[field]) !== JSON.stringify(current[field]))) {
      throw new AdminApiError('system_role');
    }
    const role = { ...current, ...changes };
    const added = role.permissions.filter(key => !current.permissions.includes(key));
    const removed = current.permissions.filter(key => !role.permissions.includes(key));
    if (added.length || removed.length) {
      if (activeRoleIds(actor).includes(id)) {
        throw new AdminApiError('self_change');
      }
      if (!holdsAll(this.permissions(actor), [...added, ...removed])) {
        throw new AdminApiError('forbidden');
      }
      // What a role allows; its name, color or rules alone do not ask
      this.assertReauthenticated();
    }
    this.data.roles = this.data.roles.map(item => item.id === id ? role : item);
    const diff: ActivityChange[] = (['name', 'description', 'tone'] as const)
      .filter(field => current[field] !== role[field])
      .map(field => ({ field, from: current[field], to: role[field] }));
    for (const field of ['maxDays', 'reasonRequired'] as const) {
      if (current.assignment[field] !== role.assignment[field]) {
        diff.push({ field, from: String(current.assignment[field]), to: String(role.assignment[field]) });
      }
    }
    if (added.length || removed.length) {
      diff.push({ field: 'permissions', added, removed });
    }
    this.log(actor.id, 'role.updated', role.name, id, diff);
    return this.respond(role);
  }

  async deleteRole(id: string): Promise<void> {
    const actor = this.actor('roles.manage');
    const role = this.data.roles.find(item => item.id === id);
    if (!role) {
      throw new AdminApiError('not_found');
    }
    if (!canManageRole(this.permissions(actor), role)) {
      throw new AdminApiError('forbidden');
    }
    if (role.system) {
      throw new AdminApiError('system_role');
    }
    const now = Date.now();
    if (this.data.users.some(user => user.roles.some(item => item.roleId === id && roleAssignmentState(item, now) !== 'expired'))) {
      throw new AdminApiError('role_in_use');
    }
    if (this.data.settings.defaultRoleId === id) {
      throw new AdminApiError('default_role');
    }
    this.assertReauthenticated();
    this.data.roles = this.data.roles.filter(item => item.id !== id);
    // Its expired assignments go with it
    this.data.users = this.data.users.map(user => user.roles.some(item => item.roleId === id)
      ? { ...user, roles: user.roles.filter(item => item.roleId !== id) } : user);
    const settings = this.data.settings;
    this.data.settings = { ...settings, twoFactorRoleIds: settings.twoFactorRoleIds.filter(roleId => roleId !== id) };
    // Off the conflicting-roles rules; a rule left with fewer than two goes
    this.data.roleConflicts = this.conflicts()
      .map(rule => ({ ...rule, roleIds: rule.roleIds.filter(roleId => roleId !== id) }))
      .filter(rule => rule.roleIds.length > 1);
    this.log(actor.id, 'role.deleted', role.name, undefined, [{ field: 'permissions', added: [], removed: role.permissions }]);
    return this.respond(undefined);
  }

  /* Activity */

  async listActivity(range: ActivityRange = {}): Promise<Activity[]> {
    const actor = this.actor();
    const { from, to } = range;
    check([from, to].every(value => value === undefined || isInstant(value)));
    const grants = this.grants(actor);
    // Through branches, only the entries about their people (API.md, "Branch administrators")
    const branches = branchesWith(grants, 'activity.view');
    const people = grants.organization.has('activity.view') ? null
      : new Set(this.data.users.filter(user => !!user.branchId && branches.includes(user.branchId)).map(user => user.id));
    if (people?.size === 0) {
      return this.respond([]);
    }
    const after = from ? new Date(from).getTime() : -Infinity;
    const before = to ? new Date(to).getTime() : Infinity;
    return this.respond(this.data.activity.filter(entry => {
      const at = new Date(entry.at).getTime();
      return at >= after && at < before && (!people || (!!entry.targetId && people.has(entry.targetId)));
    }));
  }

  /* Settings */

  async getSettings(): Promise<AdminSettings> {
    this.actor(undefined, true);
    return this.respond(this.data.settings);
  }

  async updateSettings(input: Partial<AdminSettings>): Promise<AdminSettings> {
    const actor = this.actor('settings.manage');
    const changes = settingsChanges(input);
    const roleIds = [...(changes.defaultRoleId === undefined ? [] : [changes.defaultRoleId]), ...(changes.twoFactorRoleIds ?? [])];
    if (roleIds.some(roleId => !this.data.roles.some(role => role.id === roleId))) {
      throw new AdminApiError('not_found');
    }
    this.assertReauthenticated();
    const current = this.data.settings;
    const settings: AdminSettings = {
      ...current,
      ...changes,
      allowedDomains: [...new Set((changes.allowedDomains ?? current.allowedDomains).map(domain => domain.trim().toLowerCase()).filter(Boolean))],
      twoFactorRoleIds: [...new Set(changes.twoFactorRoleIds ?? current.twoFactorRoleIds)],
      reasonsRequired: [...new Set(changes.reasonsRequired ?? current.reasonsRequired)],
    };
    this.data.settings = settings;
    const diff: ActivityChange[] = ([
      'defaultRoleId', 'inviteExpiryDays', 'sessionTimeoutMinutes', 'passwordMinLength', 'passwordHistory', 'activityRetentionDays',
      'branchesEnabled', 'reauthMinutes',
    ] as const)
      .filter(field => current[field] !== settings[field])
      .map(field => ({ field, from: String(current[field]), to: String(settings[field]) }));
    for (const field of ['allowedDomains', 'twoFactorRoleIds', 'reasonsRequired'] as const) {
      const before: readonly string[] = current[field];
      const after: readonly string[] = settings[field];
      const added = after.filter(item => !before.includes(item));
      const removed = before.filter(item => !after.includes(item));
      if (added.length || removed.length) {
        diff.push({ field, added, removed });
      }
    }
    if (diff.length) {
      this.log(actor.id, 'settings.updated', 'Settings', undefined, diff);
    }
    return this.respond(settings);
  }

  /* Signed-in devices */

  async listSessions(userId: string): Promise<UserSession[]> {
    const actor = this.actor();
    this.assertCanSeeSecurity(actor, userId);
    const here = this.currentSession()?.session.id;
    const sessions = this.data.sessions
      .filter(session => session.userId === userId)
      .map(session => ({ ...session, current: session.id === here }))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    return this.respond(sessions);
  }

  async endSession(sessionId: string, reason?: string): Promise<void> {
    const actor = this.actor();
    const session = this.data.sessions.find(item => item.id === sessionId);
    if (!session) {
      throw new AdminApiError('not_found');
    }
    const user = this.assertCanSeeSecurity(actor, session.userId);
    // Your own needs no reason, nor a recent sign-in
    if (user.id !== actor.id) {
      this.assertReauthenticated();
    }
    const why = user.id === actor.id ? '' : this.requireReason('endSessions', reason);
    this.data.sessions = this.data.sessions.filter(item => item.id !== sessionId);
    this.log(actor.id, 'auth.sessions_ended', fullName(user), user.id, [{ field: 'devices', added: [], removed: [deviceName(session)] }], why);
    return this.respond(undefined);
  }

  async endSessions(userId: string, reason?: string): Promise<void> {
    const actor = this.actor();
    const user = this.assertCanSeeSecurity(actor, userId);
    if (userId !== actor.id) {
      this.assertReauthenticated();
    }
    const why = userId === actor.id ? '' : this.requireReason('endSessions', reason);
    // Your own: everywhere but this browser
    const here = this.currentSession()?.session.id;
    const ended = this.data.sessions.filter(session => session.userId === userId && session.id !== here);
    this.data.sessions = this.data.sessions.filter(session => !ended.includes(session));
    if (ended.length) {
      this.log(actor.id, 'auth.sessions_ended', fullName(user), user.id, [{ field: 'devices', added: [], removed: ended.map(deviceName) }], why);
    }
    return this.respond(undefined);
  }

  /* Two-step sign-in */

  async startTwoFactor(): Promise<TwoFactorSetup> {
    const actor = this.actor(undefined, true);
    const secret = createSecret();
    this.data.pendingTwoFactor = { ...this.data.pendingTwoFactor, [actor.id]: secret };
    return this.respond({ secret, uri: otpauthUri(secret, actor.email, ISSUER) });
  }

  async confirmTwoFactor(code: string): Promise<TwoFactorConfirmation> {
    const actor = this.actor(undefined, true);
    const secret = this.data.pendingTwoFactor?.[actor.id];
    if (!secret || !(await verifyTotp(secret, String(code ?? '')))) {
      await this.respond(undefined);
      throw new AdminApiError('invalid_code');
    }
    const { [actor.id]: _, ...pending } = this.data.pendingTwoFactor!;
    this.data.pendingTwoFactor = pending;
    this.data.twoFactorSecrets = { ...this.data.twoFactorSecrets, [actor.id]: secret };
    const user = this.setTwoFactor(actor.id, true);
    this.log(actor.id, 'auth.two_factor_on', fullName(user), user.id);
    const recoveryCodes = await this.newRecoveryCodes(actor.id);
    return this.respond({ user, recoveryCodes });
  }

  async disableTwoFactor(code: string): Promise<User> {
    const actor = this.actor();
    if (this.requiresTwoFactor(actor)) {
      throw new AdminApiError('two_factor_mandatory');
    }
    // A code from the app, or a recovery code
    await this.checkCode(actor, String(code ?? '') || '-');
    const user = this.setTwoFactor(actor.id, false);
    this.log(actor.id, 'auth.two_factor_off', fullName(user), user.id);
    return this.respond(user);
  }

  async recoveryCodesLeft(): Promise<number> {
    const actor = this.actor();
    return this.respond((this.data.recoveryCodes?.[actor.id] ?? []).filter(item => !item.used).length);
  }

  async createRecoveryCodes(): Promise<string[]> {
    const actor = this.actor();
    check(!!actor.twoFactor);
    this.assertReauthenticated();
    const codes = await this.newRecoveryCodes(actor.id);
    this.log(actor.id, 'auth.recovery_codes_created', fullName(actor), actor.id);
    return this.respond(codes);
  }

  async resetTwoFactor(userId: string, reason?: string): Promise<User> {
    const actor = this.actor('users.edit');
    // Your own goes through disableTwoFactor, with a code
    if (userId === actor.id) {
      throw new AdminApiError('self_change');
    }
    this.findManageable(actor, userId, 'users.edit');
    this.assertReauthenticated();
    const why = this.requireReason('resetSignIn', reason);
    const user = this.setTwoFactor(userId, false);
    this.log(actor.id, 'auth.two_factor_off', fullName(user), user.id, undefined, why);
    return this.respond(user);
  }

  /* Live updates */

  /** Another tab of this browser changed the data: the same news a server would push */
  override watch(onChange: () => void): () => void {
    if (typeof window === 'undefined') {
      return () => undefined;
    }
    const listener = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === SESSION_KEY || event.key === null) {
        onChange();
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }

  /* Helpers */

  /** Your own sessions and two-step sign-in, or, with users.edit, those of someone you manage */
  private assertCanSeeSecurity(actor: User, userId: string): User {
    return userId === actor.id ? actor : this.findManageable(actor, userId, 'users.edit');
  }

  private setTwoFactor(userId: string, on: boolean): User {
    if (!on) {
      const { [userId]: _, ...secrets } = this.data.twoFactorSecrets ?? {};
      this.data.twoFactorSecrets = secrets;
      // The recovery codes go with it
      const { [userId]: __, ...codes } = this.data.recoveryCodes ?? {};
      this.data.recoveryCodes = codes;
    }
    const user = { ...this.findUser(userId), twoFactor: on };
    this.data.users = this.data.users.map(item => item.id === userId ? user : item);
    return user;
  }

  /** Checks a new user, their branch and roles included, without adding anything; through branches, in one of them */
  private assertCanCreate(actor: User, draft: UserDraft) {
    if (!allows(this.grants(actor), 'users.create', draft.branchId ?? null)) {
      throw new AdminApiError('forbidden');
    }
    this.assertEmailFree(draft.email);
    this.assertEmailDomain(draft.email);
    this.assertOpenBranch(draft.branchId ?? null);
    this.newRoles(actor, { id: '' }, draft.roles, draft.branchId ?? null);
  }

  private addUser(actor: User, draft: UserDraft): User {
    const now = new Date().toISOString();
    const id = `u-${crypto.randomUUID().slice(0, 8)}`;
    const { roles: grants, branchId = null, ...profile } = draft;
    const user: User = { ...profile, id, branchId, roles: this.newRoles(actor, { id }, grants, branchId), createdAt: now, lastActiveAt: null };
    this.data.users = [user, ...this.data.users];
    this.log(actor.id, draft.status === 'invited' ? 'user.invited' : 'user.created', fullName(user), user.id, [
      { field: 'department', to: user.department },
      ...(user.branchId ? [{ field: 'branchId', to: user.branchId }] : []),
      { field: 'email', to: user.email },
      { field: 'status', to: user.status },
    ]);
    user.roles.forEach(assignment => this.logAssignment(actor.id, 'role_assignment.added', user, assignment));
    if (user.status === 'invited') {
      this.sendLink(user, 'invite');
    }
    return user;
  }

  /**
   * A new user's first roles, each checked as POST /role-assignments checks it, with users.create. None gives the default
   * role for good: for the whole organization, or limited to their branch when the actor adds people only through branches.
   */
  private newRoles(actor: User, user: Pick<User, 'id'>, grants: RoleGrant[], branchId: string | null): RoleAssignment[] {
    const scope = this.permissions(actor).has('users.create') ? null : branchId;
    const given = grants.length ? grants : [{ roleId: this.data.settings.defaultRoleId, branchId: scope, endsAt: null }];
    return given.reduce<RoleAssignment[]>((roles, grant) =>
      [...roles, this.newAssignment(actor, { id: user.id, roles }, grant, 'users.create')], []);
  }

  /**
   * An assignment of a role to someone, checked the way API.md says: the actor may give the role in its scope, the dates
   * make sense, the role's own rules hold, and it does not overlap one of the same role they already have.
   */
  private newAssignment(actor: User, user: Pick<User, 'id' | 'roles'>, grant: RoleGrant, permission: Permission = 'users.edit'): RoleAssignment {
    const branchId = grant.branchId ?? null;
    if (!allows(this.grants(actor), permission, branchId)) {
      throw new AdminApiError('forbidden');
    }
    const role = this.assertCanAssign(actor, grant.roleId, branchId);
    this.assertOpenBranch(branchId);
    const now = Date.now();
    const start = Math.max(grant.startsAt ? new Date(grant.startsAt).getTime() : now, now);
    const end = grant.endsAt === null ? Infinity : new Date(grant.endsAt).getTime();
    check(end > start);
    assertWithinRules(role.assignment, start, grant.endsAt);
    const reason = grant.reason?.trim() ?? '';
    if (role.assignment.reasonRequired && !reason) {
      throw new AdminApiError('reason_required');
    }
    const overlaps = user.roles.some(item => item.roleId === grant.roleId && item.branchId === branchId
      && new Date(item.startsAt).getTime() < end && start < (item.endsAt ? new Date(item.endsAt).getTime() : Infinity));
    if (overlaps) {
      throw new AdminApiError('already_assigned');
    }
    // Nor a role that a rule says cannot be held with one they hold then
    if (roleConflict(this.conflicts(), user.roles, grant.roleId, { startsAt: new Date(start).toISOString(), endsAt: grant.endsAt }, now)) {
      throw new AdminApiError('role_conflict');
    }
    const at = new Date(now).toISOString();
    return {
      id: uuidV7(), userId: user.id, roleId: grant.roleId, branchId, startsAt: new Date(start).toISOString(), endsAt: grant.endsAt, reason,
      assignedById: actor.id, assignedAt: at,
    };
  }

  /** The person an assignment belongs to, someone the actor may change and who is not the actor */
  private findAssignment(actor: User, id: string): { user: User; assignment: RoleAssignment } {
    const user = this.data.users.find(item => item.roles.some(assignment => assignment.id === id));
    if (!user) {
      throw new AdminApiError('not_found');
    }
    this.findManageable(actor, user.id, 'users.edit');
    if (user.id === actor.id) {
      throw new AdminApiError('self_change');
    }
    return { user, assignment: user.roles.find(assignment => assignment.id === id)! };
  }

  private logAssignment(actorId: string | null, action: ActivityAction, user: User, assignment: RoleAssignment) {
    this.log(actorId, action, fullName(user), user.id, [
      { field: 'roleId', to: assignment.roleId },
      ...(assignment.branchId ? [{ field: 'branchId', to: assignment.branchId }] : []),
      ...(assignment.startsAt > assignment.assignedAt ? [{ field: 'startsAt', to: assignment.startsAt }] : []),
      ...(assignment.endsAt ? [{ field: 'endsAt', to: assignment.endsAt }] : []),
    ], assignment.reason);
  }

  /**
   * Saves the users after a change, unless nobody active would keep a role with every permission for good
   * (last_administrator). With save false it only checks.
   */
  private commitUsers(users: User[], save = true) {
    if (!administratorRemains(users, this.data.roles, ALL_PERMISSIONS) && administratorRemains(this.data.users, this.data.roles, ALL_PERMISSIONS)) {
      throw new AdminApiError('last_administrator');
    }
    if (save) {
      this.data.users = users;
    }
  }

  private requiresTwoFactor(user: User): boolean {
    return activeRoleIds(user).some(roleId => this.data.settings.twoFactorRoleIds.includes(roleId));
  }

  /**
   * Makes a link that works once, until it expires, and "emails" it: there is no mail server here, so the email is
   * written to the browser console. A newer link of the same kind replaces the older ones.
   */
  private sendLink(user: User, kind: EmailLink['kind']) {
    const token = crypto.randomUUID().replaceAll('-', '');
    const lifetime = kind === 'invite' ? this.data.settings.inviteExpiryDays * 24 * 60 * 60_000 : RESET_LINK_MS;
    const links = Object.entries(this.data.links ?? {}).filter(([, link]) => link.userId !== user.id || link.kind !== kind);
    this.data.links = {
      ...Object.fromEntries(links),
      [token]: { userId: user.id, kind, expiresAt: new Date(Date.now() + lifetime).toISOString() },
    };
    const origin = typeof location === 'undefined' ? '' : location.origin;
    const [subject, path] = kind === 'invite' ? ["You're invited", 'activate'] : ['Set a new password', 'reset-password'];
    console.info(`[sample email] To ${user.email}: ${subject}. ${origin}/${path}?token=${token}`);
  }

  /**
   * Checks a link and the new password, in the order a server would: values of the right kind, a link that still
   * works, a long enough password. Answers who the link is for, and setPassword, which uses the link up and saves
   * the password.
   */
  private async useLink(token: string, kind: EmailLink['kind'], password: string) {
    check(typeof token === 'string' && typeof password === 'string');
    const link = this.data.links?.[token];
    const user = link && this.data.users.find(item => item.id === link.userId);
    if (!link || !user || link.kind !== kind || new Date(link.expiresAt).getTime() <= Date.now()) {
      await this.respond(undefined);
      throw new AdminApiError('invalid_token');
    }
    await this.checkNewPassword(user.id, password);
    const setPassword = async () => {
      const { [token]: _, ...links } = this.data.links!;
      this.data.links = links;
      await this.savePassword(user.id, password);
    };
    return { user, setPassword };
  }

  /** The password rules in the settings: long enough, and not one of the person's most recent passwords */
  private async checkNewPassword(userId: string, password: string) {
    const { passwordMinLength, passwordHistory } = this.data.settings;
    if (password.length < passwordMinLength) {
      throw new AdminApiError('weak_password');
    }
    const current = this.data.passwords?.[userId];
    const recent = [...(current ? [current] : []), ...(this.data.passwordHistory?.[userId] ?? [])].slice(0, passwordHistory);
    if (recent.includes(await sha256(password))) {
      throw new AdminApiError('password_reused');
    }
  }

  /** Saves a new password, keeping the one it replaces in the history */
  private async savePassword(userId: string, password: string) {
    const current = this.data.passwords?.[userId];
    if (current) {
      const history = [current, ...(this.data.passwordHistory?.[userId] ?? [])].slice(0, HISTORY_KEPT);
      this.data.passwordHistory = { ...this.data.passwordHistory, [userId]: history };
    }
    this.data.passwords = { ...this.data.passwords, [userId]: await sha256(password) };
  }

  private async passwordMatches(userId: string, password: string): Promise<boolean> {
    const saved = this.data.passwords?.[userId];
    return saved ? saved === await sha256(password) : password.length >= MIN_PASSWORD_LENGTH;
  }

  /** The code from the authenticator app, with two-step sign-in on: two_factor_required without one, invalid_code when wrong */
  private async checkCode(user: User, code: string | undefined) {
    const secret = user.twoFactor ? this.data.twoFactorSecrets?.[user.id] : undefined;
    if (secret && !code) {
      await this.respond(undefined);
      throw new AdminApiError('two_factor_required');
    }
    if (secret && !(await verifyTotp(secret, String(code))) && !(await this.useRecoveryCode(user, String(code)))) {
      await this.respond(undefined);
      throw new AdminApiError('invalid_code');
    }
  }

  /** Ten new recovery codes such as "abcde-fghjk", which replace the old ones; only their hashes are kept */
  private async newRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const letters = Array.from(crypto.getRandomValues(new Uint32Array(10)), value => RECOVERY_ALPHABET[value % RECOVERY_ALPHABET.length]).join('');
      return `${letters.slice(0, 5)}-${letters.slice(5)}`;
    });
    const hashes = await Promise.all(codes.map(code => sha256(recoveryCodeValue(code))));
    this.data.recoveryCodes = { ...this.data.recoveryCodes, [userId]: hashes.map(hash => ({ hash, used: false })) };
    return codes;
  }

  /** Whether this is one of their unused recovery codes, ignoring case, spaces and the dash; it is then used up and logged */
  private async useRecoveryCode(user: User, code: string): Promise<boolean> {
    const value = recoveryCodeValue(code);
    if (!/^[a-z0-9]{10}$/.test(value)) {
      return false;
    }
    const hash = await sha256(value);
    const codes = this.data.recoveryCodes?.[user.id] ?? [];
    const found = codes.find(item => !item.used && item.hash === hash);
    if (!found) {
      return false;
    }
    found.used = true;
    const left = codes.filter(item => !item.used).length;
    this.log(user.id, 'auth.recovery_code_used', fullName(user), user.id, [{ field: 'recoveryCodesLeft', to: String(left) }]);
    return true;
  }

  /**
   * Refuses a risky change with reauth_required when this browser's session last proved who is signed in longer ago
   * than the settings' reauthMinutes allow (API.md, "Confirming who you are"). Asked once the change is allowed, before
   * anything changes.
   */
  private assertReauthenticated() {
    const minutes = this.data.settings.reauthMinutes;
    const session = this.currentSession()?.session;
    const verifiedAt = session && this.data.verifiedAt?.[session.id];
    if (minutes && (!verifiedAt || Date.now() - new Date(verifiedAt).getTime() >= minutes * 60_000)) {
      throw new AdminApiError('reauth_required');
    }
  }

  /** This browser's session and its user, while the session lasts and the account is active */
  private currentSession(): { session: UserSession; user: User } | undefined {
    const id = readStore(sessionStorage, SESSION_KEY) ?? readStore(localStorage, SESSION_KEY);
    const session = this.data.sessions.find(item => item.id === id);
    const user = session && this.data.users.find(item => item.id === session.userId);
    return session && user?.status === 'active' ? { session, user } : undefined;
  }

  /**
   * Who is making the request; refuses it when nobody is signed in or their role lacks the permission. Someone whose
   * role requires two-step sign-in and who has not turned it on gets only what setting it up needs (setupAllowed).
   */
  private actor(permission?: Permission, setupAllowed = false): User {
    // Another tab may have changed the data or signed out
    this.data = this.read();
    const current = this.currentSession();
    if (!current) {
      throw new AdminApiError('unauthenticated');
    }
    const { session, user } = current;
    const now = new Date();
    if (now.getTime() - new Date(session.lastSeenAt).getTime() > SEEN_EVERY_MS) {
      this.data.sessions = this.data.sessions.map(item => item.id === session.id ? { ...item, lastSeenAt: now.toISOString() } : item);
    }
    if (!setupAllowed && !user.twoFactor && this.requiresTwoFactor(user)) {
      throw new AdminApiError('two_factor_mandatory');
    }
    // Somewhere: the methods narrow a permission a branch role gives to the people of that branch
    if (permission && !this.permissions(user).has(permission) && !branchesWith(this.grants(user), permission).length) {
      throw new AdminApiError('forbidden');
    }
    return user;
  }

  private permissions(user: User): ReadonlySet<Permission> {
    return permissionsOf(user, this.data.roles);
  }

  private grants(user: User): Grants {
    return grantsOf(user, this.data.roles);
  }

  private findUser(id: string): User {
    const user = this.data.users.find(item => item.id === id);
    if (!user) {
      throw new AdminApiError('not_found');
    }
    return user;
  }

  /**
   * A user the actor may change with this permission: theirs for the whole organization, or, for one a role limited to a
   * branch gives, in the person's branch; and nobody manages someone whose roles, now or scheduled, allow more than the
   * actor has in each role's scope. Yourself is always found: the rules about yourself are the callers'.
   */
  private findManageable(actor: User, id: string, permission: Permission): User {
    const user = this.findUser(id);
    const grants = this.grants(actor);
    if (user.id !== actor.id && !(allows(grants, permission, user.branchId ?? null) && canManageUser(grants, user, this.data.roles))) {
      throw new AdminApiError('forbidden');
    }
    return user;
  }

  private findBranch(id: string): Branch {
    const branch = this.data.branches.find(item => item.id === id);
    if (!branch) {
      throw new AdminApiError('not_found');
    }
    return branch;
  }

  /** A branch people can join or get a role in: one that exists and is open; null is none, or the whole organization */
  private assertOpenBranch(branchId: string | null) {
    if (branchId !== null && !this.findBranch(branchId).active) {
      throw new AdminApiError('branch_closed');
    }
  }

  private assertCodeFree(code: string, exceptId?: string) {
    if (this.data.branches.some(branch => branch.id !== exceptId && branch.code.toUpperCase() === code.toUpperCase())) {
      throw new AdminApiError('code_taken');
    }
  }

  /** A role the actor may give in a scope (null: the whole organization): it grants nothing they lack there */
  private assertCanAssign(actor: User, roleId: string, branchId: string | null): Role {
    const role = this.data.roles.find(item => item.id === roleId);
    if (!role) {
      throw new AdminApiError('not_found');
    }
    if (!canGiveRole(this.grants(actor), role, branchId)) {
      throw new AdminApiError('forbidden');
    }
    return role;
  }

  /** An assignment the actor may change or take away: users.edit and every permission of its role, in its scope */
  private assertChangeable(actor: User, assignment: RoleAssignment): Role {
    if (!allows(this.grants(actor), 'users.edit', assignment.branchId)) {
      throw new AdminApiError('forbidden');
    }
    return this.assertCanAssign(actor, assignment.roleId, assignment.branchId);
  }

  private assertEmailDomain(email: string) {
    const domains = this.data.settings.allowedDomains;
    const value = email.trim().toLowerCase();
    const domain = value.slice(value.lastIndexOf('@') + 1);
    if (domains.length && !domains.includes(domain)) {
      throw new AdminApiError('email_domain');
    }
  }

  private assertEmailFree(email: string, exceptId?: string) {
    const taken = this.data.users.some(user => user.id !== exceptId && user.email.toLowerCase() === email.trim().toLowerCase());
    if (taken) {
      throw new AdminApiError('email_taken');
    }
  }

  /** Writes an entry; with no actor, the server did it by itself, from no browser */
  private log(actorId: string | null, action: ActivityAction, targetLabel: string, targetId?: string, changes?: ActivityChange[], reason = '') {
    this.data.activity = [logEntry(actorId, action, targetLabel, targetId, changes, actorId ? this.client : undefined, undefined, reason), ...this.data.activity];
  }

  /**
   * The reason a change gives, trimmed: what the log keeps. reason_required when the settings require one for the action
   * and it is blank (API.md, "Reasons")
   */
  private requireReason(action: ReasonAction, reason: unknown): string {
    check(reason === undefined || (typeof reason === 'string' && reason.length <= MAX_REASON_LENGTH));
    const text = ((reason as string | undefined) ?? '').trim();
    if (!text && this.data.settings.reasonsRequired.includes(action)) {
      throw new AdminApiError('reason_required');
    }
    return text;
  }

  /** Saves the data and answers after a short delay, with a copy so callers cannot change the store */
  private async respond<T>(value: T): Promise<T> {
    this.write();
    await new Promise(resolve => setTimeout(resolve, LATENCY_MS));
    return structuredClone(value);
  }

  private read(): AdminData {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as AdminData;
        // Saved before settings, sessions or the newer settings existed
        data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
        data.sessions ??= createMockSessions(data.users);
        data.roleConflicts ??= SAMPLE_ROLE_CONFLICTS.filter(rule => rule.roleIds.every(roleId => data.roles.some(role => role.id === roleId)));
        // Activity older than the settings keep is gone, as the server deletes it every night
        const kept = new Date(Date.now() - data.settings.activityRetentionDays * DAY_MS).toISOString();
        data.activity = data.activity.filter(entry => entry.at >= kept);
        // Built-in roles come from the code, as the server syncs them on every start
        data.roles = data.roles.map(role => {
          const builtIn = BUILT_IN_ROLES.find(item => item.id === role.id);
          return builtIn ? { ...role, name: builtIn.name, description: builtIn.description, permissions: [...builtIn.permissions] } : role;
        });
        settleAssignments(data, kept);
        return data;
      }
    } catch {
      // Unreadable or blocked storage: fall back to fresh sample data
    }
    return createMockData();
  }

  private write() {
    writeStore(localStorage, STORAGE_KEY, JSON.stringify(this.data));
  }
}

/** A recovery code as it is compared: lower case, without spaces or the dash */
function recoveryCodeValue(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, '');
}

/** An ISO 8601 instant with Z or an offset, as API.md asks of GET /activity's from and to */
function isInstant(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

/*
 * Request checks, as a server validates a body before using it: only the fields a request may set, each of the
 * right kind. Anything else (an id, the system flag, a creation date) is refused.
 */

function fields(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AdminApiError('invalid_request');
  }
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.some(([key]) => !allowed.includes(key))) {
    throw new AdminApiError('invalid_request');
  }
  return Object.fromEntries(entries);
}

function check(ok: boolean) {
  if (!ok) {
    throw new AdminApiError('invalid_request');
  }
}

function userChanges(input: unknown): UserChanges {
  const changes = fields(input, USER_FIELDS);
  // Every field is text; the branch may also be null, for none
  check(Object.entries(changes).every(([field, value]) => typeof value === 'string' || (field === 'branchId' && value === null)));
  check(changes['status'] === undefined || (changes['status'] as string) in STATUS_META);
  check(changes['email'] === undefined || EMAIL.test((changes['email'] as string).trim()));
  return changes as UserChanges;
}

function userDraft(input: unknown): UserDraft {
  const { roles = [], ...profile } = fields(input, [...USER_FIELDS, 'roles']);
  const changes = userChanges(profile);
  check(['firstName', 'lastName', 'email', 'department', 'status'].every(field => field in changes));
  check(Array.isArray(roles));
  return { phone: '', avatar: '', ...changes, roles: (roles as unknown[]).map(grant => grantInput(fields(grant, GRANT_FIELDS))) } as UserDraft;
}

/** What a role grant may carry */
const GRANT_FIELDS = ['roleId', 'branchId', 'startsAt', 'endsAt', 'reason'];

function grantInput(grant: Record<string, unknown>): RoleGrant {
  check(typeof grant['roleId'] === 'string');
  check(grant['branchId'] === undefined || grant['branchId'] === null || typeof grant['branchId'] === 'string');
  check(grant['startsAt'] === undefined || isInstant(grant['startsAt']));
  check(grant['endsAt'] === null || isInstant(grant['endsAt']));
  check(grant['reason'] === undefined || (typeof grant['reason'] === 'string' && grant['reason'].length <= MAX_REASON_LENGTH));
  return grant as unknown as RoleGrant;
}

/** A role's rules for an assignment from `start` until `endsAt`: assignment_too_long when it runs, or may run, too long */
function assertWithinRules(rules: RoleAssignmentRules, start: number, endsAt: string | null) {
  if (rules.maxDays !== null && (endsAt === null || new Date(endsAt).getTime() - start > rules.maxDays * DAY_MS)) {
    throw new AdminApiError('assignment_too_long');
  }
}

/** A branch's fields, the code upper-case */
function branchChanges(input: unknown): BranchChanges {
  const changes = fields(input, ['code', 'name', 'active']);
  check(changes['code'] === undefined || (typeof changes['code'] === 'string' && BRANCH_CODE.test(changes['code'].trim())));
  check(changes['name'] === undefined || (typeof changes['name'] === 'string' && !!changes['name'].trim() && changes['name'].length <= 100));
  check(changes['active'] === undefined || typeof changes['active'] === 'boolean');
  return {
    ...changes,
    ...(changes['code'] !== undefined ? { code: (changes['code'] as string).trim().toUpperCase() } : {}),
    ...(changes['name'] !== undefined ? { name: (changes['name'] as string).trim() } : {}),
  } as BranchChanges;
}

function roleChanges(input: unknown): Partial<RoleDraft> {
  const changes = fields(input, ['name', 'description', 'tone', 'permissions', 'assignment']);
  check(['name', 'description'].every(field => changes[field] === undefined || typeof changes[field] === 'string'));
  check(changes['tone'] === undefined || ROLE_TONES.includes(changes['tone'] as never));
  check(changes['permissions'] === undefined
    || (Array.isArray(changes['permissions']) && changes['permissions'].every(key => ALL_PERMISSIONS.includes(key))));
  if (changes['assignment'] !== undefined) {
    const rules = fields(changes['assignment'], ['maxDays', 'reasonRequired']);
    const maxDays = rules['maxDays'];
    check(maxDays === null || (Number.isInteger(maxDays) && (maxDays as number) >= 1 && (maxDays as number) <= 365));
    check(typeof rules['reasonRequired'] === 'boolean');
  }
  return changes as Partial<RoleDraft>;
}

function logEntry(
  actorId: string | null, action: ActivityAction, targetLabel: string, targetId: string | undefined, changes: ActivityChange[] | undefined,
  client = { ip: '', browser: '', os: '' }, at = new Date().toISOString(), reason = '',
): Activity {
  return {
    id: uuidV7(new Date(at).getTime()), at, actorId, action, targetLabel, targetId, ...client, changes: changes?.length ? changes : undefined,
    ...(reason ? { reason } : {}),
  };
}

/**
 * What the server's expiry job does: logs each assignment that has ended, once, as role_assignment.expired at the
 * moment it ended, and drops expired ones older than the activity the settings keep.
 */
function settleAssignments(data: AdminData, kept: string) {
  const now = Date.now();
  const logged = new Set(data.expiryLogged ?? []);
  const entries: Activity[] = [];
  data.users = data.users.map(user => {
    const roles = user.roles.filter(item => !(item.endsAt && item.endsAt < kept));
    for (const item of roles.filter(item => roleAssignmentState(item, now) === 'expired' && !logged.has(item.id))) {
      logged.add(item.id);
      entries.push(logEntry(null, 'role_assignment.expired', fullName(user), user.id, [{ field: 'roleId', from: item.roleId }], undefined, item.endsAt!));
    }
    return roles.length === user.roles.length ? user : { ...user, roles };
  });
  const ids = new Set(data.users.flatMap(user => user.roles.map(item => item.id)));
  data.expiryLogged = [...logged].filter(id => ids.has(id));
  if (entries.length) {
    data.activity = [...entries, ...data.activity].sort((a, b) => b.at.localeCompare(a.at));
  }
}

/** The whole numbers each settings field accepts */
const SETTINGS_RANGES: Record<string, [min: number, max: number]> = {
  inviteExpiryDays: [0, 365],
  sessionTimeoutMinutes: [0, 10080],
  reauthMinutes: [0, 1440],
  passwordMinLength: [8, 64],
  passwordHistory: [0, 24],
  activityRetentionDays: [30, 3650],
};

function settingsChanges(input: unknown): Partial<AdminSettings> {
  const changes = fields(input, [
    'defaultRoleId', 'allowedDomains', 'twoFactorRoleIds', 'branchesEnabled', 'reasonsRequired', ...Object.keys(SETTINGS_RANGES),
  ]);
  check(changes['branchesEnabled'] === undefined || typeof changes['branchesEnabled'] === 'boolean');
  check(changes['defaultRoleId'] === undefined || typeof changes['defaultRoleId'] === 'string');
  check(['allowedDomains', 'twoFactorRoleIds', 'reasonsRequired'].every(field => changes[field] === undefined
    || (Array.isArray(changes[field]) && (changes[field] as unknown[]).every(item => typeof item === 'string'))));
  check(changes['reasonsRequired'] === undefined || (changes['reasonsRequired'] as string[]).every(item => item in REASON_ACTIONS));
  check(Object.entries(SETTINGS_RANGES).every(([field, [min, max]]) => changes[field] === undefined
    || (Number.isInteger(changes[field]) && (changes[field] as number) >= min && (changes[field] as number) <= max)));
  return changes as Partial<AdminSettings>;
}

/** "Chrome · Windows" */
function deviceName(session: Pick<UserSession, 'browser' | 'os'>): string {
  return `${session.browser} · ${session.os}`;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function readStore(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage full or blocked: changes last until the page reloads
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Blocked storage holds no session to clear
  }
}

/** Browser and operating system names from a user agent string, such as "Chrome" and "Windows" */
export function describeBrowser(userAgent: string): { browser: string; os: string } {
  // Order matters: Edge also says Chrome, Chrome also says Safari, Android also says Linux, iOS also says Mac OS X
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Browser';
  const os = /Windows/.test(userAgent) ? 'Windows'
    : /iPhone|iPad/.test(userAgent) ? 'iOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'Unknown';
  return { browser, os };
}
