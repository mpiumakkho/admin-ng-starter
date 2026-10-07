import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AdminApiError } from './admin-api';
import { ADMIN_API_URL, HttpAdminApi } from './http-admin-api';
import { User } from './models';

const user = { id: 'u-1', email: 'ann@example.com' } as User;

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
      ],
    });
    api = TestBed.inject(HttpAdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Starts a request and hands back what the server received, once it has gone out */
  async function sent<T>(call: Promise<T>, method: string, path: string) {
    await Promise.resolve();
    const request = http.expectOne(req => req.method === method && req.url === `https://admin.example.com/api${path}`);
    return { request, call };
  }

  it('signs in with the cookie session, sending credentials to the other origin', async () => {
    const { request, call } = await sent(api.signIn('ann@example.com', 'secret', true), 'POST', '/session');

    expect(request.request.body).toEqual({ email: 'ann@example.com', password: 'secret', remember: true });
    expect(request.request.withCredentials).toBe(true);
    request.flush(user);
    await expect(call).resolves.toEqual(user);
  });

  it('reads no session as signed out', async () => {
    const { request, call } = await sent(api.getSession(), 'GET', '/session');

    request.flush({ code: 'unauthenticated' }, { status: 401, statusText: 'Unauthorized' });
    await expect(call).resolves.toBeNull();
  });

  it('sends each change to its address', async () => {
    const update = await sent(api.updateUser('u/1', { phone: '0812345678' }), 'PATCH', '/users/u%2F1');
    expect(update.request.request.body).toEqual({ phone: '0812345678' });
    update.request.flush(user);
    await update.call;

    const status = await sent(api.setUserStatus(['u-1', 'u-2'], 'suspended'), 'POST', '/users/status');
    expect(status.request.request.body).toEqual({ ids: ['u-1', 'u-2'], status: 'suspended' });
    status.request.flush([]);
    await status.call;

    const remove = await sent(api.deleteUsers(['u-3']), 'POST', '/users/delete');
    expect(remove.request.request.body).toEqual({ ids: ['u-3'] });
    remove.request.flush(null);
    await remove.call;

    const role = await sent(api.deleteRole('auditor'), 'DELETE', '/roles/auditor');
    role.request.flush(null);
    await role.call;
  });

  it('turns the code in a refusal into an AdminApiError', async () => {
    const { request, call } = await sent(api.createUser({} as never), 'POST', '/users');

    request.flush({ code: 'email_taken', message: 'Taken' }, { status: 409, statusText: 'Conflict' });
    await expect(call).rejects.toEqual(new AdminApiError('email_taken'));
  });

  it('falls back on the status when the body has no known code', async () => {
    const forbidden = await sent(api.listActivity(), 'GET', '/activity');
    forbidden.request.flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    await expect(forbidden.call).rejects.toEqual(new AdminApiError('forbidden'));

    const ended = await sent(api.listUsers(), 'GET', '/users');
    ended.request.flush({ code: 'something_else' }, { status: 401, statusText: 'Unauthorized' });
    await expect(ended.call).rejects.toEqual(new AdminApiError('unauthenticated'));
  });

  it('passes server failures on as they are', async () => {
    const { request, call } = await sent(api.listRoles(), 'GET', '/roles');

    request.flush('Oops', { status: 500, statusText: 'Server Error' });
    await expect(call).rejects.toMatchObject({ status: 500 });
  });
});
