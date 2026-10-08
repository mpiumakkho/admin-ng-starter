import { HttpClient, HttpErrorResponse, HttpEventType, HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, tap } from 'rxjs';

import { AdminApiError } from './admin-api';
import { HttpAdminApi } from './http-admin-api';
import { localBackend } from './local-backend';
import { DEMO_ACCOUNTS } from './mock-data';
import { totp } from './totp';

describe('HttpAdminApi against localBackend', () => {
  let api: HttpAdminApi;
  let http: HttpClient;
  /** Each request that reached the pretend server, with the status it answered */
  let answers: string[];

  const record: HttpInterceptorFn = (request, next) => next(request).pipe(tap({
    next: event => event.type === HttpEventType.Response && answers.push(`${request.method} ${request.url} ${event.status}`),
    error: (error: HttpErrorResponse) => answers.push(`${request.method} ${request.url} ${error.status}`),
  }));

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    answers = [];
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([record, localBackend])), HttpAdminApi],
    });
    api = TestBed.inject(HttpAdminApi);
    http = TestBed.inject(HttpClient);
  });

  it('goes through a whole session over HTTP', async () => {
    expect(await api.getSession()).toBeNull();
    await expect(api.listUsers()).rejects.toEqual(new AdminApiError('unauthenticated'));

    const admin = await api.signIn(DEMO_ACCOUNTS[0].email, 'any-password', false);
    expect((await api.getSession())?.id).toBe(admin.id);
    expect((await api.listUsers()).length).toBe(48);

    const taken = (await api.listUsers())[1].email;
    await expect(api.createUser({
      firstName: 'A', lastName: 'B', email: taken, phone: '', department: 'Design', roleId: 'viewer', status: 'invited', avatar: '',
    })).rejects.toEqual(new AdminApiError('email_taken'));
    await expect(api.deleteUsers([admin.id])).rejects.toEqual(new AdminApiError('self_change'));
    await expect(api.updateSettings({ inviteExpiryDays: 14 })).resolves.toMatchObject({ inviteExpiryDays: 14 });

    await api.signOut();
    expect(await api.getSession()).toBeNull();
  });

  it('refuses requests without an access token it handed out', async () => {
    await api.signIn(DEMO_ACCOUNTS[0].email, 'any-password', false);

    const refused = { status: 401, error: { code: 'unauthenticated' } };
    await expect(firstValueFrom(http.get('/api/users'))).rejects.toMatchObject(refused);
    await expect(firstValueFrom(http.get('/api/users', { headers: { Authorization: 'Bearer local.made-up' } }))).rejects.toMatchObject(refused);
  });

  it('picks the session up after a reload, and refreshes a token that has run out', async () => {
    await api.signIn(DEMO_ACCOUNTS[0].email, 'any-password', false);

    // A reload forgets the token; the session in the browser stands in for the refresh cookie
    const reloaded = TestBed.runInInjectionContext(() => new HttpAdminApi());
    expect((await reloaded.getSession())?.email).toBe(DEMO_ACCOUNTS[0].email);

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 16 * 60_000);
      answers = [];
      expect((await reloaded.listRoles()).length).toBe(4);
      expect(answers).toEqual(['GET /api/roles 401', 'POST /api/auth/refresh 200', 'GET /api/roles 200']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('signs out with the refresh cookie alone, ending every token of the session', async () => {
    await api.signIn(DEMO_ACCOUNTS[0].email, 'any-password', false);

    const answer = await firstValueFrom(http.post('/api/auth/logout', null, { observe: 'response' }));
    expect(answer.status).toBe(204);
    await expect(api.listUsers()).rejects.toEqual(new AdminApiError('unauthenticated'));
    expect(answers.slice(-2)).toEqual(['GET /api/users 401', 'POST /api/auth/refresh 401']);
  });

  it('sets a password from the links in emails, each working once', async () => {
    // With the sample data, the emails are written to the console
    const emails: string[] = [];
    const console = vi.spyOn(globalThis.console, 'info').mockImplementation(message => emails.push(String(message)));
    const tokenFor = (email: string) => {
      const line = [...emails].reverse().find(text => text.includes(`To ${email}:`));
      return new URL(line!.split(' ').at(-1)!).searchParams.get('token')!;
    };
    try {
      // Forgot password
      const viewer = DEMO_ACCOUNTS.find(account => account.roleName === 'Viewer')!.email;
      await api.requestPasswordReset(viewer);
      const token = tokenFor(viewer);
      await expect(api.confirmPasswordReset(token, 'short')).rejects.toEqual(new AdminApiError('weak_password'));
      await api.confirmPasswordReset(token, 'new-password-1');
      await expect(api.confirmPasswordReset(token, 'new-password-1')).rejects.toEqual(new AdminApiError('invalid_token'));
      await expect(api.signIn(viewer, 'any-password', false)).rejects.toEqual(new AdminApiError('invalid_credentials'));
      expect((await api.signIn(viewer, 'new-password-1', false)).email).toBe(viewer);

      // An unknown address gets the same answer, and no email
      const sent = emails.length;
      await api.requestPasswordReset('nobody@example.com');
      expect(emails.length).toBe(sent);

      // An invitation: the new user sets a password and becomes active
      await api.signIn(DEMO_ACCOUNTS[0].email, 'any-password', false);
      await api.createUser({
        firstName: 'New', lastName: 'Person', email: 'new.person@example.com', phone: '', department: 'Design',
        roleId: 'viewer', status: 'invited', avatar: '',
      });
      await api.signOut();
      await expect(api.signIn('new.person@example.com', 'any-password', false)).rejects.toEqual(new AdminApiError('invite_pending'));
      const invitation = tokenFor('new.person@example.com');
      // A link only does what it was made for
      await expect(api.confirmPasswordReset(invitation, 'first-password-1')).rejects.toEqual(new AdminApiError('invalid_token'));
      await api.acceptInvitation(invitation, 'first-password-1');
      expect((await api.signIn('new.person@example.com', 'first-password-1', false)).status).toBe('active');
    } finally {
      console.mockRestore();
    }
  });

  it('follows the account rules in the settings', async () => {
    const admin = DEMO_ACCOUNTS.find(account => account.roleName === 'Administrator')!.email;
    const viewer = DEMO_ACCOUNTS.find(account => account.roleName === 'Viewer')!;
    await api.signIn(admin, 'any-password', false);
    expect(await api.getPasswordPolicy()).toEqual({ minLength: 8, history: 0 });

    // Password rules: at least 12 characters, and not one of the last 3
    await api.updateSettings({ passwordMinLength: 12, passwordHistory: 3 });
    expect(await api.getPasswordPolicy()).toEqual({ minLength: 12, history: 3 });
    await expect(api.changePassword('any-password', 'short-pass1')).rejects.toEqual(new AdminApiError('weak_password'));
    await api.changePassword('any-password', 'first-password-1');
    await api.changePassword('first-password-1', 'second-password-2');
    await expect(api.changePassword('second-password-2', 'first-password-1')).rejects.toEqual(new AdminApiError('password_reused'));
    await expect(api.updateSettings({ passwordMinLength: 4 })).rejects.toEqual(new AdminApiError('invalid_request'));

    // Several people's role at once, never your own
    const users = await api.listUsers();
    const others = users.filter(user => user.roleId === 'support').slice(0, 2).map(user => user.id);
    expect((await api.setUsersRole(others, 'viewer')).map(user => user.roleId)).toEqual(['viewer', 'viewer']);
    const self = users.find(user => user.email === admin)!.id;
    await expect(api.setUsersRole([self], 'viewer')).rejects.toEqual(new AdminApiError('self_change'));

    // A part of the activity log
    expect(await api.listActivity({ from: new Date(Date.now() + 60_000).toISOString() })).toEqual([]);
    expect((await api.listActivity({ from: new Date(Date.now() - 60_000).toISOString() })).length).toBeGreaterThan(0);
    await expect(api.listActivity({ from: '2026-10-01' })).rejects.toEqual(new AdminApiError('invalid_request'));

    // Kept for 30 days to 10 years
    expect((await api.updateSettings({ activityRetentionDays: 30 })).activityRetentionDays).toBe(30);
    await expect(api.updateSettings({ activityRetentionDays: 7 })).rejects.toEqual(new AdminApiError('invalid_request'));

    // A role that must use two-step sign-in: nothing but setting it up until it is on
    await api.updateSettings({ twoFactorRoleIds: ['viewer'] });
    await api.signIn(viewer.email, 'any-password', false);
    await expect(api.listUsers()).rejects.toEqual(new AdminApiError('two_factor_mandatory'));
    expect((await api.getSettings()).twoFactorRoleIds).toEqual(['viewer']);
    const { secret } = await api.startTwoFactor();
    await api.confirmTwoFactor(await totp(secret));
    expect((await api.listUsers()).length).toBeGreaterThan(1);
    await expect(api.disableTwoFactor(await totp(secret))).rejects.toEqual(new AdminApiError('two_factor_mandatory'));
  });
});
