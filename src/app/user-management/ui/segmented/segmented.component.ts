import { ChangeDetectionStrategy, Component, forwardRef, input, model, signal, ViewEncapsulation } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';

import { UiOption } from '../core/types';

/**
 * Pick one of a few options. `pill` looks like a toggle group, `underline` like tabs.
 * Works with two-way binding or with Angular forms.
 *
 *   <ui-segmented [options]="ranges" [(value)]="range" />
 *   <ui-segmented [options]="statuses" formControlName="status" />
 *   <ui-segmented [options]="tabs" [(value)]="tab" variant="underline" />
 */
@Component({
  selector: 'ui-segmented',
  imports: [NgIcon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiSegmented), multi: true }],
  template: `
    @for (option of options(); track option.value) {
      <button
        type="button"
        class="ui-seg-option"
        [class.ui-seg-active]="option.value === value()"
        [attr.aria-pressed]="option.value === value()"
        [attr.aria-label]="option.ariaLabel || null"
        [attr.title]="option.ariaLabel || null"
        [attr.lang]="option.lang || null"
        [disabled]="disabled()"
        (click)="select(option.value)">
        @if (option.icon) {
          <ng-icon [svg]="option.icon" />
        }
        {{ option.label }}
        @if (option.count !== undefined) {
          <span class="ui-seg-count">{{ option.count }}</span>
        }
      </button>
    }
  `,
  styles: `
    .ui-segmented {
      display: inline-flex;
      max-width: 100%;
      font-family: var(--ui-font);
    }

    .ui-seg-option {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      border: 0;
      background: transparent;
      color: var(--ui-muted);
      font: 600 .8125rem/1 var(--ui-font);
      white-space: nowrap;
      cursor: pointer;
      transition: background-color .15s ease, color .15s ease, box-shadow .15s ease, border-color .15s ease;

      &:hover:not(:disabled) {
        color: var(--ui-heading);
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--ui-ring);
      }

      &:disabled {
        opacity: .5;
        cursor: not-allowed;
      }

      ng-icon {
        font-size: 1rem;
      }
    }

    .ui-seg-count {
      min-width: 1.25rem;
      padding: .125rem .375rem;
      border-radius: 999px;
      background: var(--ui-hover);
      color: var(--ui-muted);
      font-size: .6875rem;
      text-align: center;
    }

    /* Pill: buttons inside a tinted track */
    .ui-segmented-pill {
      gap: 2px;
      padding: 3px;
      border-radius: var(--ui-radius);
      background: var(--ui-hover);

      .ui-seg-option {
        height: 30px;
        padding: 0 .75rem;
        border-radius: .375rem;
      }

      .ui-seg-active {
        background: var(--ui-surface);
        box-shadow: var(--ui-shadow-sm);
        color: var(--ui-heading);
      }

      &.ui-segmented-sm .ui-seg-option {
        height: 26px;
        padding: 0 .625rem;
        font-size: .75rem;
      }
    }

    /* Underline: tabs along a rule */
    .ui-segmented-underline {
      gap: 1.25rem;
      overflow-x: auto;
      border-bottom: 1px solid var(--ui-border);

      .ui-seg-option {
        height: 40px;
        margin-bottom: -1px;
        padding: 0 .125rem;
        border-bottom: 2px solid transparent;
        border-radius: 0;
      }

      .ui-seg-active {
        border-bottom-color: var(--ui-primary);
        color: var(--ui-heading);

        .ui-seg-count {
          background: var(--ui-primary-soft);
          color: var(--ui-primary-text);
        }
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'group',
    '[attr.aria-label]': 'ariaLabel() || null',
    '[class]': '"ui-segmented ui-segmented-" + variant() + " ui-segmented-" + size()',
  },
})
export class UiSegmented<T = string> implements ControlValueAccessor {
  readonly options = input<UiOption<T>[]>([]);
  readonly value = model<T | null>(null);
  readonly variant = input<'pill' | 'underline'>('pill');
  readonly size = input<'sm' | 'md'>('md');
  readonly ariaLabel = input('');

  protected readonly disabled = signal(false);
  private onChange: (value: T) => void = () => {};
  private onTouched: () => void = () => {};

  protected select(value: T) {
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
  }

  writeValue(value: T | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: T) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
