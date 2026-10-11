import { computed, effect, inject, Injectable, signal } from '@angular/core';

import { activeRoleIds, roleAssignmentState } from './access-rules';
import { AdminApi, AdminApiError } from './admin-api';
import { DEFAULT_SETTINGS } from './catalog';
import {
  Activity, ActivityRange, AdminSettings, Branch, BranchChanges, BranchDraft, Role, RoleAssignmentBatch, RoleAssignmentChanges,
  RoleAssignmentDraft, RoleDraft, TwoFactorSetup, User, UserChanges, UserDraft, UserSession, UserStatus,
} from './models';

/** How long to wait for more changes before loading again, as one action can change several things */
const REFRESH_DELAY_MS = 300;
/** The clock moves on at least this often, and at each moment an assignment starts or ends */
const CLOCK_MS = 60 * 60_000;

/**
 * The data the screens share, as signals, kept in step with the server through AdminApi.
 * Each change waits for the server's answer before updating the signals.
 * Session loads it after sign-in and clears it on sign-out.
 */
@Injectable({ providedIn: 'root' })
export class AdminStore {
  private readonly api = inject(AdminApi);

  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly branches = signal<Branch[]>([]);
  readonly activity = signal<Activity[]>([]);
  readonly settings = signal<AdminSettings>(DEFAULT_SETTINGS);
  readonly loaded = signal(false);
  /** Set when the server answers that the session has ended; Session then sends the user to sign in */
  readonly sessionEnded = signal(false);
  /**
   * Set when the signed-in user's role requires two-step sign-in and it is off (two_factor_mandatory). Until they turn
   * it on, only the roles and the settings load, and Session keeps them on the page for setting it up.
   */
  readonly twoFactorSetupRequired = signal(false);
  /** Goes up each time the data is loaded again, so a page can reload what it fetched itself */
  readonly revision = signal(0);
  /**
   * Changes made elsewhere wait for showChanges() rather than appearing by themselves, so the page never changes
   * under someone (the accessible view, WCAG 2.2.4). Changes the person makes here show at once either way.
   */
  readonly holdChanges = signal(false);
  /** Changes made elsewhere are waiting to be shown, while holdChanges is on */
  readonly changesWaiting = signal(false);

  private stopWatching?: () => void;
  private refreshTimer?: ReturnType<typeof setTimeout>;

  readonly usersById = computed(() => new Map(this.users().map(user => [user.id, user])));
  readonly rolesById = computed(() => new Map(this.roles().map(role => [role.id, role])));
  readonly branchesById = computed(() => new Map(this.branches().map(branch => [branch.id, branch])));
  /** Branches are in use: turned on in the settings */
  readonly branchesEnabled = computed(() => this.settings().branchesEnabled);
  /** The ones people can join or get a role in */
  readonly openBranches = computed(() => this.branches().filter(branch => branch.active));

  /**
   * Now, as far as role assignments go: it moves on when one starts or ends, so whatever depends on who holds which
   * role (permissions, badges, counts) follows without a reload. Read it instead of Date.now() in a computed.
   */
  readonly now = signal(Date.now());

  /** How many people hold each role now */
  readonly roleCounts = computed(() => {
    const now = this.now();
    const counts = new Map<string, number>();
    for (const user of this.users()) {
      for (const roleId of activeRoleIds(user, now)) {
        counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
      }
    }
    return counts;
  });

