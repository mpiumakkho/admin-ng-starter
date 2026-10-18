import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import {
  lucideBell,
  lucideBlocks,
  lucideCopy,
  lucideDownload,
  lucideEllipsis,
  lucidePencil,
  lucidePlus,
  lucideSettings,
  lucideTrash2,
  lucideUserPlus,
  lucideUsers,
  lucideWallet,
} from '@ng-icons/lucide';
import type { ChartData, ChartOptions } from 'chart.js';

import {
  UiAlert,
  UiAvatar,
  UiBadge,
  UiBulkBar,
  UiButton,
  UiCard,
  UiCardActions,
  UiCardFooter,
  UiChartLegend,
  UiCheckbox,
  UiChoice,
  UiChoiceCards,
  UiConfirmService,
  UiDetailItem,
  UiDetailList,
  UiDialog,
  UiDialogFooter,
  UiEmptyState,
  UiFileDropzone,
  UiFilterChips,
  UiFormField,
  UiIconChip,
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
  UiPersonOption,
  UiPersonSelect,
  UiProgress,
  UiSearchInput,
  UiSegmented,
  UiSortHeader,
  UiStatCard,
  UiSwitch,
  UiTable,
  UiTableMinRows,
  UiTableState,
  UiTimeline,
  UiTimelineItem,
  UiToastService,
  UiTrend,
} from '../user-management/ui';
import { areaFill, UI_CHART_PALETTE } from '../user-management/ui/charts/chart-colors';
import { UiChart } from '../user-management/ui/charts/chart.component';

interface Sample {
  id: number;
  name: string;
  team: string;
  score: number;
}

/**
 * Every piece in user-management/ui, with a short usage note. Not in the menu; open /ui-kit.
 * Use it as the reference when building another dashboard on the library.
 */
const FIRST_NAMES = ['Ann', 'Ben', 'Chloe', 'Dan', 'Ella', 'Finn', 'Grace', 'Hugo', 'Isla', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olive',
  'Paul', 'Quinn', 'Ruby', 'Sam', 'Tara', 'Uma', 'Vic', 'Will', 'Xena', 'Yuki', 'Zoe', 'Arun', 'Busaba', 'Chai', 'Dao'];
const LAST_NAMES = ['Adams', 'Baker', 'Carter', 'Davis', 'Evans', 'Foster', 'Green', 'Hughes', 'Irwin', 'Jones', 'Kelly', 'Lewis', 'Moore', 'Nash',
  'Owens', 'Parker', 'Quinn', 'Reed', 'Scott', 'Turner', 'Underwood', 'Vance', 'Walker', 'Young', 'Zimmer', 'Boonmee', 'Chaiyaporn', 'Duangdee',
  'Kaewkla', 'Srisuk', 'Thongdee', 'Wongsa', 'Phromma', 'Saetang', 'Jaidee', 'Meechai', 'Nakorn', 'Panya', 'Rattana', 'Siriwat'];
/** Every first name with every last name, by name */
const SAMPLE_PEOPLE: UiPersonOption[] = FIRST_NAMES.flatMap(first => LAST_NAMES.map(last => ({
  id: `${first}-${last}`.toLowerCase(),
  name: `${first} ${last}`,
  detail: `${first}.${last}@example.com`.toLowerCase(),
}))).sort((a, b) => a.name.localeCompare(b.name));

@Component({
  selector: 'app-ui-kit',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    UiChart,
    UiPageHeader, UiButton, UiCard, UiCardActions, UiCardFooter, UiBadge, UiTrend, UiIconChip, UiAlert,
    UiAvatar, UiPerson, UiPersonSelect, UiStatCard,
    UiSegmented, UiFilterChips, UiSearchInput, UiPagination, UiFormField, UiInput, UiCheckbox, UiSwitch, UiChoiceCards,
    UiFileDropzone, UiDialog, UiDialogFooter, UiEmptyState, UiProgress, UiTable, UiTableMinRows, UiSortHeader, UiBulkBar, UiPageSize, UiTimeline,
    UiTimelineItem, UiDetailList, UiDetailItem, UiMenu, UiMenuItem, UiMenuTrigger, UiMenuDivider, UiChartLegend,
  ],
  templateUrl: './ui-kit.component.html',
  styleUrl: './ui-kit.component.scss',
})
export class UiKitComponent {
  private readonly toast = inject(UiToastService);
  private readonly confirm = inject(UiConfirmService);

  protected readonly icons = {
    page: lucideBlocks, plus: lucidePlus, download: lucideDownload, settings: lucideSettings, more: lucideEllipsis,
    edit: lucidePencil, copy: lucideCopy, remove: lucideTrash2, users: lucideUsers, wallet: lucideWallet, bell: lucideBell, invite: lucideUserPlus,
  };

