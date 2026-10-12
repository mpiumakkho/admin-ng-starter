import { Permission, Role, RoleAssignment, RoleConflict, User } from './models';

/*
 * Who may change what. LocalAdminApi enforces these rules the way a server would, and the pages use the same
 * functions to hide or disable what the server would refuse. A real backend must check them too: hiding a
 * button never stops a request.
 *
 * - A person holds the roles of their assignments that count now (see roleAssignmentState), and has every
 *   permission of each of them, together. User management's own permissions come from assignments for the whole
 *   organization, except the four of BRANCH_SCOPED_PERMISSIONS, which one limited to a branch grants over the people
 *   of that branch (a branch administrator). Otherwise one limited to a branch grants its permissions in that branch
 *   (branchPermissionsOf).
 * - A permission is needed for each kind of change (users.edit, roles.manage and so on).
 * - Nobody can give out more than they have: you can only give a role, or tick a permission on a role,
 *   when you hold every permission it grants yourself.
 * - So you can only manage people whose roles, now or scheduled, you could give, each in its scope (permissionsIn);
 *   nobody below an administrator can take over an administrator's account.
 * - Nobody can suspend or delete themselves, change their own role assignments or change the permissions of a role
 *   they hold, so an administrator cannot lock everyone out by accident.
 * - Someone must always be able to run the system: an active user keeps a role with every permission, for good.
 * - Everyone can change their own name, phone and photo, and their password, without any permission.
 */

/** What people can change on their own account without users.edit; language is the app's own doing (Session) */
export const SELF_EDITABLE_FIELDS = ['firstName', 'lastName', 'phone', 'avatar', 'language'] as const;

/**
 * The user-management permissions a role limited to a branch grants over the people who belong to that branch, so a
 * branch manager looks after their branch's staff (API.md, "Branch administrators"). The rest come only from roles for
 * the whole organization.
 */
export const BRANCH_SCOPED_PERMISSIONS: readonly Permission[] = ['users.view', 'users.create', 'users.edit', 'activity.view'];

/** Everything someone's roles allow: for the whole organization, and through roles limited to a branch, by branch id */
export interface Grants {
  organization: ReadonlySet<Permission>;
  branches: ReadonlyMap<string, ReadonlySet<Permission>>;
}

export type RoleAssignmentState = 'scheduled' | 'active' | 'expired';

/** Whether an assignment has not started yet, counts now, or has ended */
export function roleAssignmentState(assignment: Pick<RoleAssignment, 'startsAt' | 'endsAt'>, now = Date.now()): RoleAssignmentState {
  if (new Date(assignment.startsAt).getTime() > now) {
    return 'scheduled';
  }
  return assignment.endsAt && new Date(assignment.endsAt).getTime() <= now ? 'expired' : 'active';
}

/** The ids of the roles someone holds now */
export function activeRoleIds(user: Pick<User, 'roles'> | null | undefined, now = Date.now()): string[] {
  return [...new Set((user?.roles ?? []).filter(item => roleAssignmentState(item, now) === 'active').map(item => item.roleId))];
}

/** Every permission of the roles someone holds now for the whole organization; nothing when they hold none */
export function permissionsOf(user: Pick<User, 'roles'> | null | undefined, roles: readonly Role[], now = Date.now()): ReadonlySet<Permission> {
  const held = new Set((user?.roles ?? [])
    .filter(item => item.branchId === null && roleAssignmentState(item, now) === 'active')
    .map(item => item.roleId));
  return new Set(roles.filter(role => held.has(role.id)).flatMap(role => role.permissions));
}

/** What someone may do in each branch through roles limited to it, on top of permissionsOf, by branch id */
export function branchPermissionsOf(user: Pick<User, 'roles'> | null | undefined, roles: readonly Role[], now = Date.now()): ReadonlyMap<string, ReadonlySet<Permission>> {
  const byId = new Map(roles.map(role => [role.id, role]));
  const result = new Map<string, Set<Permission>>();
  for (const item of user?.roles ?? []) {
    if (item.branchId !== null && roleAssignmentState(item, now) === 'active') {
      const granted = result.get(item.branchId) ?? new Set<Permission>();
      byId.get(item.roleId)?.permissions.forEach(permission => granted.add(permission));
      result.set(item.branchId, granted);
    }
  }
  return result;
}

/** What someone's roles allow, from permissionsOf and branchPermissionsOf */
export function grantsOf(user: Pick<User, 'roles'> | null | undefined, roles: readonly Role[], now = Date.now()): Grants {
  return { organization: permissionsOf(user, roles, now), branches: branchPermissionsOf(user, roles, now) };
}

/**
 * What someone has in a scope: for the whole organization (null), their permissions there; in a branch, those together
 * with what their roles limited to it allow. Giving a role, and managing someone who holds it, count in the role's scope.
 */
export function permissionsIn(grants: Grants, branchId: string | null): ReadonlySet<Permission> {
  const limited = branchId === null ? undefined : grants.branches.get(branchId);
  return limited?.size ? new Set([...grants.organization, ...limited]) : grants.organization;
}

/**
 * Whether someone may use a user-management permission over a person of this branch, or of none (null), or for an
 * assignment in that scope: for the whole organization, or, for one of BRANCH_SCOPED_PERMISSIONS, through a role
 * limited to the branch
 */
