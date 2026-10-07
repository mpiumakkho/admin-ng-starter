import { Component, computed, inject, signal, viewChildren } from '@angular/core';
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
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

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
import { areaFill, syncChartTheme, UI_CHART_PALETTE } from '../user-management/ui/charts';

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
@Component({
  selector: 'app-ui-kit',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    BaseChartDirective,
    UiPageHeader, UiButton, UiCard, UiCardActions, UiCardFooter, UiBadge, UiTrend, UiIconChip, UiAlert,
    UiAvatar, UiPerson, UiStatCard,
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
  private readonly charts = viewChildren(BaseChartDirective);

  protected readonly icons = {
    page: lucideBlocks, plus: lucidePlus, download: lucideDownload, settings: lucideSettings, more: lucideEllipsis,
    edit: lucidePencil, copy: lucideCopy, remove: lucideTrash2, users: lucideUsers, wallet: lucideWallet, bell: lucideBell, invite: lucideUserPlus,
  };

  constructor() {
    syncChartTheme(this.charts);
  }

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