  /* Buttons */
  protected readonly variants = ['primary', 'secondary', 'soft', 'outline', 'ghost', 'danger', 'danger-soft'] as const;
  protected readonly loading = signal(false);

  protected load() {
    this.loading.set(true);
    setTimeout(() => this.loading.set(false), 1500);
  }

  /* Navigation */
  protected readonly range = signal('7d');
  protected readonly ranges: UiOption[] = [{ value: '24h', label: '24h' }, { value: '7d', label: '7d' }, { value: '30d', label: '30d' }];
  protected readonly tab = signal('general');
  protected readonly tabs: UiOption[] = [
    { value: 'general', label: 'General' },
    { value: 'members', label: 'Members', count: 12 },
    { value: 'billing', label: 'Billing' },
  ];
  protected readonly chip = signal('all');
  protected readonly chips: UiOption[] = [
    { value: 'all', label: 'All', count: 24 },
    { value: 'open', label: 'Open', count: 9 },
    { value: 'closed', label: 'Closed', count: 15 },
  ];
  protected readonly query = signal('');
  protected readonly page = signal(3);
  /** 1,200 people, as an organization of that size would have, for the person picker */
  protected readonly people: UiPersonOption[] = SAMPLE_PEOPLE;
  protected readonly owner = signal<string | null>(null);

  /* Forms */
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly form = this.fb.group({
    email: ['not-an-email', [Validators.required, Validators.email]],
    plan: ['team'],
    notify: [true],
    terms: [false, Validators.requiredTrue],
  });
  protected readonly plans: UiChoice[] = [
    { value: 'solo', title: 'Solo', meta: '$0', description: 'One person' },
    { value: 'team', title: 'Team', meta: '$12', description: 'Up to 20 people' },
    { value: 'company', title: 'Company', meta: '$49', description: 'Unlimited' },
  ];
  protected readonly preview = signal('');
  protected readonly allChecked = signal(false);
  protected readonly someChecked = signal(true);

  protected pick(file: File) {
    this.preview.set(URL.createObjectURL(file));
  }

  protected validate() {
    this.form.markAllAsTouched();
  }

  /* Feedback */
  protected readonly dialogOpen = signal(false);

  protected showToast(tone: 'success' | 'error' | 'info') {
    this.toast.show({ success: 'Saved', error: 'Could not save', info: 'Link copied' }[tone], tone);
  }

  protected async ask() {
    const yes = await this.confirm.ask({ title: 'Delete this project?', message: 'This cannot be undone.', tone: 'danger', confirmLabel: 'Delete' });
    this.toast.show(yes ? 'Deleted' : 'Kept', yes ? 'success' : 'info');
  }

  /* Table */
  private readonly samples = signal<Sample[]>([
    { id: 1, name: 'Aurora', team: 'Design', score: 92 },
    { id: 2, name: 'Basil', team: 'Sales', score: 71 },
    { id: 3, name: 'Cedar', team: 'Engineering', score: 85 },
    { id: 4, name: 'Dahlia', team: 'Support', score: 64 },
    { id: 5, name: 'Elm', team: 'Engineering', score: 78 },
    { id: 6, name: 'Fern', team: 'Design', score: 88 },
  ]);
  protected readonly table = new UiTableState<Sample, 'name' | 'score'>({
    rows: this.samples,
    id: row => row.id,
    pageSize: 4,
    search: (row, query) => row.name.toLowerCase().includes(query) || row.team.toLowerCase().includes(query),
    sorters: { name: (a, b) => a.name.localeCompare(b.name), score: (a, b) => a.score - b.score },
  });

  /* Chart */
  protected readonly legend = [
    { label: 'Visits', color: UI_CHART_PALETTE[0], value: '12.4k' },
    { label: 'Sign-ups', color: UI_CHART_PALETTE[2], value: '1.9k' },
  ];
  protected readonly chartData = computed<ChartData<'line'>>(() => ({
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      { label: 'Visits', data: [18, 22, 19, 27, 31, 26, 34], borderColor: UI_CHART_PALETTE[0], backgroundColor: areaFill(UI_CHART_PALETTE[0]), fill: true },
      { label: 'Sign-ups', data: [6, 8, 7, 9, 12, 10, 13], borderColor: UI_CHART_PALETTE[2], backgroundColor: areaFill(UI_CHART_PALETTE[2]), fill: true },
    ],
  }));
  protected readonly chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false } },
    elements: { point: { radius: 0, hoverRadius: 4 }, line: { borderWidth: 2.5, cubicInterpolationMode: 'monotone' } },
    scales: { x: { grid: { display: false }, border: { display: false } }, y: { border: { display: false } } },
  };
}
