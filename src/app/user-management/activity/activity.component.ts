import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideChevronRight, lucideDownload, lucideHistory, lucideMonitor, lucideSearchX, lucideSmartphone, lucideX } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  UiAvatar,
  UiButton,
  UiCard,
  UiEmptyState,
  UiFilterChips,
  UiIconChip,
  UiInput,
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
import { ACTIVITY_KINDS, ACTIVITY_META, ActivityKind } from '../data/catalog';
import { Activity, fullName, User } from '../data/models';
import { downloadText, toCsv } from '../shared/csv';
import { LocalDatePipe, TimeAgoPipe } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import { ActivityDialog } from './activity-dialog.component';
import { ActivityFormat, ActivityTarget } from './activity-format';

type Kind = ActivityKind | 'all';
type Period = 'all' | 'today' | '7d' | '30d';
type SortKey = 'time' | 'actor' | 'action';

/** One table row: the entry plus the text it shows, worked out once per language */
interface ActivityRow {
  entry: Activity;
  actor: User | undefined;
  actorName: string;
  action: string;
  summary: string;
  target: ActivityTarget | null;
  mobile: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-activity',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    UiPageHeader,
    UiCard,
    UiButton,
    UiSearchInput,
    UiFilterChips,
    UiInput,
    UiTable,
    UiTableMinRows,
    UiTableScrollReset,
    UiSortHeader,
    UiPerson,
    UiAvatar,
    UiIconChip,
    UiPagination,
    UiPageSize,
    UiEmptyState,
    ActivityDialog,
    LocalDatePipe,
    TimeAgoPipe,
  ],
  templateUrl: './activity.component.html',
  styleUrl: './activity.component.scss',
  // Fills the window on desktop; the log scrolls inside when a page has more rows than fit
  host: { class: 'page-fit' },
})
export class ActivityComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly format = inject(ActivityFormat);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly i18n = translationsChanged();

  protected readonly icons = {
    page: lucideHistory, export: lucideDownload, empty: lucideSearchX, open: lucideChevronRight, desktop: lucideMonitor, phone: lucideSmartphone,
    clear: lucideX,
  };
  protected readonly fullName = fullName;
  protected readonly meta = ACTIVITY_META;

  /* Filters */

  protected readonly kind = signal<Kind>('all');
  protected readonly actor = signal('all');
  protected readonly period = signal<Period>('all');

  /** ?user=…: only what one person did or what was done to them, as when opened from their profile */
  readonly userParam = input<string>(undefined, { alias: 'user' });
  protected readonly subject = linkedSignal(() => this.userParam() || null);
  protected readonly subjectUser = computed(() => {
    const id = this.subject();
    return id ? this.store.usersById().get(id) : undefined;
  });
  protected readonly subjectName = computed(() => {
    this.i18n();
    const user = this.subjectUser();
    return user ? fullName(user) : this.translate.instant('Deleted user');
  });

  protected readonly kindOptions = computed<UiOption<Kind>[]>(() => {
    this.i18n();
    // Counted within the person and time range picked, so the numbers match the rows the chips show
    const actor = this.actor();
    const subject = this.subject();
    const since = this.since(this.period());
    const entries = this.store.activity().filter(entry =>
      (actor === 'all' || entry.actorId === actor)
      && (!subject || entry.actorId === subject || entry.targetId === subject)
      && (!since || entry.at >= since));
    const count = (kind: ActivityKind) => entries.filter(entry => ACTIVITY_META[entry.action].kind === kind).length;
    return [
      { value: 'all', label: this.translate.instant('All'), count: entries.length },
      ...(Object.keys(ACTIVITY_KINDS) as ActivityKind[]).map(kind => ({ value: kind, label: this.translate.instant(ACTIVITY_KINDS[kind]), count: count(kind) })),
    ];
  });

  /** People who have done something, for the "Done by" filter */
  protected readonly actors = computed(() => {
    const ids = new Set(this.store.activity().map(entry => entry.actorId));
    return [...ids].map(id => this.store.usersById().get(id)).filter(user => !!user).map(user => ({ id: user.id, name: fullName(user) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  private readonly rows = computed<ActivityRow[]>(() => {
    this.i18n();
    return this.store.activity().map(entry => ({
      entry,
      actor: this.store.usersById().get(entry.actorId),
      actorName: this.format.actorName(entry),
      action: this.format.action(entry),
      summary: this.format.summary(entry),
      target: this.format.target(entry),
      mobile: this.format.isMobile(entry),
    }));
  });

  /** The same sizes as the users list; the table keeps the height of the smallest */
  protected readonly pageSizes = [10, 25, 50, 100];

  protected readonly table = new UiTableState<ActivityRow, SortKey>({
    rows: this.rows,
    id: row => row.entry.id,
    pageSize: this.pageSizes[0],
    pageSizeKey: 'activity-page-size',
    search: (row, query) =>
      [row.actorName, row.actor?.email ?? '', row.entry.targetLabel, row.action, row.summary, row.entry.ip]
        .some(text => text.toLowerCase().includes(query)),
    filter: computed(() => {
      const kind = this.kind();
      const actor = this.actor();
      const subject = this.subject();
      const since = this.since(this.period());
      return (row: ActivityRow) =>
        (kind === 'all' || ACTIVITY_META[row.entry.action].kind === kind)
        && (actor === 'all' || row.entry.actorId === actor)
        && (!subject || row.entry.actorId === subject || row.entry.targetId === subject)
        && (!since || row.entry.at >= since);
    }),
    sorters: {
      time: (a, b) => a.entry.at.localeCompare(b.entry.at),
      actor: (a, b) => a.actorName.localeCompare(b.actorName),
      action: (a, b) => a.action.localeCompare(b.action),
    },
  });

  protected readonly hasFilters = computed(() =>
    !!this.table.query() || this.kind() !== 'all' || this.actor() !== 'all' || this.period() !== 'all' || !!this.subject());

  /* Details */

  protected readonly selected = signal<ActivityRow | null>(null);

  /** ?q=… to open the log already searched, for example from a user's profile */
  readonly q = input<string>();

  constructor() {
    // Newest first, as a log is read
    this.table.sortKey.set('time');
    this.table.sortDirection.set('desc');

    effect(() => {
      const query = this.q();
      untracked(() => this.table.search(query ?? ''));
    });

    // Another person picked through the address: back to the first page
    effect(() => {
      this.userParam();
      untracked(() => this.table.resetPage());
    });
  }

  /** Back to everyone's activity; the address follows, so Back and reload agree */
  protected clearSubject() {
    this.subject.set(null);
    this.table.resetPage();
    this.router.navigate([], { queryParams: { user: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected setKind(kind: Kind | null) {
    this.kind.set(kind ?? 'all');
    this.table.resetPage();
  }

  protected setActor(actor: string) {
    this.actor.set(actor);
    this.table.resetPage();
  }

  protected setPeriod(period: Period) {
    this.period.set(period);
    this.table.resetPage();
  }

  protected clearFilters() {
    this.table.search('');
    this.kind.set('all');
    this.actor.set('all');
    this.period.set('all');
    if (this.subject()) {
      this.clearSubject();
    }
  }

  protected open(row: ActivityRow) {
    this.selected.set(row);
  }

  /** Downloads the filtered log, in the order shown, as a CSV file */
  protected exportCsv() {
    const header = ['Time', 'Done by', 'Email', 'Action', 'Description', 'Details', 'IP address', 'Browser', 'OS', 'Event ID'];
    const rows = this.table.sorted().map(row => [
      row.entry.at, row.actorName, row.actor?.email ?? '', row.entry.action, this.format.sentence(row.entry), row.summary,
      row.entry.ip, row.entry.browser, row.entry.os, row.entry.id,
    ]);
    downloadText('activity.csv', toCsv([header, ...rows]));
    this.toast.show(this.translate.instant('toast.exported', { count: rows.length }));
  }

  /** The earliest time a period includes, as an ISO string, or null for all time */
  private since(period: Period): string | null {
    if (period === 'all') {
      return null;
    }
    if (period === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    return new Date(Date.now() - (period === '7d' ? 7 : 30) * DAY).toISOString();
  }
}
