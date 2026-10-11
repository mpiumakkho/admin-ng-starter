import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideBan,
  lucideCheck,
  lucideEllipsis,
  lucideHistory,
  lucideKeyRound,
  lucideLogOut,
  lucideMail,
  lucideMonitor,
  lucidePencil,
  lucidePhone,
  lucideShieldCheck,
  lucideShieldPlus,
  lucideSmartphone,
  lucideTrash2,
  lucideUserCheck,
  lucideUserRound,
  lucideUserX,
  lucideX,
} from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  UiAvatar,
  UiBadge,
  UiButton,
  UiCard,
  UiCardActions,
  UiConfirmService,
  UiDetailItem,
  UiDetailList,
  UiEmptyState,
  UiMenu,
  UiMenuDivider,
  UiMenuItem,
  UiMenuTrigger,
  UiOption,
  UiPageHeader,
  UiSegmented,
  UiTimeline,
  UiTimelineItem,
  UiToastService,
  UiTone,
} from '../ui';
import { ChangePasswordDialog } from '../access/change-password-dialog.component';
import { Session } from '../access/session';
import { TwoFactorDialog } from '../access/two-factor-dialog.component';
import { activeRoleIds, permissionsOf, roleAssignmentState, RoleAssignmentState } from '../data/access-rules';
import { AdminStore } from '../data/admin-store';
import { ACTIVITY_META, PERMISSION_GROUPS } from '../data/catalog';
import { fullName, Permission, RoleAssignment, UserSession, UserStatus } from '../data/models';
import { ActivityText } from '../shared/activity-text';
import { RoleBadge, RoleBadges, StatusBadge } from '../shared/badges';
import { errorMessage } from '../shared/errors';
import { LocalDatePipe, TimeAgoPipe } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import { RoleAssignmentDialog } from './role-assignment-dialog.component';

type Tab = 'details' | 'roles' | 'activity' | 'security';
const TABS: Tab[] = ['details', 'roles', 'activity', 'security'];
/** Older links name the roles tab by its earlier name */
const TAB_ALIASES: Record<string, Tab> = { permissions: 'roles' };

