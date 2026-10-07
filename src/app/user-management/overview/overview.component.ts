import { Component, computed, inject, signal, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideActivity,
  lucideBan,
  lucideCircleCheck,
  lucideHistory,
  lucideLayoutDashboard,
  lucideMailCheck,
  lucideMailWarning,
  lucideUserPlus,
  lucideUsers,
} from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { ActivityDialog } from '../activity/activity-dialog.component';
import {
  UiButton,
  UiCard,
  UiCardActions,
  UiChartLegend,
  UiEmptyState,
  UiIconChip,
  UiLegendItem,
  UiOption,
  UiPageHeader,
  UiPerson,
  UiProgress,
  UiSegmented,
  UiSplitBar,
  UiSplitPart,
  UiStatCard,
  UiTimeline,
  UiTimelineItem,
  UiToastService,
  UiTone,
} from '../ui';
import { areaFill, syncChartTheme, UI_CHART_PALETTE } from '../ui/charts';
import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { ACTIVITY_META, DEPARTMENTS, STATUS_META } from '../data/catalog';
import { Activity, fullName, User, UserStatus } from '../data/models';
import { ActivityText } from '../shared/activity-text';
import { RoleBadge } from '../shared/badges';
import { intlLocale, TimeAgoPipe } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';

const DAY = 24 * 60 * 60 * 1000;

// Chart colors per role tone, matching the badges
const TONE_COLORS: Record<UiTone, string> = {
  primary: '#6366f1',
  info: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  neutral: '#94a3b8',
};

