import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { Session, signedIn, signedOut, USER_MANAGEMENT_ROUTES } from './user-management';

export const routes: Routes = [
  // The first page the signed-in user's role allows, or the sign-in page
  { path: '', pathMatch: 'full', redirectTo: () => inject(Session).homeUrl() },
  // Overview, users, roles and activity
  ...USER_MANAGEMENT_ROUTES,
  // Component reference for building other dashboards; not linked from the menu
  { path: 'ui-kit', canActivate: [signedIn], loadComponent: () => import('./ui-kit/ui-kit.component').then(m => m.UiKitComponent) },
  { path: 'login', canActivate: [signedOut], loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'forgot-password', canActivate: [signedOut], loadComponent: () => import('./auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  // Where the links in emails lead (API.md, "Links in emails"); they work whether or not someone is signed in here
  { path: 'activate', data: { link: 'invite' }, loadComponent: () => import('./auth/set-password/set-password.component').then(m => m.SetPasswordComponent) },
  { path: 'reset-password', data: { link: 'reset' }, loadComponent: () => import('./auth/set-password/set-password.component').then(m => m.SetPasswordComponent) },
  { path: 'error-pages', loadChildren: () => import('./error-pages/error-pages.routes').then(m => m.ERROR_PAGES_ROUTES) },
  { path: '**', redirectTo: '/error-pages/404' },
];