@Component({
  selector: 'app-user-detail',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    UiPageHeader,
    UiCard,
    UiCardActions,
    UiButton,
    UiAvatar,
    UiSegmented,
    UiDetailList,
    UiDetailItem,
    UiTimeline,
    UiTimelineItem,
    UiEmptyState,
    UiMenu,
    UiMenuItem,
    UiMenuTrigger,
    UiMenuDivider,
    RoleBadge,
    RoleBadges,
    StatusBadge,
    ActivityText,
    RoleAssignmentDialog,
    TimeAgoPipe,
    LocalDatePipe,
    UiBadge,
    TwoFactorDialog,
    ChangePasswordDialog,
  ],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.scss',
  // Fills the window on desktop: the tab's cards reach the bottom and scroll inside, as on the pages with tables
  host: { class: 'page-fit' },
})
export class UserDetailComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly confirm = inject(UiConfirmService);
  private readonly toast = inject(UiToastService);
  private readonly i18n = translationsChanged();

  readonly id = input.required<string>();
  /** ?tab=security and so on, to open a tab from a link such as the account menu's */
  readonly tabParam = input<string>(undefined, { alias: 'tab' });

  protected readonly icons = {
    page: lucideUserRound, edit: lucidePencil, more: lucideEllipsis, suspend: lucideBan, activate: lucideUserCheck,
    reset: lucideKeyRound, remove: lucideTrash2, missing: lucideUserX, mail: lucideMail, phone: lucidePhone,
    granted: lucideCheck, denied: lucideX, role: lucideShieldCheck, history: lucideHistory, arrow: lucideArrowRight,
    desktop: lucideMonitor, mobile: lucideSmartphone, signOut: lucideLogOut, giveRole: lucideShieldPlus,
  };
  protected readonly stateLabels: Record<RoleAssignmentState, string> = { active: 'Active', scheduled: 'Scheduled', expired: 'Ended' };
  protected readonly stateTones: Record<RoleAssignmentState, UiTone> = { active: 'success', scheduled: 'info', expired: 'neutral' };
  protected readonly activityMeta = ACTIVITY_META;
  protected readonly permissionGroups = PERMISSION_GROUPS;

  protected readonly user = computed(() => this.store.usersById().get(this.id()));
  /** Every permission of the roles they hold now */
  private readonly permissions = computed(() => permissionsOf(this.user(), this.store.roles(), this.store.now()));
  protected readonly name = computed(() => {
    const user = this.user();
    return user ? fullName(user) : '';
  });
  protected readonly isSelf = computed(() => this.id() === this.session.userId());

  /* What the signed-in user's role allows for this person */

  /** Nobody can change someone whose role allows more than their own */
  private readonly manages = computed(() => {
    const user = this.user();
    return !!user && this.session.canManage(user);
  });
  protected readonly canEdit = computed(() => this.manages() && this.session.can('users.edit'));
  /** Everyone can edit their own name, phone and photo */
  protected readonly canEditProfile = computed(() => {
    const user = this.user();
    return !!user && this.session.canEditProfile(user);
  });
  /** Nobody suspends or deletes themselves */
  protected readonly canSetStatus = computed(() => this.canEdit() && !this.isSelf());
  protected readonly canDelete = computed(() => this.manages() && this.session.can('users.delete') && !this.isSelf());
  /** The ⋯ menu: status, reset password and delete, none of which apply to yourself */
  protected readonly hasMenu = computed(() => !this.isSelf() && (this.canEdit() || this.canDelete()));
  protected readonly canViewActivity = computed(() => this.session.can('activity.view'));
  /** Devices and two-step sign-in: your own, or, with users.edit, those of people you manage */
  protected readonly canSeeSecurity = computed(() => this.isSelf() || this.canEdit());
  /** Their role must use two-step sign-in (settings), so they cannot turn it off themselves */
  protected readonly twoFactorRequired = computed(() => {
    const user = this.user();
    return !!user && activeRoleIds(user, this.store.now()).some(roleId => this.store.settings().twoFactorRoleIds.includes(roleId));
  });

  /* Roles tab */

  /** Someone else's roles, when the signed-in user may manage them */
  protected readonly canChangeRoles = computed(() => this.canEdit() && !this.isSelf());
  /** Their assignments: the ones that count now, then scheduled, then ended, each newest first */
  protected readonly assignments = computed(() => {
    const user = this.user();
    const now = this.store.now();
    const order: Record<RoleAssignmentState, number> = { active: 0, scheduled: 1, expired: 2 };
    return (user?.roles ?? [])
      .map(assignment => {
        const giver = assignment.assignedById ? this.store.usersById().get(assignment.assignedById) : undefined;
        const role = this.store.rolesById().get(assignment.roleId);
        return {
          assignment,
          state: roleAssignmentState(assignment, now),
          givenBy: giver ? fullName(giver) : '',
          canChange: this.canChangeRoles() && this.session.canAssign(role),
        };
      })
      .sort((a, b) => order[a.state] - order[b.state] || b.assignment.startsAt.localeCompare(a.assignment.startsAt));
  });
  protected readonly assigning = signal(false);
  /** The assignment being changed, or null to give a new role */
  protected readonly editing = signal<RoleAssignment | null>(null);

  /** Everything done by or to this person; the tab counts it all */
  protected readonly activity = computed(() =>
    this.store.activity().filter(entry => entry.actorId === this.id() || entry.targetId === this.id()));
  /** The latest thirty, scrolling inside the tab's card; the card links to the whole log for this person */
  protected readonly recentActivity = computed(() => this.activity().slice(0, 30));

  protected readonly tab = signal<Tab>('details');
  protected readonly tabs = computed<UiOption<Tab>[]>(() => {
    this.i18n();
    return [
      { value: 'details', label: this.translate.instant('Details') },
      { value: 'roles', label: this.translate.instant('Roles & permissions'), count: this.store.activeRoles(this.user()).length },
      ...this.canViewActivity() ? [{ value: 'activity' as const, label: this.translate.instant('Activity'), count: this.activity().length }] : [],
      ...this.canSeeSecurity() ? [{ value: 'security' as const, label: this.translate.instant('Security') }] : [],
    ];
  });

  /* Security tab */

  /** Where they are signed in; loaded when the tab opens, and again when the data changes */
  protected readonly sessions = signal<UserSession[] | null>(null);
  protected readonly ending = signal<string | null>(null);
  protected readonly twoFactorMode = signal<'enable' | 'disable'>('enable');
  protected readonly twoFactorOpen = signal(false);
  protected readonly changingPassword = signal(false);

  constructor() {
    effect(() => {
      const param = this.tabParam() ?? '';
      const wanted = (TAB_ALIASES[param] ?? param) as Tab;
      if (wanted && TABS.includes(wanted)) {
        untracked(() => this.tab.set(wanted));
      }
    });
    effect(() => {
      const id = this.id();
      this.store.revision();
      if (this.tab() === 'security' && this.canSeeSecurity()) {
        untracked(() => this.loadSessions(id));
      }
    });
  }

  protected isPhone(session: UserSession) {
    return session.os === 'iOS' || session.os === 'Android';
  }

  protected openTwoFactor(mode: 'enable' | 'disable') {
    this.twoFactorMode.set(mode);
    this.twoFactorOpen.set(true);
  }

  protected async resetTwoFactor() {
    const user = this.user();
    if (!user) {
      return;
    }
    const confirmed = await this.confirm.ask({
      title: this.translate.instant('resetTwoFactorTitle', { name: fullName(user) }),
      message: this.translate.instant('Use this when they lose their phone. They can sign in with just their password until they turn it on again.'),
      confirmLabel: this.translate.instant('Turn off'),
      cancelLabel: this.translate.instant('Cancel'),
      tone: 'danger',
    });
    if (confirmed) {
      try {
        await this.store.resetTwoFactor(user.id);
        this.toast.show(this.translate.instant('Two-step sign-in is off.'));
      } catch (error) {
        this.showError(error);
      }
    }
  }

  protected async endSession(session: UserSession) {
    this.ending.set(session.id);
    try {
      await this.store.endSession(session.id);
      this.toast.show(this.translate.instant('Signed out of that device.'));
      await this.loadSessions(this.id());
    } catch (error) {
      this.showError(error);
    } finally {
      this.ending.set(null);
    }
  }

  protected async endOtherSessions() {
    const self = this.isSelf();
    const confirmed = await this.confirm.ask({
      title: this.translate.instant(self ? 'Sign out of all other devices?' : 'endAllSessionsTitle', { name: this.name() }),
      message: this.translate.instant(self ? 'You stay signed in here.' : 'They need to sign in again everywhere.'),
      confirmLabel: this.translate.instant('Sign out'),
      cancelLabel: this.translate.instant('Cancel'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    this.ending.set('all');
    try {
      await this.store.endSessions(this.id());
      this.toast.show(this.translate.instant(self ? 'Signed out of your other devices.' : 'Signed out everywhere.'));
      await this.loadSessions(this.id());
    } catch (error) {
      this.showError(error);
    } finally {
      this.ending.set(null);
    }
  }

  private async loadSessions(id: string) {
    try {
      const sessions = await this.store.listSessions(id);
      // Still the same person: the route may have moved on while this loaded
      if (id === this.id()) {
        this.sessions.set(sessions);
      }
    } catch {
      this.sessions.set([]);
    }
  }

  protected granted(permission: Permission) {
    return this.permissions().has(permission);
  }

  /** Which of their roles grant a permission, when they hold more than one */
  protected sources(permission: Permission): string {
    const roles = this.store.activeRoles(this.user());
    return roles.length > 1 ? roles.filter(role => role.permissions.includes(permission)).map(role => role.name).join(', ') : '';
  }

  protected roleName(roleId: string): string {
    return this.store.rolesById().get(roleId)?.name ?? '';
  }

  protected giveRole() {
    this.editing.set(null);
    this.assigning.set(true);
  }

  protected changeAssignment(assignment: RoleAssignment) {
    this.editing.set(assignment);
    this.assigning.set(true);
  }

  protected async removeAssignment(assignment: RoleAssignment) {
    const user = this.user();
    if (!user) {
      return;
    }
    const role = this.roleName(assignment.roleId);
    const ok = await this.confirm.ask({
      title: this.translate.instant('removeRoleTitle', { role, name: fullName(user) }),
      message: this.translate.instant('It ends now. The activity log keeps a record of it.'),
      confirmLabel: this.translate.instant('Take away'),
      cancelLabel: this.translate.instant('Cancel'),
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    try {
      await this.store.removeRoleAssignment(assignment.id);
      this.toast.show(this.translate.instant('Role taken away.'));
    } catch (error) {
      this.showError(error);
    }
  }

  protected async setStatus(status: UserStatus) {
    const user = this.user();
    if (!user) {
      return;
    }
    try {
      await this.store.setUserStatus([user.id], status);
      this.toast.show(this.translate.instant(status === 'suspended' ? 'toast.suspended' : 'toast.activated', { count: 1 }));
    } catch (error) {
      this.showError(error);
    }
  }

  protected async resetPassword() {
    const user = this.user();
    if (!user) {
      return;
    }
    try {
      await this.store.resetPassword(user.id);
      this.toast.show(this.translate.instant('toast.passwordReset', { email: user.email }), 'info');
    } catch (error) {
      this.showError(error);
    }
  }

  protected async remove() {
    const user = this.user();
    if (!user || this.isSelf()) {
      return;
    }
    const confirmed = await this.confirm.ask({
      title: this.translate.instant('confirm.deleteUser', { name: fullName(user) }),
      message: this.translate.instant('They lose access right away. This cannot be undone.'),
      confirmLabel: this.translate.instant('Delete'),
      cancelLabel: this.translate.instant('Cancel'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.store.deleteUsers([user.id]);
      this.toast.show(this.translate.instant('toast.deleted', { count: 1 }));
      this.router.navigate(['/users']);
    } catch (error) {
      this.showError(error);
    }
  }

  private showError(error: unknown) {
    this.toast.show(this.translate.instant(errorMessage(error)), 'error');
  }
}
