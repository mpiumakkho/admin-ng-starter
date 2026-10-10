import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { UiTone } from '../core/types';

/**
 * A vertical list of events joined by a line.
 *
 *   <ui-timeline>
 *     <ui-timeline-item [icon]="lucideUserPlus" tone="success" time="2 hours ago">Henry added Jane</ui-timeline-item>
 *   </ui-timeline>
 */
@Component({
  selector: 'ui-timeline',
  template: `<ng-content />`,
  styles: `
    .ui-timeline {
      display: flex;
      flex-direction: column;
      font-family: var(--ui-font);
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-timeline', role: 'list' },
})
export class UiTimeline {}

@Component({
  selector: 'ui-timeline-item',
  imports: [NgIcon],
  template: `
    <span class="ui-tl-marker" [class]="'ui-tl-marker ui-tl-' + tone()">
      @if (icon(); as svg) {
        <ng-icon [svg]="svg" />
      }
    </span>
    <div class="ui-tl-body">
      <div class="ui-tl-content"><ng-content /></div>
      @if (time()) {
        <span class="ui-tl-time">{{ time() }}</span>
      }
    </div>
  `,
  styles: `
    .ui-timeline-item {
      position: relative;
      display: flex;
      gap: .875rem;
      padding-bottom: 1.125rem;

      // The connecting line, from under this marker to the next one
      &::before {
        content: "";
        position: absolute;
        top: 32px;
        bottom: 0;
        inset-inline-start: 15px;
        width: 2px;
        border-radius: 2px;
        background: var(--ui-border);
      }

      &:last-child {
        padding-bottom: 0;

        &::before {
          display: none;
        }
      }
    }

    .ui-tl-marker {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--ui-tl-bg);
      color: var(--ui-tl-fg);
      font-size: .9375rem;
      box-shadow: 0 0 0 4px var(--ui-surface);
    }

    .ui-tl-primary { --ui-tl-bg: var(--ui-primary-soft); --ui-tl-fg: var(--ui-primary-text); }
    .ui-tl-success { --ui-tl-bg: var(--ui-success-soft); --ui-tl-fg: var(--ui-success-text); }
    .ui-tl-warning { --ui-tl-bg: var(--ui-warning-soft); --ui-tl-fg: var(--ui-warning-text); }
    .ui-tl-danger { --ui-tl-bg: var(--ui-danger-soft); --ui-tl-fg: var(--ui-danger-text); }
    .ui-tl-info { --ui-tl-bg: var(--ui-info-soft); --ui-tl-fg: var(--ui-info-text); }
    .ui-tl-neutral { --ui-tl-bg: var(--ui-neutral-soft); --ui-tl-fg: var(--ui-neutral-text); }

    .ui-tl-body {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: .125rem 1rem;
      min-width: 0;
      padding-top: .375rem;
    }

    .ui-tl-content {
      min-width: 0;
      color: var(--ui-text);
      font-size: .875rem;
      line-height: 1.45;
    }

    .ui-tl-time {
      color: var(--ui-subtle);
      font-size: .75rem;
      white-space: nowrap;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-timeline-item', role: 'listitem' },
})
export class UiTimelineItem {
  /** SVG markup, for example a Lucide icon */
  readonly icon = input<string>();
  readonly tone = input<UiTone>('neutral');
  readonly time = input('');
}

/**
 * Label and value pairs, such as a profile's details.
 *
 *   <ui-detail-list [columns]="2">
 *     <ui-detail-item label="Email">jane@example.com</ui-detail-item>
 *   </ui-detail-list>
 */
