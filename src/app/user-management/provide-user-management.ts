import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer, Type } from '@angular/core';

import { Session, SIGN_IN_PATH } from './access/session';
import { AdminApi } from './data/admin-api';
import { ADMIN_API_EVENTS, ADMIN_API_URL } from './data/http-admin-api';
import { LocalAdminApi } from './data/local-admin-api';

export interface UserManagementOptions {
  /** Where the data comes from: LocalAdminApi (the default) keeps sample data in the browser, HttpAdminApi calls a server */
  api?: Type<AdminApi>;
  /** Where HttpAdminApi finds the server's API; '/api' by default */
  apiUrl?: string;
  /** HttpAdminApi listens to the server's change events at GET {apiUrl}/events (see API.md); off by default */
  liveUpdates?: boolean;
  /** The app's sign-in page, where people who are not signed in are sent; '/login' by default */
  signInPath?: string;
}

/**
 * What user management needs from the app: where its data comes from, and the session picked up before the
 * first screen, so the guards know who is signed in.
 *
 *   provideUserManagement()                                                              // sample data
 *   provideUserManagement({ api: HttpAdminApi, apiUrl: '/api', liveUpdates: true })      // your backend, see API.md
 */
export function provideUserManagement(options: UserManagementOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AdminApi, useClass: options.api ?? LocalAdminApi },
    { provide: SIGN_IN_PATH, useValue: options.signInPath ?? '/login' },
    { provide: ADMIN_API_URL, useValue: options.apiUrl ?? '/api' },
    { provide: ADMIN_API_EVENTS, useValue: options.liveUpdates ?? false },
    provideAppInitializer(() => inject(Session).restore()),
  ]);
}
