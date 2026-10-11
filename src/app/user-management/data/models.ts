import { UiTone } from '../ui';

export type UserStatus = 'active' | 'invited' | 'suspended';

/** Everything a role can allow; catalog.ts groups and labels them */
export type Permission =
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'users.delete'
  | 'roles.view'
  | 'roles.manage'
  | 'activity.view'
  | 'activity.export'
  | 'settings.view'
  | 'settings.manage'
  | 'branches.view'
  | 'branches.manage';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  /** The branch they belong to, as a Google Workspace user is in one organizational unit; null for none */
  branchId: string | null;
  /** Every role given to them: the ones they hold now, scheduled ones and expired ones (see roleAssignmentState) */
  roles: RoleAssignment[];
  status: UserStatus;
  /** Image URL or data URL; empty shows initials */
  avatar: string;
  createdAt: string;
  /** Never set for people who have not signed in yet */
  lastActiveAt: string | null;
  /** Signs in with a code from an authenticator app as well as the password; only the server changes it */
  twoFactor?: boolean;
}

/** A new user: what a form edits, and the roles they start with (none: the default role from the settings) */
export type UserDraft = Omit<User, 'id' | 'createdAt' | 'lastActiveAt' | 'twoFactor' | 'roles' | 'branchId'> & {
  roles: RoleGrant[];
  /** Left out: no branch */
  branchId?: string | null;
};

/** What PATCH /users/:id changes; roles change through role assignments */
export type UserChanges = Partial<Omit<UserDraft, 'roles'>>;

/**
 * One role given to one person, for a time or for good, as NIST RBAC's user assignment with Microsoft Entra's
 * start and end. It counts while startsAt <= now < endsAt.
 */
export interface RoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  /** Its scope, as Azure RBAC's: null for the whole organization, or the one branch it applies in */
  branchId: string | null;
  startsAt: string;
  /** null: for good */
  endsAt: string | null;
  /** Why it was given; empty when nobody said */
  reason: string;
  /** null: given by the server, such as the default role for an imported user */
  assignedById: string | null;
  assignedAt: string;
}

/** A role to give someone */
export interface RoleGrant {
  roleId: string;
  /** Left out or null: the whole organization */
  branchId?: string | null;
  /** Left out, or earlier than now: from now */
  startsAt?: string;
  /** null: for good */
  endsAt: string | null;
  reason?: string;
}

export interface RoleAssignmentDraft extends RoleGrant {
  userId: string;
}

/** What PATCH /role-assignments/:id changes: extend, shorten or renew it, or correct the reason */
export interface RoleAssignmentChanges {
  endsAt?: string | null;
  reason?: string;
}

/** POST /role-assignments/batch: give several people a role, or take one away from them */
/** A role for several people, or one taken away from them, with a reason (see ReasonAction) */
export type RoleAssignmentBatch = { add: RoleGrant } | { removeRoleId: string; reason?: string };

/**
 * The changes that take or reset someone's access, which carry a reason the activity log keeps, as Microsoft Entra asks
 * for a justification; the settings' reasonsRequired lists those that must have one (API.md, "Reasons")
 */
export type ReasonAction = 'status' | 'delete' | 'removeRole' | 'resetSignIn' | 'endSessions';

/** A browser someone is signed in on */
export interface UserSession {
  id: string;
  userId: string;
  /** When they signed in there */
  createdAt: string;
  lastSeenAt: string;
  ip: string;
  browser: string;
  os: string;
  /** The session the request came from */
  current?: boolean;
}

/** What an authenticator app needs to start making codes */
export interface TwoFactorSetup {
  /** Base32, for typing in by hand */
  secret: string;
  /** otpauth:// address, for the QR code */
  uri: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  tone: UiTone;
  permissions: Permission[];
  /** How the role may be given */
  assignment: RoleAssignmentRules;
  /** Built in: its name, description and permissions come from the server's code; only its color and assignment rules change */
  system: boolean;
}

/** A role's own rules for giving it, as Microsoft Entra PIM's role settings */
export interface RoleAssignmentRules {
  /** Each assignment must end within this many days of starting; null: no limit, and it may be for good */
  maxDays: number | null;
  /** Each assignment needs a reason */
  reasonRequired: boolean;
}

/** A role to create or change; without assignment rules, a new role may be given for good, without a reason */
export type RoleDraft = Omit<Role, 'id' | 'system' | 'assignment'> & { assignment?: RoleAssignmentRules };

/** A site or office people belong to, and roles can be limited to */
export interface Branch {
  id: string;
  /** Short, unique and upper-case, such as "CNX" */
  code: string;
  name: string;
  /** Closed: it keeps its people and their roles, but nobody new joins it or gets a role there */
  active: boolean;
  createdAt: string;
}

export type BranchDraft = Pick<Branch, 'code' | 'name'>;

/** What PATCH /branches/:id changes */
export type BranchChanges = Partial<BranchDraft & Pick<Branch, 'active'>>;

/** How user management behaves, changed on the settings page */
export interface AdminSettings {
  /** The role a new user starts with */
  defaultRoleId: string;
  /** New and changed emails must end in one of these domains, such as "example.com"; empty allows any */
  allowedDomains: string[];
  /** How long an invitation link works */
  inviteExpiryDays: number;
  /** Signs people out after this long without using the app; 0 keeps them signed in */
  sessionTimeoutMinutes: number;
  /** Roles whose holders must use two-step sign-in before they can do anything else */
  twoFactorRoleIds: string[];
  /** The shortest password someone can set */
  passwordMinLength: number;
  /** How many of someone's most recent passwords, the current one included, they cannot choose again; 0 allows any */
  passwordHistory: number;
  /** Activity older than this is deleted */
  activityRetentionDays: number;
  /** Shows the branches page and the branch fields; turned off, the data stays */
  branchesEnabled: boolean;
  /** The changes that must have a reason */
  reasonsRequired: ReasonAction[];
}

/** What a new password must be, from the settings; readable before signing in, for the links in emails */
export interface PasswordPolicy {
  minLength: number;
  history: number;
}

/** A part of the activity log, from one moment up to (not including) another; either end may be left open */
export interface ActivityRange {
  from?: string;
  to?: string;
}

export type ActivityAction =
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.invited'
  | 'user.suspended'
  | 'user.activated'
  | 'user.password_reset'
  | 'user.password_changed'
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'role_assignment.added'
  | 'role_assignment.updated'
  | 'role_assignment.removed'
  | 'role_assignment.expired'
  | 'settings.updated'
  | 'branch.created'
  | 'branch.updated'
  | 'branch.deleted'
  | 'auth.sign_in'
  | 'auth.sessions_ended'
  | 'auth.two_factor_on'
  | 'auth.two_factor_off';

/** One field an action changed. Values are stored raw (a role id, a status) and formatted for display. */
export interface ActivityChange {
  /** A User or Role field, such as "department", "roleId" or "permissions" */
  field: string;
  from?: string | null;
  to?: string | null;
  /** For list fields such as permissions */
  added?: string[];
  removed?: string[];
}

export interface Activity {
  id: string;
  at: string;
  /** null: the server did it by itself, such as ending an assignment on time */
  actorId: string | null;
  action: ActivityAction;
  /** Who or what the action was about, kept as text so it survives deletion */
  targetLabel: string;
  targetId?: string;
  /** Where the request came from */
  ip: string;
  browser: string;
  os: string;
  changes?: ActivityChange[];
  /** Why, as the person who made the change gave it */
  reason?: string;
}

export function fullName(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
