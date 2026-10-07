import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, map, throwError } from 'rxjs';

import { AdminApiError, AdminApiErrorCode } from './admin-api';
import { ADMIN_API_URL } from './http-admin-api';
import { LocalAdminApi } from './local-admin-api';
import { RoleDraft, UserDraft } from './models';

/** The status a server would answer each refusal with */
const STATUS: Record<AdminApiErrorCode, number> = {
  unauthenticated: 401,
  invalid_credentials: 401,
  forbidden: 403,
  self_change: 403,
  account_suspended: 403,
  invite_pending: 403,
  not_found: 404,
  email_taken: 409,
  role_in_use: 409,
  system_role: 409,
  not_invited: 409,
  email_domain: 422,
  weak_password: 422,
  default_role: 409,
  invalid_request: 400,
  two_factor_required: 401,
  invalid_code: 401,
};

type Body = Record<string, never>;
type Route = [method: string, path: RegExp, answer: (api: LocalAdminApi, body: Body, id: string) => Promise<unknown>];

/** Every request in API.md, answered by LocalAdminApi */
const ROUTES: Route[] = [
  ['GET', /^\/session$/, api => api.getSession()],
  ['POST', /^\/session$/, (api, body) => api.signIn(body['email'], body['password'], body['remember'], body['code'])],
  ['POST', /^\/session\/two-factor$/, api => api.startTwoFactor()],
  ['POST', /^\/session\/two-factor\/confirm$/, (api, body) => api.confirmTwoFactor(body['code'])],
  ['POST', /^\/session\/two-factor\/disable$/, (api, body) => api.disableTwoFactor(body['code'])],
  ['GET', /^\/users\/([^/]+)\/sessions$/, (api, _body, id) => api.listSessions(id)],
  ['POST', /^\/users\/([^/]+)\/sessions\/end$/, (api, _body, id) => api.endSessions(id)],
  ['DELETE', /^\/sessions\/([^/]+)$/, (api, _body, id) => api.endSession(id)],
  ['POST', /^\/users\/([^/]+)\/two-factor\/reset$/, (api, _body, id) => api.resetTwoFactor(id)],
  ['DELETE', /^\/session$/, api => api.signOut()],
  ['POST', /^\/session\/password$/, (api, body) => api.changePassword(body['currentPassword'], body['newPassword'])],
  ['GET', /^\/users$/, api => api.listUsers()],
  ['POST', /^\/users$/, (api, body) => api.createUser(body as unknown as UserDraft)],
  ['POST', /^\/users\/import$/, (api, body) => api.createUsers(body['users'])],
  ['POST', /^\/users\/status$/, (api, body) => api.setUserStatus(body['ids'], body['status'])],
  ['POST', /^\/users\/delete$/, (api, body) => api.deleteUsers(body['ids'])],
  ['POST', /^\/users\/([^/]+)\/reset-password$/, (api, _body, id) => api.resetPassword(id)],
  ['POST', /^\/users\/([^/]+)\/resend-invite$/, (api, _body, id) => api.resendInvite(id)],
  ['PATCH', /^\/users\/([^/]+)$/, (api, body, id) => api.updateUser(id, body)],
  ['GET', /^\/roles$/, api => api.listRoles()],
  ['POST', /^\/roles$/, (api, body) => api.createRole(body as unknown as RoleDraft)],
  ['PATCH', /^\/roles\/([^/]+)$/, (api, body, id) => api.updateRole(id, body)],
  ['DELETE', /^\/roles\/([^/]+)$/, (api, _body, id) => api.deleteRole(id)],
  ['GET', /^\/activity$/, api => api.listActivity()],
  ['GET', /^\/settings$/, api => api.getSettings()],
  ['PATCH', /^\/settings$/, (api, body) => api.updateSettings(body)],
];

let backend: LocalAdminApi | undefined;

/** Whether the pretend server has answered, so the sign-in page can offer the sample accounts */
export function localBackendActive(): boolean {
  return !!backend;
}

/**
 * A pretend server in the browser: answers HttpAdminApi's requests with the sample data, as real HTTP
 * responses and errors. Use it to work on the HTTP side before the backend exists:
 *
 *   provideHttpClient(withInterceptors([localBackend])),
 *   provideUserManagement({ api: HttpAdminApi }),
 *
 * Requests outside the API's address pass through untouched.
 */
export const localBackend: HttpInterceptorFn = (request, next) => {
  const base = new URL(inject(ADMIN_API_URL).replace(/\/$/, ''), location.origin);
  const url = new URL(request.url, location.origin);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname + '/')) {
    return next(request);
  }
  const path = url.pathname.slice(base.pathname.length);
  for (const [method, pattern, answer] of ROUTES) {
    const match = request.method === method ? pattern.exec(path) : null;
    if (match) {
      backend ??= new LocalAdminApi();
      return from(answer(backend, (request.body ?? {}) as Body, decodeURIComponent(match[1] ?? ''))).pipe(
        map(body => new HttpResponse({ status: body === undefined ? 204 : 200, body: body ?? null, url: request.url })),
        catchError(error => throwError(() => toHttpError(error, request))),
      );
    }
  }
  return throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found', url: request.url }));
};

function toHttpError(error: unknown, request: HttpRequest<unknown>) {
  if (!(error instanceof AdminApiError)) {
    return new HttpErrorResponse({ status: 500, statusText: 'Server Error', error: String(error), url: request.url });
  }
  return new HttpErrorResponse({ status: STATUS[error.code], error: { code: error.code }, url: request.url });
}
