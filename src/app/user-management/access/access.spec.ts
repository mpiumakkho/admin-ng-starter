import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, convertToParamMap, provideRouter, RedirectCommand, RouterStateSnapshot, UrlTree } from '@angular/router';

import { activeRoleIds } from '../data/access-rules';
import { AdminApi, AdminApiError } from '../data/admin-api';
import { AdminStore } from '../data/admin-store';
import { LocalAdminApi } from '../data/local-admin-api';
import { createMockData, DEMO_ACCOUNTS } from '../data/mock-data';
import { totp } from '../data/totp';
import { UserDraft } from '../data/models';
import { canEditUser, canViewUser, requirePermission, signedIn, signedOut } from './guards';
import { UiAccessibleViewService, UiToastService } from '../ui';
import { Session } from './session';

const email = (roleId: string) => DEMO_ACCOUNTS.find(account => account.roleId === roleId)!.email;
const sample = createMockData(0);
const anyone = (status: string) => sample.users.find(user => user.status === status)!;

const draft = (roleId: string): UserDraft => ({
  firstName: 'Ada', lastName: 'Lovelace', email: `ada.${roleId}@example.com`, phone: '', department: 'Design', roles: [{ roleId, endsAt: null }],
  status: 'invited', avatar: '',
});

describe('Session and permissions', () => {
  let session: Session;
  let store: AdminStore;

  const signInAs = (roleId: string) => session.signIn(email(roleId), 'any-password', false);
  /** Someone other than the signed-in user who holds this role and no other */
  const userWithRole = (roleId: string) => store.users().find(user => activeRoleIds(user).join() === roleId && user.id !== session.userId())!;
  const hours = (count: number) => new Date(Date.now() + count * 60 * 60_000).toISOString();
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
      await expect(store.createUser(draft('support'))).resolves.toMatchObject({ roles: [expect.objectContaining({ roleId: 'support', endsAt: null })] });
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
      await expect(store.assignRole({ userId: me, roleId: 'viewer', endsAt: null })).rejects.toEqual(new AdminApiError('self_change'));
      await expect(store.updateUser(me, { phone: '0899999999' })).resolves.toMatchObject({ phone: '0899999999' });
    });

    it('lets nobody change the permissions of a role they hold, but other details are fine', async () => {
      await signInAs('admin');
      const role = await store.createRole({ name: 'Keeper', description: '', tone: 'info', permissions: ['users.view', 'roles.view', 'roles.manage'] });
      const keeper = await store.createUser({ ...draft(role.id), status: 'active' });
      await session.signOut();
      await session.signIn(keeper.email, 'any-password', false);

      await expect(store.updateRole(role.id, { permissions: ['users.view'] })).rejects.toEqual(new AdminApiError('self_change'));
      await expect(store.updateRole(role.id, { description: 'Keeps roles' })).resolves.toMatchObject({ description: 'Keeps roles' });
    });

    it('keeps the name and permissions of a built-in role; its color and rules for giving it can change', async () => {
      await signInAs('admin');

      await expect(store.updateRole('manager', { permissions: ['users.view'] })).rejects.toEqual(new AdminApiError('system_role'));
      await expect(store.updateRole('manager', { name: 'Boss' })).rejects.toEqual(new AdminApiError('system_role'));
      await expect(store.updateRole('manager', { tone: 'warning', assignment: { maxDays: 30, reasonRequired: true } }))
        .resolves.toMatchObject({ tone: 'warning', assignment: { maxDays: 30, reasonRequired: true } });
    });

    it('keeps roles read-only without roles.manage', async () => {
      await signInAs('support');

      expect(store.roles().length).toBe(14);
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

      await store.setUserStatus([someone.id], 'suspended', 'Left the company');
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

  describe('role assignments', () => {
    it('gives someone a second role for a time, with its own entry in the log', async () => {
      await signInAs('admin');
      const someone = userWithRole('viewer');

      const user = await store.assignRole({ userId: someone.id, roleId: 'support', endsAt: hours(1), reason: 'Covering for a colleague' });

      expect(activeRoleIds(user)).toEqual(['viewer', 'support']);
      expect(activeRoleIds(user, Date.now() + 2 * 60 * 60_000)).toEqual(['viewer']);
      expect(store.activity()[0]).toMatchObject({
        action: 'role_assignment.added', targetId: someone.id,
        changes: [{ field: 'roleId', to: 'support' }, { field: 'endsAt' }], reason: 'Covering for a colleague',
      });
    });

    it('follows each role\'s own rules, and gives a role once at a time', async () => {
      await signInAs('admin');
      const someone = userWithRole('viewer');
      // Contractor: at most 90 days, with a reason
      const contractor = { userId: someone.id, roleId: 'contractor' };

      await expect(store.assignRole({ ...contractor, endsAt: null, reason: 'Project' })).rejects.toEqual(new AdminApiError('assignment_too_long'));
      await expect(store.assignRole({ ...contractor, endsAt: hours(24 * 91), reason: 'Project' })).rejects.toEqual(new AdminApiError('assignment_too_long'));
      await expect(store.assignRole({ ...contractor, endsAt: hours(24 * 30) })).rejects.toEqual(new AdminApiError('reason_required'));
      const user = await store.assignRole({ ...contractor, endsAt: hours(24 * 30), reason: 'Project' });
      await expect(store.assignRole({ ...contractor, endsAt: hours(24), reason: 'Again' })).rejects.toEqual(new AdminApiError('already_assigned'));
      await expect(store.assignRole({ userId: someone.id, roleId: 'viewer', endsAt: null })).rejects.toEqual(new AdminApiError('already_assigned'));

      // Moved: still within its rules
      const assignment = user.roles.find(item => item.roleId === 'contractor')!;
      await expect(store.updateRoleAssignment(assignment.id, { endsAt: hours(24 * 100) })).rejects.toEqual(new AdminApiError('assignment_too_long'));
      await expect(store.updateRoleAssignment(assignment.id, { endsAt: hours(24 * 60) })).resolves.toMatchObject({ id: someone.id });
      await expect(store.removeRoleAssignment(assignment.id)).resolves.toMatchObject({ roles: [expect.objectContaining({ roleId: 'viewer' })] });
    });

    it('gives a role to several people at once and takes it away, skipping those it does not change', async () => {
      await signInAs('admin');
      const viewers = store.users().filter(user => activeRoleIds(user).join() === 'viewer').slice(0, 2).map(user => user.id);

      expect((await store.assignRoles(viewers, { add: { roleId: 'support', endsAt: null } })).length).toBe(2);
      expect((await store.assignRoles(viewers, { add: { roleId: 'support', endsAt: null } })).length).toBe(0);
      expect((await store.assignRoles(viewers, { removeRoleId: 'support' })).map(user => activeRoleIds(user))).toEqual([['viewer'], ['viewer']]);
      await expect(store.assignRoles([session.userId()!], { removeRoleId: 'admin' })).rejects.toEqual(new AdminApiError('self_change'));
    });

    it('keeps someone who can run the system: an active administrator for good', async () => {
      await signInAs('admin');
      const owner = session.userId()!;
      // Everyone else's administrator role goes; the owner keeps theirs
      const others = store.users().filter(user => user.id !== owner && activeRoleIds(user).includes('admin')).map(user => user.id);
      await store.assignRoles(others, { removeRoleId: 'admin' });
      // Someone gets it for a day only
      const helper = store.users().find(user => user.status === 'active' && activeRoleIds(user).join() === 'viewer')!;
      await store.assignRole({ userId: helper.id, roleId: 'admin', endsAt: hours(24) });
      await session.signOut();
      await session.signIn(helper.email, 'any-password', false);
      const ownerRole = store.usersById().get(owner)!.roles.find(item => item.roleId === 'admin')!;

      await expect(store.removeRoleAssignment(ownerRole.id)).rejects.toEqual(new AdminApiError('last_administrator'));
      await expect(store.updateRoleAssignment(ownerRole.id, { endsAt: hours(48) })).rejects.toEqual(new AdminApiError('last_administrator'));
      await expect(store.setUserStatus([owner], 'suspended', 'Test')).rejects.toEqual(new AdminApiError('last_administrator'));
      await expect(store.deleteUsers([owner], 'Test')).rejects.toEqual(new AdminApiError('last_administrator'));
    });

    it('ends an assignment on time: the role stops counting, and the server logs it once', async () => {
      await signInAs('admin');
      const someone = userWithRole('viewer');
      await store.assignRole({ userId: someone.id, roleId: 'support', endsAt: hours(1) });

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
        await store.refresh();
        await store.refresh();
        const ended = store.activity().filter(entry => entry.action === 'role_assignment.expired' && entry.targetId === someone.id);
        expect(ended).toEqual([expect.objectContaining({ actorId: null, changes: [{ field: 'roleId', from: 'support' }] })]);
        // It stays on the profile, ended, until the log forgets it
        expect(store.usersById().get(someone.id)!.roles.map(item => item.roleId)).toEqual(['viewer', 'support']);
        expect(activeRoleIds(store.usersById().get(someone.id))).toEqual(['viewer']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not delete a role someone will hold later', async () => {
      await signInAs('admin');
      const role = await store.createRole({ name: 'Later', description: '', tone: 'info', permissions: ['users.view'] });
      await store.assignRole({ userId: userWithRole('viewer').id, roleId: role.id, startsAt: hours(24), endsAt: hours(48) });

      await expect(store.deleteRole(role.id)).rejects.toEqual(new AdminApiError('role_in_use'));
    });
  });

  describe('conflicting roles', () => {
    const active = (roleId: string) => store.users().find(user => user.status === 'active' && activeRoleIds(user).join() === roleId)!;

    it('refuses a role that a rule says cannot be held with one held then, in any scope', async () => {
      await signInAs('admin');
      const someone = active('viewer');
      await store.createRoleConflict({ name: 'Viewers do not bill', roleIds: ['viewer', 'finance'] });

      await expect(store.assignRole({ userId: someone.id, roleId: 'finance', endsAt: null })).rejects.toEqual(new AdminApiError('role_conflict'));
      await expect(store.assignRole({ userId: someone.id, roleId: 'finance', branchId: 'b-cnx', endsAt: null }))
        .rejects.toEqual(new AdminApiError('role_conflict'));
      await expect(store.createUser({ ...draft('viewer'), roles: [{ roleId: 'viewer', endsAt: null }, { roleId: 'finance', endsAt: null }] }))
        .rejects.toEqual(new AdminApiError('role_conflict'));
    });

    it('counts the times: one that ends before the other starts is fine, until its end moves', async () => {
      await signInAs('admin');
      const someone = active('viewer');
      await store.createRoleConflict({ name: 'HR is not audited by itself', roleIds: ['hr', 'auditor'] });
      await store.assignRole({ userId: someone.id, roleId: 'hr', startsAt: hours(48), endsAt: null });

      await expect(store.assignRole({ userId: someone.id, roleId: 'auditor', endsAt: null })).rejects.toEqual(new AdminApiError('role_conflict'));
      const user = await store.assignRole({ userId: someone.id, roleId: 'auditor', endsAt: hours(24) });
      const auditor = user.roles.find(item => item.roleId === 'auditor')!;
      await expect(store.updateRoleAssignment(auditor.id, { endsAt: hours(72) })).rejects.toEqual(new AdminApiError('role_conflict'));
    });

    it('keeps the rules to people who manage roles, and lists the people a new rule finds', async () => {
      await signInAs('admin');
      // The sample has someone who held Auditor and Support before the rule was made
      expect(store.roleConflictViolations().map(item => item.rule.id)).toContain('rc-audit');
      await expect(store.createRoleConflict({ name: 'One role', roleIds: ['viewer'] })).rejects.toEqual(new AdminApiError('invalid_request'));
      await expect(store.createRoleConflict({ name: 'Ghost', roleIds: ['viewer', 'ghost'] })).rejects.toEqual(new AdminApiError('not_found'));

      const rule = await store.createRoleConflict({ name: 'Support is not HR', roleIds: ['support', 'hr'] });
      expect(store.activity()[0]).toMatchObject({
        action: 'role_conflict.created', targetId: rule.id, changes: [{ field: 'name', to: 'Support is not HR' }, { field: 'roles', added: ['support', 'hr'] }],
      });
      await store.updateRoleConflict(rule.id, { roleIds: ['support', 'onboarding'] });
      expect(store.activity()[0].changes).toEqual([{ field: 'roles', added: ['onboarding'], removed: ['hr'] }]);

      await session.signOut();
      await signInAs('manager');
      await expect(store.deleteRoleConflict(rule.id)).rejects.toEqual(new AdminApiError('forbidden'));
    });

    it('drops a rule left with one role when a role is deleted', async () => {
      await signInAs('admin');
      const role = await store.createRole({ name: 'Temporary desk', description: '', tone: 'info', permissions: ['users.view'] });
      await store.createRoleConflict({ name: 'Desk is not billing', roleIds: [role.id, 'finance'] });
      await store.deleteRole(role.id);

      expect(store.roleConflicts().some(rule => rule.name === 'Desk is not billing')).toBe(false);
    });
  });

  describe('reasons', () => {
    it('asks for a reason where the settings say so, and keeps any given in the log', async () => {
      await signInAs('admin');
      const someone = store.users().find(user => user.status === 'active' && activeRoleIds(user).join() === 'viewer')!;

      // Suspending needs one on a new installation
      await expect(store.setUserStatus([someone.id], 'suspended')).rejects.toEqual(new AdminApiError('reason_required'));
      await expect(store.setUserStatus([someone.id], 'suspended', '   ')).rejects.toEqual(new AdminApiError('reason_required'));
      await store.setUserStatus([someone.id], 'suspended', '  Left the company ');
      expect(store.activity()[0]).toMatchObject({ action: 'user.suspended', targetId: someone.id, reason: 'Left the company' });

      // Taking a role away does not, but keeps one given
      const user = await store.assignRole({ userId: someone.id, roleId: 'support', endsAt: null });
      await store.removeRoleAssignment(user.roles.find(item => item.roleId === 'support')!.id, 'Project over');
      expect(store.activity()[0]).toMatchObject({ action: 'role_assignment.removed', reason: 'Project over' });
      await store.assignRole({ userId: someone.id, roleId: 'support', endsAt: null });
      await store.assignRoles([someone.id], { removeRoleId: 'support' });
      expect(store.activity()[0].reason).toBeUndefined();
    });

    it('follows the settings, and never asks about your own sessions', async () => {
      await signInAs('admin');
      const someone = userWithRole('viewer');
      await store.updateSettings({ reasonsRequired: ['removeRole', 'endSessions'] });
      expect(store.activity()[0].changes).toEqual([{ field: 'reasonsRequired', added: ['removeRole', 'endSessions'], removed: ['status', 'delete'] }]);
      await expect(store.updateSettings({ reasonsRequired: ['nope'] as never })).rejects.toEqual(new AdminApiError('invalid_request'));

      await store.setUserStatus([someone.id], 'suspended');
      await store.assignRole({ userId: someone.id, roleId: 'support', endsAt: null });
      await expect(store.assignRoles([someone.id], { removeRoleId: 'support' })).rejects.toEqual(new AdminApiError('reason_required'));
      await expect(store.endSessions(someone.id)).rejects.toEqual(new AdminApiError('reason_required'));
      await expect(store.endSessions(session.userId()!)).resolves.toBeUndefined();
      // A role given has its own reason, not the request's
      await expect(TestBed.inject(AdminApi).assignRoles([someone.id], { add: { roleId: 'auditor', endsAt: null }, reason: 'x' } as never))
        .rejects.toEqual(new AdminApiError('invalid_request'));
    });
  });

  describe('branches', () => {
    it('adds, renames and closes a branch, each code once, and logs it', async () => {
      await signInAs('admin');

      const branch = await store.createBranch({ code: ' bkk-2 ', name: 'Bangkok 2' });
      expect(branch).toMatchObject({ code: 'BKK-2', name: 'Bangkok 2', active: true });
      await expect(store.createBranch({ code: 'Bkk-2', name: 'Again' })).rejects.toEqual(new AdminApiError('code_taken'));
      await expect(store.createBranch({ code: 'TOO-LONG-CODE', name: 'Long' })).rejects.toEqual(new AdminApiError('invalid_request'));

      await store.updateBranch(branch.id, { name: 'Bangkok East', active: false });
      expect(store.branchesById().get(branch.id)).toMatchObject({ name: 'Bangkok East', active: false });
      expect(store.openBranches().some(item => item.id === branch.id)).toBe(false);
      expect(store.activity()[0]).toMatchObject({
        action: 'branch.updated', targetId: branch.id,
        changes: [{ field: 'name', from: 'Bangkok 2', to: 'Bangkok East' }, { field: 'active', from: 'true', to: 'false' }],
      });
    });

    it('keeps a branch people belong to, and takes nobody into a closed one', async () => {
      await signInAs('admin');
      const someone = userWithRole('viewer');
      const branch = await store.createBranch({ code: 'KKC', name: 'Khon Kaen' });

      await store.updateUser(someone.id, { branchId: branch.id });
      await expect(store.deleteBranch(branch.id)).rejects.toEqual(new AdminApiError('branch_in_use'));
      await store.updateUser(someone.id, { branchId: null });
      await store.updateBranch(branch.id, { active: false });
      await expect(store.updateUser(someone.id, { branchId: branch.id })).rejects.toEqual(new AdminApiError('branch_closed'));
      await expect(store.assignRole({ userId: someone.id, roleId: 'support', branchId: branch.id, endsAt: null })).rejects.toEqual(new AdminApiError('branch_closed'));
      await expect(store.createUser({ ...draft('viewer'), branchId: branch.id })).rejects.toEqual(new AdminApiError('branch_closed'));

      await store.deleteBranch(branch.id);
      expect(store.branchesById().has(branch.id)).toBe(false);
    });

    it('gives a role for one branch: it allows what it allows there only, and once per branch', async () => {
      await signInAs('admin');
      const someone = store.users().find(user => user.status === 'active' && activeRoleIds(user).join() === 'viewer')!;
      const grant = { userId: someone.id, roleId: 'manager', endsAt: null };

      await store.assignRole({ ...grant, branchId: 'b-cnx' });
      await expect(store.assignRole({ ...grant, branchId: 'b-cnx' })).rejects.toEqual(new AdminApiError('already_assigned'));
      await store.assignRole({ ...grant, branchId: 'b-hkt' });
      // A branch's assignment is not the whole organization's
      expect(store.holdsOrWillHold(store.usersById().get(someone.id)!, 'manager', null)).toBe(false);
      expect(store.activity()[0]).toMatchObject({ action: 'role_assignment.added', changes: expect.arrayContaining([{ field: 'branchId', to: 'b-hkt' }]) });

      await session.signOut();
      await session.signIn(someone.email, 'any-password', false);
      expect(session.can('users.edit')).toBe(false);
      expect(session.can('users.edit', 'b-cnx')).toBe(true);
      expect(session.can('users.edit', 'b-hq')).toBe(false);
      expect(session.branchesWith('users.edit').sort()).toEqual(['b-cnx', 'b-hkt']);
      // User management's own permissions reach the people of those branches only (API.md, "Branch administrators")
      const viewers = store.users().filter(user => user.id !== someone.id && activeRoleIds(user).join() === 'viewer');
      await store.updateUser(viewers.find(user => user.branchId === 'b-cnx')!.id, { phone: '0800000000' });
      await expect(store.updateUser(viewers.find(user => user.branchId === 'b-hq')!.id, { phone: '0800000000' }))
        .rejects.toEqual(new AdminApiError('forbidden'));
    });

    it('counts only roles for the whole organization toward keeping an administrator', async () => {
      await signInAs('admin');
      const owner = session.userId()!;
      const others = store.users().filter(user => user.id !== owner && activeRoleIds(user).includes('admin')).map(user => user.id);
      await store.assignRoles(others, { removeRoleId: 'admin' });
      // Someone gets it for good, but for one branch, and for a day across the whole organization
      const helper = store.users().find(user => user.status === 'active' && activeRoleIds(user).join() === 'viewer')!;
      await store.assignRole({ userId: helper.id, roleId: 'admin', branchId: 'b-hq', endsAt: null });
      await store.assignRole({ userId: helper.id, roleId: 'admin', endsAt: hours(24) });
      await session.signOut();
      await session.signIn(helper.email, 'any-password', false);
      const ownerRole = store.usersById().get(owner)!.roles.find(item => item.roleId === 'admin')!;

      await expect(store.removeRoleAssignment(ownerRole.id)).rejects.toEqual(new AdminApiError('last_administrator'));
    });
  });

  describe('branch administrators', () => {
    const manager = () => DEMO_ACCOUNTS.find(account => account.roleName === 'Branch manager')!.email;
    /** Someone in Chiang Mai with Finance, which allows no more than the manager's Viewer; and someone at the head office */
    const own = () => store.users().find(user => user.branchId === 'b-cnx' && activeRoleIds(user).join() === 'finance')!;
    const elsewhere = () => store.users().find(user => user.branchId === 'b-hq' && user.status === 'active')!;

    it('looks after the people of their branch, giving roles limited to it', async () => {
      await session.signIn(manager(), 'any-password', false);
      expect(session.can('users.edit')).toBe(false);
      expect(session.canSomewhere('users.edit')).toBe(true);
      expect(session.canSomewhere('settings.view')).toBe(false);
      expect(session.canOn('users.edit', own())).toBe(true);
      expect(session.canOn('users.edit', elsewhere())).toBe(false);
      expect(session.canOn('users.delete', own())).toBe(false);
      const finance = store.rolesById().get('finance');
      expect(session.canGive(finance, 'b-cnx')).toBe(true);
      expect(session.canGive(finance, null)).toBe(false);
      expect(session.canGive(store.rolesById().get('admin'), 'b-cnx')).toBe(false);

      await store.updateUser(own().id, { department: 'Sales' });
      await expect(store.updateUser(elsewhere().id, { department: 'Sales' })).rejects.toEqual(new AdminApiError('forbidden'));
      await expect(store.updateUser(own().id, { branchId: 'b-hq' })).rejects.toEqual(new AdminApiError('forbidden'));
      await expect(store.deleteUsers([own().id], 'Left the company')).rejects.toEqual(new AdminApiError('forbidden'));
      await expect(store.assignRole({ userId: own().id, roleId: 'finance', endsAt: null })).rejects.toEqual(new AdminApiError('forbidden'));
      await store.assignRole({ userId: own().id, roleId: 'finance', branchId: 'b-cnx', endsAt: null });

      const added = { ...draft('viewer'), roles: [], branchId: 'b-cnx' };
      await expect(store.createUser({ ...added, branchId: 'b-hq' })).rejects.toEqual(new AdminApiError('forbidden'));
      const created = await store.createUser(added);
      expect(created.roles.map(item => [item.roleId, item.branchId])).toEqual([['viewer', 'b-cnx']]);
    });

    it('reads the activity about the people of their branch only', async () => {
      await session.signIn(manager(), 'any-password', false);
      const people = new Set(store.users().filter(user => user.branchId === 'b-cnx').map(user => user.id));
      expect(store.activity().length).toBeGreaterThan(0);
      expect(store.activity().every(entry => !!entry.targetId && people.has(entry.targetId))).toBe(true);
    });
  });

  describe('live updates', () => {
    it('loads again when another tab changes the data, and notices when this session was ended there', async () => {
      await signInAs('admin');
      const revision = store.revision();

      window.dispatchEvent(new StorageEvent('storage', { key: 'admin-data-v7' }));
      await vi.waitFor(() => expect(store.revision()).toBe(revision + 1), { timeout: 3000 });

      // Another tab signs this browser's session out
      const data = JSON.parse(localStorage.getItem('admin-data-v7')!);
      data.sessions = data.sessions.filter((item: { userId: string }) => item.userId !== session.userId());
      localStorage.setItem('admin-data-v7', JSON.stringify(data));
      window.dispatchEvent(new StorageEvent('storage', { key: 'admin-data-v7' }));
      await vi.waitFor(() => expect(session.signedIn()).toBe(false), { timeout: 3000 });
    });
  });

  describe('the accessible view', () => {
    beforeEach(() => {
      TestBed.inject(UiAccessibleViewService).set(true);
      TestBed.tick();
    });
    afterEach(() => document.body.classList.remove('ui-aaa'));

    it('keeps changes made in another tab waiting until asked for', async () => {
      await signInAs('admin');
      const revision = store.revision();
      const someone = userWithRole('viewer');

      const data = JSON.parse(localStorage.getItem('admin-data-v7')!);
      data.users.find((user: { id: string }) => user.id === someone.id).department = 'Elsewhere';
      localStorage.setItem('admin-data-v7', JSON.stringify(data));
      window.dispatchEvent(new StorageEvent('storage', { key: 'admin-data-v7' }));
      await vi.waitFor(() => expect(store.changesWaiting()).toBe(true), { timeout: 3000 });
      expect(store.revision()).toBe(revision);
      expect(store.usersById().get(someone.id)?.department).toBe(someone.department);

      await store.showChanges();
      expect(store.changesWaiting()).toBe(false);
      expect(store.usersById().get(someone.id)?.department).toBe('Elsewhere');
    });

    it('keeps the page when the session ends, for signing in again over it', async () => {
      await signInAs('admin');
      sessionStorage.clear();

      await expect(store.resetPassword(userWithRole('viewer').id)).rejects.toEqual(new AdminApiError('unauthenticated'));
      TestBed.tick();
      expect(session.paused()).toBe('ended');
      expect(session.signedIn()).toBe(true);
      expect(store.users().length).toBeGreaterThan(0);

      await expect(session.resume('123')).rejects.toEqual(new AdminApiError('invalid_credentials'));
      await session.resume('any-password');
      expect(session.paused()).toBe(null);
      expect(store.sessionEnded()).toBe(false);
      await expect(store.resetPassword(userWithRole('viewer').id)).resolves.toBeUndefined();
    });

    it('keeps messages until they are dismissed', () => {
      vi.useFakeTimers();
      try {
        const toasts = TestBed.inject(UiToastService);
        const id = toasts.show('Saved');
        vi.advanceTimersByTime(60_000);
        expect(toasts.toasts().map(toast => toast.message)).toEqual(['Saved']);
        toasts.dismiss(id);
        expect(toasts.toasts()).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
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