  /**
   * How many people each role is the main role of: the one with most permissions they hold now. Everyone counts once,
   * for a chart of the whole; roleCounts counts everyone who holds each role.
   */
  readonly mainRoleCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const user of this.users()) {
      const main = this.activeRoles(user)[0];
      if (main) {
        counts.set(main.id, (counts.get(main.id) ?? 0) + 1);
      }
    }
    return counts;
  });

  /** The roles someone holds now, the ones with most permissions first */
  activeRoles(user: Pick<User, 'roles'> | null | undefined): Role[] {
    const roles = this.rolesById();
    return activeRoleIds(user, this.now())
      .map(id => roles.get(id))
      .filter((role): role is Role => !!role)
      .sort((a, b) => b.permissions.length - a.permissions.length);
  }

  constructor() {
    // Moves the clock on at the next start or end of an assignment, or within the hour
    effect(onCleanup => {
      const now = this.now();
      const next = this.users()
        .flatMap(user => user.roles.flatMap(item => [item.startsAt, item.endsAt]))
        .map(at => at ? new Date(at).getTime() : Infinity)
        .filter(at => at > now)
        .reduce((soonest, at) => Math.min(soonest, at), now + CLOCK_MS);
      const timer = setTimeout(() => this.now.set(Date.now()), Math.max(next - now, 1000));
      onCleanup(() => clearTimeout(timer));
    });
  }

  async load(): Promise<void> {
    let loaded: [User[], Role[], Activity[], AdminSettings, Branch[]];
    try {
      loaded = await this.fetchAll();
    } catch (error) {
      if (!(error instanceof AdminApiError && error.code === 'two_factor_mandatory')) {
        throw error;
      }
      // Only what setting up two-step sign-in needs
      const [roles, settings] = await this.call(() => Promise.all([this.api.listRoles(), this.api.getSettings()]));
      this.clear();
      this.roles.set(roles);
      this.settings.set(settings);
      this.twoFactorSetupRequired.set(true);
      this.loaded.set(true);
      return;
    }
    const [users, roles, activity, settings, branches] = loaded;
    this.twoFactorSetupRequired.set(false);
    this.users.set(users);
    this.roles.set(roles);
    this.branches.set(branches);
    this.activity.set(activity);
    this.settings.set(settings);
    this.sessionEnded.set(false);
    this.changesWaiting.set(false);
    this.loaded.set(true);
    this.revision.update(revision => revision + 1);
    this.watch();
  }

  /** Signed in again on the same page (Session.resume): what changed meanwhile shows, or waits (holdChanges) */
  resume(): void {
    this.sessionEnded.set(false);
    this.update();
    this.watch();
  }

  /** Shows the changes that were waiting */
  async showChanges(): Promise<void> {
    this.changesWaiting.set(false);
    await this.refresh();
  }

  /** Loads everything again, quietly; a session that ended elsewhere is noticed here */
  async refresh(): Promise<void> {
    try {
      const [users, roles, activity, settings, branches] = await this.fetchAll();
      this.users.set(users);
      this.roles.set(roles);
      this.branches.set(branches);
      this.activity.set(activity);
      this.settings.set(settings);
      this.revision.update(revision => revision + 1);
    } catch {
      // Offline for a moment: the next change tries again
    }
  }

  private fetchAll() {
    return this.call(() => Promise.all([
      this.api.listUsers(), this.api.listRoles(), this.api.listActivity(), this.api.getSettings(), this.api.listBranches(),
    ]));
  }

  /** Changes made elsewhere show up without a reload, or wait to be asked for (holdChanges) */
  private watch() {
    this.stopWatching?.();
    this.stopWatching = this.api.watch(() => {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.update(), REFRESH_DELAY_MS);
    });
  }

  /**
   * Loads again, or, while holding changes, only looks: the data stays, and the notice shows when something differs.
   * Either way a session that ended elsewhere is noticed.
   */
  private async update() {
    if (!this.holdChanges()) {
      return this.refresh();
    }
    try {
      const latest = await this.fetchAll();
      const shown = [this.users(), this.roles(), this.activity(), this.settings(), this.branches()];
      if (JSON.stringify(latest) !== JSON.stringify(shown)) {
        this.changesWaiting.set(true);
      }
    } catch {
      // Offline for a moment: the next change tries again
    }
  }

  /** Forgets everything, after signing out */
  clear() {
    this.stopWatching?.();
    this.stopWatching = undefined;
    clearTimeout(this.refreshTimer);
    this.users.set([]);
    this.roles.set([]);
    this.branches.set([]);
    this.activity.set([]);
    this.settings.set(DEFAULT_SETTINGS);
    this.loaded.set(false);
    this.sessionEnded.set(false);
    this.changesWaiting.set(false);
    this.twoFactorSetupRequired.set(false);
  }

  isEmailTaken(email: string, exceptId?: string): boolean {
    const value = email.trim().toLowerCase();
    return this.users().some(user => user.id !== exceptId && user.email.toLowerCase() === value);
  }

  /* Users */

  async createUser(draft: UserDraft): Promise<User> {
    const user = await this.call(() => this.api.createUser(draft));
    this.users.update(users => [user, ...users]);
    await this.refreshActivity();
    return user;
  }

  async createUsers(drafts: UserDraft[]): Promise<User[]> {
    const created = await this.call(() => this.api.createUsers(drafts));
    // Newest first, as the server lists them
    this.users.update(users => [...[...created].reverse(), ...users]);
    await this.refreshActivity();
    return created;
  }

  async updateUser(id: string, changes: UserChanges): Promise<User> {
    const user = await this.call(() => this.api.updateUser(id, changes));
    this.users.update(users => users.map(item => item.id === id ? user : item));
    await this.refreshActivity();
    return user;
  }

  async setUserStatus(ids: string[], status: UserStatus, reason?: string): Promise<void> {
    const changed = await this.call(() => this.api.setUserStatus(ids, status, reason));
    const byId = new Map(changed.map(user => [user.id, user]));
    this.users.update(users => users.map(user => byId.get(user.id) ?? user));
    await this.refreshActivity();
  }

  /* Role assignments */

  async assignRole(draft: RoleAssignmentDraft): Promise<User> {
    return this.afterUserChange(await this.call(() => this.api.assignRole(draft)));
  }

  async updateRoleAssignment(id: string, changes: RoleAssignmentChanges): Promise<User> {
    return this.afterUserChange(await this.call(() => this.api.updateRoleAssignment(id, changes)));
  }

  async removeRoleAssignment(id: string, reason?: string): Promise<User> {
    return this.afterUserChange(await this.call(() => this.api.removeRoleAssignment(id, reason)));
  }

  /** Gives several people a role, or takes one away; answers with the people that changed */
  async assignRoles(userIds: string[], change: RoleAssignmentBatch): Promise<User[]> {
    const changed = await this.call(() => this.api.assignRoles(userIds, change));
    const byId = new Map(changed.map(user => [user.id, user]));
    this.users.update(users => users.map(user => byId.get(user.id) ?? user));
    await this.refreshActivity();
    return changed;
  }

  /**
   * Whether someone holds a role now or will hold it, for offering to give or take it: in any scope, or, given a branch
   * id or null (the whole organization), in that one
   */
  holdsOrWillHold(user: Pick<User, 'roles'>, roleId: string, branchId?: string | null): boolean {
    const now = this.now();
    return user.roles.some(item => item.roleId === roleId && (branchId === undefined || item.branchId === branchId)
      && roleAssignmentState(item, now) !== 'expired');
  }

  async deleteUsers(ids: string[], reason?: string): Promise<void> {
    await this.call(() => this.api.deleteUsers(ids, reason));
    this.users.update(users => users.filter(user => !ids.includes(user.id)));
    await this.refreshActivity();
  }

  async resetPassword(id: string, reason?: string): Promise<void> {
    await this.call(() => this.api.resetPassword(id, reason));
    await this.refreshActivity();
  }

  async resendInvite(id: string): Promise<void> {
    await this.call(() => this.api.resendInvite(id));
    await this.refreshActivity();
  }

  /* Branches */

  async createBranch(draft: BranchDraft): Promise<Branch> {
    const branch = await this.call(() => this.api.createBranch(draft));
    this.branches.update(branches => [...branches, branch]);
    await this.refreshActivity();
    return branch;
  }

  async updateBranch(id: string, changes: BranchChanges): Promise<Branch> {
    const branch = await this.call(() => this.api.updateBranch(id, changes));
    this.branches.update(branches => branches.map(item => item.id === id ? branch : item));
    await this.refreshActivity();
    return branch;
  }

  async deleteBranch(id: string): Promise<void> {
    await this.call(() => this.api.deleteBranch(id));
    this.branches.update(branches => branches.filter(item => item.id !== id));
    // Ended assignments limited to it are gone too
    this.users.set(await this.call(() => this.api.listUsers()));
    await this.refreshActivity();
  }

  /** How many people belong to each branch */
  readonly branchCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const user of this.users()) {
      if (user.branchId) {
        counts.set(user.branchId, (counts.get(user.branchId) ?? 0) + 1);
      }
    }
    return counts;
  });

  /* Roles */

  async createRole(draft: RoleDraft): Promise<Role> {
    const role = await this.call(() => this.api.createRole(draft));
    this.roles.update(roles => [...roles, role]);
    await this.refreshActivity();
    return role;
  }

  async updateRole(id: string, changes: Partial<RoleDraft>): Promise<Role> {
    const role = await this.call(() => this.api.updateRole(id, changes));
    this.roles.update(roles => roles.map(item => item.id === id ? role : item));
    await this.refreshActivity();
    return role;
  }

  async deleteRole(id: string): Promise<void> {
    await this.call(() => this.api.deleteRole(id));
    this.roles.update(roles => roles.filter(role => role.id !== id));
    await this.refreshActivity();
  }

  /* Settings */

  async updateSettings(changes: Partial<AdminSettings>): Promise<AdminSettings> {
    const settings = await this.call(() => this.api.updateSettings(changes));
    this.settings.set(settings);
    await this.refreshActivity();
    return settings;
  }

  /* Activity */

  /** A part of the activity log straight from the server, beyond what the pages keep loaded */
  activityBetween(range: ActivityRange): Promise<Activity[]> {
    return this.call(() => this.api.listActivity(range));
  }

  /* Signed-in devices and two-step sign-in */

  listSessions(userId: string): Promise<UserSession[]> {
    return this.call(() => this.api.listSessions(userId));
  }

  async endSession(sessionId: string, reason?: string): Promise<void> {
    await this.call(() => this.api.endSession(sessionId, reason));
    await this.refreshActivity();
  }

  async endSessions(userId: string, reason?: string): Promise<void> {
    await this.call(() => this.api.endSessions(userId, reason));
    await this.refreshActivity();
  }

  startTwoFactor(): Promise<TwoFactorSetup> {
    return this.call(() => this.api.startTwoFactor());
  }

  async confirmTwoFactor(code: string): Promise<User> {
    return this.afterUserChange(await this.call(() => this.api.confirmTwoFactor(code)));
  }

  async disableTwoFactor(code: string): Promise<User> {
    // Refused with two_factor_mandatory when the role requires it: two-step sign-in stays on, nothing to set up
    return this.afterUserChange(await this.call(() => this.api.disableTwoFactor(code), false));
  }

  async resetTwoFactor(userId: string, reason?: string): Promise<User> {
    return this.afterUserChange(await this.call(() => this.api.resetTwoFactor(userId, reason)));
  }

  private async afterUserChange(user: User): Promise<User> {
    this.users.update(users => users.map(item => item.id === user.id ? user : item));
    await this.refreshActivity().catch(() => undefined);
    return user;
  }

  private async refreshActivity(): Promise<void> {
    this.activity.set(await this.call(() => this.api.listActivity()));
  }

  /**
   * Runs a request, noting when it failed because the session has ended, or because two-step sign-in has to be set up
   * first (unless the request can only be refused for the other reason two_factor_mandatory has)
   */
  private async call<T>(request: () => Promise<T>, setupMayBeRequired = true): Promise<T> {
    try {
      const result = await request();
      // What the server answers is as of now: a role given a moment ago counts at once, not at the clock's next move
      this.now.set(Date.now());
      return result;
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'unauthenticated') {
        this.sessionEnded.set(true);
      }
      if (setupMayBeRequired && error instanceof AdminApiError && error.code === 'two_factor_mandatory') {
        this.twoFactorSetupRequired.set(true);
      }
      throw error;
    }
  }
}
