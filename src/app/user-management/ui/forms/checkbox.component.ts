import { booleanAttribute, ChangeDetectionStrategy, Component, computed, forwardRef, input, model, output, signal, ViewEncapsulation } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck, lucideMinus } from '@ng-icons/lucide';

/**
 * A checkbox with its label as content. Works with two-way binding or with Angular forms.
 *
 *   <ui-checkbox [(checked)]="remember">Remember me</ui-checkbox>
 *   <ui-checkbox formControlName="terms">I agree</ui-checkbox>
 *   <ui-checkbox [checked]="all()" [indeterminate]="some()" (changed)="toggleAll()" ariaLabel="Select all" />
 */
@Component({
  selector: 'ui-checkbox',
  imports: [NgIcon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiCheckbox), multi: true }],
  template: `
    <label class="ui-check">
      <input
        type="checkbox"
        class="ui-check-input"
        [checked]="checked()"
        [indeterminate]="indeterminate()"
        [disabled]="isDisabled()"
        [attr.aria-label]="ariaLabel() || null"
        (change)="toggle($any($event.target).checked)"
        (blur)="onTouched()" />
      <span class="ui-check-box" aria-hidden="true">
        <ng-icon [svg]="indeterminate() ? minusIcon : checkIcon" />
      </span>
      <span class="ui-check-label"><ng-content /></span>
    </label>
  `,
  styleUrl: './checkbox.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-checkbox' },
})
export class UiCheckbox implements ControlValueAccessor {
  readonly checked = model(false);
  readonly indeterminate = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Label for screen readers when the checkbox has no visible text */
  readonly ariaLabel = input('');
  /** The user ticked or unticked the box */
  readonly changed = output<boolean>();

  protected readonly checkIcon = lucideCheck;
  protected readonly minusIcon = lucideMinus;
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
