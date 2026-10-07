import { computed, Signal, signal, WritableSignal } from '@angular/core';

export type UiSortDirection = 'asc' | 'desc';

export interface UiTableStateOptions<T, K extends string = string> {
  /** All rows; the state reacts when this signal changes */
  rows: Signal<readonly T[]>;
  /** A stable id for each row, used for selection */
  id: (row: T) => string | number;
  /** Does the row match the search text (already trimmed and lower-cased)? */
  search?: (row: T, query: string) => boolean;
  /** Extra filters, such as a status tab; return false to hide the row */
  filter?: Signal<(row: T) => boolean>;
  /** Rows that can be ticked, such as the ones the reader may change; every row when left out. May read signals. */
  selectable?: (row: T) => boolean;
  /** Compare functions for the sortable columns */
  sorters?: Partial<Record<K, (a: T, b: T) => number>>;
  pageSize?: number;
  /** Remembers the reader's page size in this browser under this key, such as "users-page-size" */
  pageSizeKey?: string;
}

/**
 * Search, filter, sort, page and select for a table, as signals. It holds no markup, so any table
 * design can use it.
 *
 *   readonly table = new UiTableState({
 *     rows: this.store.users,
 *     id: user => user.id,
 *     search: (user, q) => user.name.toLowerCase().includes(q),
 *     sorters: { name: (a, b) => a.name.localeCompare(b.name) },
 *   });
 *
 *   @for (user of table.pageRows(); track user.id) { ... }
 */
export class UiTableState<T, K extends string = string> {
  readonly query = signal('');
  readonly sortKey = signal<K | null>(null);
  readonly sortDirection = signal<UiSortDirection>('asc');
  readonly page = signal(1);
  /** Rows per page; change it with `setPageSize` to keep the reader's place */
  readonly pageSize: WritableSignal<number>;
  readonly selectedIds = signal<ReadonlySet<string | number>>(new Set());

  /** Rows that pass the search and filters, in their original order */
  readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    const filter = this.options.filter?.();
    return this.options.rows().filter(row =>
      (!filter || filter(row)) && (!query || !this.options.search || this.options.search(row, query)));
  });

  readonly sorted = computed(() => {
    const key = this.sortKey();
    const compare = key ? this.options.sorters?.[key] : undefined;
    if (!compare) {
      return this.filtered();
    }
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((a, b) => compare(a, b) * direction);
  });

  readonly total = computed(() => this.filtered().length);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  /** The page in range, even after rows were removed */
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  /** Rows on the current page */
  readonly pageRows = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.sorted().slice(start, start + this.pageSize());
  });

  /** 1-based positions of the first and last row shown, for "Showing 11–20 of 57" */
  readonly range = computed(() => {
    const from = this.total() ? (this.currentPage() - 1) * this.pageSize() + 1 : 0;
    return { from, to: Math.min(from + this.pageSize() - 1, this.total()), total: this.total() };
  });

  /** Changes when the reader asks for another view (page, page size, sort, search or filters), not when rows change */
  readonly view = computed(() => [
    this.currentPage(), this.pageSize(), this.sortKey(), this.sortDirection(), this.query(), this.options.filter?.(),
  ]);

  /** Selected rows that still exist and can still be selected */
  readonly selectedRows = computed(() => {
    const ids = this.selectedIds();
    return this.options.rows().filter(row => ids.has(this.options.id(row)) && this.isSelectable(row));
  });

  /** Rows on the current page that can be ticked */
  private readonly selectableOnPage = computed(() => this.pageRows().filter(row => this.isSelectable(row)));

  readonly allOnPageSelected = computed(() => {
    const rows = this.selectableOnPage();
    return rows.length > 0 && rows.every(row => this.selectedIds().has(this.options.id(row)));
  });

  readonly someOnPageSelected = computed(() =>
    !this.allOnPageSelected() && this.selectableOnPage().some(row => this.selectedIds().has(this.options.id(row))));

  /** Whether the page has any row to tick, so the "select all" box has something to do */
  readonly pageHasSelectable = computed(() => this.selectableOnPage().length > 0);

  constructor(private readonly options: UiTableStateOptions<T, K>) {
    this.pageSize = signal(readNumber(options.pageSizeKey) ?? options.pageSize ?? 10);
  }

  search(query: string): void {
    this.query.set(query);
    this.page.set(1);
  }

  /** Sort by a column; asking again for the same column reverses the order */
  sortBy(key: K): void {
    if (this.sortKey() === key) {
      this.sortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDirection.set('asc');
    }
  }

  isSelected(row: T): boolean {
    return this.selectedIds().has(this.options.id(row));
  }

  isSelectable(row: T): boolean {
    return this.options.selectable?.(row) ?? true;
  }

  toggle(row: T): void {
    if (!this.isSelectable(row)) {
      return;
    }
    const id = this.options.id(row);
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /** Select every row on the page, or clear them if they are all selected already */
  togglePage(): void {
    const ids = this.selectableOnPage().map(row => this.options.id(row));
    const select = !this.allOnPageSelected();
    this.selectedIds.update(selected => {
      const next = new Set(selected);
      ids.forEach(id => select ? next.add(id) : next.delete(id));
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  /** Shows `size` rows per page, on the page that holds the row that was first on screen */
  setPageSize(size: number): void {
    const firstIndex = (this.currentPage() - 1) * this.pageSize();
    this.pageSize.set(size);
    writeNumber(this.options.pageSizeKey, size);
    this.page.set(Math.floor(firstIndex / size) + 1);
  }

  /** Back to page one, for example after a filter changed */
  resetPage(): void {
    this.page.set(1);
  }
}

// Storage can be missing or blocked (private windows, tests); the default page size then applies
function readNumber(key: string | undefined): number | null {
  try {
    const value = key ? Number(localStorage.getItem(key)) : NaN;
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string | undefined, value: number) {
  try {
    if (key) {
      localStorage.setItem(key, String(value));
    }
  } catch {
    // Remembered for this visit only
  }
}
