import { computed, DOCUMENT, effect, inject, Injectable, InjectionToken, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

import { canManageUser, holdsAll, permissionsOf } from '../data/access-rules';
import { AdminApi } from '../data/admin-api';
import { AdminStore } from '../data/admin-store';
import { Permission, Role, User } from '../data/models';
import { idleTimeoutLabel } from '../shared/formatting';
import { UiAccessibleViewService, UiToastService } from '../ui';

/** The app's sign-in page, where guards send people who are not signed in. Set by provideUserManagement(). */
export const SIGN_IN_PATH = new InjectionToken<string>('SIGN_IN_PATH', { factory: () => '/login' });

/** What counts as using the app, for signing out when idle */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
/** How often the idle timer looks at the clock */
const IDLE_CHECK_MS = 15_000;
/** How long before signing out when idle the app warns */
const IDLE_WARNING_MS = 60_000;
/** When the app was last used in any tab of this browser, so tabs share one idle timer and a reload does not reset it */
const LAST_ACTIVE_KEY = 'admin-last-active';

/** Where someone goes whose role requires two-step sign-in while it is off; nothing else opens until it is on */
export const TWO_FACTOR_SETUP_PATH = '/setup-two-factor';

/** Navigation state that lets a signed-in user onto the sign-in page while signing out */
export const SIGNING_OUT = 'signingOut';

/** Why someone was sent back to the sign-in page, as ?expired=… */
export type SessionEndReason = 'ended' | 'idle';

/**
 * Who is signed in and what their role lets them do. Pages ask it before showing an action:
 *
 *   @if (session.can('users.delete')) { <button …>Delete</button> }
 *
 * It only hides what the server would refuse anyway; the server checks every request itself.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly api = inject(AdminApi);
  private readonly store = inject(AdminStore);
  private readonly router = inject(Router);
  private readonly signInPath = inject(SIGN_IN_PATH);
  private readonly document = inject(DOCUMENT);
  private readonly toast = inject(UiToastService);
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly accessibleView = inject(UiAccessibleViewService);

  /** The account the server signed in. Once the data loads, the store's copy takes over, so edits show at once. */
  private readonly account = signal<User | null>(null);

  readonly user = computed(() => {
    const account = this.account();
    return account ? this.store.usersById().get(account.id) ?? account : null;
  });
  readonly userId = computed(() => this.account()?.id ?? null);
  readonly signedIn = computed(() => this.account() !== null);
  /** The roles the signed-in user holds now, the ones with most permissions first */
  readonly roles = computed(() => this.store.activeRoles(this.user()));
  /** The role to name them by: the one with most permissions */
  readonly role = computed<Role | undefined>(() => this.roles()[0]);
  /** Every permission of the roles they hold now, together; follows assignments as they start and end */
  readonly permissions = computed<ReadonlySet<Permission>>(() => permissionsOf(this.user(), this.store.roles(), this.store.now()));
  /** The role requires two-step sign-in and it is off: only the setup page opens (API.md, "Roles that must use…") */
  readonly twoFactorSetupRequired = computed(() => this.signedIn() && this.store.twoFactorSetupRequired());
  /**
   * In the accessible view, why the session ended while the page stays as it was, for signing in again over it
   * (ReauthDialog, WCAG 2.2.5) rather than being taken to the sign-in page (3.2.5). Null while signed in.
   */
  readonly paused = signal<SessionEndReason | null>(null);

  /** "Keep me signed in" at the last sign-in, for signing in again the same way */
  private remember = false;

  /** When the signed-in user last used the app in this tab, and when that was last shared with other tabs */
  private lastActive = Date.now();
  private lastShared = 0;

  constructor() {
    // The server said the session ended (signed out elsewhere, or the account was suspended): sign in again
    effect(() => {
      if (this.store.sessionEnded() && untracked(this.signedIn) && !untracked(this.paused)) {
        untracked(() => this.expire('ended'));
      }
    });

    // The settings came to require two-step sign-in for this role while the app was open: set it up first. The
    // accessible view says so instead (NoticesComponent), and the next page opened is the setup page.
    effect(() => {
      if (this.twoFactorSetupRequired() && !untracked(this.accessibleView.on)) {
        untracked(() => this.router.navigateByUrl(TWO_FACTOR_SETUP_PATH));
      }
    });

    // The accessible view holds changes made elsewhere until asked for; turned off, any that wait show at once
    effect(() => {
      const hold = this.accessibleView.on();
      this.store.holdChanges.set(hold);
      if (!hold && untracked(this.store.changesWaiting)) {
        untracked(() => this.store.showChanges());
      }
    });

    // With a timeout in the settings, sign out after that long without a click, key press or scroll
    effect(onCleanup => {
      const minutes = this.store.settings().sessionTimeoutMinutes;
      const view = this.document.defaultView;
      if (!this.signedIn() || this.paused() || !minutes || !view) {
        return;
      }
      this.markActive();
      // Once per sign-in: how long someone can leave the app before it signs them out (WCAG 2.2.6); the account
      // menu says so too
      const notice = `idle-notice:${this.userId()}:${minutes}`;
      const translate = this.translate;
      if (translate && !readSession(notice)) {
        writeSession(notice);
        this.toast.show(translate.instant('idleNotice', { time: idleTimeoutLabel(translate, minutes) }), 'info', 8000);
      }
      /** The warning that signing out is a minute away, taken back once the app is used again */
      let warning: number | undefined;
      const touch = () => {
        this.markActive();
        if (warning !== undefined) {
          this.toast.dismiss(warning);
          warning = undefined;
        }
      };
      ACTIVITY_EVENTS.forEach(type => this.document.addEventListener(type, touch, { capture: true, passive: true }));
      let warned = false;
      const timer = view.setInterval(() => {
        const idle = Date.now() - this.lastActiveAnywhere();
        if (idle >= minutes * 60_000) {
          untracked(() => this.signOutIdle());
        } else if (idle >= minutes * 60_000 - IDLE_WARNING_MS) {
          // A minute's notice, shown once, so someone reading a page can stay signed in
          if (!warned) {
            warned = true;
            const message = 'You will be signed out in a minute. Click anywhere to stay signed in.';
            warning = this.toast.show(this.translate?.instant(message) ?? message, 'info', IDLE_WARNING_MS);
          }
        } else {
          warned = false;
        }
      }, IDLE_CHECK_MS);
      onCleanup(() => {
        view.clearInterval(timer);
        if (warning !== undefined) {
          this.toast.dismiss(warning);
        }
        ACTIVITY_EVENTS.forEach(type => this.document.removeEventListener(type, touch, { capture: true }));
      });
    });
  }

  can(permission: Permission): boolean {
    return this.permissions().has(permission);
  }

  isSelf(user: Pick<User, 'id'> | null | undefined): boolean {
    return !!user && user.id === this.userId();
  }

  /** Whether the signed-in user may give someone this role: it grants nothing they lack */
  canAssign(role: Pick<Role, 'permissions'> | undefined): boolean {
    return !!role && holdsAll(this.permissions(), role.permissions);
  }

  /** Whether the signed-in user may change this person: themselves, or someone whose roles, now or scheduled, they could give */
  canManage(user: Pick<User, 'id' | 'roles'>): boolean {
    return this.isSelf(user) || canManageUser(this.permissions(), user, this.store.roles(), this.store.now());
  }

  /** The first page the signed-in user can open: the overview, or their own profile when nothing else is allowed */
  homeUrl(): string {
    if (!this.signedIn()) {
      return this.signInPath;
    }
    if (this.twoFactorSetupRequired()) {
      return TWO_FACTOR_SETUP_PATH;
    }
    if (this.can('users.view')) {
      return '/overview';
    }
    if (this.can('activity.view')) {
      return '/activity';
    }
    if (this.can('roles.view')) {
      return '/roles';
    }
    if (this.can('settings.view')) {
      return '/settings';
    }
    return `/users/${this.userId()}`;
  }

  /** Picks up a session from before a reload. Runs before the first screen. */
  async restore(): Promise<void> {
    try {
      const user = await this.api.getSession();
      if (user) {
        this.account.set(user);
        await this.store.load();
        // Kept signed in, but away for longer than the idle timeout allows: start signed out
        const minutes = this.store.settings().sessionTimeoutMinutes;
        const last = readNumber(LAST_ACTIVE_KEY);
        if (minutes && last && Date.now() - last >= minutes * 60_000) {
          await this.api.signOut().catch(() => undefined);
          this.end();
        }
      }
    } catch {
      // The server could not be reached or the session is no longer valid: start signed out
      this.end();
    }
  }

  /** With two-step sign-in on, the first try fails with two_factor_required; try again with the code */
  async signIn(email: string, password: string, remember: boolean, code?: string): Promise<User> {
    const user = await this.api.signIn(email, password, remember, code);
    this.remember = remember;
    this.account.set(user);
    await this.store.load();
    return user;
  }

  /**
   * Signs the same person in again after the session ended in the accessible view. The page and what was typed on it
   * stay; the data is not loaded again until they ask (AdminStore.showChanges), so nothing on it changes by itself.
   */
  async resume(password: string, code?: string): Promise<void> {
    const email = this.user()?.email;
    if (!email || !this.paused()) {
      return;
    }
    const user = await this.api.signIn(email, password, this.remember, code);
    this.account.set(user);
    this.paused.set(null);
    this.store.resume();
  }

  /** Leaves the page the session ended on for the sign-in page, as the usual view does at once */
  leave(): void {
    const reason = this.paused() ?? 'ended';
    this.paused.set(null);
    this.end();
    this.router.navigate([this.signInPath], { queryParams: { expired: reason } });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.api.changePassword(currentPassword, newPassword);
    // The activity log gains an entry; the password has changed even if this refresh fails
    if (this.can('activity.view')) {
      this.api.listActivity().then(entries => this.store.activity.set(entries), () => undefined);
    }
  }

  /** Whether the signed-in user can edit this person's profile: their own name, phone and photo always */
  canEditProfile(user: Pick<User, 'id' | 'roles'>): boolean {
    return this.isSelf(user) || (this.can('users.edit') && this.canManage(user));
  }

  /**
   * Leaves for the sign-in page, then ends the session. A page with unsaved changes asks first; if the person
   * stays, they stay signed in. Resolves to whether they signed out.
   */
  async signOut(): Promise<boolean> {
    const left = await this.router.navigateByUrl(this.signInPath, { state: { [SIGNING_OUT]: true } });
    if (!left) {
      return false;
    }
    try {
      await this.api.signOut();
    } finally {
      this.end();
    }
    return true;
  }

  private end() {
    this.account.set(null);
    this.store.clear();
  }

  private markActive() {
    this.lastActive = Date.now();
    // Shared at most every few seconds, not on every key press
    if (this.lastActive - this.lastShared > 5_000) {
      this.lastShared = this.lastActive;
      writeNumber(LAST_ACTIVE_KEY, this.lastActive);
    }
  }

  private lastActiveAnywhere(): number {
    return Math.max(this.lastActive, readNumber(LAST_ACTIVE_KEY) ?? 0);
  }

  // A session that ends (idle, signed out elsewhere, suspended) starts over at the first page after signing in
  // again, as a first sign-in does; only a link opened while signed out leads back to that page. In the accessible
  // view it waits on the same page instead (paused)

  private async signOutIdle() {
    try {
      await this.api.signOut();
    } catch {
      // Already signed out on the server
    }
    if (this.accessibleView.on()) {
      this.paused.set('idle');
      return;
    }
    this.end();
    this.router.navigate([this.signInPath], { queryParams: { expired: 'idle' satisfies SessionEndReason } });
  }

  private expire(reason: SessionEndReason) {
    if (this.accessibleView.on()) {
      this.paused.set(reason);
      return;
    }
    this.end();
    this.router.navigate([this.signInPath], { queryParams: { expired: reason } });
  }
}

// Storage can be missing or blocked; the idle timer then only knows about this tab
function readNumber(key: string): number | null {
  try {
    return Number(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Not shared with other tabs
  }
}

function readSession(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSession(key: string): void {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    // Storage unavailable: the notice may show again after a reload
  }
}
