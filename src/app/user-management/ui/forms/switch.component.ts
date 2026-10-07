import { booleanAttribute, ChangeDetectionStrategy, Component, computed, forwardRef, input, model, output, signal, ViewEncapsulation } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * An on/off switch with a label and an optional description. Works with two-way binding or forms.
 *
 *   <ui-switch [(checked)]="notify" description="News about your account">Email notifications</ui-switch>
 *   <ui-switch formControlName="sendInvite">Send an invitation email</ui-switch>
 */
@Component({
  selector: 'ui-switch',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiSwitch), multi: true }],
  template: `
    <label class="ui-switch-row">
      <span class="ui-switch-text">
        <span class="ui-switch-label"><ng-content /></span>
        @if (description()) {
          <span class="ui-switch-description">{{ description() }}</span>
        }
      </span>
      <input
        type="checkbox"
        role="switch"
        class="ui-switch-input"
        [checked]="checked()"
        [disabled]="isDisabled()"
        [attr.aria-label]="ariaLabel() || null"
        (change)="toggle($any($event.target).checked)"
        (blur)="onTouched()" />
      <span class="ui-switch-track" aria-hidden="true"><span class="ui-switch-knob"></span></span>
    </label>
  `,
  styles: `
    .ui-switch {
      display: block;
      font-family: var(--ui-font);
    }

    .ui-switch-row {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin: 0;
      cursor: pointer;
    }

    .ui-switch-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .ui-switch-label {
      color: var(--ui-heading);
      font-size: .875rem;
      font-weight: 500;

      &:empty {
        display: none;
      }
    }

    .ui-switch-description {
      color: var(--ui-muted);
      font-size: .75rem;
    }

    .ui-switch-input {
      position: absolute;
      inset-inline-end: 0;
      width: 36px;
      height: 20px;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }

    .ui-switch-track {
      position: relative;
      flex-shrink: 0;
      width: 36px;
      height: 20px;
      border-radius: 999px;
      background: var(--ui-border-strong);
      transition: background-color .2s ease, box-shadow .15s ease;
    }

    .ui-switch-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(15, 23, 42, .25);
      transition: transform .2s var(--ui-ease);
    }

    .ui-switch-input:checked + .ui-switch-track {
      background: var(--ui-primary);

      .ui-switch-knob {
        transform: translateX(16px);
      }
    }

    .ui-switch-input:focus-visible + .ui-switch-track {
      box-shadow: var(--ui-ring);
    }

    .ui-switch-input:disabled + .ui-switch-track {
      opacity: .5;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-switch' },
})
export class UiSwitch implements ControlValueAccessor {
  readonly checked = model(false);
  readonly description = input('');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input('');
  readonly changed = output<boolean>();

  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  private onChange: (value: boolean) => void = () => {};
  protected onTouched: () => void = () => {};

  protected toggle(checked: boolean) {
    this.checked.set(checked);
    this.onChange(checked);
    this.changed.emit(checked);
  }

  writeValue(value: boolean): void {
    this.checked.set(!!value);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }
}
