import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck, lucideClipboardCheck, lucideEllipsis, lucideSearchX, lucideTrash2, lucideX } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { REVIEW_DECISIONS, REVIEW_OUTCOMES, REVIEW_STATUS } from '../data/catalog';
import { AccessReviewDecision, AccessReviewItem, AccessReviewOutcome, fullName } from '../data/models';
import { RoleBadge } from '../shared/badges';
import { errorMessage } from '../shared/errors';
import { ExportMenu } from '../shared/export-menu.component';
import { LocalDatePipe, localDate, localName, TimeAgoPipe } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import { ReasonPrompt } from '../shared/reason-prompt';
import { TableExport } from '../shared/table-export';
import {
  UiBadge,
  UiBulkBar,
  UiButton,
  UiCard,
  UiCheckbox,
  UiConfirmService,
  UiEmptyState,
  UiFilterChips,
  UiMenu,
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
import { reviewScope } from './review-text';

type SortKey = 'person' | 'role' | 'since' | 'decision';
/** What the list shows: everything, what waits for the signed-in user, a decision, or, once closed, an outcome */
type ItemFilter = 'all' | 'mine' | 'undecided' | AccessReviewDecision | AccessReviewOutcome;

/**
 * One access review (API.md, "Access reviews"): each role it covers, with Keep and Remove for the ones the signed-in
 * user may decide. Nothing changes until it closes, on its due date or when someone with reviews.manage closes it; the
 * roles decided Remove are then taken away. The list exports as the report an auditor asks for.
 */
@Component({
  selector: 'app-access-review',
  imports: [
    RouterLink, NgIcon, TranslatePipe, LocalDatePipe, TimeAgoPipe, ExportMenu, RoleBadge, UiBadge, UiBulkBar, UiButton,
    UiCard, UiCheckbox, UiEmptyState, UiFilterChips, UiMenu, UiMenuItem, UiMenuTrigger, UiPageHeader, UiPageSize, UiPagination, UiPerson,
    UiSearchInput, UiSortHeader, UiTable, UiTableMinRows, UiTableScrollReset,
  ],
  templateUrl: './access-review.component.html',
  styleUrl: './access-review.component.scss',
  // Fills the window on desktop; the table scrolls inside its card
  host: { class: 'page-fit' },
})
export class AccessReviewComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly confirm = inject(UiConfirmService);
  private readonly reasons = inject(ReasonPrompt);
  private readonly i18n = translationsChanged();

  /** From the address: /access-reviews/:id */
  readonly id = input.required<string>();

  protected readonly icons = {
    page: lucideClipboardCheck, keep: lucideCheck, remove: lucideX, more: lucideEllipsis, delete: lucideTrash2, empty: lucideSearchX,
  };
  protected readonly decisions = REVIEW_DECISIONS;
  protected readonly outcomes = REVIEW_OUTCOMES;
  protected readonly status = REVIEW_STATUS;

  protected readonly review = computed(() => this.store.accessReviews().find(review => review.id === this.id()) ?? null);
  protected readonly items = signal<AccessReviewItem[]>([]);
  protected readonly loading = signal(true);
  /** Why the roles could not be loaded; empty when they were */
  protected readonly failure = signal('');
  protected readonly busy = signal(false);

  protected readonly canManage = computed(() => this.session.can('reviews.manage'));
  protected readonly isOpen = computed(() => this.review()?.status === 'open');
  /** Rows have checkboxes when some of them are the signed-in user's to decide */
  protected readonly canSelect = computed(() => this.isOpen() && this.items().some(item => item.canDecide));

  /** Its name in the reader's language, when it is one of the sample's */
  protected readonly name = computed(() => {
    this.i18n();
    const review = this.review();
    return review ? localName(this.translate, review.name) : '';
  });

  /**
   * The header's subtitle: what it covers, when it closes or closed, and who it names to decide all of it, such as
   * "Every role · People of Chiang Mai · closes 23 Oct 2026"
   */
  protected readonly summary = computed(() => {
    this.i18n();
    const review = this.review();
    if (!review) {
      return '';
    }
    const t = this.translate;
    const when = review.status === 'open'
      ? t.instant('reviewClosesOn', { date: localDate(t, review.dueAt) })
      : review.closedById
        ? t.instant('reviewClosedOnBy', { date: localDate(t, review.closedAt ?? review.dueAt), name: this.userName(review.closedById) })
        : t.instant('reviewClosedOn', { date: localDate(t, review.closedAt ?? review.dueAt) });
    const named = review.reviewerIds.length
      ? [t.instant('reviewNamed', { names: review.reviewerIds.map(id => this.userName(id)).join(', ') })]
      : [];
    return [reviewScope(review, this.store, t), when, ...named].join(' · ');
  });

  protected readonly counts = computed(() => {
    const items = this.items();
    const count = (test: (item: AccessReviewItem) => boolean) => items.filter(test).length;
    return {
      all: items.length,
      mine: count(item => item.canDecide && !item.decision),
      undecided: count(item => !item.decision),
      keep: count(item => item.decision === 'keep'),
      remove: count(item => item.decision === 'remove'),
      kept: count(item => item.outcome === 'kept'),
      removed: count(item => item.outcome === 'removed'),
      not_reviewed: count(item => item.outcome === 'not_reviewed'),
      gone: count(item => item.outcome === 'gone'),
      last_administrator: count(item => item.outcome === 'last_administrator'),
    };
  });

  protected readonly filter = signal<ItemFilter>('all');
  protected readonly filterOptions = computed<UiOption<ItemFilter>[]>(() => {
    this.i18n();
    const counts = this.counts();
    const t = (key: string) => this.translate.instant(key);
    if (this.isOpen()) {
      return [
        { value: 'all', label: t('All'), count: counts.all },
        ...(this.canSelect() ? [{ value: 'mine' as const, label: t('Waiting for you'), count: counts.mine }] : []),
        { value: 'undecided', label: t('Not decided'), count: counts.undecided },
        { value: 'keep', label: t('Keep'), count: counts.keep },
        { value: 'remove', label: t('Remove'), count: counts.remove },
      ];
    }
    return [
      { value: 'all', label: t('All'), count: counts.all },
      ...(Object.keys(REVIEW_OUTCOMES) as AccessReviewOutcome[])
        .filter(outcome => counts[outcome] || outcome === 'kept' || outcome === 'removed' || outcome === 'not_reviewed')
        .map(outcome => ({ value: outcome, label: t(REVIEW_OUTCOMES[outcome].label), count: counts[outcome] })),
    ];
  });

  /** As the users list; the table keeps the height of the smallest size, so a short page doesn't move the pagination */
  protected readonly pageSizes = [10, 25, 50, 100];

  protected readonly table = new UiTableState<AccessReviewItem, SortKey>({
    rows: this.items,
    id: item => item.id,
    selectable: item => item.canDecide,
    pageSize: this.pageSizes[0],
    pageSizeKey: 'review-page-size',
    search: (item, query) => item.userName.toLowerCase().includes(query) || item.email.toLowerCase().includes(query)
      || item.roleName.toLowerCase().includes(query),
    filter: computed(() => {
      const filter = this.filter();
      return (item: AccessReviewItem) => filter === 'all' ? true
        : filter === 'mine' ? item.canDecide && !item.decision
        : filter === 'undecided' ? !item.decision
        : filter === 'keep' || filter === 'remove' ? item.decision === filter
        : item.outcome === filter;
    }),
    sorters: {
      person: (a, b) => a.userName.localeCompare(b.userName),
      role: (a, b) => a.roleName.localeCompare(b.roleName),
      since: (a, b) => a.startsAt.localeCompare(b.startsAt),
      decision: (a, b) => (a.decision ?? '').localeCompare(b.decision ?? ''),
    },
  });

  /** Whether the list was opened on what waits for the signed-in user, once, when it first loaded */
  private filtered = false;

  constructor() {
    // On arrival, and each time the data is loaded again, such as after someone else decided
    effect(() => {
      const id = this.id();
      this.store.revision();
      untracked(() => this.load(id));
    });
  }

  protected userName(id: string | null): string {
    if (!id) {
      return '';
    }
    const user = this.store.usersById().get(id);
    return user ? fullName(user) : this.translate.instant('Deleted user');
  }

  protected branchName(branchId: string | null): string {
    return branchId ? this.store.branchesById().get(branchId)?.name ?? '' : '';
  }

  /** The person as they are now, for their photo and when they last used the app; gone once deleted */
  protected person(item: AccessReviewItem) {
    return this.store.usersById().get(item.userId);
  }

  protected setFilter(filter: ItemFilter | null) {
    this.filter.set(filter ?? 'all');
    this.table.resetPage();
  }

  protected async decide(items: AccessReviewItem[], decision: AccessReviewDecision) {
    const review = this.review();
    if (!review || !items.length) {
      return;
    }
    const t = this.translate;
    let note: string | undefined;
    // Taking a role away says why, required where the settings ask a reason for it
    if (decision === 'remove') {
      const reason = await this.reasons.ask('removeRole', {
        title: items.length === 1
          ? t.instant('confirm.removeInReview', { role: items[0].roleName, name: items[0].userName })
          : t.instant('confirm.removeInReviewCount', { count: items.length }),
        message: t.instant('The role is taken away when the review closes. You can change your mind until then.'),
        confirmLabel: t.instant('Remove'),
        tone: 'danger',
      });
      if (reason === null) {
        return;
      }
      note = reason || undefined;
    }
    this.busy.set(true);
    try {
      const decided = await this.store.decideAccessReview(review.id, items.map(item => item.id), decision, note);
      const byId = new Map(decided.map(item => [item.id, item]));
      this.items.update(all => all.map(item => byId.get(item.id) ?? item));
      this.table.clearSelection();
      if (items.length > 1) {
        this.toast.show(t.instant(decision === 'keep' ? 'toast.reviewKept' : 'toast.reviewRemoved', { count: items.length }));
      }
    } catch (error) {
      this.toast.show(t.instant(errorMessage(error)), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  protected async closeNow() {
    const review = this.review();
    if (!review) {
      return;
    }
    const t = this.translate;
    const { remove, undecided } = this.counts();
    const confirmed = await this.confirm.ask({
      title: t.instant('confirm.closeReview', { name: localName(t, review.name) }),
      message: [
        remove ? t.instant('closeReviewRemoves', { count: remove }) : t.instant('No roles are taken away.'),
        undecided ? t.instant('closeReviewUndecided', { count: undecided }) : '',
      ].filter(Boolean).join(' '),
      confirmLabel: t.instant('Close review'),
      cancelLabel: t.instant('Cancel'),
      tone: remove ? 'danger' : 'primary',
    });
    if (!confirmed) {
      return;
    }
    this.busy.set(true);
    try {
      await this.store.closeAccessReview(review.id);
      this.toast.show(t.instant('toast.reviewClosed', { name: localName(t, review.name) }));
      await this.load(review.id);
    } catch (error) {
      this.toast.show(t.instant(errorMessage(error)), 'error');
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove() {
    const review = this.review();
    if (!review) {
      return;
    }
    const t = this.translate;
    const confirmed = await this.confirm.ask({
      title: t.instant('confirm.deleteReview', { name: localName(t, review.name) }),
      message: t.instant('Its decisions are lost, and nobody\'s roles change.'),
      confirmLabel: t.instant('Delete'),
      cancelLabel: t.instant('Cancel'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.store.deleteAccessReview(review.id);
      this.toast.show(t.instant('toast.reviewDeleted', { name: localName(t, review.name) }));
      this.router.navigate(['/access-reviews']);
    } catch (error) {
      this.toast.show(t.instant(errorMessage(error)), 'error');
    }
  }

  /** The report: every role shown, as filtered and sorted, with its decision and, once closed, what became of it */
  protected readonly exportTable = (): TableExport => {
    const t = this.translate;
    const review = this.review();
    const closed = review?.status === 'closed';
    const items = this.table.sorted();
    const scope = (item: AccessReviewItem) => item.branchId ? this.branchName(item.branchId) : t.instant('Whole organization');
    return {
      fileName: 'access-review',
      title: review ? localName(t, review.name) : t.instant('Access reviews'),
      columns: [
        { header: t.instant('Name') }, { header: t.instant('Email') }, { header: t.instant('Role') }, { header: t.instant('Applies in') },
        { header: t.instant('Held since'), date: 'day' }, { header: t.instant('Ends'), date: 'day' }, { header: t.instant('Decision') },
        { header: t.instant('Note') }, { header: t.instant('Decided by') }, { header: t.instant('Decided on'), date: 'time' },
        ...(closed ? [{ header: t.instant('Outcome') }] : []),
      ],
      rows: items.map(item => [
        item.userName, item.email, item.roleName, scope(item), new Date(item.startsAt), item.endsAt ? new Date(item.endsAt) : t.instant('For good'),
        t.instant(item.decision ? REVIEW_DECISIONS[item.decision].label : 'Not decided'), item.note, item.decidedByName,
        item.decidedAt ? new Date(item.decidedAt) : null, ...(closed ? [item.outcome ? t.instant(REVIEW_OUTCOMES[item.outcome].label) : ''] : []),
      ]),
      csv: [
        ['Name', 'Email', 'Role', 'Branch', 'Held since', 'Ends', 'Decision', 'Note', 'Decided by', 'Decided at', ...(closed ? ['Outcome'] : [])],
        ...items.map(item => [
          item.userName, item.email, item.roleName, item.branchId ? this.store.branchesById().get(item.branchId)?.code ?? '' : '',
          item.startsAt.slice(0, 10), item.endsAt?.slice(0, 10) ?? '', item.decision ?? '', item.note, item.decidedByName, item.decidedAt ?? '',
          ...(closed ? [item.outcome ?? ''] : []),
        ]),
      ],
    };
  };

  private async load(id: string) {
    try {
      this.items.set(await this.store.accessReviewItems(id));
      this.failure.set('');
      // Someone with roles waiting for them starts on those
      if (!this.filtered) {
        this.filtered = true;
        if (this.counts().mine && this.counts().mine < this.counts().all) {
          this.filter.set('mine');
        }
      }
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
