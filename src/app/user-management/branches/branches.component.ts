import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideBuilding2, lucideEllipsis, lucideMapPinOff, lucideMapPinned, lucidePencil, lucidePlus, lucideSearchX, lucideTrash2,
} from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Session } from '../access/session';
import { roleAssignmentState } from '../data/access-rules';
import { AdminStore } from '../data/admin-store';
import { Branch } from '../data/models';
import { errorMessage } from '../shared/errors';
import { translationsChanged } from '../shared/i18n';
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiConfirmService,
  UiDialog,
  UiDialogFooter,
  UiEmptyState,
  UiFilterChips,
  UiFormField,
  UiInput,
  UiMenu,
  UiMenuDivider,
  UiMenuItem,
  UiMenuTrigger,
  UiOption,
  UiPageHeader,
  UiPageSize,
  UiPagination,
  UiSearchInput,
  UiSortHeader,
  UiTable,
  UiTableMinRows,
  UiTableScrollReset,
  UiTableState,
  UiToastService,
} from '../ui';

/** A branch as the list shows it: with how many people belong to it and how many roles are limited to it now */
interface BranchRow {
  branch: Branch;
  people: number;
  roles: number;
}

type SortKey = 'name' | 'code' | 'people' | 'roles';
type StatusFilter = 'all' | 'open' | 'closed';

/** Name or code, as typed */
function matchesSearch(row: BranchRow, query: string): boolean {
  return row.branch.name.toLowerCase().includes(query) || row.branch.code.toLowerCase().includes(query);
}

/**
 * The branches (sites, offices) people belong to and roles can be limited to, as Google Workspace's organizational
 * units. Everyone with branches.view sees the list; branches.manage adds, renames, closes and deletes them. A closed
 * branch keeps its people and their roles, but nobody new joins it; a branch in use cannot be deleted. The list
 * searches, filters by status, sorts and pages as the users list does, for an organization with many branches.
 */
@Component({
  selector: 'app-branches',
  imports: [
    FormsModule, RouterLink, NgIcon, TranslatePipe, UiAlert, UiBadge, UiButton, UiCard, UiDialog, UiDialogFooter, UiEmptyState,
    UiFilterChips, UiFormField, UiInput, UiMenu, UiMenuDivider, UiMenuItem, UiMenuTrigger, UiPageHeader, UiPageSize, UiPagination,
    UiSearchInput, UiSortHeader, UiTable, UiTableMinRows, UiTableScrollReset,
  ],
  templateUrl: './branches.component.html',
  styleUrl: './branches.component.scss',
  // Fills the window on desktop: a long list scrolls inside its card, as on the pages with tables
  host: { class: 'page-fit' },
})
export class BranchesComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly confirm = inject(UiConfirmService);

  protected readonly icons = {
    page: lucideBuilding2, add: lucidePlus, more: lucideEllipsis, edit: lucidePencil, close: lucideMapPinOff, reopen: lucideMapPinned,
    remove: lucideTrash2, empty: lucideSearchX,
  };
  protected readonly canManage = computed(() => this.session.can('branches.manage'));

  /** Open ones first, then by name, until a column is sorted */
  protected readonly rows = computed<BranchRow[]>(() => {
    const now = this.store.now();
    const scoped = new Map<string, number>();
    for (const user of this.store.users()) {
      for (const item of user.roles) {
        if (item.branchId && roleAssignmentState(item, now) === 'active') {
          scoped.set(item.branchId, (scoped.get(item.branchId) ?? 0) + 1);
        }
      }
    }
    return [...this.store.branches()]
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
      .map(branch => ({ branch, people: this.store.branchCounts().get(branch.id) ?? 0, roles: scoped.get(branch.id) ?? 0 }));
  });

  /* The list */

  protected readonly status = signal<StatusFilter>('all');
  private readonly i18n = translationsChanged();

  /** Counted within the search, so each number is what the list shows after a click */
  protected readonly statusOptions = computed<UiOption<StatusFilter>[]>(() => {
    this.i18n();
    const query = this.table.query().trim().toLowerCase();
    const rows = this.rows().filter(row => !query || matchesSearch(row, query));
    const open = rows.filter(row => row.branch.active).length;
    return [
      { value: 'all', label: this.translate.instant('All'), count: rows.length },
      { value: 'open', label: this.translate.instant('Open'), count: open },
      { value: 'closed', label: this.translate.instant('Closed'), count: rows.length - open },
    ];
  });

  /** The table keeps the height of the smallest size, so a short page doesn't move the pagination */
  protected readonly pageSizes = [10, 25, 50];

  protected readonly table = new UiTableState<BranchRow, SortKey>({
    rows: this.rows,
    id: row => row.branch.id,
    pageSize: this.pageSizes[0],
    pageSizeKey: 'branches-page-size',
    search: matchesSearch,
    filter: computed(() => {
      const status = this.status();
      return (row: BranchRow) => status === 'all' || row.branch.active === (status === 'open');
    }),
    sorters: {
      name: (a, b) => a.branch.name.localeCompare(b.branch.name),
      code: (a, b) => a.branch.code.localeCompare(b.branch.code),
      people: (a, b) => a.people - b.people,
      roles: (a, b) => a.roles - b.roles,
    },
  });

  protected readonly hasFilters = computed(() => !!this.table.query() || this.status() !== 'all');

  protected setStatus(status: StatusFilter | null) {
    this.status.set(status ?? 'all');
    this.table.resetPage();
  }

  protected clearFilters() {
    this.table.search('');
    this.status.set('all');
  }

  /* Add and edit */

  protected readonly editing = signal<Branch | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly code = signal('');
  protected readonly name = signal('');
  protected readonly saving = signal(false);
  protected readonly problem = signal('');

  protected add() {
    this.open(null);
  }

  protected edit(branch: Branch) {
    this.open(branch);
  }

  protected async save() {
    const code = this.code().trim().toUpperCase();
    const name = this.name().trim();
    if (!/^[A-Z0-9-]{1,10}$/.test(code) || !name) {
      this.problem.set(!name ? 'This field is required.' : 'Use up to 10 letters, digits or dashes.');
      return;
    }
    this.saving.set(true);
    this.problem.set('');
    try {
      const current = this.editing();
      if (current) {
        await this.store.updateBranch(current.id, { code, name });
        this.toast.show(this.translate.instant('toast.branchSaved', { name }));
      } else {
        await this.store.createBranch({ code, name });
        this.toast.show(this.translate.instant('toast.branchAdded', { name }));
      }
      this.dialogOpen.set(false);
    } catch (error) {
      this.problem.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /* Close, reopen, delete */

  protected async setOpen(branch: Branch, active: boolean) {
    try {
      await this.store.updateBranch(branch.id, { active });
      this.toast.show(this.translate.instant(active ? 'toast.branchReopened' : 'toast.branchClosed', { name: branch.name }));
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    }
  }

  protected async remove(branch: Branch) {
    const confirmed = await this.confirm.ask({
      title: this.translate.instant('confirm.deleteBranch', { name: branch.name }),
      message: this.translate.instant('This cannot be undone.'),
      confirmLabel: this.translate.instant('Delete'),
      cancelLabel: this.translate.instant('Cancel'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.store.deleteBranch(branch.id);
      this.toast.show(this.translate.instant('toast.branchDeleted', { name: branch.name }));
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    }
  }

  private open(branch: Branch | null) {
    this.editing.set(branch);
    this.code.set(branch?.code ?? '');
    this.name.set(branch?.name ?? '');
    this.problem.set('');
    this.dialogOpen.set(true);
  }
}
