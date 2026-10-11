import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, model, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { translationsChanged } from '../shared/i18n';
import { UiFormField, UiInput } from '../ui';

/** Six digits from the authenticator app, or a recovery code such as "abcde-fghjk", in any case, with or without the dash */
const CODE = /^(\d{6}|[a-z0-9]{5}[\s-]?[a-z0-9]{5})$/i;

/** The control for app-two-factor-code-field: required, and either kind of code */
export function twoFactorCodeControl(): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(CODE)] });
}

/**
 * The code two-step sign-in asks for: six digits from the authenticator app, or, through the link under it, one of the
 * recovery codes (API.md, "Recovery codes"). The form owns the control, made by twoFactorCodeControl(); set its
 * "wrong" error when the server answers invalid_code.
 */
@Component({
  selector: 'app-two-factor-code-field',
  imports: [ReactiveFormsModule, TranslatePipe, UiFormField, UiInput],
  template: `
    <ui-form-field [label]="(recovery() ? 'Recovery code' : 'Code') | translate" [for]="inputId()" [errors]="errors()"
      [hint]="hinted() ? ((recovery() ? recoveryHint : codeHint) | translate) : ''">
      @if (recovery()) {
        <input #input uiInput class="code-input" [id]="inputId()" [formControl]="control()" autocomplete="off" autocapitalize="off"
          spellcheck="false" maxlength="11" placeholder="abcde-fghjk" />
      } @else {
        <input #input uiInput class="code-input" [id]="inputId()" [formControl]="control()" inputmode="numeric"
          autocomplete="one-time-code" maxlength="6" placeholder="123456" />
      }
    </ui-form-field>
    <button type="button" class="code-switch" (click)="switchKind()">
      {{ (recovery() ? 'Use the code from the app' : 'Lost your phone? Use a recovery code') | translate }}
    </button>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: .375rem; }
    .code-input { max-width: 12rem; font-family: var(--ui-font-mono); font-size: 1rem; letter-spacing: .12em; }
    .code-switch {
      align-self: flex-start;
      padding: 0;
      border: 0;
      background: none;
      color: var(--ui-primary-text);
      font: inherit;
      font-size: .8125rem;
      font-weight: 500;
      cursor: pointer;
    }
    .code-switch:hover { text-decoration: underline; }
  `,
})
export class TwoFactorCodeField {
  private readonly translate = inject(TranslateService);
  private readonly i18n = translationsChanged();
  private readonly injector = inject(Injector);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('input');

  readonly control = input.required<FormControl<string>>();
  readonly inputId = input.required<string>();
  /** A recovery code rather than one from the app */
  readonly recovery = model(false);
  /** Without the hint under the field, where the page says the same above it */
  readonly hinted = input(true);

  protected readonly codeHint = 'Type the 6-digit code the app shows.';
  protected readonly recoveryHint = 'Type one of the codes you saved when you turned on two-step sign-in.';

  protected readonly errors = computed<Record<string, string>>(() => {
    this.i18n();
    const missing = this.translate.instant(this.recovery() ? 'Type a recovery code, such as abcde-fghjk.' : 'Type the 6-digit code.');
    return {
      required: missing,
      pattern: missing,
      wrong: this.translate.instant(this.recovery()
        ? 'That recovery code is not right, or it was used already.'
        : 'That code is not right. Codes change every 30 seconds; try the newest one.'),
    };
  });

  focus() {
    this.field()?.nativeElement.focus();
  }

  protected switchKind() {
    this.recovery.update(recovery => !recovery);
    this.control().reset();
    afterNextRender(() => this.focus(), { injector: this.injector });
  }
}
