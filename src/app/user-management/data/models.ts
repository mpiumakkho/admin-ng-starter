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
  | 'settings.manage';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  roleId: string;
  status: UserStatus;
  /** Image URL or data URL; empty shows initials */
  avatar: string;
  createdAt: string;
  /** Never set for people who have not signed in yet */
  lastActiveAt: string | null;
  /** Signs in with a code from an authenticator app as well as the password; only the server changes it */
  twoFactor?: boolean;
}

/** What a form edits: everything the server does not assign */
export type UserDraft = Omit<User, 'id' | 'createdAt' | 'lastActiveAt' | 'twoFactor'>;

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
  /** Built-in roles can be edited but not deleted */
  system: boolean;
}

export type RoleDraft = Omit<Role, 'id' | 'system'>;

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
  | 'settings.updated'
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
  actorId: string;
  action: ActivityAction;
  /** Who or what the action was about, kept as text so it survives deletion */
  targetLabel: string;
  targetId?: string;
  /** Where the request came from */
  ip: string;
  browser: string;
  os: string;
  changes?: ActivityChange[];
}

export function fullName(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
