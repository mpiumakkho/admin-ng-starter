import {
  afterRenderEffect, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, forwardRef, inject, input, model, signal, untracked, viewChild,
  viewChildren, ViewEncapsulation,
} from '@angular/core';
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
 *
 * The chosen option's background (pill) or line (underline) is one mark that slides to the option picked, so the
 * choice moves rather than jumps. Until the mark is measured, and in forced colors, the option marks itself.
 */
@Component({
  selector: 'ui-segmented',
  imports: [NgIcon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiSegmented), multi: true }],
  template: `
    <span #indicator class="ui-seg-indicator" aria-hidden="true"></span>
    @for (option of options(); track option.value) {
      <button
        #option
        type="button"
        class="ui-seg-option"
        [class.ui-seg-active]="option.value === value()"
        [attr.aria-pressed]="option.value === value()"
        [attr.aria-label]="option.ariaLabel || null"
        [attr.title]="option.ariaLabel || null"
        [attr.lang]="option.lang || null"
        [disabled]="disabled() || !!option.disabled"
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
      position: relative;
      display: inline-flex;
      max-width: 100%;
      font-family: var(--ui-font);
    }

    .ui-seg-option {
      position: relative;
      z-index: 1;
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

    /* The mark under the chosen option: placed by script (UiSegmented.place), shown once placed; it slides only after
       the first placing, so it does not fly in from the left when the page opens */
    .ui-seg-indicator {
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      opacity: 0;
      pointer-events: none;
    }

    .ui-seg-sliding > .ui-seg-indicator {
      opacity: 1;
    }

    .ui-seg-ready > .ui-seg-indicator {
      transition: transform var(--ui-duration) var(--ui-ease-standard), width var(--ui-duration) var(--ui-ease-standard),
        opacity var(--ui-duration-fast) ease;
    }

    @media (forced-colors: active) {
      .ui-seg-indicator {
        display: none;
      }
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

      .ui-seg-indicator {
        top: 3px;
        bottom: 3px;
        border-radius: .375rem;
        background: var(--ui-surface);
        box-shadow: var(--ui-shadow-sm);
      }

      // The mark is the chosen option's background now; its focus ring stays its own
      @media (forced-colors: none) {
        &.ui-seg-sliding .ui-seg-active {
          background: transparent;

          &:not(:focus-visible) {
            box-shadow: none;
          }
        }
      }

      &.ui-segmented-sm .ui-seg-option {
        height: 26px;
        padding: 0 .625rem;
        font-size: .75rem;
      }
    }

    /*
     * Underline: tabs along a rule. The row scrolls sideways when the tabs do not fit, which clips anything outside
     * it, so everything stays inside: the rule is a shadow under the tabs, which the chosen tab's line covers, and the
     * focus ring is drawn just inside each tab. Nothing reaches below the row, so it never scrolls up and down.
     */
    .ui-segmented-underline {
      gap: .5rem;
      overflow-x: auto;
      overflow-y: hidden;
      box-shadow: inset 0 -1px 0 var(--ui-border);

      .ui-seg-option {
        height: 40px;
        padding: 0 .5rem;
        border-bottom: 2px solid transparent;
        border-radius: 0;

        &:focus-visible {
          outline-offset: -2px;
          box-shadow: none;
        }
      }

      .ui-seg-active {
        border-bottom-color: var(--ui-primary);
        color: var(--ui-heading);

        .ui-seg-count {
          background: var(--ui-primary-soft);
          color: var(--ui-primary-text);
        }
      }

      .ui-seg-indicator {
        top: auto;
        bottom: 0;
        height: 2px;
        background: var(--ui-primary);
      }

      // The mark is the chosen tab's line now
      @media (forced-colors: none) {
        &.ui-seg-sliding .ui-seg-active {
          border-bottom-color: transparent;
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
    '[class.ui-seg-sliding]': 'placed()',
    '[class.ui-seg-ready]': 'ready()',
  },
})
export class UiSegmented<T = string> implements ControlValueAccessor {
  readonly options = input<UiOption<T>[]>([]);
  readonly value = model<T | null>(null);
  readonly variant = input<'pill' | 'underline'>('pill');
  readonly size = input<'sm' | 'md'>('md');
  readonly ariaLabel = input('');

  protected readonly disabled = signal(false);
  /** The mark sits under the chosen option */
  protected readonly placed = signal(false);
  /** The mark has been placed once, so from now on it slides */
  protected readonly ready = signal(false);
  private onChange: (value: T) => void = () => {};
  private onTouched: () => void = () => {};

  private readonly indicator = viewChild.required<ElementRef<HTMLElement>>('indicator');
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('option');

  constructor() {
    // Labels change width with the language and once the fonts load, and a hidden group gets its size when shown
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.place());
    inject(DestroyRef).onDestroy(() => resized?.disconnect());
    afterRenderEffect(() => {
      const buttons = this.buttons();
      this.value();
      this.options();
      untracked(() => {
        resized?.disconnect();
        buttons.forEach(button => resized?.observe(button.nativeElement));
        this.place();
      });
    });
  }

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

  /** Puts the mark under the chosen option, where the option is now */
  private place() {
    const index = this.options().findIndex(option => option.value === this.value());
    const button = this.buttons()[index]?.nativeElement;
    if (!button || !button.offsetWidth) {
      this.placed.set(false);
      return;
    }
    const indicator = this.indicator().nativeElement;
    indicator.style.transform = `translateX(${button.offsetLeft}px)`;
    indicator.style.width = `${button.offsetWidth}px`;
    this.placed.set(true);
    if (!this.ready()) {
      // After this placing has been drawn, so the first one does not slide
      requestAnimationFrame(() => this.ready.set(true));
    }
  }
}
