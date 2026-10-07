import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, convertToParamMap, provideRouter, RedirectCommand, RouterStateSnapshot, UrlTree } from '@angular/router';

import { AdminApi, AdminApiError } from '../data/admin-api';
import { AdminStore } from '../data/admin-store';
import { LocalAdminApi } from '../data/local-admin-api';
import { createMockData, DEMO_ACCOUNTS } from '../data/mock-data';
import { totp } from '../data/totp';
import { UserDraft } from '../data/models';
import { canEditUser, canViewUser, requirePermission, signedIn, signedOut } from './guards';
import { UiToastService } from '../ui';
import { Session } from './session';

const email = (roleId: string) => DEMO_ACCOUNTS.find(account => account.roleId === roleId)!.email;
const sample = createMockData(0);
const anyone = (status: string) => sample.users.find(user => user.status === status)!;

const draft = (roleId: string): UserDraft => ({
  firstName: 'Ada', lastName: 'Lovelace', email: `ada.${roleId}@example.com`, phone: '', department: 'Design', roleId, status: 'invited', avatar: '',
});

describe('Session and permissions', () => {
  let session: Session;
  let store: AdminStore;

  const signInAs = (roleId: string) => session.signIn(email(roleId), 'any-password', false);
  const userWithRole = (roleId: string) => store.users().find(user => user.roleId === roleId && user.id !== session.userId())!;
  const state = (url: string) => ({ url }) as RouterStateSnapshot;
  const route = (id: string) => ({ paramMap: convertToParamMap({ id }) }) as ActivatedRouteSnapshot;
  const guard = <T>(fn: () => T) => TestBed.runInInjectionContext(fn);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      // Every address leads to an empty page, so sign-out and expiry can navigate
      providers: [provideRouter([{ path: '**', children: [] }]), { provide: AdminApi, useClass: LocalAdminApi }],
    });
    session = TestBed.inject(Session);
    store = TestBed.inject(AdminStore);
  });

  describe('signing in', () => {
    it('starts signed out and picks the session up again after a reload', async () => {
      await session.restore();
      expect(session.signedIn()).toBe(false);

      await signInAs('manager');
      const reloaded = new LocalAdminApi();
      expect((await reloaded.getSession())?.email).toBe(email('manager'));
    });

    it('refuses unknown people, short passwords, and accounts that are not active', async () => {
      await expect(session.signIn('nobody@example.com', 'any-password', false)).rejects.toEqual(new AdminApiError('invalid_credentials'));
      await expect(session.signIn(email('admin'), '123', false)).rejects.toEqual(new AdminApiError('invalid_credentials'));
      await expect(session.signIn(anyone('suspended').email, 'any-password', false)).rejects.toEqual(new AdminApiError('account_suspended'));
      await expect(session.signIn(anyone('invited').email, 'any-password', false)).rejects.toEqual(new AdminApiError('invite_pending'));
      expect(session.signedIn()).toBe(false);
    });

    it('forgets the data on sign-out, and the server refuses requests after it', async () => {
      await signInAs('admin');
      await session.signOut();

      expect(session.signedIn()).toBe(false);
      expect(store.users()).toEqual([]);
      await expect(TestBed.inject(AdminApi).listUsers()).rejects.toEqual(new AdminApiError('unauthenticated'));
    });

    it('notices when the server says the session has ended', async () => {
      await signInAs('admin');
      sessionStorage.clear();

      await expect(store.resetPassword(userWithRole('viewer').id)).rejects.toEqual(new AdminApiError('unauthenticated'));
      TestBed.tick();
      expect(session.signedIn()).toBe(false);
    });
  });

  describe('what each role can do', () => {
    it('shows a viewer the users but not the activity log, and refuses their changes', async () => {
      await signInAs('viewer');

      expect(store.users().length).toBe(48);
      expect(store.activity()).toEqual([]);
      expect(session.can('users.view')).toBe(true);
      expect(session.can('users.delete')).toBe(false);
      await expect(store.deleteUsers([userWithRole('viewer').id])).rejects.toEqual(new AdminApiError('forbidden'));
      await expect(store.createUser(draft('viewer'))).rejects.toEqual(new AdminApiError('forbidden'));
    });

    it('lets a manager give only roles within their own permissions', async () => {
      await signInAs('manager');

      expect(session.canAssign(store.rolesById().get('support'))).toBe(true);
      expect(session.canAssign(store.rolesById().get('admin'))).toBe(false);
      await expect(store.createUser(draft('admin'))).rejects.toEqual(new AdminApiError('forbidden'));
      await expect(store.createUser(draft('support'))).resolves.toMatchObject({ roleId: 'support' });
    });

    it('stops a manager from changing an administrator', async () => {
      await signInAs('manager');
      const admin = userWithRole('admin');

      expect(session.canManage(admin)).toBe(false);
      expect(session.canManage(userWithRole('viewer'))).toBe(true);
      await expect(store.updateUser(admin.id, { phone: '0899999999' })).rejects.toEqual(new AdminApiError('forbidden'));
      await expect(store.resetPassword(admin.id)).rejects.toEqual(new AdminApiError('forbidden'));
    });

    it('stops anyone from suspending, deleting or promoting themselves', async () => {
      await signInAs('admin');
      const me = session.userId()!;

      await expect(store.setUserStatus([me], 'suspended')).rejects.toEqual(new AdminApiError('self_change'));
      await expect(store.deleteUsers([me])).rejects.toEqual(new AdminApiError('self_change'));
      await expect(store.updateUser(me, { roleId: 'viewer' })).rejects.toEqual(new AdminApiError('self_change'));
      await expect(store.updateUser(me, { phone: '0899999999' })).resolves.toMatchObject({ phone: '0899999999' });
    });

    it('lets nobody change the permissions of their own role, but other details are fine', async () => {
      await signInAs('admin');

      await expect(store.updateRole('admin', { permissions: ['users.view'] })).rejects.toEqual(new AdminApiError('self_change'));
      await expect(store.updateRole('admin', { description: 'Everything' })).resolves.toMatchObject({ description: 'Everything' });
    });

    it('keeps roles read-only without roles.manage', async () => {
      await signInAs('support');

      expect(store.roles().length).toBe(4);
      await expect(store.createRole({ name: 'X', description: '', tone: 'info', permissions: [] })).rejects.toEqual(new AdminApiError('forbidden'));
    });
  });

  describe('what the server refuses outright', () => {
    it('takes only the fields a request may set', async () => {
      await signInAs('admin');
      const api = TestBed.inject(AdminApi);
      const someone = userWithRole('viewer');

      await expect(api.updateUser(someone.id, { id: 'u-001' } as never)).rejects.toEqual(new AdminApiError('invalid_request'));
      await expect(api.updateRole('admin', { system: false } as never)).rejects.toEqual(new AdminApiError('invalid_request'));
      await expect(api.updateUser(someone.id, { status: 'boss' } as never)).rejects.toEqual(new AdminApiError('invalid_request'));
      await expect(api.updateUser(someone.id, { email: 'x@corp.example@evil.example' })).rejects.toEqual(new AdminApiError('invalid_request'));
    });

    it('stops anyone from changing or deleting a role stronger than their own', async () => {
      await signInAs('admin');
      const roleManager = await store.createRole({ name: 'Role manager', description: '', tone: 'info', permissions: ['roles.view', 'roles.manage'] });
      await store.createUser({ ...draft(roleManager.id), status: 'active', email: 'rm@example.com' });
      await session.signOut();
      await session.signIn('rm@example.com', 'any-password', false);

      expect(session.canAssign(store.rolesById().get('admin'))).toBe(false);
      await expect(store.updateRole('admin', { permissions: ['users.view'] })).rejects.toEqual(new AdminApiError('forbidden'));
      await expect(store.updateRole('admin', { description: 'Changed' })).rejects.toEqual(new AdminApiError('forbidden'));
    });

    it('keeps the default role for new users', async () => {
      await signInAs('admin');
      const role = await store.createRole({ name: 'Interns', description: '', tone: 'info', permissions: [] });
      await store.updateSettings({ defaultRoleId: role.id });

      await expect(store.deleteRole(role.id)).rejects.toEqual(new AdminApiError('default_role'));
    });
  });

  describe('importing', () => {
    it('adds every user in one go, or none when one is refused', async () => {
      await signInAs('manager');
      const before = store.users().length;

      await expect(store.createUsers([draft('viewer'), draft('admin')])).rejects.toEqual(new AdminApiError('forbidden'));
      expect((await TestBed.inject(AdminApi).listUsers()).length).toBe(before);

      const created = await store.createUsers([draft('viewer'), { ...draft('support'), email: 'bo@example.com' }]);
      expect(created.map(user => user.email)).toEqual(['ada.viewer@example.com', 'bo@example.com']);
      expect(store.users().length).toBe(before + 2);
      await expect(store.createUsers([{ ...draft('viewer'), email: 'cy@example.com' }, { ...draft('viewer'), email: 'CY@example.com' }]))
        .rejects.toEqual(new AdminApiError('email_taken'));
    });
  });

  describe('your own account', () => {
    it('lets anyone change their own name, phone and photo, but nothing else without users.edit', async () => {
      await signInAs('viewer');
      const me = session.userId()!;

      await expect(store.updateUser(me, { firstName: 'Tee', phone: '0811111111' })).resolves.toMatchObject({ firstName: 'Tee' });
      expect(session.user()?.firstName).toBe('Tee');
      await expect(store.updateUser(me, { email: 'new@example.com' })).rejects.toEqual(new AdminApiError('forbidden'));
      await expect(store.updateUser(userWithRole('viewer').id, { phone: '0811111111' })).rejects.toEqual(new AdminApiError('forbidden'));
      expect(guard(() => canEditUser(route(me), state(`/users/${me}/edit`)))).toBe(true);
    });

    it('changes the password, and sign-in then needs the new one', async () => {
      await signInAs('support');
      const account = email('support');

      await expect(session.changePassword('wrong', 'short')).rejects.toEqual(new AdminApiError('invalid_credentials'));
      await expect(session.changePassword('any-password', 'short')).rejects.toEqual(new AdminApiError('weak_password'));
      await session.changePassword('any-password', 'a-new-password');
      await session.signOut();

      await expect(session.signIn(account, 'any-password', false)).rejects.toEqual(new AdminApiError('invalid_credentials'));
      await expect(session.signIn(account, 'a-new-password', false)).resolves.toMatchObject({ email: account });
      expect(store.activity().some(entry => entry.action === 'user.password_changed')).toBe(true);
    });
  });

  describe('signed-in devices', () => {
    it('lists where someone is signed in, this browser first among equals, and signs the others out', async () => {
      await signInAs('admin');
      const me = session.userId()!;

      const before = await store.listSessions(me);
      expect(before.filter(item => item.current).length).toBe(1);
      expect(before.length).toBeGreaterThan(1);

      await store.endSessions(me);
      const after = await store.listSessions(me);
      expect(after.map(item => item.current)).toEqual([true]);
      expect(store.activity()[0]).toMatchObject({ action: 'auth.sessions_ended', targetId: me });
    });

    it('lets administrators end other people’s sessions, and nobody else', async () => {
      await signInAs('viewer');
      const other = userWithRole('support');
      await expect(store.listSessions(other.id)).rejects.toEqual(new AdminApiError('forbidden'));
      await session.signOut();

      await signInAs('admin');
      const sessions = await store.listSessions(other.id);
      await store.endSession(sessions[0].id);
      expect((await store.listSessions(other.id)).length).toBe(sessions.length - 1);
    });

    it('ends the sessions of someone who is suspended', async () => {
      await signInAs('admin');
      const someone = store.users().find(user => user.status === 'active' && user.id !== session.userId() && user.lastActiveAt)!;
      expect((await store.listSessions(someone.id)).length).toBeGreaterThan(0);

      await store.setUserStatus([someone.id], 'suspended');
      expect(await store.listSessions(someone.id)).toEqual([]);
    });
  });

  describe('two-step sign-in', () => {
    it('turns on with a code from the app, and is then needed to sign in', async () => {
      await signInAs('support');
      const account = email('support');

      const setup = await store.startTwoFactor();
      expect(setup.uri).toContain(`secret=${setup.secret}`);
      await expect(store.confirmTwoFactor('000000')).rejects.toEqual(new AdminApiError('invalid_code'));
      await store.confirmTwoFactor(await totp(setup.secret));
      expect(session.user()?.twoFactor).toBe(true);
      await session.signOut();

      await expect(session.signIn(account, 'any-password', false)).rejects.toEqual(new AdminApiError('two_factor_required'));
      await expect(session.signIn(account, 'any-password', false, '000000')).rejects.toEqual(new AdminApiError('invalid_code'));
      await session.signIn(account, 'any-password', false, await totp(setup.secret));
      expect(session.signedIn()).toBe(true);

      await store.disableTwoFactor(await totp(setup.secret));
      expect(session.user()?.twoFactor).toBe(false);
    });

    it('can be turned off for someone who lost their phone, by an administrator', async () => {
      await signInAs('support');
      const setup = await store.startTwoFactor();
      await store.confirmTwoFactor(await totp(setup.secret));
      const supportId = session.userId()!;
      await session.signOut();

      await signInAs('admin');
      await expect(store.resetTwoFactor(session.userId()!)).rejects.toEqual(new AdminApiError('self_change'));
      await expect(store.resetTwoFactor(supportId)).resolves.toMatchObject({ twoFactor: false });
      await session.signOut();
      await expect(signInAs('support')).resolves.toBeTruthy();
    });
  });

  describe('live updates', () => {
    it('loads again when another tab changes the data, and notices when this session was ended there', async () => {
      await signInAs('admin');
      const revision = store.revision();

      window.dispatchEvent(new StorageEvent('storage', { key: 'admin-data-v3' }));
      await vi.waitFor(() => expect(store.revision()).toBe(revision + 1), { timeout: 3000 });

      // Another tab signs this browser's session out
      const data = JSON.parse(localStorage.getItem('admin-data-v3')!);
      data.sessions = data.sessions.filter((item: { userId: string }) => item.userId !== session.userId());
      localStorage.setItem('admin-data-v3', JSON.stringify(data));
      window.dispatchEvent(new StorageEvent('storage', { key: 'admin-data-v3' }));
      await vi.waitFor(() => expect(session.signedIn()).toBe(false), { timeout: 3000 });
    });
  });

  describe('settings', () => {
    it('lets an administrator change them, and logs what changed', async () => {
      await signInAs('admin');

      const settings = await store.updateSettings({ allowedDomains: ['Example.com', ' example.com ', 'corp.example'], inviteExpiryDays: 14 });

      expect(settings.allowedDomains).toEqual(['example.com', 'corp.example']);
      expect(store.activity()[0]).toMatchObject({
        action: 'settings.updated',
        changes: [{ field: 'inviteExpiryDays', from: '7', to: '14' }, { field: 'allowedDomains', added: ['example.com', 'corp.example'], removed: [] }],
      });
    });

    it('keeps them read-only without settings.manage', async () => {
      await signInAs('manager');

      expect(store.settings().defaultRoleId).toBe('viewer');
      await expect(store.updateSettings({ inviteExpiryDays: 30 })).rejects.toEqual(new AdminApiError('forbidden'));
    });

    it('only accepts new emails on the allowed domains', async () => {
      await signInAs('admin');
      await store.updateSettings({ allowedDomains: ['corp.example'] });
      const someone = userWithRole('viewer');

      await expect(store.createUser(draft('viewer'))).rejects.toEqual(new AdminApiError('email_domain'));
      await expect(store.createUser({ ...draft('viewer'), email: 'ada@corp.example' })).resolves.toMatchObject({ email: 'ada@corp.example' });
      // Someone who already has an email elsewhere keeps it
      await expect(store.updateUser(someone.id, { email: someone.email, phone: '0899999999' })).resolves.toMatchObject({ phone: '0899999999' });
    });

    it('signs people out after the idle timeout', async () => {
      await signInAs('admin');
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      try {
        await store.updateSettings({ sessionTimeoutMinutes: 15 });
        TestBed.tick();

        vi.advanceTimersByTime(14 * 60_000);
        expect(session.signedIn()).toBe(true);
        expect(TestBed.inject(UiToastService).toasts().map(toast => toast.message)).toContain(
          'You will be signed out in a minute. Click anywhere to stay signed in.');

        vi.advanceTimersByTime(60_000);
        await vi.waitFor(() => expect(session.signedIn()).toBe(false), { timeout: 2000 });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('guards', () => {
    it('sends people who are not signed in to sign in, and back afterwards', () => {
      const result = guard(() => signedIn({} as ActivatedRouteSnapshot, state('/users?q=ann')));
      expect(result instanceof UrlTree && result.toString()).toBe('/login?returnUrl=%2Fusers%3Fq%3Dann');
    });

    it('shows the no-access page at the address that was asked for', async () => {
      await signInAs('viewer');

      expect(guard(() => requirePermission('users.view')({} as ActivatedRouteSnapshot, state('/users')))).toBe(true);
      const refused = guard(() => requirePermission('activity.view')({} as ActivatedRouteSnapshot, state('/activity')));
      expect(refused).toBeInstanceOf(RedirectCommand);
      expect((refused as RedirectCommand).redirectTo.toString()).toBe('/no-access');
      expect((refused as RedirectCommand).navigationBehaviorOptions?.browserUrl?.toString()).toBe('/activity');
    });

    it('lets everyone open their own profile, and only editors edit people they may manage', async () => {
      await signInAs('support');
      const me = session.userId()!;

      expect(guard(() => canViewUser(route(me), state(`/users/${me}`)))).toBe(true);
      expect(guard(() => canEditUser(route(userWithRole('viewer').id), state('/users/x/edit')))).toBe(true);
      expect(guard(() => canEditUser(route(userWithRole('admin').id), state('/users/x/edit')))).toBeInstanceOf(RedirectCommand);
    });

    it('sends someone already signed in away from the sign-in page, to the first page their role allows', async () => {
      await signInAs('viewer');

      const result = guard(() => signedOut({} as ActivatedRouteSnapshot, state('/login')));
      expect(result instanceof UrlTree && result.toString()).toBe('/overview');
    });

    it('opens their own profile first for a role without users.view', async () => {
      await signInAs('admin');
      const role = await store.createRole({ name: 'Auditor', description: '', tone: 'info', permissions: [] });
      const auditor = await store.createUser({ ...draft(role.id), status: 'active' });
      await session.signOut();

      await session.signIn(auditor.email, 'any-password', false);

      expect(store.users().map(user => user.id)).toEqual([auditor.id]);
      expect(session.homeUrl()).toBe(`/users/${auditor.id}`);
    });
  });
});
