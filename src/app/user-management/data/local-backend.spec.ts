import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { AdminApiError } from './admin-api';
import { HttpAdminApi } from './http-admin-api';
import { localBackend } from './local-backend';
import { DEMO_ACCOUNTS } from './mock-data';

describe('HttpAdminApi against localBackend', () => {
  let api: HttpAdminApi;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([localBackend])), HttpAdminApi],
    });
    api = TestBed.inject(HttpAdminApi);
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
});
