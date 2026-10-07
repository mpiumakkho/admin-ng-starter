import { booleanAttribute, ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

import { UiTone } from '../core/types';
import { UiIconChip } from '../icon-chip/icon-chip.component';
import { UiTrend } from '../trend/trend.component';

/**
 * A key number with its label, an icon and how it changed. Content placed inside goes under the number,
 * for example a `ui-split-bar` showing what the total is made of. Wrap the card in an <a> to make the
 * whole card a link, such as to the list behind the number.
 *
 *   <ui-stat-card label="Active users" [value]="1284" [icon]="lucideUserCheck" tone="success" [trend]="4.2" hint="vs last month" />
 *   <ui-stat-card label="New sign-ups" [value]="10" [trend]="7" trendSuffix="" hint="vs the 30 days before" />
 */
@Component({
  selector: 'ui-stat-card',
  imports: [UiIconChip, UiTrend],
  template: `
    <span class="ui-stat-label">{{ label() }}</span>
    @if (icon(); as svg) {
      <ui-icon-chip class="ui-stat-icon" [icon]="svg" [tone]="tone()" />
    }
    <p class="ui-stat-value">{{ value() }}</p>
    @if (trend() !== null || hint()) {
      <div class="ui-stat-meta">
        @if (trend(); as change) {
          <ui-trend [value]="change" [suffix]="trendSuffix()" [inverse]="inverse()" />
        } @else if (trend() === 0) {
          <ui-trend [value]="0" [suffix]="trendSuffix()" />
        }
        @if (hint()) {
          <span>{{ hint() }}</span>
        }
      </div>
    }
    <div class="ui-stat-extra"><ng-content /></div>
  `,
  styles: `
    // The icon sits beside the label and the number instead of above them, which keeps the card short
    .ui-stat-card {
      // Lets the card drop its icon when it is narrow, whatever the screen
      container-type: inline-size;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-content: start;
      column-gap: .75rem;
      padding: 1rem 1.25rem;
      border: 1px solid var(--ui-border);
      border-radius: var(--ui-radius-lg);
      background: var(--ui-surface);
      box-shadow: var(--ui-shadow-xs);
      font-family: var(--ui-font);
      transition: box-shadow .2s ease;

      &:hover {
        box-shadow: var(--ui-shadow-md);
      }
    }

    .ui-stat-label {
      grid-column: 1;
      color: var(--ui-muted);
      font-size: .8125rem;
      font-weight: 500;
      line-height: 1.4;
    }

    .ui-stat-icon {
      grid-column: 2;
      grid-row: 1 / span 2;
    }

    .ui-stat-value {
      grid-column: 1;
      margin: .25rem 0 .5rem;
      color: var(--ui-heading);
      font-size: 1.75rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: -.025em;
      line-height: 1.2;
    }

    a:has(> .ui-stat-card) {
      display: block;
      border-radius: var(--ui-radius-lg);
      color: inherit;
      text-decoration: none;

      > .ui-stat-card {
        height: 100%;
      }

      &:hover {
        text-decoration: none;

        > .ui-stat-card {
          border-color: var(--ui-border-strong);
          box-shadow: var(--ui-shadow-md);
        }
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--ui-ring);
      }
    }

    .ui-stat-meta,
    .ui-stat-extra {
      grid-column: 1 / -1;
    }

    @container (max-width: 160px) {
      // Through the card, so it outranks the chip's own display whatever order the styles load in
      .ui-stat-card .ui-stat-icon {
        display: none;
      }

      .ui-stat-value {
        font-size: 1.5rem;
      }
    }

    .ui-stat-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .5rem;
      color: var(--ui-muted);
      font-size: .8125rem;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-stat-card' },
})
export class UiStatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  /** SVG markup, for example a Lucide icon */
  readonly icon = input<string>();
  readonly tone = input<UiTone>('primary');
  /** Change shown in a pill; leave unset to hide it */
  readonly trend = input<number | null>(null);
  /** After the trend number: '%' for a percentage, '' for a count */
  readonly trendSuffix = input('%');
  /** A drop is good news for this number */
  readonly inverse = input(false, { transform: booleanAttribute });
  /** Short note after the trend, such as "vs last month" */
  readonly hint = input('');
}
