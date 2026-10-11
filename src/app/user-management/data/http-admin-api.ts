import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { firstValueFrom, Observable, Subscription } from 'rxjs';

import { AdminApi, AdminApiError, AdminApiErrorCode } from './admin-api';
import {
  Activity, ActivityRange, AdminSettings, Branch, BranchChanges, BranchDraft, PasswordPolicy, Role, RoleAssignmentBatch,
  RoleAssignmentChanges, RoleAssignmentDraft, RoleDraft, TwoFactorSetup, User, UserChanges, UserDraft, UserSession, UserStatus,
} from './models';

/** Where the server's API starts, such as "/api" or "https://admin.example.com/api". Set by provideUserManagement(). */
export const ADMIN_API_URL = new InjectionToken<string>('ADMIN_API_URL', { factory: () => '/api' });

/** Whether the server streams change events at GET /events, for live updates. Set by provideUserManagement(). */
export const ADMIN_API_EVENTS = new InjectionToken<boolean>('ADMIN_API_EVENTS', { factory: () => false });

/** What POST /auth/login and POST /auth/refresh answer; expiresIn is in seconds */
export interface TokenAnswer {
  accessToken: string;
  expiresIn: number;
  user: User;
}

const CODES: readonly AdminApiErrorCode[] = [
  'email_taken', 'not_found', 'not_invited', 'role_in_use', 'system_role', 'invalid_credentials', 'account_suspended',
  'invite_pending', 'unauthenticated', 'forbidden', 'self_change', 'email_domain', 'weak_password', 'default_role',
  'invalid_request', 'two_factor_required', 'invalid_code', 'invalid_token', 'two_factor_mandatory', 'password_reused',
  'too_many_requests', 'already_assigned', 'last_administrator', 'assignment_too_long', 'reason_required', 'code_taken',
  'branch_in_use', 'branch_closed',
];

/** The /auth requests carry the refresh cookie, also to an API on another origin */
const CREDENTIALS = { withCredentials: true };
/** How long watch() waits before connecting again, doubling after each failed try up to the longest */
const RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

/**
 * AdminApi over HTTP, for a real backend. API.md describes each request and response.
 *
 * Signing in answers a short-lived access token, kept in memory only and sent as `Authorization: Bearer …` outside
 * /auth, and sets an HttpOnly refresh cookie that only the /auth requests carry. On start, and whenever a request is
 * answered 401, the cookie buys a new token (one refresh at a time, shared by every request waiting for it) and the
 * request goes out again; when that fails too, the person is signed out. Refusals come back as JSON
 * `{ "code": "email_taken" }`; without a known code, 401 means unauthenticated, 403 forbidden, 404 not_found and
 * 429 too_many_requests.
 */
@Injectable()
export class HttpAdminApi extends AdminApi {
  private readonly http = inject(HttpClient);
  private readonly url = inject(ADMIN_API_URL).replace(/\/$/, '');
  private readonly events = inject(ADMIN_API_EVENTS);
  /** In memory only: storage would let any script on the page read it */
  private token: string | null = null;
  /** The refresh under way, which every request that needs a new token waits for */
  private refreshing?: Promise<User>;

  /* Session */

  async getSession(): Promise<User | null> {
    try {
      return await this.refresh();
    } catch (error) {
      if (unauthenticated(error)) {
        return null;
      }
      throw error;
    }
  }

  signIn(email: string, password: string, remember: boolean, code?: string): Promise<User> {
    return this.keepToken(this.http.post<TokenAnswer>(`${this.url}/auth/login`, { email, password, remember, code }, CREDENTIALS));
  }

