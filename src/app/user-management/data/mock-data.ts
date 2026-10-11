import { activeRoleIds } from './access-rules';
import { ALL_PERMISSIONS, DEFAULT_ASSIGNMENT_RULES, DEFAULT_SETTINGS, DEPARTMENTS } from './catalog';
import {
  Activity, ActivityAction, ActivityChange, AdminSettings, Branch, fullName, Role, RoleAssignment, RoleAssignmentRules, RoleConflict,
  User, UserSession, UserStatus,
} from './models';
import { uuidV7 } from './uuid';

export interface AdminData {
  users: User[];
  roles: Role[];
  /** Saved before conflicting roles existed: the sample rules */
  roleConflicts?: RoleConflict[];
  branches: Branch[];
  activity: Activity[];
  settings: AdminSettings;
  /** Who is signed in where */
  sessions: UserSession[];
  /**
   * When each session last proved who is signed in, by session id: its sign-in, or a password confirmed since, for the
   * changes that ask for it again (API.md, "Confirming who you are")
   */
  verifiedAt?: Record<string, string>;
  /** Authenticator secrets by user id, and the ones waiting to be confirmed */
  twoFactorSecrets?: Record<string, string>;
  pendingTwoFactor?: Record<string, string>;
  /**
   * SHA-256 of the passwords people set themselves, by user id. Without one, the sample accepts any password
   * of 6 or more characters.
   */
  passwords?: Record<string, string>;
  /** SHA-256 of the passwords people used before, newest first, for the settings' passwordHistory */
  passwordHistory?: Record<string, string[]>;
  /** Links in emails that still work, by token: an invitation to set a first password, or a password reset */
  links?: Record<string, EmailLink>;
  /** Assignments whose end is already in the activity log, as the server's expiry job keeps track */
  expiryLogged?: string[];
}

export interface EmailLink {
  userId: string;
  kind: 'invite' | 'reset';
  expiresAt: string;
}



const FIRST_NAMES = [
  'Henry', 'Somchai', 'Nattaya', 'Olivia', 'Krit', 'Pimchanok', 'Liam', 'Sarah', 'Thanawat', 'Mia',
  'Arthit', 'Chanida', 'Noah', 'Emma', 'Wichai', 'Siriporn', 'James', 'Ava', 'Phakphum', 'Kanokwan',
  'Lucas', 'Sophia', 'Jirayu', 'Natthida', 'Ethan', 'Isabella', 'Pongsakorn', 'Rattana', 'Mason', 'Charlotte',
  'Tanakorn', 'Supaporn', 'Logan', 'Amelia', 'Kittipong', 'Waraporn', 'Daniel', 'Harper', 'Anucha', 'Malee',
  'Jack', 'Evelyn', 'Sarawut', 'Jintana', 'Ryan', 'Grace', 'Teerapat', 'Duangjai',
];

const LAST_NAMES = [
  'Klein', 'Jaidee', 'Srisuk', 'Bennett', 'Wongsa', 'Rattanakul', 'Carter', 'Mitchell', 'Boonmee', 'Chen',
  'Saetang', 'Phromma', 'Walker', 'Hughes', 'Kaewkla', 'Thongdee', 'Foster', 'Reed', 'Suwan', 'Inthong',
  'Hayes', 'Price', 'Chaiyo', 'Panya', 'Ward', 'Brooks', 'Siriwat', 'Kongkaew', 'Gray', 'Perry',
  'Somboon', 'Meechai', 'Long', 'Ross', 'Sukjai', 'Yodsri', 'Kelly', 'Morgan', 'Chantra', 'Pakdee',
  'Cooper', 'Bailey', 'Rungruang', 'Sangthong', 'Howard', 'Fisher', 'Nakorn', 'Charoen',
];

/** Rules some roles have for giving them, so the sample shows them; the rest may be given for good, without a reason */
const ASSIGNMENT_RULES: Record<string, RoleAssignmentRules> = {
  contractor: { maxDays: 90, reasonRequired: true },
  security: { maxDays: null, reasonRequired: true },
};

function withRules(roles: Omit<Role, 'assignment'>[]): Role[] {
  return roles.map(role => ({ ...role, assignment: { ...(ASSIGNMENT_RULES[role.id] ?? DEFAULT_ASSIGNMENT_RULES) } }));
}

