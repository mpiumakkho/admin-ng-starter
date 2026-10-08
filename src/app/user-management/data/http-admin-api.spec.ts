import { HttpEventType, HttpHeaderResponse, provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AdminApiError } from './admin-api';
import { ADMIN_API_EVENTS, ADMIN_API_URL, HttpAdminApi, TokenAnswer } from './http-admin-api';
import { User } from './models';

const API = 'https://admin.example.com/api';
const user = { id: 'u-1', email: 'ann@example.com' } as User;
const tokenAnswer = (accessToken: string): TokenAnswer => ({ accessToken, expiresIn: 900, user });
const expired = { code: 'unauthenticated' };
const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };

/** Lets HttpAdminApi's promises run on until they wait for the next answer */
async function settle() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

describe('HttpAdminApi', () => {
  let api: HttpAdminApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        HttpAdminApi,
        { provide: ADMIN_API_URL, useValue: 'https://admin.example.com/api/' },
        { provide: ADMIN_API_EVENTS, useValue: true },
      ],
    });
    api = TestBed.inject(HttpAdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The one request HttpAdminApi has sent to this address, once it has gone out */
  async function sent(method: string, path: string): Promise<TestRequest> {
    await settle();
    return http.expectOne(req => req.method === method && req.url === `${API}${path}`, `${method} ${path}`);
  }

  /** Signs in, the server answering with this access token */
  async function signIn(token = 'token-1') {
    const call = api.signIn('ann@example.com', 'secret', true);
    (await sent('POST', '/auth/login')).flush(tokenAnswer(token));
    await call;
  }

  describe('the access token', () => {
    it('signs in with credentials, then sends the token it got with each request', async () => {
      const call = api.signIn('ann@example.com', 'secret', true);
      const login = await sent('POST', '/auth/login');
      expect(login.request.body).toEqual({ email: 'ann@example.com', password: 'secret', remember: true });
      expect(login.request.withCredentials).toBe(true);
      expect(login.request.headers.has('Authorization')).toBe(false);
      login.flush(tokenAnswer('token-1'));
      await expect(call).resolves.toEqual(user);

      const users = api.listUsers();
      const request = await sent('GET', '/users');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      expect(request.request.withCredentials).toBe(false);
      request.flush([user]);
      await expect(users).resolves.toEqual([user]);
    });

    it('picks up the session on start with the refresh cookie, and reads 401 as signed out', async () => {
      const nobody = api.getSession();
      const refused = await sent('POST', '/auth/refresh');
      expect(refused.request.withCredentials).toBe(true);
      refused.flush(expired, UNAUTHORIZED);
      await expect(nobody).resolves.toBeNull();

      const someone = api.getSession();
      (await sent('POST', '/auth/refresh')).flush(tokenAnswer('token-1'));
      await expect(someone).resolves.toEqual(user);
      const roles = api.listRoles();
      const request = await sent('GET', '/roles');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      request.flush([]);
      await roles;
    });

    it('gets a token before a request when it has none, as after a reload', async () => {
      const users = api.listUsers();
      (await sent('POST', '/auth/refresh')).flush(tokenAnswer('token-1'));
      const request = await sent('GET', '/users');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      request.flush([user]);
      await expect(users).resolves.toEqual([user]);
    });

    it('refreshes the token once and sends the request again when it has run out', async () => {
      await signIn();
      const users = api.listUsers();
      (await sent('GET', '/users')).flush(expired, UNAUTHORIZED);
      (await sent('POST', '/auth/refresh')).flush(tokenAnswer('token-2'));

      const again = await sent('GET', '/users');
      expect(again.request.headers.get('Authorization')).toBe('Bearer token-2');
      again.flush([user]);
      await expect(users).resolves.toEqual([user]);
    });

    it('shares one refresh among requests that fail together', async () => {
      await signIn();
      const users = api.listUsers();
      const roles = api.listRoles();
      (await sent('GET', '/users')).flush(expired, UNAUTHORIZED);
      (await sent('GET', '/roles')).flush(expired, UNAUTHORIZED);
      (await sent('POST', '/auth/refresh')).flush(tokenAnswer('token-2'));

      const usersAgain = await sent('GET', '/users');
      const rolesAgain = await sent('GET', '/roles');
      expect(usersAgain.request.headers.get('Authorization')).toBe('Bearer token-2');
      expect(rolesAgain.request.headers.get('Authorization')).toBe('Bearer token-2');
      usersAgain.flush([user]);
      rolesAgain.flush([]);
      await expect(users).resolves.toEqual([user]);
      await expect(roles).resolves.toEqual([]);
    });

    it('signs out when the refresh fails too', async () => {
      await signIn();
      const users = api.listUsers();
      (await sent('GET', '/users')).flush(expired, UNAUTHORIZED);
      (await sent('POST', '/auth/refresh')).flush(expired, UNAUTHORIZED);
      await expect(users).rejects.toEqual(new AdminApiError('unauthenticated'));

      // The token is gone, so the next request tries the refresh cookie first
      const roles = api.listRoles();
      (await sent('POST', '/auth/refresh')).flush(expired, UNAUTHORIZED);
      await expect(roles).rejects.toEqual(new AdminApiError('unauthenticated'));
    });

    it('takes other 401 refusals, such as a wrong code, as the answer, without refreshing', async () => {
      await signIn();
      const confirm = api.confirmTwoFactor('000000');
      (await sent('POST', '/me/two-factor/confirm')).flush({ code: 'invalid_code' }, UNAUTHORIZED);
      await expect(confirm).rejects.toEqual(new AdminApiError('invalid_code'));

      const password = api.changePassword('wrong', 'new-secret');
      (await sent('POST', '/me/password')).flush({ code: 'invalid_credentials' }, UNAUTHORIZED);
      await expect(password).rejects.toEqual(new AdminApiError('invalid_credentials'));

      await settle();
      http.expectNone(`${API}/auth/refresh`);
    });

    it('sends a request again only once, passing on what the second try answers', async () => {
      await signIn();
      const users = api.listUsers();
      (await sent('GET', '/users')).flush(expired, UNAUTHORIZED);
      (await sent('POST', '/auth/refresh')).flush(tokenAnswer('token-2'));
      (await sent('GET', '/users')).flush(expired, UNAUTHORIZED);
      await expect(users).rejects.toEqual(new AdminApiError('unauthenticated'));

      const roles = api.listRoles();
      (await sent('GET', '/roles')).flush(expired, UNAUTHORIZED);
      (await sent('POST', '/auth/refresh')).flush(tokenAnswer('token-3'));
      (await sent('GET', '/roles')).flush('Oops', { status: 500, statusText: 'Server Error' });
      await expect(roles).rejects.toMatchObject({ status: 500 });
    });

    it('signs out with the refresh cookie and forgets the token, even when that fails', async () => {
      await signIn();
      const out = api.signOut();
      const logout = await sent('POST', '/auth/logout');
      expect(logout.request.withCredentials).toBe(true);
      logout.flush(null);
      await out;

      const users = api.listUsers();
      (await sent('POST', '/auth/refresh')).flush(expired, UNAUTHORIZED);
      await expect(users).rejects.toEqual(new AdminApiError('unauthenticated'));

      await signIn('token-2');
      const failed = api.signOut();
      (await sent('POST', '/auth/logout')).flush('Oops', { status: 500, statusText: 'Server Error' });
      await expect(failed).rejects.toMatchObject({ status: 500 });

      const roles = api.listRoles();
      (await sent('POST', '/auth/refresh')).flush(expired, UNAUTHORIZED);
      await expect(roles).rejects.toEqual(new AdminApiError('unauthenticated'));
    });
  });

  describe('account rules', () => {
    it('reads the password rules without a token', async () => {
      const policy = api.getPasswordPolicy();
      const request = await sent('GET', '/auth/password-policy');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ minLength: 12, history: 3 });
      await expect(policy).resolves.toEqual({ minLength: 12, history: 3 });
    });

    it('changes several roles at once and reads a part of the activity log', async () => {
      await signIn();
      const changed = api.setUsersRole(['u-1', 'u-2'], 'viewer');
      const role = await sent('POST', '/users/role');
      expect(role.request.body).toEqual({ ids: ['u-1', 'u-2'], roleId: 'viewer' });
      role.flush([user]);
      await expect(changed).resolves.toEqual([user]);

      const part = api.listActivity({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z' });
      (await sent('GET', '/activity?from=2026-10-01T00%3A00%3A00.000Z&to=2026-10-02T00%3A00%3A00.000Z')).flush([]);
      await expect(part).resolves.toEqual([]);
    });

    it('reads the new refusals', async () => {
      await signIn();
      const users = api.listUsers();
      (await sent('GET', '/users')).flush({ code: 'two_factor_mandatory' }, { status: 403, statusText: 'Forbidden' });
      await expect(users).rejects.toEqual(new AdminApiError('two_factor_mandatory'));
      const change = api.changePassword('old-password', 'new-password');
      (await sent('POST', '/me/password')).flush({ code: 'password_reused' }, { status: 422, statusText: 'Unprocessable Content' });
      await expect(change).rejects.toEqual(new AdminApiError('password_reused'));
    });
  });

  describe('links in emails', () => {
    it('sends them without a token or the cookie, and never refreshes for them', async () => {
      const accept = api.acceptInvitation('invite-token', 'new-password-1');
      const activate = await sent('POST', '/auth/activate');
      expect(activate.request.body).toEqual({ token: 'invite-token', password: 'new-password-1' });
      expect(activate.request.headers.has('Authorization')).toBe(false);
      expect(activate.request.withCredentials).toBe(false);
      activate.flush(null, { status: 204, statusText: 'No Content' });
      await accept;

      const request = api.requestPasswordReset('ann@example.com');
      const reset = await sent('POST', '/auth/password-reset/request');
      expect(reset.request.body).toEqual({ email: 'ann@example.com' });
      reset.flush(null, { status: 202, statusText: 'Accepted' });
      await request;

      const confirm = api.confirmPasswordReset('reset-token', 'new-password-2');
      (await sent('POST', '/auth/password-reset/confirm')).flush(null, { status: 204, statusText: 'No Content' });
      await confirm;
    });

    it('reads a dead link as invalid_token', async () => {
      const confirm = api.confirmPasswordReset('used-token', 'new-password-2');
      (await sent('POST', '/auth/password-reset/confirm')).flush({ code: 'invalid_token' }, { status: 400, statusText: 'Bad Request' });
      await expect(confirm).rejects.toEqual(new AdminApiError('invalid_token'));
    });
  });

  describe('requests and refusals', () => {
    beforeEach(() => signIn());

    it('sends each change to its address', async () => {
      const update = api.updateUser('u/1', { phone: '0812345678' });
      const patch = await sent('PATCH', '/users/u%2F1');
      expect(patch.request.body).toEqual({ phone: '0812345678' });
      patch.flush(user);
      await update;

      const status = api.setUserStatus(['u-1', 'u-2'], 'suspended');
      const post = await sent('POST', '/users/status');
      expect(post.request.body).toEqual({ ids: ['u-1', 'u-2'], status: 'suspended' });
      post.flush([]);
      await status;

      const remove = api.deleteUsers(['u-3']);
      const deleted = await sent('POST', '/users/delete');
      expect(deleted.request.body).toEqual({ ids: ['u-3'] });
      deleted.flush(null);
      await remove;

      const role = api.deleteRole('auditor');
      (await sent('DELETE', '/roles/auditor')).flush(null);
      await role;

      const password = api.changePassword('old-secret', 'new-secret');
      const changed = await sent('POST', '/me/password');
      expect(changed.request.body).toEqual({ currentPassword: 'old-secret', newPassword: 'new-secret' });
      changed.flush(null);
      await password;

      const setup = api.startTwoFactor();
      (await sent('POST', '/me/two-factor')).flush({ secret: 'ABC', uri: 'otpauth://totp/x' });
      await setup;

      const off = api.disableTwoFactor('123456');
      (await sent('POST', '/me/two-factor/disable')).flush(user);
      await off;
    });

    it('turns the code in a refusal into an AdminApiError', async () => {
      const call = api.createUser({} as never);
      (await sent('POST', '/users')).flush({ code: 'email_taken', message: 'Taken' }, { status: 409, statusText: 'Conflict' });
      await expect(call).rejects.toEqual(new AdminApiError('email_taken'));
    });

    it('refuses too many sign-in attempts with too_many_requests', async () => {
      const call = api.signIn('ann@example.com', 'wrong', false);
      (await sent('POST', '/auth/login')).flush({ code: 'too_many_requests' }, { status: 429, statusText: 'Too Many Requests' });
      await expect(call).rejects.toEqual(new AdminApiError('too_many_requests'));
    });

    it('falls back on the status when the body has no known code', async () => {
      const forbidden = api.listActivity();
      (await sent('GET', '/activity')).flush('Forbidden', { status: 403, statusText: 'Forbidden' });
      await expect(forbidden).rejects.toEqual(new AdminApiError('forbidden'));

      const ended = api.listUsers();
      (await sent('GET', '/users')).flush({ code: 'something_else' }, UNAUTHORIZED);
      (await sent('POST', '/auth/refresh')).flush('Unauthorized', UNAUTHORIZED);
      await expect(ended).rejects.toEqual(new AdminApiError('unauthenticated'));

      const limited = api.signIn('ann@example.com', 'secret', false);
      (await sent('POST', '/auth/login')).flush('Slow down', { status: 429, statusText: 'Too Many Requests' });
      await expect(limited).rejects.toEqual(new AdminApiError('too_many_requests'));
    });

    it('passes server failures on as they are', async () => {
      const call = api.listRoles();
      (await sent('GET', '/roles')).flush('Oops', { status: 500, statusText: 'Server Error' });
      await expect(call).rejects.toMatchObject({ status: 500 });
    });
  });

  describe('live updates', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls onChange for each message with data in the event stream, not for pings', async () => {
      await signIn();
      const onChange = vi.fn();
      const stop = api.watch(onChange);
      const stream = await sent('GET', '/events');
      expect(stream.request.headers.get('Authorization')).toBe('Bearer token-1');
      expect(stream.request.responseType).toBe('text');
      expect(stream.request.reportProgress).toBe(true);

      // The headers come first, then each progress event carries all the text so far
      stream.event(new HttpHeaderResponse({ status: 200, statusText: 'OK' }));
      let text = '';
      const arrive = (chunk: string) => {
        text += chunk;
        stream.event({ type: HttpEventType.DownloadProgress, loaded: text.length, partialText: text });
      };
      arrive(': ping\n\n');
      expect(onChange).not.toHaveBeenCalled();
      arrive('data: changed\n\n');
      expect(onChange).toHaveBeenCalledTimes(1);
      arrive('data: chan');
      expect(onChange).toHaveBeenCalledTimes(1);
      arrive('ged\r\n\r\n: ping\n\ndata: changed\n\n');
      expect(onChange).toHaveBeenCalledTimes(3);

      stop();
      expect(stream.cancelled).toBe(true);
    });

    it('connects again at once when the server closes the stream, refreshing the token it then refuses', async () => {
      await signIn();
      api.watch(() => undefined);

      // The token the stream was opened with runs out, and the server closes it
      (await sent('GET', '/events')).flush(': ping\n\n');
      await vi.advanceTimersByTimeAsync(0);
      (await sent('GET', '/events')).flush(expired, UNAUTHORIZED);
      await vi.advanceTimersByTimeAsync(0);
      (await sent('POST', '/auth/refresh')).flush(tokenAnswer('token-2'));

      const again = await sent('GET', '/events');
      expect(again.request.headers.get('Authorization')).toBe('Bearer token-2');
    });

    it('waits longer after each failure, and stops once the session has ended', async () => {
      await signIn();
      const onChange = vi.fn();
      api.watch(onChange);

      // A stream that closes without a word, and a server failure
      (await sent('GET', '/events')).flush('');
      await vi.advanceTimersByTimeAsync(999);
      http.expectNone(`${API}/events`);
      await vi.advanceTimersByTimeAsync(1);
      (await sent('GET', '/events')).flush('Unavailable', { status: 503, statusText: 'Service Unavailable' });
      await vi.advanceTimersByTimeAsync(1_999);
      http.expectNone(`${API}/events`);
      await vi.advanceTimersByTimeAsync(1);

      // A fresh token refused too waits before the next refresh
      (await sent('GET', '/events')).flush(expired, UNAUTHORIZED);
      await vi.advanceTimersByTimeAsync(0);
      (await sent('POST', '/auth/refresh')).flush(tokenAnswer('token-2'));
      (await sent('GET', '/events')).flush(expired, UNAUTHORIZED);
      await vi.advanceTimersByTimeAsync(3_999);
      http.expectNone(`${API}/auth/refresh`);
      await vi.advanceTimersByTimeAsync(1);

      // The session has ended: no more tries, and the pages load again to notice it
      (await sent('POST', '/auth/refresh')).flush(expired, UNAUTHORIZED);
      await settle();
      expect(onChange).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      http.expectNone(`${API}/events`);
    });

    it('stops connecting again once stopped', async () => {
      await signIn();
      const stop = api.watch(() => undefined);
      (await sent('GET', '/events')).flush(': ping\n\n');
      stop();
      await vi.advanceTimersByTimeAsync(60_000);
      http.expectNone(`${API}/events`);
    });
  });
});

describe('HttpAdminApi event stream over fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the messages as they arrive', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: controller => { stream = controller; } });
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => url.endsWith('/auth/refresh')
      ? Response.json(tokenAnswer('token-1'))
      : new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetch);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), HttpAdminApi, { provide: ADMIN_API_EVENTS, useValue: true }],
    });
    const onChange = vi.fn();
    const stop = TestBed.inject(HttpAdminApi).watch(onChange);

    // Without a token yet, it refreshes first
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[0][0]).toBe('/api/auth/refresh');
    expect(new Headers(fetch.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer token-1');

    const encoder = new TextEncoder();
    stream.enqueue(encoder.encode(': ping\n\ndata: chan'));
    stream.enqueue(encoder.encode('ged\n\n'));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    stream.enqueue(encoder.encode('data: changed\n\n'));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));

    stop();
    stream.close();
  });
});
