import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RedirectCommand, Router, RouterStateSnapshot } from '@angular/router';

import { AdminStore } from '../data/admin-store';
import { Permission } from '../data/models';
import { Session, SIGN_IN_PATH, SIGNING_OUT } from './session';

/*
 * Route guards. A page someone may not open shows the no-access page at the same address, so the address bar
 * still says what they tried to open.
 */

/** Lets signed-in people through; sends everyone else to sign in, and back here afterwards */
export const signedIn: CanActivateFn = (_route, state) => inject(Session).signedIn() || toSignIn(state);

/** For the sign-in page: someone already signed in goes to their first page instead, unless they are signing out */
export const signedOut: CanActivateFn = () => {
  const session = inject(Session);
  const router = inject(Router);
  return !session.signedIn() || !!router.currentNavigation()?.extras.state?.[SIGNING_OUT] || router.parseUrl(session.homeUrl());
};

/** Lets through people whose role has every permission listed */
export function requirePermission(...permissions: Permission[]): CanActivateFn {
  return (_route, state) => {
    const session = inject(Session);
    if (!session.signedIn()) {
      return toSignIn(state);
    }
    return permissions.every(permission => session.can(permission)) || noAccess(state);
  };
}

/** A user's profile: anyone can see their own; other people's need users.view */
export const canViewUser: CanActivateFn = (route, state) => {
  const session = inject(Session);
  if (!session.signedIn()) {
    return toSignIn(state);
  }
  return route.paramMap.get('id') === session.userId() || session.can('users.view') || noAccess(state);
};

/**
 * Editing a user needs users.edit and a role no stronger than your own (see access-rules.ts).
 * Everyone can edit their own profile; the form then locks what they may not change.
 */
export const canEditUser: CanActivateFn = (route: ActivatedRouteSnapshot, state) => {
  const session = inject(Session);
  if (!session.signedIn()) {
    return toSignIn(state);
  }
  const user = inject(AdminStore).usersById().get(route.paramMap.get('id') ?? '');
  // An unknown id is let through to editors: the form shows "user not found"
  return (user ? session.canEditProfile(user) : session.can('users.edit')) || noAccess(state);
};

function toSignIn(state: RouterStateSnapshot) {
  const router = inject(Router);
  return router.createUrlTree([inject(SIGN_IN_PATH)], { queryParams: { returnUrl: state.url } });
}

/** Shows the no-access page while the address bar keeps the address that was asked for */
function noAccess(state: RouterStateSnapshot) {
  const router = inject(Router);
  return new RedirectCommand(router.parseUrl('/no-access'), { browserUrl: router.parseUrl(state.url) });
}
