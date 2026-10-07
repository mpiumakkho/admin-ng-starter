import { booleanAttribute, ChangeDetectionStrategy, Component, computed, contentChild, Directive, effect, input, signal, ViewEncapsulation } from '@angular/core';
import { NgControl } from '@angular/forms';

/** Gives an <input>, <select> or <textarea> the library's field style */
@Directive({
  selector: 'input[uiInput], select[uiInput], textarea[uiInput]',
  host: { class: 'ui-input' },
})
export class UiInput {}

/**
 * Label, control, hint and error message, laid out as one field. The error shows once the control
 * has been touched or changed, using the first key of `control.errors` found in `errors`.
 *
 *   <ui-form-field label="Email" for="email" required [errors]="{ required: 'Enter an email', email: 'Not a valid email' }">
 *     <input uiInput id="email" formControlName="email" />
 *   </ui-form-field>
 */
@Component({
  selector: 'ui-form-field',
  template: `
    @if (label()) {
      <div class="ui-field-label-row">
        <label class="ui-field-label" [attr.for]="forId() || null">
          {{ label() }}
          @if (required()) {
            <span class="ui-field-required" aria-hidden="true">*</span>
          }
          @if (optionalLabel()) {
            <span class="ui-field-optional">{{ optionalLabel() }}</span>
          }
        </label>
        <ng-content select="[uiFieldAside]" />
      </div>
    }
    <ng-content />
    @if (error(); as message) {
      <p class="ui-field-error" role="alert">{{ message }}</p>
    } @else if (hint()) {
      <p class="ui-field-hint">{{ hint() }}</p>
    }
  `,
  styles: `
    .ui-form-field {
      display: block;
      font-family: var(--ui-font);
    }

    .ui-field-label-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: .5rem;
      margin-bottom: .375rem;
    }

    .ui-field-label {
      margin: 0;
      color: var(--ui-text);
      font-size: .8125rem;
      font-weight: 500;
    }

    .ui-field-required {
      margin-inline-start: .125rem;
      color: var(--ui-danger);
    }

    .ui-field-optional {
      margin-inline-start: .25rem;
      color: var(--ui-subtle);
      font-weight: 400;
    }

    .ui-field-hint,
    .ui-field-error {
      margin: .375rem 0 0;
      font-size: .75rem;
      line-height: 1.4;
    }

    .ui-field-hint {
      color: var(--ui-muted);
    }

    .ui-field-error {
      color: var(--ui-danger-text);
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-form-field' },
})
export class UiFormField {
  readonly label = input('');
  /** The id of the control, so clicking the label focuses it */
  readonly forId = input('', { alias: 'for' });
  readonly hint = input('');
  readonly required = input(false, { transform: booleanAttribute });
  /** Shown after the label for fields that can be left empty, such as "(optional)" */
  readonly optionalLabel = input('');
  /** Message per validation error key, for example { required: '…', email: '…' } */
  readonly errors = input<Record<string, string>>({});

  private readonly control = contentChild(NgControl, { descendants: true });
  // Bumped whenever the control reports a change, so `error` recomputes
  private readonly changes = signal(0);

  protected readonly error = computed(() => {
    this.changes();
    const control = this.control();
    if (!control?.errors || !(control.touched || control.dirty)) {
      return '';
    }
    const messages = this.errors();
    const key = Object.keys(control.errors).find(name => messages[name]);
    return key ? messages[key] : '';
  });

  constructor() {
    effect(onCleanup => {
      const control = this.control()?.control;
      if (control) {
        const subscription = control.events.subscribe(() => this.changes.update(count => count + 1));
        onCleanup(() => subscription.unsubscribe());
      }
    });
  }
}
