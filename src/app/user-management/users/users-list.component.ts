import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideBan,
  lucideEllipsis,
  lucideEye,
  lucideKeyRound,
  lucidePencil,
  lucideSearchX,
  lucideShield,
  lucideShieldMinus,
  lucideTrash2,
  lucideUpload,
  lucideUserCheck,
  lucideUserPlus,
  lucideUsers,
} from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  UiBulkBar,
  UiButton,
  UiCard,
  UiCheckbox,
  UiConfirmService,
  UiEmptyState,
  UiFilterChips,
  UiInput,
  UiMenu,
  UiMenuDivider,
  UiMenuItem,
  UiMenuTrigger,
  UiOption,
  UiPageHeader,
  UiPageSize,
  UiPagination,
  UiPerson,
  UiSearchInput,
  UiSortHeader,
  UiTable,
  UiTableMinRows,
  UiTableScrollReset,
  UiTableState,
  UiToastService,
} from '../ui';
import { Session } from '../access/session';
import { activeRoleIds, roleAssignmentState } from '../data/access-rules';
import { AdminStore } from '../data/admin-store';
import { STATUS_META } from '../data/catalog';
import { fullName, User, UserStatus } from '../data/models';
import { RoleBadges, StatusBadge } from '../shared/badges';
import { ExportMenu } from '../shared/export-menu.component';
import { TableExport } from '../shared/table-export';
import { errorMessage } from '../shared/errors';
import { LocalDatePipe, TimeAgoPipe } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import { ImportUsersDialog } from './import-users-dialog.component';
import { RemoveRoleDialog } from './remove-role-dialog.component';
import { RoleAssignmentDialog } from './role-assignment-dialog.component';

type SortKey = 'name' | 'role' | 'department' | 'branch' | 'lastActive' | 'created';

/** The role filter's value for everyone who holds a role for a time, or will; ?role=temporary */
const TEMPORARY = 'temporary';
/** The branch filter's value for people who belong to no branch; ?branch=none */
const NO_BRANCH = 'none';

