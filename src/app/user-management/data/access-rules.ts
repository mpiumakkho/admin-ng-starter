import { Permission, Role, User } from './models';

/*
 * Who may change what. LocalAdminApi enforces these rules the way a server would, and the pages use the same
 * functions to hide or disable what the server would refuse. A real backend must check them too: hiding a
 * button never stops a request.
 *
 * - A permission is needed for each kind of change (users.edit, roles.manage and so on).
 * - Nobody can give out more than they have: you can only assign a role, or tick a permission on a role,
 *   when you hold every permission it grants yourself.
 * - So you can only manage people whose role you could assign; nobody below an administrator can take over
 *   an administrator's account.
 * - Nobody can suspend or delete themselves, change their own role or change their own role's permissions,
 *   so an administrator cannot lock everyone out by accident.
 * - Everyone can change their own name, phone and photo, and their password, without any permission.
 */

/** What people can change on their own account without users.edit */
export const SELF_EDITABLE_FIELDS = ['firstName', 'lastName', 'phone', 'avatar'] as const;

/** What a user's role allows; nothing when the role is missing */
export function permissionsOf(user: Pick<User, 'roleId'> | null | undefined, roles: readonly Role[]): ReadonlySet<Permission> {
  const role = user ? roles.find(item => item.id === user.roleId) : undefined;
  return new Set(role?.permissions ?? []);
}

/** Whether someone holding `held` may give out every permission in `permissions` */
export function holdsAll(held: ReadonlySet<Permission>, permissions: readonly Permission[]): boolean {
  return permissions.every(permission => held.has(permission));
}

/** Whether someone holding `held` may manage a person with this role (edit, suspend, delete, reset, invite again) */
export function canManageRole(held: ReadonlySet<Permission>, role: Pick<Role, 'permissions'> | undefined): boolean {
  return holdsAll(held, role?.permissions ?? []);
}
