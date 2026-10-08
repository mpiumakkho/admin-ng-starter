import { ALL_PERMISSIONS, DEFAULT_SETTINGS, DEPARTMENTS } from './catalog';
import { Activity, ActivityAction, ActivityChange, AdminSettings, fullName, Role, User, UserSession, UserStatus } from './models';

export interface AdminData {
  users: User[];
  roles: Role[];
  activity: Activity[];
  settings: AdminSettings;
  /** Who is signed in where */
  sessions: UserSession[];
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

const ROLES: Role[] = [
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
    permissions: ['users.view', 'users.create', 'users.edit', 'roles.view', 'activity.view', 'activity.export', 'settings.view'],
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
];

/** Small deterministic generator, so the sample data is the same on every first load */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;

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
    return {
      id,
      firstName,
      lastName,
      email: `${firstName}.${lastName}`.toLowerCase() + '@example.com',
      phone: `08${Math.floor(10000000 + next() * 89999999)}`,
      department: isOwner ? 'Operations' : pick(DEPARTMENTS),
      roleId,
      status,
      // About two thirds have a photo; the rest show initials
      avatar: isOwner ? 'assets/images/faces/face8.jpg' : next() < 0.66 ? `assets/images/faces/face${1 + (index % 27)}.jpg` : '',
      createdAt: new Date(now - ageDays * DAY - next() * DAY).toISOString(),
      lastActiveAt: status === 'invited' ? null : new Date(now - (isOwner ? 0.01 : next() * 30) * DAY).toISOString(),
    };
  });

  const admins = users.filter(user => user.roleId === 'admin' || user.roleId === 'manager');

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
        return [{ field: 'roleId', to: user.roleId }, { field: 'department', to: user.department }, { field: 'email', to: user.email }, { field: 'status', to: 'active' }];
      case 'user.invited':
        return [{ field: 'roleId', to: user.roleId }, { field: 'email', to: user.email }, { field: 'status', to: 'invited' }];
      case 'user.updated': {
        const otherRole = pick(ROLES.filter(item => item.id !== user.roleId)).id;
        const otherDepartment = pick(DEPARTMENTS.filter(item => item !== user.department));
        return pick<ActivityChange[]>([
          [{ field: 'department', from: otherDepartment, to: user.department }],
          [{ field: 'roleId', from: otherRole, to: user.roleId }],
          [{ field: 'phone', from: `08${Math.floor(10000000 + next() * 89999999)}`, to: user.phone }],
          [{ field: 'roleId', from: otherRole, to: user.roleId }, { field: 'department', from: otherDepartment, to: user.department }],
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

  const activity: Activity[] = Array.from({ length: 60 }, (_, index) => {
    const action = pick(actions);
    const actor = pick(admins);
    // Anyone but the owner, whose account the sample keeps untouched
    const user = pick(users.slice(1));
    const role = pick(ROLES);
    const isRole = action.startsWith('role.');
    const isSignIn = action === 'auth.sign_in';
    const device = devices.get(actor.id)!;
    return {
      id: `a-${index + 1}`,
      at: new Date(now - Math.pow(next(), 1.4) * 30 * DAY).toISOString(),
      actorId: actor.id,
      action,
      targetLabel: isSignIn ? fullName(actor) : isRole ? role.name : fullName(user),
      targetId: isSignIn ? actor.id : isRole ? role.id : user.id,
      ...(next() < 0.8 ? device.desktop : device.phone),
      changes: changesFor(action, user, role),
    };
  }).sort((a, b) => b.at.localeCompare(a.at));

  return { users, roles: structuredClone(ROLES), activity, settings: { ...DEFAULT_SETTINGS }, sessions: createMockSessions(users, now) };
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
 * One active account per role from the sample data, for trying each role on the sign-in page.
 * Any password of 6 or more characters signs in. Not for a real server.
 */
export const DEMO_ACCOUNTS: { email: string; roleId: string; roleName: string }[] = (() => {
  const { users, roles } = createMockData(0);
  return roles.flatMap(role => {
    const user = users.find(item => item.roleId === role.id && item.status === 'active');
    return user ? [{ email: user.email, roleId: role.id, roleName: role.name }] : [];
  });
})();