const ROLES: Role[] = withRules([
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full access to every part of the system',
    tone: 'primary',
    permissions: [...ALL_PERMISSIONS],
    system: true,
  },
  {
    id: 'manager',
    name: 'Manager',
    description: 'Manages people in their teams and reads the activity log',
    tone: 'info',
    permissions: ['users.view', 'users.create', 'users.edit', 'roles.view', 'activity.view', 'activity.export', 'settings.view', 'branches.view'],
    system: true,
  },
  {
    id: 'support',
    name: 'Support',
    description: 'Helps users with their accounts',
    tone: 'success',
    permissions: ['users.view', 'users.edit', 'roles.view', 'activity.view'],
    system: false,
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to the user list',
    tone: 'neutral',
    permissions: ['users.view', 'roles.view'],
    system: false,
  },
]);

/** The built-in roles, as the server's code defines them; LocalAdminApi puts them back on every load */
export const BUILT_IN_ROLES = ROLES.filter(role => role.system);

/**
 * Roles nobody may hold together, as an organization might set them: the sample has someone who holds two of the
 * first, given before the rule was made, so the roles page has a person to fix
 */
export const SAMPLE_ROLE_CONFLICTS: RoleConflict[] = [
  {
    id: 'rc-audit', name: 'Auditors do not change accounts',
    description: 'Who checks the activity log does not edit the people in it.', roleIds: ['auditor', 'support', 'help-desk'],
  },
  {
    id: 'rc-settings', name: 'Settings are checked by someone else',
    description: 'Who changes the settings is not the one who reviews them.', roleIds: ['it-operations', 'compliance'],
  },
];

/**
 * Roles an organization adds of its own, so the sample shows the pages with a longer list of roles. A few people
 * hold each; the demo accounts on the sign-in page stay with the four roles above.
 */
const CUSTOM_ROLES: Role[] = withRules([
  { id: 'help-desk', name: 'Help desk', description: 'Unlocks accounts and fixes sign-in problems', tone: 'info', permissions: ['users.view', 'users.edit'], system: false },
  { id: 'hr', name: 'HR', description: 'Adds and invites new staff', tone: 'success', permissions: ['users.view', 'users.create', 'users.edit'], system: false },
  { id: 'auditor', name: 'Auditor', description: 'Reads the activity log and exports it', tone: 'warning', permissions: ['users.view', 'roles.view', 'activity.view', 'activity.export', 'settings.view'], system: false },
  { id: 'security', name: 'Security', description: 'Reviews sign-ins, devices and the sign-in settings', tone: 'danger', permissions: ['users.view', 'activity.view', 'settings.view'], system: false },
  { id: 'team-lead', name: 'Team lead', description: 'Edits the people in their team', tone: 'primary', permissions: ['users.view', 'users.edit', 'activity.view'], system: false },
  { id: 'onboarding', name: 'Onboarding', description: 'Invites new people and sends invitations again', tone: 'success', permissions: ['users.view', 'users.create'], system: false },
  { id: 'it-operations', name: 'IT operations', description: 'Looks after the settings and signed-in devices', tone: 'info', permissions: ['users.view', 'users.edit', 'settings.view', 'settings.manage'], system: false },
  { id: 'compliance', name: 'Compliance', description: 'Reads the roles, the settings and the activity log', tone: 'warning', permissions: ['users.view', 'roles.view', 'activity.view', 'activity.export', 'settings.view'], system: false },
  { id: 'finance', name: 'Finance', description: 'Reads the user list for billing', tone: 'neutral', permissions: ['users.view'], system: false },
  { id: 'contractor', name: 'Contractor', description: 'Limited access for outside staff', tone: 'neutral', permissions: ['users.view'], system: false },
]);

/** How many people hold each custom role, in the order above */
const CUSTOM_ROLE_HOLDERS = [3, 2, 2, 1, 2, 1, 1, 0, 1, 0];

/** Small deterministic generator, so the sample data is the same on every first load */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;

/** The sample organization's branches: three open, and one closed with nobody left in it */
const BRANCHES: Omit<Branch, 'createdAt'>[] = [
  { id: 'b-hq', code: 'HQ', name: 'Head office', active: true },
  { id: 'b-cnx', code: 'CNX', name: 'Chiang Mai', active: true },
  { id: 'b-hkt', code: 'HKT', name: 'Phuket', active: true },
  { id: 'b-pyx', code: 'PYX', name: 'Pattaya', active: false },
];

/** Where people work, by their place in the list: half at the head office, the rest in the two other open branches */
const BRANCH_ROTA = ['b-hq', 'b-hq', 'b-cnx', 'b-hkt'];

/** The last active Viewer in Chiang Mai with no other role, who also manages the branch; the first is the Viewer demo account */
function branchManager(users: User[]): User | undefined {
  return users.filter(user => user.status === 'active' && user.branchId === 'b-cnx' && user.roles.length === 1
    && user.roles[0].roleId === 'viewer').at(-1);
}

