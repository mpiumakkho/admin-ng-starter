import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideClipboardCheck, lucidePlus, lucideSearchX } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { REVIEW_STATUS } from '../data/catalog';
import { AccessReview, AccessReviewStatus } from '../data/models';
import { LocalDatePipe, localName } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import {
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiFilterChips,
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
} from '../ui';
import { reviewScope } from './review-text';
import { StartReviewDialog } from './start-review-dialog.component';

/** A review as the list shows it: its name and what it covers in the reader's language, and how far it has got */
interface ReviewRow {
  review: AccessReview;
  name: string;
  scope: string;
  /** Decided, in percent */
  progress: number;
}

type SortKey = 'name' | 'closes' | 'decided' | 'status';
type StatusFilter = 'all' | AccessReviewStatus;

/** Name or what it covers, as typed */
function matchesSearch(row: ReviewRow, query: string): boolean {
  return row.name.toLowerCase().includes(query) || row.scope.toLowerCase().includes(query);
}

/**
 * Access reviews (API.md, "Access reviews"): rounds of checking that people still need the roles they hold, as audits
 * ask. People with reviews.manage see and start them all; anyone else sees the ones they decide in, with how many roles
 * wait for them. The list searches, filters by status, sorts and pages as the branches list does.
 */
@Component({
  selector: 'app-access-reviews',
  imports: [
    RouterLink, NgIcon, TranslatePipe, LocalDatePipe, UiBadge, UiButton, UiCard, UiEmptyState, UiFilterChips, UiPageHeader, UiPageSize,
    UiPagination, UiSearchInput, UiSortHeader, UiTable, UiTableMinRows, UiTableScrollReset, StartReviewDialog,
  ],
  templateUrl: './access-reviews.component.html',
  styleUrl: './access-reviews.component.scss',
  // Fills the window on desktop; a long list scrolls inside its card, as on the pages with tables
  host: { class: 'page-fit' },
})
export class AccessReviewsComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly i18n = translationsChanged();

  protected readonly icons = { page: lucideClipboardCheck, add: lucidePlus, empty: lucideSearchX };
  protected readonly statusMeta = REVIEW_STATUS;
  protected readonly canManage = computed(() => this.session.can('reviews.manage'));
  protected readonly starting = signal(false);

  /** Newest first, as the server lists them, until a column is sorted */
  protected readonly rows = computed<ReviewRow[]>(() => {
    this.i18n();
    return this.store.accessReviews().map(review => ({
      review,
      name: localName(this.translate, review.name),
      scope: reviewScope(review, this.store, this.translate),
      progress: review.itemCount ? Math.round(review.decidedCount / review.itemCount * 100) : 100,
    }));
  });

  protected readonly status = signal<StatusFilter>('all');

  /** Counted within the search, so each number is what the list shows after a click */
  protected readonly statusOptions = computed<UiOption<StatusFilter>[]>(() => {
    this.i18n();
    const query = this.table.query().trim().toLowerCase();
    const rows = this.rows().filter(row => !query || matchesSearch(row, query));
    const open = rows.filter(row => row.review.status === 'open').length;
    return [
      { value: 'all', label: this.translate.instant('All'), count: rows.length },
      { value: 'open', label: this.translate.instant('Open'), count: open },
      { value: 'closed', label: this.translate.instant('Closed'), count: rows.length - open },
    ];
  });

  /** The table keeps the height of the smallest size, so a short page doesn't move the pagination */
  protected readonly pageSizes = [10, 25, 50];

  protected readonly table = new UiTableState<ReviewRow, SortKey>({
    rows: this.rows,
    id: row => row.review.id,
    pageSize: this.pageSizes[0],
    pageSizeKey: 'reviews-page-size',
    search: matchesSearch,
    filter: computed(() => {
      const status = this.status();
      return (row: ReviewRow) => status === 'all' || row.review.status === status;
    }),
    sorters: {
      name: (a, b) => a.name.localeCompare(b.name),
      closes: (a, b) => (a.review.closedAt ?? a.review.dueAt).localeCompare(b.review.closedAt ?? b.review.dueAt),
      decided: (a, b) => a.progress - b.progress,
      status: (a, b) => a.review.status.localeCompare(b.review.status),
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

  protected open(review: AccessReview) {
    this.router.navigate(['/access-reviews', review.id]);
  }
}
