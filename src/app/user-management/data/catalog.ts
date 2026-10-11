import {
  lucideBadgeMinus,
  lucideBadgePlus,
  lucideBan,
  lucideCalendarClock,
  lucideKeyRound,
  lucideLogIn,
  lucideLogOut,
  lucideMail,
  lucidePencil,
  lucideSettings,
  lucideShield,
  lucideShieldCheck,
  lucideShieldOff,
  lucideShieldPlus,
  lucideShieldX,
  lucideTimerOff,
  lucideTrash2,
  lucideUserCheck,
  lucideUserPlus,
} from '@ng-icons/lucide';

import { UiTone } from '../ui';
import { ActivityAction, AdminSettings, Permission, RoleAssignmentRules, UserStatus } from './models';

// Labels in this file are translation keys

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: Permission; label: string }[];
}

/** Every permission a role can grant, grouped by area */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'users',
    label: 'Users',
    permissions: [
      { key: 'users.view', label: 'View users' },
      { key: 'users.create', label: 'Add users' },
      { key: 'users.edit', label: 'Edit users' },
      { key: 'users.delete', label: 'Delete users' },
    ],
  },
  {
    key: 'roles',
    label: 'Roles & permissions',
    permissions: [
      { key: 'roles.view', label: 'View roles' },
      { key: 'roles.manage', label: 'Create and edit roles' },
    ],
  },
  {
    key: 'activity',
    label: 'Activity log',
    permissions: [
      { key: 'activity.view', label: 'View activity' },
      { key: 'activity.export', label: 'Export activity' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    permissions: [
      { key: 'settings.view', label: 'View settings' },
      { key: 'settings.manage', label: 'Change settings' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(group => group.permissions.map(permission => permission.key));

export const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Sales', 'Support', 'Finance', 'Operations'];

export const STATUS_META: Record<UserStatus, { label: string; tone: UiTone }> = {
  active: { label: 'Active', tone: 'success' },
  invited: { label: 'Invited', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'danger' },
};

export const ROLE_TONES: UiTone[] = ['primary', 'info', 'success', 'warning', 'danger', 'neutral'];

/** What each role color looks like, for screen readers */
export const TONE_NAMES: Record<UiTone, string> = {
  primary: 'Indigo',
  info: 'Blue',
  success: 'Green',
  warning: 'Amber',
  danger: 'Red',
  neutral: 'Gray',
};

export type ActivityKind = 'users' | 'roles' | 'settings' | 'sessions';

export const ACTIVITY_KINDS: Record<ActivityKind, string> = {
  users: 'Users',
  roles: 'Roles',
  settings: 'Settings',
  sessions: 'Sign-ins',
};

/**
 * How each kind of activity is shown: icon, color, a short label for tables and the sentence key
 * (with {{actor}} and {{target}})
 */
export const ACTIVITY_META: Record<ActivityAction, { icon: string; tone: UiTone; label: string; message: string; kind: ActivityKind }> = {
  'user.created': { icon: lucideUserPlus, tone: 'success', label: 'action.user.created', message: 'activity.user.created', kind: 'users' },
  'user.updated': { icon: lucidePencil, tone: 'info', label: 'action.user.updated', message: 'activity.user.updated', kind: 'users' },
  'user.deleted': { icon: lucideTrash2, tone: 'danger', label: 'action.user.deleted', message: 'activity.user.deleted', kind: 'users' },
  'user.invited': { icon: lucideMail, tone: 'primary', label: 'action.user.invited', message: 'activity.user.invited', kind: 'users' },
  'user.suspended': { icon: lucideBan, tone: 'warning', label: 'action.user.suspended', message: 'activity.user.suspended', kind: 'users' },
  'user.activated': { icon: lucideUserCheck, tone: 'success', label: 'action.user.activated', message: 'activity.user.activated', kind: 'users' },
  'user.password_reset': { icon: lucideKeyRound, tone: 'neutral', label: 'action.user.password_reset', message: 'activity.user.password_reset', kind: 'users' },
  'user.password_changed': { icon: lucideKeyRound, tone: 'neutral', label: 'action.user.password_changed', message: 'activity.user.password_changed', kind: 'users' },
  'role.created': { icon: lucideShieldPlus, tone: 'primary', label: 'action.role.created', message: 'activity.role.created', kind: 'roles' },
  'role.updated': { icon: lucideShield, tone: 'info', label: 'action.role.updated', message: 'activity.role.updated', kind: 'roles' },
  'role.deleted': { icon: lucideShieldX, tone: 'danger', label: 'action.role.deleted', message: 'activity.role.deleted', kind: 'roles' },
  'role_assignment.added': { icon: lucideBadgePlus, tone: 'primary', label: 'action.role_assignment.added', message: 'activity.role_assignment.added', kind: 'users' },
  'role_assignment.updated': { icon: lucideCalendarClock, tone: 'info', label: 'action.role_assignment.updated', message: 'activity.role_assignment.updated', kind: 'users' },
  'role_assignment.removed': { icon: lucideBadgeMinus, tone: 'warning', label: 'action.role_assignment.removed', message: 'activity.role_assignment.removed', kind: 'users' },
  'role_assignment.expired': { icon: lucideTimerOff, tone: 'neutral', label: 'action.role_assignment.expired', message: 'activity.role_assignment.expired', kind: 'users' },
  'settings.updated': { icon: lucideSettings, tone: 'neutral', label: 'action.settings.updated', message: 'activity.settings.updated', kind: 'settings' },
  'auth.sign_in': { icon: lucideLogIn, tone: 'neutral', label: 'action.auth.sign_in', message: 'activity.auth.sign_in', kind: 'sessions' },
  'auth.sessions_ended': { icon: lucideLogOut, tone: 'warning', label: 'action.auth.sessions_ended', message: 'activity.auth.sessions_ended', kind: 'sessions' },
  'auth.two_factor_on': { icon: lucideShieldCheck, tone: 'success', label: 'action.auth.two_factor_on', message: 'activity.auth.two_factor_on', kind: 'sessions' },
  'auth.two_factor_off': { icon: lucideShieldOff, tone: 'warning', label: 'action.auth.two_factor_off', message: 'activity.auth.two_factor_off', kind: 'sessions' },
};

/** Names of the user and role fields an activity can change */
export const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  department: 'Department',
  roleId: 'Role',
  roles: 'Roles',
  startsAt: 'Starts',
  endsAt: 'Ends',
  reason: 'Reason',
  maxDays: 'Longest assignment',
  reasonRequired: 'Reason required',
  status: 'Status',
  avatar: 'Photo',
  name: 'Name',
  description: 'Description',
  tone: 'Color',
  permissions: 'Permissions',
  defaultRoleId: 'Default role',
  allowedDomains: 'Allowed email domains',
  inviteExpiryDays: 'Invitations expire after',
  sessionTimeoutMinutes: 'Sign out when idle',
  twoFactorRoleIds: 'Two-step sign-in required for',
  passwordMinLength: 'Shortest password',
  passwordHistory: 'Recent passwords not allowed again',
  activityRetentionDays: 'Keep activity for',
  devices: 'Devices',
};

/** How a new role may be given: for good or for a time, with or without a reason */
export const DEFAULT_ASSIGNMENT_RULES: RoleAssignmentRules = { maxDays: null, reasonRequired: false };

/** Choices for a role's longest assignment, in days; null: no limit */
export const ASSIGNMENT_MAX_DAYS: (number | null)[] = [null, 7, 30, 90, 180, 365];

/** Settings for a new installation */
export const DEFAULT_SETTINGS: AdminSettings = {
  defaultRoleId: 'viewer',
  allowedDomains: [],
  inviteExpiryDays: 7,
  sessionTimeoutMinutes: 0,
  twoFactorRoleIds: [],
  passwordMinLength: 8,
  passwordHistory: 0,
  activityRetentionDays: 730,
};

/** Choices on the settings page */
export const INVITE_EXPIRY_DAYS = [3, 7, 14, 30];
export const SESSION_TIMEOUT_MINUTES = [0, 15, 30, 60, 240, 480];
export const PASSWORD_MIN_LENGTHS = [8, 10, 12, 14, 16];
export const PASSWORD_HISTORY = [0, 1, 3, 5, 10];
export const ACTIVITY_RETENTION_DAYS = [30, 90, 180, 365, 730, 1825];

/** Permission label by key, such as "users.view" → "View users" */
export const PERMISSION_LABELS = new Map<string, string>(PERMISSION_GROUPS.flatMap(group => group.permissions.map(permission => [permission.key, permission.label] as const)));