export function allows(grants: Grants, permission: Permission, branchId: string | null): boolean {
  return grants.organization.has(permission) || (branchId !== null && BRANCH_SCOPED_PERMISSIONS.includes(permission)
    && !!grants.branches.get(branchId)?.has(permission));
}

/** The branches where someone has one of BRANCH_SCOPED_PERMISSIONS through a role limited to them */
export function branchesWith(grants: Grants, permission: Permission): string[] {
  return BRANCH_SCOPED_PERMISSIONS.includes(permission)
    ? [...grants.branches].filter(([, granted]) => granted.has(permission)).map(([branchId]) => branchId)
    : [];
}

/** Whether someone holding `held` may give out every permission in `permissions` */
export function holdsAll(held: ReadonlySet<Permission>, permissions: readonly Permission[]): boolean {
  return permissions.every(permission => held.has(permission));
}

/** Whether someone holding `held` may manage a role, or give it */
export function canManageRole(held: ReadonlySet<Permission>, role: Pick<Role, 'permissions'> | undefined): boolean {
  return holdsAll(held, role?.permissions ?? []);
}

/**
 * Whether someone may manage a person (edit, suspend, delete, reset, invite again, change their roles) as far as rule 3
 * goes: they have every permission of each role the person holds now or later, in that role's scope
 */
export function canManageUser(grants: Grants, user: Pick<User, 'roles'>, roles: readonly Role[], now = Date.now()): boolean {
  const byId = new Map(roles.map(role => [role.id, role]));
  return user.roles.filter(item => roleAssignmentState(item, now) !== 'expired')
    .every(item => canManageRole(permissionsIn(grants, item.branchId), byId.get(item.roleId)));
}

/** Whether someone may give a role in a scope (null: the whole organization) as far as rule 2 goes */
export function canGiveRole(grants: Grants, role: Pick<Role, 'permissions'> | undefined, branchId: string | null): boolean {
  return canManageRole(permissionsIn(grants, branchId), role);
}

/** A role that grants every permission there is, such as the built-in Administrator */
export function grantsEverything(role: Pick<Role, 'permissions'>, all: readonly Permission[]): boolean {
  return holdsAll(new Set(role.permissions), all);
}

/**
 * Whether someone can still run the system: an active user who holds, now, for good and for the whole organization,
 * a role with every permission. Changes that would leave nobody are refused with last_administrator.
 */
export function administratorRemains(users: readonly User[], roles: readonly Role[], all: readonly Permission[], now = Date.now()): boolean {
  const full = new Set(roles.filter(role => grantsEverything(role, all)).map(role => role.id));
  return users.some(user => user.status === 'active' && user.roles.some(item =>
    full.has(item.roleId) && item.branchId === null && item.endsAt === null && roleAssignmentState(item, now) === 'active'));
}

/** A period of a role: from startsAt until endsAt, or for good */
type Period = Pick<RoleAssignment, 'startsAt' | 'endsAt'>;

/** Whether two periods share a moment */
export function periodsOverlap(a: Period, b: Period): boolean {
  const end = (period: Period) => period.endsAt ? new Date(period.endsAt).getTime() : Infinity;
  return new Date(a.startsAt).getTime() < end(b) && new Date(b.startsAt).getTime() < end(a);
}

/**
 * The rule a period of a role would break, and the role it clashes with: another role of the same rule held, now or
 * later, at an overlapping time, in any scope (API.md, "Conflicting roles"). Null when none.
 */
export function roleConflict(
  rules: readonly RoleConflict[], held: readonly RoleAssignment[], roleId: string, period: Period, now = Date.now(),
): { rule: RoleConflict; roleId: string } | null {
  for (const rule of rules.filter(item => item.roleIds.includes(roleId))) {
    const other = held.find(item => item.roleId !== roleId && rule.roleIds.includes(item.roleId)
      && roleAssignmentState(item, now) !== 'expired' && periodsOverlap(item, period));
    if (other) {
      return { rule, roleId: other.roleId };
    }
  }
  return null;
}

/** Someone who holds two or more roles of a rule at an overlapping time, now or later: the people to fix */
export interface RoleConflictViolation {
  user: User;
  rule: RoleConflict;
  roleIds: string[];
}

/** Everyone who breaks a rule, as a rule made after they got their roles leaves them (API.md, "Conflicting roles") */
export function roleConflictViolations(users: readonly User[], rules: readonly RoleConflict[], now = Date.now()): RoleConflictViolation[] {
  const found: RoleConflictViolation[] = [];
  for (const user of users) {
    const held = user.roles.filter(item => roleAssignmentState(item, now) !== 'expired');
    for (const rule of rules) {
      const inRule = held.filter(item => rule.roleIds.includes(item.roleId));
      const clashing = new Set(inRule.filter(item => inRule.some(other => other.roleId !== item.roleId && periodsOverlap(item, other)))
        .map(item => item.roleId));
      if (clashing.size > 1) {
        found.push({ user, rule, roleIds: rule.roleIds.filter(roleId => clashing.has(roleId)) });
      }
    }
  }
  return found;
}
