/*
 * user-management: users, roles and permissions, and the activity log, together with the data layer and
 * the UI they are built from. README.md explains how to add it to an Angular app.
 */
export { USER_MANAGEMENT_ROUTES } from './user-management.routes';
export { USER_MANAGEMENT_MENU, USER_MANAGEMENT_OVERVIEW } from './user-management.menu';
export type { UserManagementMenuGroup, UserManagementMenuLink, UserManagementMenuPage } from './user-management.menu';
export { provideUserManagement } from './provide-user-management';
export type { UserManagementOptions } from './provide-user-management';
export { Session } from './access/session';
export { canViewUser, requirePermission, settingUpTwoFactor, signedIn, signedOut } from './access/guards';
export { TWO_FACTOR_SETUP_PATH } from './access/session';
export { AdminApi, AdminApiError } from './data/admin-api';
export { HttpAdminApi } from './data/http-admin-api';
export { LocalAdminApi } from './data/local-admin-api';
export { localBackend } from './data/local-backend';
export type { AdminApiErrorCode } from './data/admin-api';
export { AdminStore } from './data/admin-store';
export * from './data/models';