@Component({
  selector: 'app-users-list',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    ExportMenu,
    UiPageHeader,
    UiButton,
    UiCard,
    UiSearchInput,
    UiFilterChips,
    UiInput,
    UiBulkBar,
    UiTable,
    UiTableMinRows,
    UiTableScrollReset,
    UiSortHeader,
    UiCheckbox,
    UiPerson,
    UiMenu,
    UiMenuItem,
    UiMenuTrigger,
    UiMenuDivider,
    UiPagination,
    UiPageSize,
    UiEmptyState,
    RoleBadges,
    StatusBadge,
    TimeAgoPipe,
    LocalDatePipe,
    ImportUsersDialog,
    RoleAssignmentDialog,
    RemoveRoleDialog,
  ],
  templateUrl: './users-list.component.html',
  styleUrl: './users-list.component.scss',
  // Fills the window on desktop; the table scrolls inside when a page has more rows than fit
  host: { class: 'page-fit' },
})
export class UsersListComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly confirm = inject(UiConfirmService);
  private readonly toast = inject(UiToastService);

  protected readonly icons = {
    page: lucideUsers, add: lucideUserPlus, more: lucideEllipsis, view: lucideEye, edit: lucidePencil,
    suspend: lucideBan, activate: lucideUserCheck, reset: lucideKeyRound, remove: lucideTrash2, empty: lucideSearchX,
    import: lucideUpload, role: lucideShield, roleOff: lucideShieldMinus,
  };
  protected readonly importing = signal(false);
  protected readonly givingRole = signal(false);
  protected readonly takingRole = signal(false);
  protected readonly fullName = fullName;
  protected readonly busy = signal(false);

  /* What the signed-in user's role allows here */

  protected readonly canEdit = computed(() => this.session.can('users.edit'));
  protected readonly canDelete = computed(() => this.session.can('users.delete'));
  /** Rows have checkboxes only when there is something to do with a selection */
  protected readonly canSelect = computed(() => this.canEdit() || this.canDelete());

  /** Whether the reader may change this person: nobody can change someone whose role allows more than their own */
  protected manages(user: User) {
    return this.session.canManage(user);
  }

  /** Why a row cannot be ticked, as a tooltip; empty when it can */
  protected lockReason(user: User): string {
    if (this.session.isSelf(user)) {
      return 'You cannot change your own account from the list.';
    }
    return this.manages(user) ? '' : 'Their role has permissions yours does not, so you cannot change them.';
  }

  /* Filters */

  protected readonly status = signal<UserStatus | 'all'>('all');
  /** A role id, all, or everyone who holds a role for a time (or will) */
  protected readonly roleFilter = signal('all');
  protected readonly temporary = TEMPORARY;
  /** A branch id, all, or none */
  protected readonly branchFilter = signal('all');
  protected readonly noBranch = NO_BRANCH;

  protected branchName(branchId: string | null): string {
    return branchId ? this.store.branchesById().get(branchId)?.name ?? '' : '';
  }

  /** Whether someone matches the branch filter; with branches turned off, everyone does */
  private inBranch(user: User, filter: string): boolean {
    return filter === 'all' || !this.store.branchesEnabled() || (filter === NO_BRANCH ? !user.branchId : user.branchId === filter);
  }

  /** Whether someone matches the role filter */
  private holds(user: User, filter: string): boolean {
    const now = this.store.now();
    if (filter === TEMPORARY) {
      return user.roles.some(item => roleAssignmentState(item, now) !== 'expired' && (item.endsAt !== null || roleAssignmentState(item, now) === 'scheduled'));
    }
    return filter === 'all' || activeRoleIds(user, now).includes(filter);
  }

  private readonly i18n = translationsChanged();

  /** Counted within the search and the role picked, so each number is what the list shows after a click */
  protected readonly statusOptions = computed<UiOption<UserStatus | 'all'>[]>(() => {
    this.i18n();
    const query = this.table.query().trim().toLowerCase();
    const role = this.roleFilter();
    const branch = this.branchFilter();
    const users = this.store.users().filter(user => this.holds(user, role) && this.inBranch(user, branch) && (!query || matchesSearch(user, query)));
    return [
      { value: 'all', label: this.translate.instant('All'), count: users.length },
      ...(Object.keys(STATUS_META) as UserStatus[]).map(status => ({
        value: status,
        label: this.translate.instant(STATUS_META[status].label),
        count: users.filter(user => user.status === status).length,
      })),
    ];
  });

  /** The table keeps the height of the smallest size, so a short page doesn't move the pagination */
  protected readonly pageSizes = [10, 25, 50, 100];

  protected readonly table = new UiTableState<User, SortKey>({
    rows: this.store.users,
    id: user => user.id,
    // People the reader may change, other than themselves
    selectable: user => this.canSelect() && this.session.canManage(user) && !this.session.isSelf(user),
    pageSize: this.pageSizes[0],
    pageSizeKey: 'users-page-size',
    search: matchesSearch,
    filter: computed(() => {
      const status = this.status();
      const role = this.roleFilter();
      const branch = this.branchFilter();
      return (user: User) => (status === 'all' || user.status === status) && this.holds(user, role) && this.inBranch(user, branch);
    }),
    sorters: {
      name: (a, b) => fullName(a).localeCompare(fullName(b)),
      // By the role each is named by: the one with most permissions
      role: (a, b) => (this.store.activeRoles(a)[0]?.name ?? '').localeCompare(this.store.activeRoles(b)[0]?.name ?? ''),
      department: (a, b) => a.department.localeCompare(b.department),
      branch: (a, b) => this.branchName(a.branchId).localeCompare(this.branchName(b.branchId)),
      // Never signed in sorts as the oldest
      lastActive: (a, b) => (a.lastActiveAt ?? '').localeCompare(b.lastActiveAt ?? ''),
      created: (a, b) => a.createdAt.localeCompare(b.createdAt),
    },
  });

  protected readonly hasFilters = computed(() => !!this.table.query() || this.status() !== 'all' || this.roleFilter() !== 'all'
    || this.branchFilter() !== 'all');

  /** ?q=… from the navbar search */
  readonly q = input<string>();
  /** ?status=…, ?role=… and ?sort=joined or ?sort=active (newest first), from the overview's cards */
  readonly statusParam = input<string>(undefined, { alias: 'status' });
  readonly roleParam = input<string>(undefined, { alias: 'role' });
  /** ?branch=…, from the branches page */
  readonly branchParam = input<string>(undefined, { alias: 'branch' });
  readonly sortParam = input<string>(undefined, { alias: 'sort' });

  constructor() {
    // Applies on arrival and when searching again from the navbar while this page is open
    effect(() => {
      const query = this.q();
      untracked(() => this.table.search(query ?? ''));
    });

    effect(() => {
      const status = this.statusParam();
      const role = this.roleParam();
      const branch = this.branchParam();
      untracked(() => {
        this.status.set(status && status in STATUS_META ? status as UserStatus : 'all');
        this.roleFilter.set(role && (role === TEMPORARY || this.store.rolesById().has(role)) ? role : 'all');
        this.branchFilter.set(branch && (branch === NO_BRANCH || this.store.branchesById().has(branch)) ? branch : 'all');
        this.table.resetPage();
      });
    });

    effect(() => {
      const sorts: Record<string, SortKey> = { joined: 'created', active: 'lastActive' };
      const key = sorts[this.sortParam() ?? ''];
      if (key) {
        untracked(() => {
          this.table.sortKey.set(key);
          this.table.sortDirection.set('desc');
        });
      }
    });
  }

  protected setStatus(status: UserStatus | 'all' | null) {
    this.status.set(status ?? 'all');
    this.table.resetPage();
  }

  protected setRole(role: string) {
    this.roleFilter.set(role);
    this.table.resetPage();
  }

  protected setBranch(branch: string) {
    this.branchFilter.set(branch);
    this.table.resetPage();
  }

  protected clearFilters() {
    this.table.search('');
    this.status.set('all');
    this.roleFilter.set('all');
    this.branchFilter.set('all');
  }

  protected open(user: User) {
    this.router.navigate(['/users', user.id]);
  }

  /* Actions */

  protected async setStatusFor(users: User[], status: UserStatus) {
    this.busy.set(true);
    try {
      await this.store.setUserStatus(users.map(user => user.id), status);
      const key = status === 'suspended' ? 'toast.suspended' : 'toast.activated';
      this.toast.show(this.translate.instant(key, { count: users.length }));
      this.table.clearSelection();
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async resetPassword(user: User) {
    try {
      await this.store.resetPassword(user.id);
      this.toast.show(this.translate.instant('toast.passwordReset', { email: user.email }), 'info');
    } catch (error) {
      this.showError(error);
    }
  }

  protected async remove(users: User[]) {
    if (users.some(user => this.session.isSelf(user))) {
      this.toast.show(this.translate.instant('You cannot delete your own account.'), 'error');
      return;
    }
    const confirmed = await this.confirm.ask({
      title: users.length === 1
        ? this.translate.instant('confirm.deleteUser', { name: fullName(users[0]) })
        : this.translate.instant('confirm.deleteUsers', { count: users.length }),
      message: this.translate.instant('They lose access right away. This cannot be undone.'),
      confirmLabel: this.translate.instant('Delete'),
      cancelLabel: this.translate.instant('Cancel'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    this.busy.set(true);
    try {
      await this.store.deleteUsers(users.map(user => user.id));
      this.toast.show(this.translate.instant('toast.deleted', { count: users.length }));
      this.table.clearSelection();
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private showError(error: unknown) {
    this.toast.show(this.translate.instant(errorMessage(error)), 'error');
  }

  /** The filtered list, in the order shown, for the Export menu */
  protected readonly exportTable = (): TableExport => {
    const t = this.translate;
    const users = this.table.sorted();
    // The roles held now, separated as an import file takes them
    const roleNames = (user: User) => this.store.activeRoles(user).map(role => role.name).join('; ');
    // With branches on, the branch after the department, by name on screen and by code in the file to import again
    const branches = this.store.branchesEnabled();
    const branchCode = (user: User) => user.branchId ? this.store.branchesById().get(user.branchId)?.code ?? '' : '';
    return {
      fileName: 'users',
      title: t.instant('Users'),
      columns: [
        { header: t.instant('First name') }, { header: t.instant('Last name') }, { header: t.instant('Email') }, { header: t.instant('Phone') },
        { header: t.instant('Department') }, ...(branches ? [{ header: t.instant('Branch') }] : []), { header: t.instant('Roles') },
        { header: t.instant('Status') }, { header: t.instant('Joined'), date: 'day' }, { header: t.instant('Last active'), date: 'time' },
      ],
      rows: users.map(user => [
        user.firstName, user.lastName, user.email, user.phone, t.instant(user.department), ...(branches ? [this.branchName(user.branchId)] : []),
        roleNames(user), t.instant(STATUS_META[user.status].label), new Date(user.createdAt), user.lastActiveAt ? new Date(user.lastActiveAt) : null,
      ]),
      // The same first columns as an import file, so an export can be edited and imported elsewhere
      csv: [
        ['First name', 'Last name', 'Email', 'Phone', 'Department', ...(branches ? ['Branch'] : []), 'Roles', 'Status', 'Joined', 'Last active'],
        ...users.map(user => [
          user.firstName, user.lastName, user.email, user.phone, user.department, ...(branches ? [branchCode(user)] : []), roleNames(user),
          user.status, user.createdAt.slice(0, 10), user.lastActiveAt?.slice(0, 10) ?? '',
        ]),
      ],
    };
  };
}

/** Name, email or phone, as the search box says; the query is already lower case */
function matchesSearch(user: User, query: string): boolean {
  return fullName(user).toLowerCase().includes(query) || user.email.toLowerCase().includes(query) || user.phone.includes(query);
}
