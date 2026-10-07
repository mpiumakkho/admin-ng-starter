import { Routes } from '@angular/router';

import { requirePermission } from './access/guards';
import { NoAccessComponent } from './access/no-access.component';

/**
 * The user management pages, each loaded when first opened and only for people whose role allows it.
 * Spread them into the app's routes, at the top level.
 */
export const USER_MANAGEMENT_ROUTES: Routes = [
  { path: 'overview', canActivate: [requirePermission('users.view')], loadComponent: () => import('./overview/overview.component').then(m => m.OverviewComponent) },
  // Each users page checks its own permission; anyone can open their own profile
  { path: 'users', loadChildren: () => import('./users/users.routes').then(m => m.USERS_ROUTES) },
  { path: 'roles', canActivate: [requirePermission('roles.view')], loadComponent: () => import('./roles/roles.component').then(m => m.RolesComponent) },
  { path: 'activity', canActivate: [requirePermission('activity.view')], loadComponent: () => import('./activity/activity.component').then(m => m.ActivityComponent) },
  { path: 'settings', loadChildren: () => import('./settings/settings.routes').then(m => m.SETTINGS_ROUTES) },
  // Where the guards send people whose role does not allow a page
  { path: 'no-access', component: NoAccessComponent },
];
