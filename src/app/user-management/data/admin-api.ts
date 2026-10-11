import {
  Activity, ActivityRange, AdminSettings, Branch, BranchChanges, BranchDraft, PasswordPolicy, Role, RoleAssignmentBatch,
  RoleAssignmentChanges, RoleAssignmentDraft, RoleDraft, TwoFactorSetup, User, UserChanges, UserDraft, UserSession, UserStatus,
} from './models';

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
  /** Suspending or deleting yourself, or changing your own role assignments or the permissions of a role you hold */
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
  | 'invalid_code'
  /** A link from an email that has expired, was used already, or never existed */
  | 'invalid_token'
  /** The role requires two-step sign-in and it is off: turn it on before anything else */
  | 'two_factor_mandatory'
  /** A new password that is one of the person's most recent ones */
  | 'password_reused'
  /** Too many sign-in, refresh or reset attempts from one address; try again later */
  | 'too_many_requests'
  /** The person already holds that role, now or later, at the same time */
  | 'already_assigned'
  /** Nobody active would keep a role with every permission for good */
  | 'last_administrator'
  /** The role must end within its maxDays, or this end is too far */
  | 'assignment_too_long'
  /** The role asks for a reason, and none was given */
  | 'reason_required'
  /** Another branch already has this code */
  | 'code_taken'
  /** People still belong to the branch, or hold a role there now or later */
  | 'branch_in_use'
  /** Nobody new joins a closed branch or gets a role there */
  | 'branch_closed';

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

  /* Links in emails: nobody is signed in, the token from the link says who */

  /** Sets the first password from an invitation and makes the account active; invalid_token for a dead link */
  abstract acceptInvitation(token: string, password: string): Promise<void>;
  /** "Forgot password?": emails a reset link if the address belongs to someone, and answers the same either way */
  abstract requestPasswordReset(email: string): Promise<void>;
  /** Sets a new password from a reset link and ends the user's sessions; invalid_token for a dead link */
  abstract confirmPasswordReset(token: string, password: string): Promise<void>;
  /** What a new password must be; readable without signing in */
  abstract getPasswordPolicy(): Promise<PasswordPolicy>;

  /* Users */

  /** Everyone, or only the signed-in user without users.view */
  abstract listUsers(): Promise<User[]>;
  abstract createUser(draft: UserDraft): Promise<User>;
  /** Adds several users at once, as from an import file: all of them, or none when one is refused */
  abstract createUsers(drafts: UserDraft[]): Promise<User[]>;
  abstract updateUser(id: string, changes: UserChanges): Promise<User>;
  /* A reason, where these take one, goes to the activity log; the settings may require it (ReasonAction) */
  abstract setUserStatus(ids: string[], status: UserStatus, reason?: string): Promise<User[]>;
  abstract deleteUsers(ids: string[], reason?: string): Promise<void>;
  abstract resetPassword(id: string, reason?: string): Promise<void>;
  /** Emails the invitation again to someone who has not accepted it yet */
  abstract resendInvite(id: string): Promise<void>;

  /* Role assignments: each answers with the people it changed */

  /** Gives someone a role, from now or a later date, until a date or for good */
  abstract assignRole(draft: RoleAssignmentDraft): Promise<User>;
  /** Moves an assignment's end (extend, shorten, renew) or changes its reason */
  abstract updateRoleAssignment(id: string, changes: RoleAssignmentChanges): Promise<User>;
  abstract removeRoleAssignment(id: string, reason?: string): Promise<User>;
  /** Gives several people a role, or takes one away from them: all or nothing; answers with the ones that changed */
  abstract assignRoles(userIds: string[], change: RoleAssignmentBatch): Promise<User[]>;

  /* Branches: everyone signed in can read them, to show branch names */

  abstract listBranches(): Promise<Branch[]>;
  abstract createBranch(draft: BranchDraft): Promise<Branch>;
  abstract updateBranch(id: string, changes: BranchChanges): Promise<Branch>;
  abstract deleteBranch(id: string): Promise<void>;

  /* Roles: everyone signed in can read them, to show role names */

  abstract listRoles(): Promise<Role[]>;
  abstract createRole(draft: RoleDraft): Promise<Role>;
  abstract updateRole(id: string, changes: Partial<RoleDraft>): Promise<Role>;
  abstract deleteRole(id: string): Promise<void>;

  /* Activity */

  /** The whole log, or the part in range, newest first; nothing without activity.view */
  abstract listActivity(range?: ActivityRange): Promise<Activity[]>;

  /* Settings: everyone signed in can read them, since sign-in and the user form follow them */

  abstract getSettings(): Promise<AdminSettings>;
  abstract updateSettings(changes: Partial<AdminSettings>): Promise<AdminSettings>;

  /* Signed-in devices: your own, or, with users.edit, those of people you manage */

  abstract listSessions(userId: string): Promise<UserSession[]>;
  abstract endSession(sessionId: string, reason?: string): Promise<void>;
  /** Signs someone out everywhere; for yourself, everywhere but this browser */
  abstract endSessions(userId: string, reason?: string): Promise<void>;

  /* Two-step sign-in with an authenticator app */

  /** A new secret for the signed-in user; it takes effect once confirmed with a code */
  abstract startTwoFactor(): Promise<TwoFactorSetup>;
  abstract confirmTwoFactor(code: string): Promise<User>;
  /** Turns it off for yourself, with a current code */
  abstract disableTwoFactor(code: string): Promise<User>;
  /** Turns it off for someone who lost their phone; needs users.edit */
  abstract resetTwoFactor(userId: string, reason?: string): Promise<User>;

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
