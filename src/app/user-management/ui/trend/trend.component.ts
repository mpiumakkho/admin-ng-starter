import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideMinus, lucideTrendingDown, lucideTrendingUp } from '@ng-icons/lucide';

/**
 * A change shown as a pill: green going up, red going down, grey when flat.
 *
 *   <ui-trend [value]="12.5" />           +12.5%
 *   <ui-trend [value]="-3" inverse />     -3%, green, because fewer is better here
 */
@Component({
  selector: 'ui-trend',
  imports: [NgIcon],
  template: `<ng-icon [svg]="icon()" />{{ label() }}`,
  styles: `
    .ui-trend {
      display: inline-flex;
      align-items: center;
      gap: .25rem;
      padding: .125rem .5rem;
      border-radius: 999px;
      font: 600 .75rem/1.4 var(--ui-font);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;

      ng-icon {
        font-size: .875rem;
      }
    }

    .ui-trend-good { background: var(--ui-success-soft); color: var(--ui-success-text); }
    .ui-trend-bad { background: var(--ui-danger-soft); color: var(--ui-danger-text); }
    .ui-trend-flat { background: var(--ui-neutral-soft); color: var(--ui-neutral-text); }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"ui-trend ui-trend-" + mood()' },
})
export class UiTrend {
  readonly value = input.required<number>();
  readonly suffix = input('%');
  /** Treat a drop as good news (for errors, churn, costs) */
  readonly inverse = input(false, { transform: booleanAttribute });

  protected readonly mood = computed(() => {
    const value = this.value();
    if (value === 0) {
      return 'flat';
    }
    return (value > 0) !== this.inverse() ? 'good' : 'bad';
  });

  protected readonly icon = computed(() => this.value() > 0 ? lucideTrendingUp : this.value() < 0 ? lucideTrendingDown : lucideMinus);

  protected readonly label = computed(() => {
    const value = this.value();
    const rounded = Math.round(value * 10) / 10;
    return `${value > 0 ? '+' : ''}${rounded}${this.suffix()}`;
  });
}
