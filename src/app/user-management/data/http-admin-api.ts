import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { AdminApi, AdminApiError, AdminApiErrorCode } from './admin-api';
import { Activity, AdminSettings, Role, RoleDraft, TwoFactorSetup, User, UserDraft, UserSession, UserStatus } from './models';

/** Where the server's API starts, such as "/api" or "https://admin.example.com/api". Set by provideUserManagement(). */
export const ADMIN_API_URL = new InjectionToken<string>('ADMIN_API_URL', { factory: () => '/api' });

/** Whether the server streams change events at GET /events, for live updates. Set by provideUserManagement(). */
export const ADMIN_API_EVENTS = new InjectionToken<boolean>('ADMIN_API_EVENTS', { factory: () => false });

const CODES: readonly AdminApiErrorCode[] = [
  'email_taken', 'not_found', 'not_invited', 'role_in_use', 'system_role', 'invalid_credentials', 'account_suspended',
  'invite_pending', 'unauthenticated', 'forbidden', 'self_change', 'email_domain', 'weak_password', 'default_role',
  'invalid_request', 'two_factor_required', 'invalid_code',
];

/**
 * AdminApi over HTTP, for a real backend. API.md describes each request and response.
 *
 * The session is a cookie the server sets on sign-in, sent with every request (also to another origin, so the
 * server must allow credentials). For a bearer token instead, add an HttpInterceptor that sets the header.
 * Refusals come back as JSON `{ "code": "email_taken" }`; without a known code, 401 means unauthenticated,
 * 403 forbidden and 404 not_found.
 */
@Injectable()
export class HttpAdminApi extends AdminApi {
  private readonly http = inject(HttpClient);
  private readonly url = inject(ADMIN_API_URL).replace(/\/$/, '');
  private readonly events = inject(ADMIN_API_EVENTS);
  /** Sends the session cookie, also to an API on another origin */
  private readonly options = { withCredentials: true };

  /* Session */

  async getSession(): Promise<User | null> {
    try {
      return await this.request(this.http.get<User | null>(`${this.url}/session`, this.options));
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'unauthenticated') {
        return null;
      }
      throw error;
    }
  }

  signIn(email: string, password: string, remember: boolean, code?: string): Promise<User> {
    return this.request(this.http.post<User>(`${this.url}/session`, { email, password, remember, code }, this.options));
  }

  async signOut(): Promise<void> {
    await this.request(this.http.delete(`${this.url}/session`, this.options));
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request(this.http.post(`${this.url}/session/password`, { currentPassword, newPassword }, this.options));
  }

  /* Users */

  listUsers(): Promise<User[]> {
    return this.request(this.http.get<User[]>(`${this.url}/users`, this.options));
  }

  createUser(draft: UserDraft): Promise<User> {
    return this.request(this.http.post<User>(`${this.url}/users`, draft, this.options));
  }

  createUsers(drafts: UserDraft[]): Promise<User[]> {
    return this.request(this.http.post<User[]>(`${this.url}/users/import`, { users: drafts }, this.options));
  }

  updateUser(id: string, changes: Partial<UserDraft>): Promise<User> {
    return this.request(this.http.patch<User>(`${this.url}/users/${encodeURIComponent(id)}`, changes, this.options));
  }

  setUserStatus(ids: string[], status: UserStatus): Promise<User[]> {
    return this.request(this.http.post<User[]>(`${this.url}/users/status`, { ids, status }, this.options));
  }

  async deleteUsers(ids: string[]): Promise<void> {
    await this.request(this.http.post(`${this.url}/users/delete`, { ids }, this.options));
  }

  async resetPassword(id: string): Promise<void> {
    await this.request(this.http.post(`${this.url}/users/${encodeURIComponent(id)}/reset-password`, null, this.options));
  }

  async resendInvite(id: string): Promise<void> {
    await this.request(this.http.post(`${this.url}/users/${encodeURIComponent(id)}/resend-invite`, null, this.options));
  }

  /* Roles */

  listRoles(): Promise<Role[]> {
    return this.request(this.http.get<Role[]>(`${this.url}/roles`, this.options));
  }

  createRole(draft: RoleDraft): Promise<Role> {
    return this.request(this.http.post<Role>(`${this.url}/roles`, draft, this.options));
  }

  updateRole(id: string, changes: Partial<RoleDraft>): Promise<Role> {
    return this.request(this.http.patch<Role>(`${this.url}/roles/${encodeURIComponent(id)}`, changes, this.options));
  }

  async deleteRole(id: string): Promise<void> {
    await this.request(this.http.delete(`${this.url}/roles/${encodeURIComponent(id)}`, this.options));
  }

  /* Activity */

  listActivity(): Promise<Activity[]> {
    return this.request(this.http.get<Activity[]>(`${this.url}/activity`, this.options));
  }

  /* Settings */

  getSettings(): Promise<AdminSettings> {
    return this.request(this.http.get<AdminSettings>(`${this.url}/settings`, this.options));
  }

  updateSettings(changes: Partial<AdminSettings>): Promise<AdminSettings> {
    return this.request(this.http.patch<AdminSettings>(`${this.url}/settings`, changes, this.options));
  }

  /* Signed-in devices */

  listSessions(userId: string): Promise<UserSession[]> {
    return this.request(this.http.get<UserSession[]>(`${this.url}/users/${encodeURIComponent(userId)}/sessions`, this.options));
  }

  async endSession(sessionId: string): Promise<void> {
    await this.request(this.http.delete(`${this.url}/sessions/${encodeURIComponent(sessionId)}`, this.options));
  }

  async endSessions(userId: string): Promise<void> {
    await this.request(this.http.post(`${this.url}/users/${encodeURIComponent(userId)}/sessions/end`, null, this.options));
  }

  /* Two-step sign-in */

  startTwoFactor(): Promise<TwoFactorSetup> {
    return this.request(this.http.post<TwoFactorSetup>(`${this.url}/session/two-factor`, null, this.options));
  }

  confirmTwoFactor(code: string): Promise<User> {
    return this.request(this.http.post<User>(`${this.url}/session/two-factor/confirm`, { code }, this.options));
  }

  disableTwoFactor(code: string): Promise<User> {
    return this.request(this.http.post<User>(`${this.url}/session/two-factor/disable`, { code }, this.options));
  }

  resetTwoFactor(userId: string): Promise<User> {
    return this.request(this.http.post<User>(`${this.url}/users/${encodeURIComponent(userId)}/two-factor/reset`, null, this.options));
  }

  /* Live updates */

  /** With events on, listens to the server's event stream; each message means something changed */
  override watch(onChange: () => void): () => void {
    if (!this.events || typeof EventSource === 'undefined') {
      return () => undefined;
    }
    // EventSource reconnects by itself after a dropped connection
    const source = new EventSource(`${this.url}/events`, { withCredentials: true });
    source.onmessage = () => onChange();
    return () => source.close();
  }

  /* Helpers */

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
    default:
      return error;
  }
}