/** The role someone was given first: the sample gives everyone one, for good, when they joined */
function firstRole(user: User): string {
  return user.roles[0].roleId;
}

/** Sample organisation: 48 people over the last 14 months, and a month of activity */
export function createMockData(now = Date.now()): AdminData {
  const next = random(20261004);
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];

  const users: User[] = FIRST_NAMES.map((firstName, index) => {
    const id = `u-${String(index + 1).padStart(3, '0')}`;
    const lastName = LAST_NAMES[index];
    const isOwner = index === 0;
    // More people joined recently than long ago
    const ageDays = isOwner ? 420 : Math.floor(Math.pow(next(), 1.6) * 420);
    const status: UserStatus = isOwner ? 'active' : pick<UserStatus>(['active', 'active', 'active', 'active', 'active', 'invited', 'suspended']);
    const roleId = isOwner ? 'admin' : index < 4 ? 'admin' : pick(['manager', 'support', 'support', 'viewer', 'viewer', 'viewer']);
    // The random numbers are drawn in this order; keep it, so the sample stays the same
    const user = {
      id,
      firstName,
      lastName,
      email: `${firstName}.${lastName}`.toLowerCase() + '@example.com',
      phone: `08${Math.floor(10000000 + next() * 89999999)}`,
      department: isOwner ? 'Operations' : pick(DEPARTMENTS),
      branchId: BRANCH_ROTA[index % BRANCH_ROTA.length],
      status,
      // About two thirds have a photo; the rest show initials
      avatar: isOwner ? 'assets/images/faces/face8.jpg' : next() < 0.66 ? `assets/images/faces/face${1 + (index % 27)}.jpg` : '',
      createdAt: new Date(now - ageDays * DAY - next() * DAY).toISOString(),
      lastActiveAt: status === 'invited' ? null : new Date(now - (isOwner ? 0.01 : next() * 30) * DAY).toISOString(),
    };
    // Given for good when they joined: by the owner, or by nobody for the owner's own
    const assignment: RoleAssignment = {
      id: `ra-${id}-1`, userId: id, roleId, branchId: null, startsAt: user.createdAt, endsAt: null, reason: '',
      assignedById: isOwner ? null : 'u-001', assignedAt: user.createdAt,
    };
    return { ...user, roles: [assignment] };
  });

  // Every other Support and Viewer person moves to a custom role, until each has its holders. This draws no random
  // numbers, so everything generated after it is the same as without the custom roles.
  const holders = CUSTOM_ROLES.flatMap((role, index) => Array<string>(CUSTOM_ROLE_HOLDERS[index]).fill(role.id));
  users.filter(user => firstRole(user) === 'support' || firstRole(user) === 'viewer')
    .filter((_, index) => index % 2 === 1)
    .slice(0, holders.length)
    .forEach((user, index) => user.roles[0].roleId = holders[index]);

  const admins = users.filter(user => firstRole(user) === 'admin' || firstRole(user) === 'manager');

  // Each admin works from an office computer and now and then from a phone
  const devices = new Map(admins.map(admin => [admin.id, {
    desktop: { ip: `10.20.${Math.floor(next() * 8)}.${10 + Math.floor(next() * 200)}`, browser: pick(['Chrome', 'Chrome', 'Edge', 'Firefox']), os: pick(['Windows', 'Windows', 'macOS']) },
    phone: next() < 0.5
      ? { ip: `203.0.113.${1 + Math.floor(next() * 250)}`, browser: 'Safari', os: 'iOS' }
      : { ip: `198.51.100.${1 + Math.floor(next() * 250)}`, browser: 'Chrome', os: 'Android' },
  }]));

  const actions: ActivityAction[] = [
    'auth.sign_in', 'auth.sign_in', 'auth.sign_in', 'user.updated', 'user.updated', 'user.created', 'user.invited',
    'user.suspended', 'user.activated', 'user.password_reset', 'role.updated', 'role.updated',
  ];

  /** What each kind of action changed, so the log has details to show */
  const changesFor = (action: ActivityAction, user: User, role: Role): ActivityChange[] | undefined => {
    switch (action) {
      case 'user.created':
        return [{ field: 'department', to: user.department }, { field: 'email', to: user.email }, { field: 'status', to: 'active' }];
      case 'user.invited':
        return [{ field: 'email', to: user.email }, { field: 'status', to: 'invited' }];
      case 'user.updated': {
        // Once a role to change from: roles change through assignments now, but the draw keeps the sample the same
        next();
        const otherDepartment = pick(DEPARTMENTS.filter(item => item !== user.department));
        return pick<ActivityChange[]>([
          [{ field: 'department', from: otherDepartment, to: user.department }],
          [{ field: 'department', from: otherDepartment, to: user.department }, { field: 'avatar' }],
          [{ field: 'phone', from: `08${Math.floor(10000000 + next() * 89999999)}`, to: user.phone }],
          [{ field: 'avatar' }],
        ]);
      }
      case 'user.suspended':
        return [{ field: 'status', from: 'active', to: 'suspended' }];
      case 'user.activated':
        return [{ field: 'status', from: 'suspended', to: 'active' }];
      case 'role.updated': {
        const missing = ALL_PERMISSIONS.filter(key => !role.permissions.includes(key));
        return [{
          field: 'permissions',
          added: [pick(role.permissions)],
          removed: missing.length ? [pick(missing)] : [],
        }];
      }
      default:
        return undefined;
    }
  };

  // Ids from a generator of their own, so the rest of the sample stays as it was
  const idRandom = random(20261009);
  // Reasons too, as the settings ask for one when suspending or reactivating someone
  const reasonRandom = random(20261011);
  const reasonsFor: Partial<Record<ActivityAction, string[]>> = {
    'user.suspended': ['Left the company', 'On long leave', 'Asked by their manager', 'Shared their password'],
    'user.activated': ['Back from leave', 'Rejoined the team', 'Cleared by their manager'],
  };
  const reasonFor = (action: ActivityAction) => {
    const reasons = reasonsFor[action];
    return reasons ? { reason: reasons[Math.floor(reasonRandom() * reasons.length)] } : {};
  };
  const activity: Activity[] = Array.from({ length: 60 }, () => {
    const action = pick(actions);
    const actor = pick(admins);
    // Anyone but the owner, whose account the sample keeps untouched
    const user = pick(users.slice(1));
    const role = pick(ROLES);
    const isRole = action.startsWith('role.');
    const isSignIn = action === 'auth.sign_in';
    const device = devices.get(actor.id)!;
    const at = now - Math.pow(next(), 1.4) * 30 * DAY;
    return {
      id: uuidV7(at, bytes => bytes.forEach((_, byte) => bytes[byte] = Math.floor(idRandom() * 256))),
      at: new Date(at).toISOString(),
      actorId: actor.id,
      action,
      targetLabel: isSignIn ? fullName(actor) : isRole ? role.name : fullName(user),
      targetId: isSignIn ? actor.id : isRole ? role.id : user.id,
      ...(next() < 0.8 ? device.desktop : device.phone),
      changes: changesFor(action, user, role),
      ...reasonFor(action),
    };
  });

  // Some people hold a second role, some for a time: one for good, one ending in a few days, one for a project, one
  // that starts next week and one that has ended. Given by the owner; this draws no random numbers.
  const activeWith = (roleId: string) => users.filter(user => user.status === 'active' && firstRole(user) === roleId);
  const extra: [user: User | undefined, roleId: string, branchId: string | null, startDay: number, endDay: number | null, reason: string][] = [
    [activeWith('support')[1], 'auditor', null, -40, null, 'Also checks the activity log every quarter'],
    [activeWith('viewer')[1], 'manager', null, -11, 3, 'Covers for the team manager on leave'],
    [activeWith('viewer')[2], 'it-operations', null, -5, 20, 'Moving to the new servers'],
    [activeWith('support')[2], 'hr', null, 5, 35, 'Hiring season'],
    [activeWith('viewer')[3], 'security', null, -32, -2, 'Security review'],
    // Limited to one branch: leads the team in Chiang Mai only
    [activeWith('support')[3], 'team-lead', 'b-cnx', -20, null, 'Leads the Chiang Mai team'],
    // A branch manager: looks after the people of Chiang Mai, and nobody else (API.md, "Branch administrators")
    [branchManager(users), 'manager', 'b-cnx', -60, null, 'Runs the Chiang Mai branch'],
  ];
  const owner = users[0];
  const office = devices.get(owner.id)!.desktop;
  const expiryLogged: string[] = [];
  for (const [user, roleId, branchId, startDay, endDay, reason] of extra) {
    if (!user) {
      continue;
    }
    const assignedAt = now + Math.min(startDay, -1) * DAY;
    const assignment: RoleAssignment = {
      id: `ra-${user.id}-2`, userId: user.id, roleId, branchId, startsAt: new Date(now + startDay * DAY).toISOString(),
      endsAt: endDay === null ? null : new Date(now + endDay * DAY).toISOString(), reason, assignedById: owner.id,
      assignedAt: new Date(assignedAt).toISOString(),
    };
    user.roles.push(assignment);
    const changes: ActivityChange[] = [
      { field: 'roleId', to: roleId },
      ...(branchId ? [{ field: 'branchId', to: branchId }] : []),
      ...(startDay > 0 ? [{ field: 'startsAt', to: assignment.startsAt }] : []),
      ...(assignment.endsAt ? [{ field: 'endsAt', to: assignment.endsAt }] : []),
    ];
    const entry = (at: number, action: ActivityAction, actorId: string | null, entryChanges: ActivityChange[], why = ''): Activity => ({
      id: uuidV7(at, bytes => bytes.forEach((_, byte) => bytes[byte] = Math.floor(idRandom() * 256))),
      at: new Date(at).toISOString(), actorId, action, targetLabel: fullName(user), targetId: user.id,
      ...(actorId ? office : { ip: '', browser: '', os: '' }), changes: entryChanges, ...(why ? { reason: why } : {}),
    });
    activity.push(entry(assignedAt, 'role_assignment.added', owner.id, changes, reason));
    if (endDay !== null && endDay < 0) {
      activity.push(entry(now + endDay * DAY, 'role_assignment.expired', null, [{ field: 'roleId', from: roleId }]));
      expiryLogged.push(assignment.id);
    }
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  // A year ago, before the first people joined
  const branches = BRANCHES.map(branch => ({ ...branch, createdAt: new Date(now - 430 * DAY).toISOString() }));
  return {
    users, roles: structuredClone([...ROLES, ...CUSTOM_ROLES]), roleConflicts: structuredClone(SAMPLE_ROLE_CONFLICTS), branches, activity,
    // The sample shows branches; a new installation starts without them
    settings: { ...DEFAULT_SETTINGS, branchesEnabled: true },
    sessions: createMockSessions(users, now), expiryLogged,
  };
}

