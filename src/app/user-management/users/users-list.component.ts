import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideBan,
  lucideDownload,
  lucideEllipsis,
  lucideEye,
  lucideKeyRound,
  lucidePencil,
  lucideSearchX,
  lucideShield,
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
import { AdminStore } from '../data/admin-store';
import { STATUS_META } from '../data/catalog';
import { fullName, User, UserStatus } from '../data/models';
import { RoleBadge, StatusBadge } from '../shared/badges';
import { downloadText, toCsv } from '../shared/csv';
import { errorMessage } from '../shared/errors';
import { LocalDatePipe, TimeAgoPipe } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import { ChangeRoleDialog } from './change-role-dialog.component';
import { ImportUsersDialog } from './import-users-dialog.component';

type SortKey = 'name' | 'role' | 'department' | 'lastActive' | 'created';

@Component({
  selector: 'app-users-list',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
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
    RoleBadge,
    StatusBadge,
    TimeAgoPipe,
    LocalDatePipe,
    ImportUsersDialog,
    ChangeRoleDialog,
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
    page: lucideUsers, add: lucideUserPlus, export: lucideDownload, more: lucideEllipsis, view: lucideEye, edit: lucidePencil,
    suspend: lucideBan, activate: lucideUserCheck, reset: lucideKeyRound, remove: lucideTrash2, empty: lucideSearchX,
    import: lucideUpload, role: lucideShield,
  };
  protected readonly importing = signal(false);
  protected readonly changingRole = signal(false);
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
  protected readonly roleFilter = signal('all');

  private readonly i18n = translationsChanged();

  protected readonly statusOptions = computed<UiOption<UserStatus | 'all'>[]>(() => {
    this.i18n();
    const users = this.store.users();
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
    search: (user, query) =>
      fullName(user).toLowerCase().includes(query) || user.email.toLowerCase().includes(query) || user.phone.includes(query),
    filter: computed(() => {
      const status = this.status();
      const role = this.roleFilter();
      return (user: User) => (status === 'all' || user.status === status) && (role === 'all' || user.roleId === role);
    }),
    sorters: {
      name: (a, b) => fullName(a).localeCompare(fullName(b)),
      role: (a, b) => (this.store.rolesById().get(a.roleId)?.name ?? '').localeCompare(this.store.rolesById().get(b.roleId)?.name ?? ''),
      department: (a, b) => a.department.localeCompare(b.department),
      // Never signed in sorts as the oldest
      lastActive: (a, b) => (a.lastActiveAt ?? '').localeCompare(b.lastActiveAt ?? ''),
      created: (a, b) => a.createdAt.localeCompare(b.createdAt),
    },
  });

  protected readonly hasFilters = computed(() => !!this.table.query() || this.status() !== 'all' || this.roleFilter() !== 'all');

  /** ?q=… from the navbar search */
  readonly q = input<string>();
  /** ?status=…, ?role=… and ?sort=joined or ?sort=active (newest first), from the overview's cards */
  readonly statusParam = input<string>(undefined, { alias: 'status' });
  readonly roleParam = input<string>(undefined, { alias: 'role' });
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
      untracked(() => {
        this.status.set(status && status in STATUS_META ? status as UserStatus : 'all');
        this.roleFilter.set(role && this.store.rolesById().has(role) ? role : 'all');
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

  protected clearFilters() {
    this.table.search('');
    this.status.set('all');
    this.roleFilter.set('all');
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

  /** Downloads the filtered list as a CSV file */
  protected exportCsv() {
    // The same first columns as an import file, so an export can be edited and imported elsewhere
    const header = ['First name', 'Last name', 'Email', 'Phone', 'Department', 'Role', 'Status', 'Joined', 'Last active'];
    const rows = this.table.sorted().map(user => [
      user.firstName, user.lastName, user.email, user.phone, user.department, this.store.rolesById().get(user.roleId)?.name ?? '',
      user.status, user.createdAt.slice(0, 10), user.lastActiveAt?.slice(0, 10) ?? '',
    ]);
    downloadText('users.csv', toCsv([header, ...rows]));
    this.toast.show(this.translate.instant('toast.exported', { count: rows.length }));
  }
}