  /** Ends the refresh cookie's session, which works after the access token has run out too */
  async signOut(): Promise<void> {
    try {
      await this.request(this.http.post(`${this.url}/auth/logout`, null, CREDENTIALS));
    } finally {
      this.token = null;
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.send('POST', '/me/password', { currentPassword, newPassword });
  }

  /* Links in emails: no access token, no cookie */

  async acceptInvitation(token: string, password: string): Promise<void> {
    await this.request(this.http.post(`${this.url}/auth/activate`, { token, password }));
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.request(this.http.post(`${this.url}/auth/password-reset/request`, { email }));
  }

  async confirmPasswordReset(token: string, password: string): Promise<void> {
    await this.request(this.http.post(`${this.url}/auth/password-reset/confirm`, { token, password }));
  }

  getPasswordPolicy(): Promise<PasswordPolicy> {
    return this.request(this.http.get<PasswordPolicy>(`${this.url}/auth/password-policy`));
  }

  /* Users */

  listUsers(): Promise<User[]> {
    return this.send<User[]>('GET', '/users');
  }

  createUser(draft: UserDraft): Promise<User> {
    return this.send<User>('POST', '/users', draft);
  }

  createUsers(drafts: UserDraft[]): Promise<User[]> {
    return this.send<User[]>('POST', '/users/import', { users: drafts });
  }

  updateUser(id: string, changes: UserChanges): Promise<User> {
    return this.send<User>('PATCH', `/users/${encodeURIComponent(id)}`, changes);
  }

  setUserStatus(ids: string[], status: UserStatus): Promise<User[]> {
    return this.send<User[]>('POST', '/users/status', { ids, status });
  }

  async deleteUsers(ids: string[]): Promise<void> {
    await this.send('POST', '/users/delete', { ids });
  }

  async resetPassword(id: string): Promise<void> {
    await this.send('POST', `/users/${encodeURIComponent(id)}/reset-password`);
  }

  async resendInvite(id: string): Promise<void> {
    await this.send('POST', `/users/${encodeURIComponent(id)}/resend-invite`);
  }

  /* Role assignments */

  assignRole(draft: RoleAssignmentDraft): Promise<User> {
    return this.send<User>('POST', '/role-assignments', draft);
  }

  updateRoleAssignment(id: string, changes: RoleAssignmentChanges): Promise<User> {
    return this.send<User>('PATCH', `/role-assignments/${encodeURIComponent(id)}`, changes);
  }

  removeRoleAssignment(id: string): Promise<User> {
    return this.send<User>('DELETE', `/role-assignments/${encodeURIComponent(id)}`);
  }

  assignRoles(userIds: string[], change: RoleAssignmentBatch): Promise<User[]> {
    return this.send<User[]>('POST', '/role-assignments/batch', { userIds, ...change });
  }

  /* Branches */

  listBranches(): Promise<Branch[]> {
    return this.send<Branch[]>('GET', '/branches');
  }

  createBranch(draft: BranchDraft): Promise<Branch> {
    return this.send<Branch>('POST', '/branches', draft);
  }

  updateBranch(id: string, changes: BranchChanges): Promise<Branch> {
    return this.send<Branch>('PATCH', `/branches/${encodeURIComponent(id)}`, changes);
  }

  async deleteBranch(id: string): Promise<void> {
    await this.send('DELETE', `/branches/${encodeURIComponent(id)}`);
  }

  /* Roles */

  listRoles(): Promise<Role[]> {
    return this.send<Role[]>('GET', '/roles');
  }

  createRole(draft: RoleDraft): Promise<Role> {
    return this.send<Role>('POST', '/roles', draft);
  }

  updateRole(id: string, changes: Partial<RoleDraft>): Promise<Role> {
    return this.send<Role>('PATCH', `/roles/${encodeURIComponent(id)}`, changes);
  }

  async deleteRole(id: string): Promise<void> {
    await this.send('DELETE', `/roles/${encodeURIComponent(id)}`);
  }

  /* Activity */

  listActivity(range: ActivityRange = {}): Promise<Activity[]> {
    const query = new URLSearchParams(Object.entries(range).filter((entry): entry is [string, string] => !!entry[1]));
    return this.send<Activity[]>('GET', `/activity${query.size ? `?${query}` : ''}`);
  }

  /* Settings */

  getSettings(): Promise<AdminSettings> {
    return this.send<AdminSettings>('GET', '/settings');
  }

  updateSettings(changes: Partial<AdminSettings>): Promise<AdminSettings> {
    return this.send<AdminSettings>('PATCH', '/settings', changes);
  }

  /* Signed-in devices */

  listSessions(userId: string): Promise<UserSession[]> {
    return this.send<UserSession[]>('GET', `/users/${encodeURIComponent(userId)}/sessions`);
  }

  async endSession(sessionId: string): Promise<void> {
    await this.send('DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
  }

  async endSessions(userId: string): Promise<void> {
    await this.send('POST', `/users/${encodeURIComponent(userId)}/sessions/end`);
  }

  /* Two-step sign-in */

  startTwoFactor(): Promise<TwoFactorSetup> {
    return this.send<TwoFactorSetup>('POST', '/me/two-factor');
  }

  confirmTwoFactor(code: string): Promise<User> {
    return this.send<User>('POST', '/me/two-factor/confirm', { code });
  }

  disableTwoFactor(code: string): Promise<User> {
    return this.send<User>('POST', '/me/two-factor/disable', { code });
  }

  resetTwoFactor(userId: string): Promise<User> {
    return this.send<User>('POST', `/users/${encodeURIComponent(userId)}/two-factor/reset`);
  }

  /* Live updates */

  /**
   * With events on, reads the server's event stream; each message with data means something changed. EventSource
   * cannot send the access token, so the stream comes through HttpClient. The server closes it when the token runs
   * out; it opens again at once, with a new token if the old one is refused, and after a growing wait on failures.
   */
  override watch(onChange: () => void): () => void {
    if (!this.events) {
      return () => undefined;
    }
    let stopped = false;
    let stream: Subscription | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** The wait after the next failure, doubling each time until a stream carries something again */
    let delay = RECONNECT_MS;

    const reconnect = (refreshFirst: boolean, atOnce: boolean) => {
      if (stopped) {
        return;
      }
      timer = setTimeout(() => connect(refreshFirst), atOnce ? 0 : delay);
      if (!atOnce) {
        delay = Math.min(delay * 2, MAX_RECONNECT_MS);
      }
    };

    const connect = async (refreshFirst: boolean) => {
      const refreshed = refreshFirst || !this.token;
      if (refreshed) {
        try {
          await this.refresh();
        } catch (error) {
          if (!unauthenticated(error)) {
            reconnect(false, false);
          } else if (!stopped) {
            // Signed out: stop listening, and let the pages load again, which notices it and asks to sign in
            onChange();
          }
          return;
        }
      }
      if (stopped) {
        return;
      }
      // The text grows as messages arrive; a blank line ends each one
      let accepted = false;
      let read = 0;
      let rest = '';
      const take = (text: string) => {
        if (text) {
          delay = RECONNECT_MS;
        }
        rest += text.slice(read);
        read = text.length;
        const messages = rest.split(/\r?\n\r?\n/);
        rest = messages.pop()!;
        // Comments such as ": ping" only keep the connection open
        messages.filter(message => /^data:/m.test(message)).forEach(() => onChange());
      };
      stream = this.http.get(`${this.url}/events`, { headers: this.bearer(), responseType: 'text', observe: 'events', reportProgress: true })
        .subscribe({
          next: event => {
            if (event.type === HttpEventType.ResponseHeader || event.type === HttpEventType.Response) {
              accepted = event.ok;
            }
            // Only the stream's own text, not the body of a refusal
            if (accepted && event.type === HttpEventType.DownloadProgress && event.partialText) {
              take(event.partialText);
            } else if (accepted && event.type === HttpEventType.Response) {
              take(event.body ?? '');
            }
          },
          error: error => {
            // A token that has run out is refreshed at once; a fresh one refused, or any other failure, waits
            const expired = unauthenticated(toApiError(error));
            reconnect(expired, expired && !refreshed);
          },
          // A stream that closes without a word counts as a failure, so a broken server is not called in a loop
          complete: () => reconnect(false, read > 0),
        });
    };

    void connect(false);
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.unsubscribe();
    };
  }

  /* Helpers */

  /**
   * Sends a request with the access token, getting one first when there is none. Answered unauthenticated, it
   * refreshes the token and sends the request once more.
   */
  private async send<T>(method: string, path: string, body: unknown = null): Promise<T> {
    const call = () => this.http.request<T>(method, `${this.url}${path}`, { body, headers: this.bearer() });
    if (!this.token) {
      await this.refresh();
    }
    const token = this.token;
    try {
      return await this.request(call());
    } catch (error) {
      // Other 401 refusals, such as a wrong code, are answers to the request
      if (!unauthenticated(error)) {
        throw error;
      }
    }
    // Requests that fail together share one refresh, and one that finished meanwhile has already brought a new token
    if (!this.token || this.token === token) {
      await this.refresh();
    }
    return this.request(call());
  }

  /** Trades the refresh cookie for a new access token, one refresh at a time; forgets the old token when it fails */
  private refresh(): Promise<User> {
    this.refreshing ??= this.keepToken(this.http.post<TokenAnswer>(`${this.url}/auth/refresh`, null, CREDENTIALS))
      .catch(error => {
        this.token = null;
        throw error;
      })
      .finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }

  /** Keeps the access token from a sign-in or refresh and hands back whose it is */
  private async keepToken(answer: Observable<TokenAnswer>): Promise<User> {
    const { accessToken, user } = await this.request(answer);
    this.token = accessToken;
    return user;
  }

  private bearer(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  /** Waits for the answer, turning a refusal into an AdminApiError the pages understand */
  private async request<T>(answer: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(answer);
    } catch (error) {
      throw toApiError(error);
    }
  }
}

/** The AdminApiError for a failed request, or the error itself when the server never answered (offline, 500) */
export function toApiError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  const code = (error.error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && (CODES as readonly string[]).includes(code)) {
    return new AdminApiError(code as AdminApiErrorCode);
  }
  switch (error.status) {
    case 401:
      return new AdminApiError('unauthenticated');
    case 403:
      return new AdminApiError('forbidden');
    case 404:
      return new AdminApiError('not_found');
    case 429:
      return new AdminApiError('too_many_requests');
    default:
      return error;
  }
}

function unauthenticated(error: unknown): boolean {
  return error instanceof AdminApiError && error.code === 'unauthenticated';
}