/**
 * Where the sample people are signed in: an office computer for everyone active lately, and a phone for some.
 * A generator of its own, so adding sessions leaves the rest of the sample data as it was.
 */
export function createMockSessions(users: User[], now = Date.now()): UserSession[] {
  const next = random(5150);
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  return users.filter(user => user.status === 'active' && user.lastActiveAt).flatMap(user => {
    const lastSeen = new Date(user.lastActiveAt!).getTime();
    const desktop: UserSession = {
      id: `s-${user.id}-1`,
      userId: user.id,
      createdAt: new Date(lastSeen - (1 + next() * 12) * DAY).toISOString(),
      lastSeenAt: new Date(lastSeen).toISOString(),
      ip: `10.20.${Math.floor(next() * 8)}.${10 + Math.floor(next() * 200)}`,
      browser: pick(['Chrome', 'Chrome', 'Edge', 'Firefox']),
      os: pick(['Windows', 'Windows', 'macOS']),
    };
    if (next() < 0.5) {
      return [desktop];
    }
    const ios = next() < 0.5;
    const phone: UserSession = {
      id: `s-${user.id}-2`,
      userId: user.id,
      createdAt: new Date(now - (3 + next() * 20) * DAY).toISOString(),
      lastSeenAt: new Date(now - next() * 3 * DAY).toISOString(),
      ip: ios ? `203.0.113.${1 + Math.floor(next() * 250)}` : `198.51.100.${1 + Math.floor(next() * 250)}`,
      browser: ios ? 'Safari' : 'Chrome',
      os: ios ? 'iOS' : 'Android',
    };
    return [desktop, phone];
  });
}

/**
 * One active account per role from the sample data, for trying each role on the sign-in page: someone who holds that
 * role and no other. Any password of 6 or more characters signs in. Not for a real server.
 */
export const DEMO_ACCOUNTS: { email: string; roleId: string; roleName: string }[] = (() => {
  const { users } = createMockData(0);
  const accounts = ROLES.flatMap(role => {
    const user = users.find(item => item.status === 'active' && activeRoleIds(item, 0).join() === role.id);
    return user ? [{ email: user.email, roleId: role.id, roleName: role.name }] : [];
  });
  // And the branch manager: Viewer for the whole organization, Manager in Chiang Mai only
  const manager = users.find(user => user.roles.some(item => item.roleId === 'manager' && item.branchId !== null));
  return manager ? [...accounts, { email: manager.email, roleId: 'manager', roleName: 'Branch manager' }] : accounts;
})();
