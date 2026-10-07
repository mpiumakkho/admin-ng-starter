import { ChangeDetectionStrategy, Component, forwardRef, input, model, signal, ViewEncapsulation } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { lucideCircle, lucideCircleCheck } from '@ng-icons/lucide';

export interface UiChoice<T = string> {
  value: T;
  title: string;
  description?: string;
  /** Short text at the top right, such as a price or a count */
  meta?: string;
  /** Shown but cannot be picked; say why in the description */
  disabled?: boolean;
}

/**
 * Radio choices as cards, for picking a plan, a role or a layout. Works with two-way binding or forms.
 *
 *   <ui-choice-cards [choices]="roles" formControlName="roleId" ariaLabel="Role" />
 */
@Component({
  selector: 'ui-choice-cards',
  imports: [NgIcon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiChoiceCards), multi: true }],
  template: `
    @for (choice of choices(); track choice.value) {
      <label class="ui-choice" [class.ui-choice-selected]="choice.value === value()" [class.ui-choice-disabled]="disabled() || choice.disabled">
        <input
          type="radio"
          class="ui-sr-only"
          [name]="name"
          [checked]="choice.value === value()"
          [disabled]="disabled() || choice.disabled"
          (change)="select(choice.value)"
          (blur)="onTouched()" />
        <span class="ui-choice-head">
          <span class="ui-choice-title">{{ choice.title }}</span>
          @if (choice.meta) {
            <span class="ui-choice-meta">{{ choice.meta }}</span>
          }
          <ng-icon class="ui-choice-mark" [svg]="choice.value === value() ? checkedIcon : uncheckedIcon" />
        </span>
        @if (choice.description) {
          <span class="ui-choice-description">{{ choice.description }}</span>
        }
      </label>
    }
  `,
  styles: `
    .ui-choice-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(var(--ui-choice-min, 200px), 1fr));
      gap: .75rem;
      font-family: var(--ui-font);
    }

    .ui-choice {
      display: flex;
      flex-direction: column;
      gap: .25rem;
      margin: 0;
      padding: .875rem 1rem;
      border: 1px solid var(--ui-border);
      border-radius: var(--ui-radius-lg);
      background: var(--ui-surface);
      cursor: pointer;
      transition: border-color .15s ease, box-shadow .15s ease, background-color .15s ease;

      &:hover {
        border-color: var(--ui-border-strong);
      }

      &:focus-within {
        box-shadow: var(--ui-ring);
      }
    }

    .ui-choice-selected,
    .ui-choice-selected:hover {
      border-color: var(--ui-primary);
      background: var(--ui-primary-soft);
      box-shadow: 0 0 0 1px var(--ui-primary);

      .ui-choice-mark {
        color: var(--ui-primary);
      }
    }

    .ui-choice-disabled,
    .ui-choice-disabled:hover {
      border-color: var(--ui-border);
      opacity: .6;
      cursor: not-allowed;
    }

    .ui-choice-head {
      display: flex;
      align-items: center;
      gap: .5rem;
    }

    .ui-choice-title {
      flex: 1;
      color: var(--ui-heading);
      font-size: .875rem;
      font-weight: 600;
    }

    .ui-choice-meta {
      color: var(--ui-muted);
      font-size: .75rem;
      font-weight: 500;
      white-space: nowrap;
    }

    .ui-choice-mark {
      color: var(--ui-subtle);
      font-size: 1.125rem;
    }

    .ui-choice-description {
      color: var(--ui-muted);
      font-size: .75rem;
      line-height: 1.45;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-choice-cards', role: 'radiogroup', '[attr.aria-label]': 'ariaLabel() || null' },
})
export class UiChoiceCards<T = string> implements ControlValueAccessor {
  private static nextId = 0;

  readonly choices = input<UiChoice<T>[]>([]);
  readonly value = model<T | null>(null);
  readonly ariaLabel = input('');

  protected readonly name = `ui-choice-${UiChoiceCards.nextId++}`;
  protected readonly checkedIcon = lucideCircleCheck;
  protected readonly uncheckedIcon = lucideCircle;
  protected readonly disabled = signal(false);
  private onChange: (value: T) => void = () => {};
  protected onTouched: () => void = () => {};

  protected select(value: T) {
    this.value.set(value);
    this.onChange(value);
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