@Component({
  selector: 'app-overview',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    BaseChartDirective,
    UiPageHeader,
    UiButton,
    UiCard,
    UiCardActions,
    UiStatCard,
    UiSegmented,
    UiSplitBar,
    UiChartLegend,
    UiTimeline,
    UiTimelineItem,
    UiPerson,
    UiProgress,
    UiEmptyState,
    UiIconChip,
    RoleBadge,
    ActivityDialog,
    ActivityText,
    TimeAgoPipe,
  ],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
})
export class OverviewComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly i18n = translationsChanged();
  private readonly charts = viewChildren(BaseChartDirective);

  protected readonly icons = {
    page: lucideLayoutDashboard, users: lucideUsers, active: lucideActivity, joined: lucideUserPlus, invited: lucideMailCheck, arrow: lucideArrowRight,
    stale: lucideMailWarning, suspended: lucideBan, allClear: lucideCircleCheck, history: lucideHistory,
  };
  protected readonly activityMeta = ACTIVITY_META;
  protected readonly fullName = fullName;

  constructor() {
    syncChartTheme(this.charts);
  }

  /* Summary numbers */

  private readonly now = Date.now();

  private joinedBetween(fromDaysAgo: number, toDaysAgo: number) {
    return this.store.users().filter(user => {
      const age = this.now - new Date(user.createdAt).getTime();
      return age >= toDaysAgo * DAY && age < fromDaysAgo * DAY;
    }).length;
  }

  protected readonly total = computed(() => this.store.users().length);
  protected readonly active = computed(() => this.store.users().filter(user => user.status === 'active').length);
  protected readonly invited = computed(() => this.store.users().filter(user => user.status === 'invited').length);
  /** The last 30 days, not the calendar month: early in a month that would be a misleadingly small number */
  protected readonly newThisMonth = computed(() => this.joinedBetween(30, 0));

  /** A difference in people, not a percentage, which runs into the hundreds on numbers this small */
  protected readonly newTrend = computed(() => this.newThisMonth() - this.joinedBetween(60, 30));

  /**
   * Open accounts whose owner signed in during the last 7 days, from each user's last activity: how many
   * people actually use the admin, which the account status alone does not say
   */
  protected readonly recentlyActive = computed(() => this.store.users().filter(user =>
    user.status === 'active' && !!user.lastActiveAt && this.now - new Date(user.lastActiveAt).getTime() < 7 * DAY).length);
  protected readonly recentShare = computed(() => this.active() ? Math.round(this.recentlyActive() / this.active() * 100) : 0);

  /** Accounts by status, under the total */
  protected readonly statusSplit = computed<UiSplitPart[]>(() => {
    this.i18n();
    return (Object.keys(STATUS_META) as UserStatus[]).map(status => ({
      label: this.translate.instant(STATUS_META[status].label),
      value: this.store.users().filter(user => user.status === status).length,
      tone: STATUS_META[status].tone,
    }));
  });

  /* New users per month */

  protected readonly rangeOptions = computed<UiOption<number>[]>(() => {
    this.i18n();
    return [
      { value: 6, label: this.translate.instant('6 months') },
      { value: 12, label: this.translate.instant('12 months') },
    ];
  });
  protected readonly months = signal(12);

  protected readonly signupData = computed<ChartData<'bar'>>(() => {
    this.i18n();
    const count = this.months();
    const formatter = new Intl.DateTimeFormat(intlLocale(this.translate.currentLang() ?? ''), { month: 'short' });
    const today = new Date(this.now);
    const buckets = Array.from({ length: count }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - (count - 1 - index), 1);
      return { key: `${date.getFullYear()}-${date.getMonth()}`, label: formatter.format(date), total: 0 };
    });
    const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]));
    for (const user of this.store.users()) {
      const created = new Date(user.createdAt);
      const bucket = byKey.get(`${created.getFullYear()}-${created.getMonth()}`);
      if (bucket) {
        bucket.total++;
      }
    }
    return {
      labels: buckets.map(bucket => bucket.label),
      datasets: [{
        // Shown in the tooltip
        label: this.translate.instant('New users'),
        data: buckets.map(bucket => bucket.total),
        backgroundColor: UI_CHART_PALETTE[0],
        hoverBackgroundColor: '#4f46e5',
        maxBarThickness: 28,
        borderRadius: 6,
        borderSkipped: false,
      }],
    };
  });

  /** The bar chart's numbers for screen readers, such as "New users per month: Nov 3, Dec 5, …" */
  protected readonly signupSummary = computed(() => {
    const data = this.signupData();
    const values = (data.labels ?? []).map((label, index) => `${label} ${data.datasets[0].data[index]}`).join(', ');
    return this.translate.instant('newUsersChart', { values });
  });

  protected readonly signupOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, border: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 }, border: { display: false } },
    },
  };

  /* Users per role */

  protected readonly roleBreakdown = computed(() => this.store.roles().map(role => ({
    id: role.id,
    label: role.name,
    color: TONE_COLORS[role.tone],
    value: this.store.roleCounts().get(role.id) ?? 0,
  })));

  /** Each role links to the users who have it */
  protected readonly roleLegend = computed<UiLegendItem[]>(() =>
    this.roleBreakdown().map(({ id, ...item }) => ({ ...item, link: '/users', queryParams: { role: id } })));

  protected readonly roleData = computed<ChartData<'doughnut'>>(() => ({
    labels: this.roleBreakdown().map(role => role.label),
    datasets: [{
      data: this.roleBreakdown().map(role => role.value),
      backgroundColor: this.roleBreakdown().map(role => role.color),
      borderWidth: 0,
      spacing: 3,
      borderRadius: 6,
      hoverOffset: 4,
    }],
  }));

  protected readonly roleOptions: ChartOptions<'doughnut'> = {
    cutout: '76%',
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: false } },
  };

  /* Lists */

  protected readonly recentActivity = computed(() => this.store.activity().slice(0, 7));
  /** The entry open in the details dialog */
  protected readonly selectedEntry = signal<Activity | null>(null);

  protected readonly recentlyJoined = computed(() =>
    [...this.store.users()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5));

  /* Needs attention */

  /**
   * Invited people whose last invitation has expired (see the settings), oldest first. The last invitation is
   * the account's creation or a later resend from the activity log, so sending again clears the item.
   */
  protected readonly staleInvites = computed(() => {
    const lastSent = new Map<string, string>();
    for (const entry of this.store.activity()) {
      if (entry.action === 'user.invited' && entry.targetId && entry.at > (lastSent.get(entry.targetId) ?? '')) {
        lastSent.set(entry.targetId, entry.at);
      }
    }
    return this.store.users()
      .filter(user => user.status === 'invited')
      .map(user => {
        const resent = lastSent.get(user.id) ?? '';
        return { user, sentAt: resent > user.createdAt ? resent : user.createdAt };
      })
      .filter(item => this.now - new Date(item.sentAt).getTime() > this.store.settings().inviteExpiryDays * DAY)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  });

  protected readonly suspended = computed(() => this.store.users().filter(user => user.status === 'suspended').length);
  protected readonly resending = signal<string | null>(null);

  protected async resendInvite(user: User) {
    this.resending.set(user.id);
    try {
      await this.store.resendInvite(user.id);
      this.toast.show(this.translate.instant('toast.inviteResent', { email: user.email }));
    } catch {
      this.toast.show(this.translate.instant('Something went wrong. Try again.'), 'error');
    } finally {
      this.resending.set(null);
    }
  }

  protected readonly departments = computed(() => {
    const total = this.total() || 1;
    return DEPARTMENTS
      .map(name => ({ name, count: this.store.users().filter(user => user.department === name).length }))
      .sort((a, b) => b.count - a.count)
      .map(item => ({ ...item, share: Math.round(item.count / total * 100) }));
  });
}
