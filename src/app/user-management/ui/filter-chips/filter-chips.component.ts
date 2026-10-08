import { ChangeDetectionStrategy, Component, input, model, ViewEncapsulation } from '@angular/core';

import { UiOption } from '../core/types';

/**
 * A row of pill filters, each with an optional count. One is active at a time.
 *
 *   <ui-filter-chips [options]="statusFilters()" [(value)]="status" />
 */
@Component({
  selector: 'ui-filter-chips',
  template: `
    @for (option of options(); track option.value) {
      <button type="button" class="ui-chip" [class.ui-chip-active]="option.value === value()" [attr.aria-pressed]="option.value === value()" (click)="value.set(option.value)">
        {{ option.label }}
        @if (option.count !== undefined) {
          <span class="ui-chip-count">{{ option.count }}</span>
        }
      </button>
    }
  `,
  styles: `
    .ui-filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: .375rem;
      font-family: var(--ui-font);
    }

    .ui-chip {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      height: 32px;
      padding: 0 .75rem;
      border: 1px solid var(--ui-border);
      border-radius: 999px;
      background: var(--ui-surface);
      color: var(--ui-text);
      font: 500 .8125rem/1 var(--ui-font);
      white-space: nowrap;
      cursor: pointer;
      transition: background-color .15s ease, border-color .15s ease, color .15s ease;

      &:hover:not(.ui-chip-active) {
        background: var(--ui-hover);
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--ui-ring);
      }
    }

    .ui-chip-count {
      min-width: 1.25rem;
      padding: .125rem .375rem;
      border-radius: 999px;
      background: var(--ui-hover);
      color: var(--ui-muted);
      font-size: .6875rem;
      font-weight: 600;
      text-align: center;
    }

    .ui-chip-active {
      border-color: var(--ui-primary);
      background: var(--ui-primary);
      color: var(--ui-on-primary);

      .ui-chip-count {
        // Darker than the chip, so the white count stays readable
        background: rgba(15, 23, 42, .25);
        color: var(--ui-on-primary);
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-filter-chips', role: 'group', '[attr.aria-label]': 'ariaLabel() || null' },
})
export class UiFilterChips<T = string> {
  readonly options = input<UiOption<T>[]>([]);
  readonly value = model<T | null>(null);
  readonly ariaLabel = input('');
}
