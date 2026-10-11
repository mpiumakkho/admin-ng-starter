import { Permission, Role, RoleAssignment, User } from './models';

/*
 * Who may change what. LocalAdminApi enforces these rules the way a server would, and the pages use the same
 * functions to hide or disable what the server would refuse. A real backend must check them too: hiding a
 * button never stops a request.
 *
 * - A person holds the roles of their assignments that count now (see roleAssignmentState), and has every
 *   permission of each of them, together.
 * - A permission is needed for each kind of change (users.edit, roles.manage and so on).
 * - Nobody can give out more than they have: you can only give a role, or tick a permission on a role,
 *   when you hold every permission it grants yourself.
 * - So you can only manage people whose roles, now or scheduled, you could give; nobody below an administrator can
 *   take over an administrator's account.
 * - Nobody can suspend or delete themselves, change their own role assignments or change the permissions of a role
 *   they hold, so an administrator cannot lock everyone out by accident.
 * - Someone must always be able to run the system: an active user keeps a role with every permission, for good.
 * - Everyone can change their own name, phone and photo, and their password, without any permission.
 */

/** What people can change on their own account without users.edit */
export const SELF_EDITABLE_FIELDS = ['firstName', 'lastName', 'phone', 'avatar'] as const;

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

/** The ids of the roles someone holds now or will hold: whoever manages them must be able to give all of these */
export function heldRoleIds(user: Pick<User, 'roles'> | null | undefined, now = Date.now()): string[] {
  return [...new Set((user?.roles ?? []).filter(item => roleAssignmentState(item, now) !== 'expired').map(item => item.roleId))];
}

/** Every permission of the roles someone holds now; nothing when they hold none */
export function permissionsOf(user: Pick<User, 'roles'> | null | undefined, roles: readonly Role[], now = Date.now()): ReadonlySet<Permission> {
  const held = new Set(activeRoleIds(user, now));
  return new Set(roles.filter(role => held.has(role.id)).flatMap(role => role.permissions));
}

/** Whether someone holding `held` may give out every permission in `permissions` */
export function holdsAll(held: ReadonlySet<Permission>, permissions: readonly Permission[]): boolean {
  return permissions.every(permission => held.has(permission));
}

/** Whether someone holding `held` may manage a role, or give it */
export function canManageRole(held: ReadonlySet<Permission>, role: Pick<Role, 'permissions'> | undefined): boolean {
  return holdsAll(held, role?.permissions ?? []);
}

/** Whether someone holding `held` may manage a person (edit, suspend, delete, reset, invite again, change their roles) */
export function canManageUser(held: ReadonlySet<Permission>, user: Pick<User, 'roles'>, roles: readonly Role[], now = Date.now()): boolean {
  const ids = new Set(heldRoleIds(user, now));
  return roles.filter(role => ids.has(role.id)).every(role => canManageRole(held, role));
}

/** A role that grants every permission there is, such as the built-in Administrator */
export function grantsEverything(role: Pick<Role, 'permissions'>, all: readonly Permission[]): boolean {
  return holdsAll(new Set(role.permissions), all);
}

/**
 * Whether someone can still run the system: an active user who holds, now and for good, a role with every permission.
 * Changes that would leave nobody are refused with last_administrator.
 */
export function administratorRemains(users: readonly User[], roles: readonly Role[], all: readonly Permission[], now = Date.now()): boolean {
  const full = new Set(roles.filter(role => grantsEverything(role, all)).map(role => role.id));
  return users.some(user => user.status === 'active' && user.roles.some(item =>
    full.has(item.roleId) && item.endsAt === null && roleAssignmentState(item, now) === 'active'));
}
