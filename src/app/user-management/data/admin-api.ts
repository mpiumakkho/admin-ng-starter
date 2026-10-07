import { Activity, AdminSettings, Role, RoleDraft, TwoFactorSetup, User, UserDraft, UserSession, UserStatus } from './models';

/** Why the server turned a request down; the UI turns each code into a message */
export type AdminApiErrorCode =
  | 'email_taken'
  | 'not_found'
  | 'not_invited'
  | 'role_in_use'
  | 'system_role'
  /** Wrong email or password */
  | 'invalid_credentials'
  /** The account exists but is suspended */
  | 'account_suspended'
  /** The account was invited and has not accepted yet */
  | 'invite_pending'
  /** Nobody is signed in, or the session ended */
  | 'unauthenticated'
  /** Signed in, but the role does not allow it */
  | 'forbidden'
  /** Suspending or deleting yourself, or changing your own role or its permissions */
  | 'self_change'
  /** The email is not on one of the allowed domains in the settings */
  | 'email_domain'
  /** A new password that is too short */
  | 'weak_password'
  /** The role is the default for new users in the settings */
  | 'default_role'
  /** A field the request may not set, or a value of the wrong kind */
  | 'invalid_request'
  /** The password was right; now the code from the authenticator app is needed */
  | 'two_factor_required'
  /** The code from the authenticator app is wrong or too old */
  | 'invalid_code';

export class AdminApiError extends Error {
  constructor(readonly code: AdminApiErrorCode) {
    super(code);
  }
}

/**
 * Everything the screens need from the server. The app picks one implementation with provideUserManagement():
 * LocalAdminApi keeps sample data in the browser; HttpAdminApi calls a real backend.
 *
 * The server knows who is signed in from the session (a cookie or a token), checks their permissions on every
 * request, and records the activity log itself, so callers never send who they are or write to the log.
 */
export abstract class AdminApi {
  /* Session */

  /** The signed-in user, or null when nobody is signed in */
  abstract getSession(): Promise<User | null>;
  /**
   * Starts a session; remember keeps it after the browser closes. With two-step sign-in on, the first try
   * answers two_factor_required, and the next one sends the code from the authenticator app too.
   */
  abstract signIn(email: string, password: string, remember: boolean, code?: string): Promise<User>;
  abstract signOut(): Promise<void>;
  /** Changes the signed-in user's own password; invalid_credentials when the current one is wrong */
  abstract changePassword(currentPassword: string, newPassword: string): Promise<void>;

  /* Users */

  /** Everyone, or only the signed-in user without users.view */
  abstract listUsers(): Promise<User[]>;
  abstract createUser(draft: UserDraft): Promise<User>;
  /** Adds several users at once, as from an import file: all of them, or none when one is refused */
  abstract createUsers(drafts: UserDraft[]): Promise<User[]>;
  abstract updateUser(id: string, changes: Partial<UserDraft>): Promise<User>;
  abstract setUserStatus(ids: string[], status: UserStatus): Promise<User[]>;
  abstract deleteUsers(ids: string[]): Promise<void>;
  abstract resetPassword(id: string): Promise<void>;
  /** Emails the invitation again to someone who has not accepted it yet */
  abstract resendInvite(id: string): Promise<void>;

  /* Roles: everyone signed in can read them, to show role names */

  abstract listRoles(): Promise<Role[]>;
  abstract createRole(draft: RoleDraft): Promise<Role>;
  abstract updateRole(id: string, changes: Partial<RoleDraft>): Promise<Role>;
  abstract deleteRole(id: string): Promise<void>;

  /* Activity */

  /** The whole log, or nothing without activity.view */
  abstract listActivity(): Promise<Activity[]>;

  /* Settings: everyone signed in can read them, since sign-in and the user form follow them */

  abstract getSettings(): Promise<AdminSettings>;
  abstract updateSettings(changes: Partial<AdminSettings>): Promise<AdminSettings>;

  /* Signed-in devices: your own, or, with users.edit, those of people you manage */

  abstract listSessions(userId: string): Promise<UserSession[]>;
  abstract endSession(sessionId: string): Promise<void>;
  /** Signs someone out everywhere; for yourself, everywhere but this browser */
  abstract endSessions(userId: string): Promise<void>;

  /* Two-step sign-in with an authenticator app */

  /** A new secret for the signed-in user; it takes effect once confirmed with a code */
  abstract startTwoFactor(): Promise<TwoFactorSetup>;
  abstract confirmTwoFactor(code: string): Promise<User>;
  /** Turns it off for yourself, with a current code */
  abstract disableTwoFactor(code: string): Promise<User>;
  /** Turns it off for someone who lost their phone; needs users.edit */
  abstract resetTwoFactor(userId: string): Promise<User>;

  /* Live updates */

  /**
   * Calls onChange whenever the data may have changed elsewhere (another admin, another tab), so the pages
   * can load it again. Returns a function that stops watching. Without a way to hear about changes, nothing.
   */
  watch(onChange: () => void): () => void {
    void onChange;
    return () => undefined;
  }
}
