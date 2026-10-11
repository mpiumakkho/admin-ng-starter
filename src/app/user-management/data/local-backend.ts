import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, map, throwError } from 'rxjs';

import { AdminApiError, AdminApiErrorCode } from './admin-api';
import { ADMIN_API_URL, TokenAnswer } from './http-admin-api';
import { LocalAdminApi } from './local-admin-api';
import { BranchDraft, RoleAssignmentBatch, RoleAssignmentDraft, RoleDraft, User, UserDraft } from './models';

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
  invalid_token: 400,
  two_factor_mandatory: 403,
  password_reused: 422,
  too_many_requests: 429,
  already_assigned: 409,
  last_administrator: 409,
  assignment_too_long: 422,
  reason_required: 422,
  code_taken: 409,
  branch_in_use: 409,
  branch_closed: 409,
};

/** How long an access token lasts, in seconds, as on the server */
const TOKEN_SECONDS = 900;

/** The access tokens handed out, and when each runs out */
const tokens = new Map<string, number>();

type Body = Record<string, never>;
type Route = [
  method: string,
  path: RegExp,
  answer: (api: LocalAdminApi, body: Body, id: string, query: URLSearchParams) => Promise<unknown>,
];

/**
 * Every request in API.md, answered by LocalAdminApi. The session it keeps in the browser stands in for the
 * refresh cookie, and every token handed out belongs to that one session.
 */
const ROUTES: Route[] = [
  ['POST', /^\/auth\/login$/, async (api, body) => issue(await api.signIn(body['email'], body['password'], body['remember'], body['code']))],
  ['POST', /^\/auth\/refresh$/, async api => issue(signedIn(await api.getSession()))],
  ['POST', /^\/auth\/logout$/, api => {
    tokens.clear();
    return api.signOut();
  }],
  ['POST', /^\/auth\/activate$/, (api, body) => api.acceptInvitation(body['token'], body['password'])],
  ['POST', /^\/auth\/password-reset\/request$/, (api, body) => api.requestPasswordReset(body['email'])],
  ['POST', /^\/auth\/password-reset\/confirm$/, (api, body) => api.confirmPasswordReset(body['token'], body['password'])],
  ['GET', /^\/auth\/password-policy$/, api => api.getPasswordPolicy()],
  ['GET', /^\/me$/, async api => signedIn(await api.getSession())],
  ['POST', /^\/me\/password$/, (api, body) => api.changePassword(body['currentPassword'], body['newPassword'])],
  ['POST', /^\/me\/two-factor$/, api => api.startTwoFactor()],
  ['POST', /^\/me\/two-factor\/confirm$/, (api, body) => api.confirmTwoFactor(body['code'])],
  ['POST', /^\/me\/two-factor\/disable$/, (api, body) => api.disableTwoFactor(body['code'])],
  ['GET', /^\/users\/([^/]+)\/sessions$/, (api, _body, id) => api.listSessions(id)],
  ['POST', /^\/users\/([^/]+)\/sessions\/end$/, (api, _body, id) => api.endSessions(id)],
  ['DELETE', /^\/sessions\/([^/]+)$/, (api, _body, id) => api.endSession(id)],
  ['POST', /^\/users\/([^/]+)\/two-factor\/reset$/, (api, _body, id) => api.resetTwoFactor(id)],
  ['GET', /^\/users$/, api => api.listUsers()],
  ['POST', /^\/users$/, (api, body) => api.createUser(body as unknown as UserDraft)],
  ['POST', /^\/users\/import$/, (api, body) => api.createUsers(body['users'])],
  ['POST', /^\/users\/status$/, (api, body) => api.setUserStatus(body['ids'], body['status'])],
  ['POST', /^\/users\/delete$/, (api, body) => api.deleteUsers(body['ids'])],
  ['POST', /^\/users\/([^/]+)\/reset-password$/, (api, _body, id) => api.resetPassword(id)],
  ['POST', /^\/users\/([^/]+)\/resend-invite$/, (api, _body, id) => api.resendInvite(id)],
  ['PATCH', /^\/users\/([^/]+)$/, (api, body, id) => api.updateUser(id, body)],
  ['POST', /^\/role-assignments$/, (api, body) => api.assignRole(body as unknown as RoleAssignmentDraft)],
  ['POST', /^\/role-assignments\/batch$/, (api, body) => {
    const { userIds, ...change } = body;
    return api.assignRoles(userIds, change as unknown as RoleAssignmentBatch);
  }],
  ['PATCH', /^\/role-assignments\/([^/]+)$/, (api, body, id) => api.updateRoleAssignment(id, body)],
  ['DELETE', /^\/role-assignments\/([^/]+)$/, (api, _body, id) => api.removeRoleAssignment(id)],
  ['GET', /^\/branches$/, api => api.listBranches()],
  ['POST', /^\/branches$/, (api, body) => api.createBranch(body as unknown as BranchDraft)],
  ['PATCH', /^\/branches\/([^/]+)$/, (api, body, id) => api.updateBranch(id, body)],
  ['DELETE', /^\/branches\/([^/]+)$/, (api, _body, id) => api.deleteBranch(id)],
  ['GET', /^\/roles$/, api => api.listRoles()],
  ['POST', /^\/roles$/, (api, body) => api.createRole(body as unknown as RoleDraft)],
  ['PATCH', /^\/roles\/([^/]+)$/, (api, body, id) => api.updateRole(id, body)],
  ['DELETE', /^\/roles\/([^/]+)$/, (api, _body, id) => api.deleteRole(id)],
  ['GET', /^\/activity$/, (api, _body, _id, query) => api.listActivity({
    from: query.get('from') ?? undefined,
    to: query.get('to') ?? undefined,
  })],
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
 * responses and errors, access tokens included. Use it to work on the HTTP side before the backend exists:
 *
 *   provideHttpClient(withInterceptors([localBackend])),
 *   provideUserManagement({ api: HttpAdminApi }),
 *
 * Like the server, it answers 401 to a request without a token it handed out, so after a reload HttpAdminApi
 * refreshes its token as it will against the backend. Requests outside the API's address pass through untouched.
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
      // Outside /auth, only a token handed out and not yet run out lets a request in
      const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1] ?? '';
      if (!path.startsWith('/auth/') && !((tokens.get(token) ?? 0) > Date.now())) {
        return throwError(() => toHttpError(new AdminApiError('unauthenticated'), request));
      }
      return from(answer(backend, (request.body ?? {}) as Body, decodeURIComponent(match[1] ?? ''), url.searchParams)).pipe(
        map(body => new HttpResponse({ status: body === undefined ? 204 : 200, body: body ?? null, url: request.url })),
        catchError(error => throwError(() => toHttpError(error, request))),
      );
    }
  }
  return throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found', url: request.url }));
};

/** A new access token for the user, answered as /auth/login and /auth/refresh do */
function issue(user: User): TokenAnswer {
  const accessToken = `local.${crypto.randomUUID()}`;
  tokens.set(accessToken, Date.now() + TOKEN_SECONDS * 1000);
  return { accessToken, expiresIn: TOKEN_SECONDS, user };
}

/** The signed-in user, refusing the request when nobody is */
function signedIn(user: User | null): User {
  if (!user) {
    throw new AdminApiError('unauthenticated');
  }
  return user;
}

function toHttpError(error: unknown, request: HttpRequest<unknown>) {
  if (!(error instanceof AdminApiError)) {
    return new HttpErrorResponse({ status: 500, statusText: 'Server Error', error: String(error), url: request.url });
  }
  return new HttpErrorResponse({ status: STATUS[error.code], error: { code: error.code }, url: request.url });
}
