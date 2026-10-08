import { Injectable } from '@angular/core';

import { canManageRole, holdsAll, permissionsOf, SELF_EDITABLE_FIELDS } from './access-rules';
import { AdminApi, AdminApiError } from './admin-api';
import { ALL_PERMISSIONS, DEFAULT_SETTINGS, ROLE_TONES, STATUS_META } from './catalog';
import { AdminData, createMockData, createMockSessions, EmailLink } from './mock-data';
import {
  Activity, ActivityAction, ActivityChange, ActivityRange, AdminSettings, fullName, PasswordPolicy, Permission, Role, RoleDraft,
  TwoFactorSetup, User, UserDraft, UserSession, UserStatus,
} from './models';
import { createSecret, otpauthUri, verifyTotp } from './totp';

const STORAGE_KEY = 'admin-data-v4';
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

/** User fields the activity log tracks, in the order it lists them; also every field a request may set */
const USER_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'department', 'roleId', 'status', 'avatar'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * AdminApi backed by localStorage, seeded with sample data on first use. It plays the server's part: it knows
 * who is signed in, checks their permissions (see access-rules.ts) and writes the activity log.
 * Clear the "admin-data-v4" key in the browser to start over.
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
    const secret = user.twoFactor ? this.data.twoFactorSecrets?.[user.id] : undefined;
    if (secret && !code) {
      await this.respond(undefined);
      throw new AdminApiError('two_factor_required');
    }
    if (secret && !(await verifyTotp(secret, code!))) {
      await this.respond(undefined);
      throw new AdminApiError('invalid_code');
    }
    const now = new Date().toISOString();
    const signedIn = { ...user, lastActiveAt: now };
    this.data.users = this.data.users.map(item => item.id === user.id ? signedIn : item);
    const session: UserSession = { id: `s-${crypto.randomUUID().slice(0, 12)}`, userId: user.id, createdAt: now, lastSeenAt: now, ...this.client };
    this.data.sessions = [...this.data.sessions, session];
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
    // Without users.view people still see their own account
    return this.respond(this.permissions(actor).has('users.view') ? this.data.users : [actor]);
  }

  async createUser(input: UserDraft): Promise<User> {
    const actor = this.actor('users.create');
    const draft = userDraft(input);
    this.assertCanCreate(actor, draft);
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
    return this.respond(drafts.map(draft => this.addUser(actor, draft)));
  }

  async updateUser(id: string, input: Partial<UserDraft>): Promise<User> {
    const actor = this.actor();
    const current = this.findManageable(actor, id);
    const changes = userChanges(input);
    // Without users.edit, people can still change their own name, phone and photo
    if (!this.permissions(actor).has('users.edit')) {
      const changed = (Object.keys(changes) as (keyof UserDraft)[]).filter(field => changes[field] !== current[field]);
      if (id !== actor.id || changed.some(field => !(SELF_EDITABLE_FIELDS as readonly string[]).includes(field))) {
        throw new AdminApiError('forbidden');
      }
    }
    if (changes.email !== undefined) {
      this.assertEmailFree(changes.email, id);
      if (changes.email.toLowerCase() !== current.email.toLowerCase()) {
        this.assertEmailDomain(changes.email);
      }
    }
    const roleChanged = changes.roleId !== undefined && changes.roleId !== current.roleId;
    const statusChanged = changes.status !== undefined && changes.status !== current.status;
    if (id === actor.id && (roleChanged || statusChanged)) {
      throw new AdminApiError('self_change');
    }
    if (roleChanged) {
      this.assertCanAssign(actor, changes.roleId!);
    }
    const user = { ...current, ...changes };
    this.data.users = this.data.users.map(item => item.id === id ? user : item);
    const diff = USER_FIELDS.filter(field => current[field] !== user[field]).map<ActivityChange>(field =>
      // Photos are data URLs: too big to keep, so the log only notes that it changed
      field === 'avatar' ? { field } : { field, from: current[field], to: user[field] });
    this.log(actor.id, 'user.updated', fullName(user), id, diff);
    return this.respond(user);
  }

  async setUserStatus(ids: string[], status: UserStatus): Promise<User[]> {
    const actor = this.actor('users.edit');
    if (ids.includes(actor.id)) {
      throw new AdminApiError('self_change');
    }
    ids.forEach(id => this.findManageable(actor, id));
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
      ]);
      return updated;
    });
    return this.respond(changed);
  }

  async setUsersRole(ids: string[], roleId: string): Promise<User[]> {
    const actor = this.actor('users.edit');
    check(Array.isArray(ids) && ids.every(id => typeof id === 'string') && typeof roleId === 'string');
    if (ids.includes(actor.id)) {
      throw new AdminApiError('self_change');
    }
    this.assertCanAssign(actor, roleId);
    ids.forEach(id => this.findManageable(actor, id));
    const changed: User[] = [];
    this.data.users = this.data.users.map(user => {
      if (!ids.includes(user.id) || user.roleId === roleId) {
        return user;
      }
      const updated = { ...user, roleId };
      changed.push(updated);
      this.log(actor.id, 'user.updated', fullName(user), user.id, [{ field: 'roleId', from: user.roleId, to: roleId }]);
      return updated;
    });
    return this.respond(changed);
  }

  async deleteUsers(ids: string[]): Promise<void> {
    const actor = this.actor('users.delete');
    if (ids.includes(actor.id)) {
      throw new AdminApiError('self_change');
    }
    for (const user of ids.map(id => this.findManageable(actor, id))) {
      this.log(actor.id, 'user.deleted', fullName(user), undefined, [
        { field: 'email', from: user.email },
        { field: 'roleId', from: user.roleId },
      ]);
    }
    this.data.users = this.data.users.filter(user => !ids.includes(user.id));
    this.data.sessions = this.data.sessions.filter(session => !ids.includes(session.userId));
    return this.respond(undefined);
  }

  async resetPassword(id: string): Promise<void> {
    const actor = this.actor('users.edit');
    const user = this.findManageable(actor, id);
    this.log(actor.id, 'user.password_reset', fullName(user), id);
    this.sendLink(user, 'reset');
    // The old password stops working, so the sessions it opened end too
    if (id !== actor.id) {
      this.data.sessions = this.data.sessions.filter(session => session.userId !== id);
    }
    return this.respond(undefined);
  }

  async resendInvite(id: string): Promise<void> {
    const actor = this.actor('users.create');
    const user = this.findManageable(actor, id);
    if (user.status !== 'invited') {
      throw new AdminApiError('not_invited');
    }
    this.log(actor.id, 'user.invited', fullName(user), id);
    this.sendLink(user, 'invite');
    return this.respond(undefined);
  }

  /* Roles */

  async listRoles(): Promise<Role[]> {
    this.actor(undefined, true);
    return this.respond(this.data.roles);
  }

  async createRole(input: RoleDraft): Promise<Role> {
    const actor = this.actor('roles.manage');
    const draft: RoleDraft = { name: '', description: '', tone: 'neutral', permissions: [], ...roleChanges(input) };
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
    const role = { ...current, ...changes };
    const added = role.permissions.filter(key => !current.permissions.includes(key));
    const removed = current.permissions.filter(key => !role.permissions.includes(key));
    if (added.length || removed.length) {
      if (id === actor.roleId) {
        throw new AdminApiError('self_change');
      }
      if (!holdsAll(this.permissions(actor), [...added, ...removed])) {
        throw new AdminApiError('forbidden');
      }
    }
    this.data.roles = this.data.roles.map(item => item.id === id ? role : item);
    const diff: ActivityChange[] = (['name', 'description', 'tone'] as const)
      .filter(field => current[field] !== role[field])
      .map(field => ({ field, from: current[field], to: role[field] }));
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
    if (this.data.users.some(user => user.roleId === id)) {
      throw new AdminApiError('role_in_use');
    }
    if (this.data.settings.defaultRoleId === id) {
      throw new AdminApiError('default_role');
    }
    this.data.roles = this.data.roles.filter(item => item.id !== id);
    const settings = this.data.settings;
    this.data.settings = { ...settings, twoFactorRoleIds: settings.twoFactorRoleIds.filter(roleId => roleId !== id) };
    this.log(actor.id, 'role.deleted', role.name, undefined, [{ field: 'permissions', added: [], removed: role.permissions }]);
    return this.respond(undefined);
  }

  /* Activity */

  async listActivity(range: ActivityRange = {}): Promise<Activity[]> {
    const actor = this.actor();
    const { from, to } = range;
    check([from, to].every(value => value === undefined || isInstant(value)));
    if (!this.permissions(actor).has('activity.view')) {
      return this.respond([]);
    }
    const after = from ? new Date(from).getTime() : -Infinity;
    const before = to ? new Date(to).getTime() : Infinity;
    return this.respond(this.data.activity.filter(entry => {
      const at = new Date(entry.at).getTime();
      return at >= after && at < before;
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
    const current = this.data.settings;
    const settings: AdminSettings = {
      ...current,
      ...changes,
      allowedDomains: [...new Set((changes.allowedDomains ?? current.allowedDomains).map(domain => domain.trim().toLowerCase()).filter(Boolean))],
      twoFactorRoleIds: [...new Set(changes.twoFactorRoleIds ?? current.twoFactorRoleIds)],
    };
    this.data.settings = settings;
    const diff: ActivityChange[] = ([
      'defaultRoleId', 'inviteExpiryDays', 'sessionTimeoutMinutes', 'passwordMinLength', 'passwordHistory', 'activityRetentionDays',
    ] as const)
      .filter(field => current[field] !== settings[field])
      .map(field => ({ field, from: String(current[field]), to: String(settings[field]) }));
    for (const field of ['allowedDomains', 'twoFactorRoleIds'] as const) {
      const added = settings[field].filter(item => !current[field].includes(item));
      const removed = current[field].filter(item => !settings[field].includes(item));
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

  async endSession(sessionId: string): Promise<void> {
    const actor = this.actor();
    const session = this.data.sessions.find(item => item.id === sessionId);
    if (!session) {
      throw new AdminApiError('not_found');
    }
    const user = this.assertCanSeeSecurity(actor, session.userId);
    this.data.sessions = this.data.sessions.filter(item => item.id !== sessionId);
    this.log(actor.id, 'auth.sessions_ended', fullName(user), user.id, [{ field: 'devices', added: [], removed: [deviceName(session)] }]);
    return this.respond(undefined);
  }

  async endSessions(userId: string): Promise<void> {
    const actor = this.actor();
    const user = this.assertCanSeeSecurity(actor, userId);
    // Your own: everywhere but this browser
    const here = this.currentSession()?.session.id;
    const ended = this.data.sessions.filter(session => session.userId === userId && session.id !== here);
    this.data.sessions = this.data.sessions.filter(session => !ended.includes(session));
    if (ended.length) {
      this.log(actor.id, 'auth.sessions_ended', fullName(user), user.id, [{ field: 'devices', added: [], removed: ended.map(deviceName) }]);
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

  async confirmTwoFactor(code: string): Promise<User> {
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
    return this.respond(user);
  }

  async disableTwoFactor(code: string): Promise<User> {
    const actor = this.actor();
    if (this.data.settings.twoFactorRoleIds.includes(actor.roleId)) {
      throw new AdminApiError('two_factor_mandatory');
    }
    const secret = this.data.twoFactorSecrets?.[actor.id];
    if (!secret || !(await verifyTotp(secret, String(code ?? '')))) {
      await this.respond(undefined);
      throw new AdminApiError('invalid_code');
    }
    const user = this.setTwoFactor(actor.id, false);
    this.log(actor.id, 'auth.two_factor_off', fullName(user), user.id);
    return this.respond(user);
  }

  async resetTwoFactor(userId: string): Promise<User> {
    const actor = this.actor('users.edit');
    // Your own goes through disableTwoFactor, with a code
    if (userId === actor.id) {
      throw new AdminApiError('self_change');
    }
    this.findManageable(actor, userId);
    const user = this.setTwoFactor(userId, false);
    this.log(actor.id, 'auth.two_factor_off', fullName(user), user.id);
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
    if (userId === actor.id) {
      return actor;
    }
    if (!this.permissions(actor).has('users.edit')) {
      throw new AdminApiError('forbidden');
    }
    return this.findManageable(actor, userId);
  }

  private setTwoFactor(userId: string, on: boolean): User {
    if (!on) {
      const { [userId]: _, ...secrets } = this.data.twoFactorSecrets ?? {};
      this.data.twoFactorSecrets = secrets;
    }
    const user = { ...this.findUser(userId), twoFactor: on };
    this.data.users = this.data.users.map(item => item.id === userId ? user : item);
    return user;
  }

  private assertCanCreate(actor: User, draft: UserDraft) {
    this.assertCanAssign(actor, draft.roleId);
    this.assertEmailFree(draft.email);
    this.assertEmailDomain(draft.email);
  }

  private addUser(actor: User, draft: UserDraft): User {
    const now = new Date().toISOString();
    const user: User = { ...draft, id: `u-${crypto.randomUUID().slice(0, 8)}`, createdAt: now, lastActiveAt: null };
    this.data.users = [user, ...this.data.users];
    this.log(actor.id, draft.status === 'invited' ? 'user.invited' : 'user.created', fullName(user), user.id, [
      { field: 'roleId', to: user.roleId },
      { field: 'department', to: user.department },
      { field: 'email', to: user.email },
      { field: 'status', to: user.status },
    ]);
    if (user.status === 'invited') {
      this.sendLink(user, 'invite');
    }
    return user;
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
    if (!setupAllowed && !user.twoFactor && this.data.settings.twoFactorRoleIds.includes(user.roleId)) {
      throw new AdminApiError('two_factor_mandatory');
    }
    if (permission && !this.permissions(user).has(permission)) {
      throw new AdminApiError('forbidden');
    }
    return user;
  }

  private permissions(user: User): ReadonlySet<Permission> {
    return permissionsOf(user, this.data.roles);
  }

  private findUser(id: string): User {
    const user = this.data.users.find(item => item.id === id);
    if (!user) {
      throw new AdminApiError('not_found');
    }
    return user;
  }

  /** A user the actor may change: nobody can manage someone whose role allows more than their own */
  private findManageable(actor: User, id: string): User {
    const user = this.findUser(id);
    if (user.id !== actor.id && !canManageRole(this.permissions(actor), this.data.roles.find(role => role.id === user.roleId))) {
      throw new AdminApiError('forbidden');
    }
    return user;
  }

  private assertCanAssign(actor: User, roleId: string) {
    const role = this.data.roles.find(item => item.id === roleId);
    if (!role) {
      throw new AdminApiError('not_found');
    }
    if (!holdsAll(this.permissions(actor), role.permissions)) {
      throw new AdminApiError('forbidden');
    }
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

  private log(actorId: string, action: ActivityAction, targetLabel: string, targetId?: string, changes?: ActivityChange[]) {
    const entry: Activity = {
      id: `a-${crypto.randomUUID().slice(0, 8)}`,
      at: new Date().toISOString(),
      actorId,
      action,
      targetLabel,
      targetId,
      ...this.client,
      changes: changes?.length ? changes : undefined,
    };
    this.data.activity = [entry, ...this.data.activity];
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
        // Activity older than the settings keep is gone, as the server deletes it every night
        const kept = new Date(Date.now() - data.settings.activityRetentionDays * DAY_MS).toISOString();
        data.activity = data.activity.filter(entry => entry.at >= kept);
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

function userChanges(input: unknown): Partial<UserDraft> {
  const changes = fields(input, USER_FIELDS);
  check(Object.values(changes).every(value => typeof value === 'string'));
  check(changes['status'] === undefined || (changes['status'] as string) in STATUS_META);
  check(changes['email'] === undefined || EMAIL.test((changes['email'] as string).trim()));
  return changes as Partial<UserDraft>;
}

function userDraft(input: unknown): UserDraft {
  const changes = userChanges(input);
  check(['firstName', 'lastName', 'email', 'department', 'roleId', 'status'].every(field => field in changes));
  return { phone: '', avatar: '', ...changes } as UserDraft;
}

function roleChanges(input: unknown): Partial<RoleDraft> {
  const changes = fields(input, ['name', 'description', 'tone', 'permissions']);
  check(['name', 'description'].every(field => changes[field] === undefined || typeof changes[field] === 'string'));
  check(changes['tone'] === undefined || ROLE_TONES.includes(changes['tone'] as never));
  check(changes['permissions'] === undefined
    || (Array.isArray(changes['permissions']) && changes['permissions'].every(key => ALL_PERMISSIONS.includes(key))));
  return changes as Partial<RoleDraft>;
}

/** The whole numbers each settings field accepts */
const SETTINGS_RANGES: Record<string, [min: number, max: number]> = {
  inviteExpiryDays: [0, 365],
  sessionTimeoutMinutes: [0, 10080],
  passwordMinLength: [8, 64],
  passwordHistory: [0, 24],
  activityRetentionDays: [30, 3650],
};

function settingsChanges(input: unknown): Partial<AdminSettings> {
  const changes = fields(input, ['defaultRoleId', 'allowedDomains', 'twoFactorRoleIds', ...Object.keys(SETTINGS_RANGES)]);
  check(changes['defaultRoleId'] === undefined || typeof changes['defaultRoleId'] === 'string');
  check(['allowedDomains', 'twoFactorRoleIds'].every(field => changes[field] === undefined
    || (Array.isArray(changes[field]) && (changes[field] as unknown[]).every(item => typeof item === 'string'))));
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
