import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Session } from '../access/session';
import { AdminApi, AdminApiError } from './admin-api';
import { AdminStore } from './admin-store';
import { LocalAdminApi } from './local-admin-api';
import { DEMO_ACCOUNTS } from './mock-data';
import { UserDraft } from './models';

const draft: UserDraft = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '0812345678',
  department: 'Engineering',
  roleId: 'viewer',
  status: 'active',
  avatar: '',
};

const ADMIN = DEMO_ACCOUNTS.find(account => account.roleId === 'admin')!.email;

describe('AdminStore', () => {
  let store: AdminStore;
  let session: Session;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminApi, useClass: LocalAdminApi }],
    });
    store = TestBed.inject(AdminStore);
    session = TestBed.inject(Session);
    await session.signIn(ADMIN, 'any-password', false);
  });

  it('loads the sample data after signing in', () => {
    expect(store.loaded()).toBe(true);
    expect(store.users().length).toBe(48);
    expect(store.roles().length).toBe(4);
    expect(session.user()?.email).toBe(ADMIN);
    expect(store.activity()[0]).toMatchObject({ action: 'auth.sign_in', actorId: session.userId() });
  });

  it('adds a user and records it in the activity log', async () => {
    const user = await store.createUser(draft);

    expect(store.users()[0]).toEqual(user);
    expect(store.activity()[0]).toMatchObject({ action: 'user.created', targetId: user.id, actorId: session.userId() });
    expect(store.isEmailTaken('ADA@example.com')).toBe(true);
    expect(store.isEmailTaken('ada@example.com', user.id)).toBe(false);
  });

  it('refuses an email another user has', async () => {
    const taken = store.users()[1].email;

    await expect(store.createUser({ ...draft, email: taken })).rejects.toEqual(new AdminApiError('email_taken'));
    expect(store.users().length).toBe(48);
  });

  it('sends an invitation again, only to someone still invited', async () => {
    const invited = store.users().find(user => user.status === 'invited')!;
    const active = store.users().find(user => user.status === 'active' && user.id !== session.userId())!;

    await store.resendInvite(invited.id);

    expect(store.activity()[0]).toMatchObject({ action: 'user.invited', targetId: invited.id, actorId: session.userId() });
    await expect(store.resendInvite(active.id)).rejects.toEqual(new AdminApiError('not_invited'));
  });

  it('suspends users and only logs real changes', async () => {
    const [first, second] = store.users().filter(user => user.status === 'active' && user.id !== session.userId());
    const before = store.activity().length;

    await store.setUserStatus([first.id, second.id], 'suspended');
    await store.setUserStatus([first.id], 'suspended');

    expect(store.usersById().get(first.id)?.status).toBe('suspended');
    expect(store.usersById().get(second.id)?.status).toBe('suspended');
    expect(store.activity().length).toBe(before + 2);
  });

  it('keeps roles that are built in or still in use', async () => {
    await expect(store.deleteRole('admin')).rejects.toEqual(new AdminApiError('system_role'));
    expect(store.roleCounts().get('support')).toBeGreaterThan(0);
    await expect(store.deleteRole('support')).rejects.toEqual(new AdminApiError('role_in_use'));
  });

  it('creates and deletes an unused role', async () => {
    const role = await store.createRole({ name: 'Auditor', description: '', tone: 'info', permissions: ['activity.view'] });
    expect(store.rolesById().get(role.id)?.system).toBe(false);

    await store.deleteRole(role.id);
    expect(store.rolesById().has(role.id)).toBe(false);
    expect(store.activity()[0]).toMatchObject({ action: 'role.deleted', targetLabel: 'Auditor' });
  });

  it('logs which fields changed, and from where', async () => {
    const user = store.users().find(item => item.department !== 'Design')!;

    await store.updateUser(user.id, { department: 'Design', phone: user.phone });

    expect(store.activity()[0]).toMatchObject({
      action: 'user.updated',
      ip: '127.0.0.1',
      changes: [{ field: 'department', from: user.department, to: 'Design' }],
    });
    expect(store.activity()[0].browser).toBeTruthy();
  });

  it('logs permissions a role gained and lost', async () => {
    const support = store.rolesById().get('support')!;

    await store.updateRole('support', { permissions: [...support.permissions.filter(key => key !== 'users.edit'), 'users.create'] });

    expect(store.activity()[0].changes).toEqual([{ field: 'permissions', added: ['users.create'], removed: ['users.edit'] }]);
  });

  it('keeps changes for the next visit', async () => {
    const other = store.users().find(user => user.id !== session.userId())!;
    await store.deleteUsers([other.id]);

    const next = new LocalAdminApi();
    expect((await next.listUsers()).length).toBe(47);
  });
});