@Component({
  selector: 'ui-detail-list',
  template: `<ng-content />`,
  styles: `
    .ui-detail-list {
      display: grid;
      grid-template-columns: repeat(var(--ui-detail-columns, 1), minmax(0, 1fr));
      gap: 1.125rem 1.5rem;
      font-family: var(--ui-font);

      @media (max-width: 575px) {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-detail-list', '[style.--ui-detail-columns]': 'columns()' },
})
export class UiDetailList {
  readonly columns = input(1);
}

@Component({
  selector: 'ui-detail-item',
  template: `
    @if (labelTitle()) {
      <abbr class="ui-detail-label" [title]="labelTitle()">{{ label() }}</abbr>
    } @else {
      <span class="ui-detail-label">{{ label() }}</span>
    }
    <span class="ui-detail-value"><ng-content /></span>
  `,
  styles: `
    .ui-detail-item {
      display: flex;
      flex-direction: column;
      gap: .25rem;
      min-width: 0;
    }

    .ui-detail-label {
      color: var(--ui-muted);
      font-size: .75rem;
      font-weight: 500;
    }

    .ui-detail-value {
      overflow-wrap: anywhere;
      color: var(--ui-heading);
      font-size: .875rem;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-detail-item' },
})
export class UiDetailItem {
  readonly label = input.required<string>();
  /** What an abbreviation in the label stands for, shown on hover and read by screen readers (WCAG 3.1.4) */
  readonly labelTitle = input('');
}

/**
 * A thin progress bar, with an optional label and value above it.
 *
 *   <ui-progress [value]="72" tone="success" label="Admins" valueLabel="18 of 25" />
 */
@Component({
  selector: 'ui-progress',
  template: `
    @if (label() || valueLabel()) {
      <div class="ui-progress-head">
        <span class="ui-progress-label">{{ label() }}</span>
        <span class="ui-progress-value">{{ valueLabel() }}</span>
      </div>
    }
    <div class="ui-progress-track" role="progressbar" [attr.aria-valuenow]="clamped()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="label() || null">
      <div class="ui-progress-bar" [class]="'ui-progress-bar ui-progress-' + tone()" [style.width.%]="clamped()"></div>
    </div>
  `,
  styles: `
    .ui-progress {
      display: block;
      font-family: var(--ui-font);
    }

    .ui-progress-head {
      display: flex;
      justify-content: space-between;
      gap: .5rem;
      margin-bottom: .5rem;
      font-size: .8125rem;
    }

    .ui-progress-label {
      color: var(--ui-heading);
      font-weight: 500;
    }

    .ui-progress-value {
      color: var(--ui-muted);
      font-variant-numeric: tabular-nums;
    }

    .ui-progress-track {
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--ui-hover);
    }

    .ui-progress-bar {
      height: 100%;
      border-radius: inherit;
      transition: width .4s var(--ui-ease);
    }

    .ui-progress-primary { background: var(--ui-primary); }
    .ui-progress-success { background: var(--ui-success); }
    .ui-progress-warning { background: var(--ui-warning); }
    .ui-progress-danger { background: var(--ui-danger); }
    .ui-progress-info { background: var(--ui-info); }
    .ui-progress-neutral { background: var(--ui-neutral); }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-progress' },
})
export class UiProgress {
  readonly value = input.required<number>();
  readonly tone = input<UiTone>('primary');
  readonly label = input('');
  readonly valueLabel = input('');

  protected readonly clamped = computed(() => Math.min(100, Math.max(0, this.value())));
}

export interface UiSplitPart {
  label: string;
  value: number;
  tone: UiTone;
}

/**
 * One thin bar split into colored parts by size, with their labels and numbers under it. For what a
 * total is made of, such as accounts by status.
 *
 *   <ui-split-bar [parts]="[{ label: 'Active', value: 40, tone: 'success' }, { label: 'Suspended', value: 5, tone: 'danger' }]" />
 */
@Component({
  selector: 'ui-split-bar',
  template: `
    <div class="ui-split-track" role="img" [attr.aria-label]="summary()">
      @for (part of parts(); track part.label) {
        @if (part.value > 0) {
          <span [class]="'ui-split-part ui-split-' + part.tone" [style.flex-grow]="part.value"></span>
        }
      }
    </div>
    <div class="ui-split-legend" aria-hidden="true">
      @for (part of parts(); track part.label) {
        <span class="ui-split-key">
          <span [class]="'ui-split-dot ui-split-' + part.tone"></span>
          {{ part.label }}
          <span class="ui-split-value">{{ part.value }}</span>
        </span>
      }
    </div>
  `,
  styles: `
    .ui-split-bar {
      display: block;
      font-family: var(--ui-font);
    }

    .ui-split-track {
      display: flex;
      gap: 2px;
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--ui-hover);
    }

    .ui-split-part {
      flex-basis: 0;
      transition: flex-grow .4s var(--ui-ease);
    }

    .ui-split-legend {
      display: flex;
      flex-wrap: wrap;
      gap: .125rem .5rem;
      margin-top: .5rem;
      color: var(--ui-muted);
      font-size: .75rem;
    }

    .ui-split-key {
      display: inline-flex;
      align-items: center;
      gap: .25rem;
      white-space: nowrap;
    }

    .ui-split-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .ui-split-value {
      color: var(--ui-heading);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .ui-split-primary { background: var(--ui-primary); }
    .ui-split-success { background: var(--ui-success); }
    .ui-split-warning { background: var(--ui-warning); }
    .ui-split-danger { background: var(--ui-danger); }
    .ui-split-info { background: var(--ui-info); }
    .ui-split-neutral { background: var(--ui-neutral); }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-split-bar' },
})
export class UiSplitBar {
  readonly parts = input.required<UiSplitPart[]>();

  /** What screen readers hear for the bar, such as "Active 40, Suspended 5" */
  protected readonly summary = computed(() => this.parts().map(part => `${part.label} ${part.value}`).join(', '));
}

export interface UiLegendItem {
  label: string;
  color: string;
  value?: string | number;
  /** Router link that makes the item clickable, for example to a list filtered by it */
  link?: string | unknown[];
  queryParams?: Record<string, string>;
}

/**
 * Colored dots with labels, for a chart drawn elsewhere. `list` stacks them with values on the right.
 * Items with a `link` are links.
 *
 *   <ui-chart-legend [items]="[{ label: 'Admins', color: '#6366f1', value: 12, link: '/users', queryParams: { role: 'admin' } }]" layout="list" />
 */
@Component({
  selector: 'ui-chart-legend',
  imports: [NgTemplateOutlet, RouterLink],
  template: `
    @for (item of items(); track item.label) {
      @if (item.link) {
        <a class="ui-legend-item ui-legend-link" [routerLink]="item.link" [queryParams]="item.queryParams">
          <ng-container [ngTemplateOutlet]="content" [ngTemplateOutletContext]="{ $implicit: item }" />
        </a>
      } @else {
        <span class="ui-legend-item">
          <ng-container [ngTemplateOutlet]="content" [ngTemplateOutletContext]="{ $implicit: item }" />
        </span>
      }
    }
    <ng-template #content let-item>
      <span class="ui-legend-dot" [style.background]="item.color"></span>
      <span class="ui-legend-label">{{ item.label }}</span>
      @if (item.value !== undefined) {
        <span class="ui-legend-value">{{ item.value }}</span>
      }
    </ng-template>
  `,
  styles: `
    .ui-chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: .375rem 1.25rem;
      font-family: var(--ui-font);
      font-size: .8125rem;
    }

    .ui-legend-item {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      color: var(--ui-muted);
    }

    .ui-legend-link {
      border-radius: .375rem;
      text-decoration: none;

      &:hover {
        text-decoration: none;

        .ui-legend-label {
          color: var(--ui-heading);
        }
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--ui-ring);
      }
    }

    .ui-legend-dot {
      width: 8px;
      height: 8px;
      flex-shrink: 0;
      border-radius: 50%;
    }

    .ui-legend-value {
      color: var(--ui-heading);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .ui-chart-legend-list {
      flex-direction: column;
      flex-wrap: nowrap;
      gap: 0;

      .ui-legend-item {
        padding: .625rem 0;
        border-top: 1px solid var(--ui-border);
      }

      .ui-legend-label {
        flex: 1;
        color: var(--ui-text);
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"ui-chart-legend ui-chart-legend-" + layout()' },
})
export class UiChartLegend {
  readonly items = input<UiLegendItem[]>([]);
  readonly layout = input<'inline' | 'list'>('inline');
}
