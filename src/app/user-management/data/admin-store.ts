import { computed, inject, Injectable, signal } from '@angular/core';

import { AdminApi, AdminApiError } from './admin-api';
import { DEFAULT_SETTINGS } from './catalog';
import {
  Activity, ActivityRange, AdminSettings, Role, RoleDraft, TwoFactorSetup, User, UserDraft, UserSession, UserStatus,
} from './models';

/** How long to wait for more changes before loading again, as one action can change several things */
const REFRESH_DELAY_MS = 300;

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

  private stopWatching?: () => void;
  private refreshTimer?: ReturnType<typeof setTimeout>;

  readonly usersById = computed(() => new Map(this.users().map(user => [user.id, user])));
  readonly rolesById = computed(() => new Map(this.roles().map(role => [role.id, role])));

  /** How many people hold each role */
  readonly roleCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const user of this.users()) {
      counts.set(user.roleId, (counts.get(user.roleId) ?? 0) + 1);
    }
    return counts;
  });

  async load(): Promise<void> {
    let loaded: [User[], Role[], Activity[], AdminSettings];
    try {
      loaded = await this.call(() =>
        Promise.all([this.api.listUsers(), this.api.listRoles(), this.api.listActivity(), this.api.getSettings()]));
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
    const [users, roles, activity, settings] = loaded;
    this.twoFactorSetupRequired.set(false);
    this.users.set(users);
    this.roles.set(roles);
    this.activity.set(activity);
    this.settings.set(settings);
    this.sessionEnded.set(false);
    this.loaded.set(true);
    this.revision.update(revision => revision + 1);
    // Changes made elsewhere show up without a reload
    this.stopWatching?.();
    this.stopWatching = this.api.watch(() => {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.refresh(), REFRESH_DELAY_MS);
    });
  }

  /** Loads everything again, quietly; a session that ended elsewhere is noticed here */
  async refresh(): Promise<void> {
    try {
      const [users, roles, activity, settings] = await this.call(() =>
        Promise.all([this.api.listUsers(), this.api.listRoles(), this.api.listActivity(), this.api.getSettings()]));
      this.users.set(users);
      this.roles.set(roles);
      this.activity.set(activity);
      this.settings.set(settings);
      this.revision.update(revision => revision + 1);
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
    this.activity.set([]);
    this.settings.set(DEFAULT_SETTINGS);
    this.loaded.set(false);
    this.sessionEnded.set(false);
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

  async updateUser(id: string, changes: Partial<UserDraft>): Promise<User> {
    const user = await this.call(() => this.api.updateUser(id, changes));
    this.users.update(users => users.map(item => item.id === id ? user : item));
    await this.refreshActivity();
    return user;
  }

  async setUserStatus(ids: string[], status: UserStatus): Promise<void> {
    const changed = await this.call(() => this.api.setUserStatus(ids, status));
    const byId = new Map(changed.map(user => [user.id, user]));
    this.users.update(users => users.map(user => byId.get(user.id) ?? user));
    await this.refreshActivity();
  }

  async setUsersRole(ids: string[], roleId: string): Promise<User[]> {
    const changed = await this.call(() => this.api.setUsersRole(ids, roleId));
    const byId = new Map(changed.map(user => [user.id, user]));
    this.users.update(users => users.map(user => byId.get(user.id) ?? user));
    await this.refreshActivity();
    return changed;
  }

  async deleteUsers(ids: string[]): Promise<void> {
    await this.call(() => this.api.deleteUsers(ids));
    this.users.update(users => users.filter(user => !ids.includes(user.id)));
    await this.refreshActivity();
  }

  async resetPassword(id: string): Promise<void> {
    await this.call(() => this.api.resetPassword(id));
    await this.refreshActivity();
  }

  async resendInvite(id: string): Promise<void> {
    await this.call(() => this.api.resendInvite(id));
    await this.refreshActivity();
  }

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

  async endSession(sessionId: string): Promise<void> {
    await this.call(() => this.api.endSession(sessionId));
    await this.refreshActivity();
  }

  async endSessions(userId: string): Promise<void> {
    await this.call(() => this.api.endSessions(userId));
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

  async resetTwoFactor(userId: string): Promise<User> {
    return this.afterUserChange(await this.call(() => this.api.resetTwoFactor(userId)));
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
      return await request();
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
