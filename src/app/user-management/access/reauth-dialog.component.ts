import { afterNextRender, Component, computed, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AdminApiError } from '../data/admin-api';
import { errorMessage } from '../shared/errors';
import { translationsChanged } from '../shared/i18n';
import { UiAlert, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput } from '../ui';
import { Session } from './session';

/** What to tell someone whose sign-in was refused; the email is theirs already, so only the password can be wrong */
const SIGN_IN_ERRORS: Partial<Record<string, string>> = {
  invalid_credentials: 'That password is not right.',
  account_suspended: 'This account is suspended. Ask an administrator to restore it.',
};

/**
 * In the accessible view, a session that ends does not take the person away: they sign in again here, over the page
 * they were on, and carry on with what they had typed (WCAG 2.2.5, 3.2.5). Or they go to the sign-in page, where the
 * usual view takes them at once. Nothing else closes it.
 *
 * Place one in the app shell, as <ui-toaster />.
 */
@Component({
  selector: 'app-reauth-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, UiAlert, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput],
  template: `
    <ui-dialog size="sm" [open]="!!session.paused()" [dismissible]="false" [title]="'Sign in again to carry on' | translate"
      [description]="(session.paused() === 'idle' ? 'reauthIdle' : 'reauthEnded') | translate">
      <form id="reauth-form" class="reauth-form" (submit)="$event.preventDefault(); signIn()" novalidate>
        @if (error()) {
          <ui-alert tone="danger">{{ error() | translate }}</ui-alert>
        }
        <ui-form-field [label]="'Email' | translate" for="reauth-email">
          <input uiInput id="reauth-email" [value]="email()" readonly autocomplete="username" />
        </ui-form-field>
        <ui-form-field [label]="'Password' | translate" for="reauth-password" [errors]="errors()">
          <!-- The dialog opens on the password, the only thing to type -->
          <input uiInput id="reauth-password" type="password" autocomplete="current-password" autofocus [formControl]="password" />
        </ui-form-field>
        @if (codeStep()) {
          <ui-form-field [label]="'Code' | translate" for="reauth-code" [hint]="'Type the 6-digit code the app shows.' | translate" [errors]="errors()">
            <input #codeInput uiInput id="reauth-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" [formControl]="code" />
          </ui-form-field>
        }
      </form>
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="leave()">{{ 'Go to the sign-in page' | translate }}</button>
        <button uiButton type="submit" form="reauth-form" [loading]="busy()">{{ 'Sign in' | translate }}</button>
      </div>
    </ui-dialog>
  `,
  styles: `.reauth-form { display: flex; flex-direction: column; gap: 1rem; }`,
})
export class ReauthDialog {
  protected readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly i18n = translationsChanged();
  private readonly injector = inject(Injector);
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  protected readonly email = computed(() => this.session.user()?.email ?? '');
  protected readonly password = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  protected readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] });
  /** The password was right and the account uses two-step sign-in: now the code from the app */
  protected readonly codeStep = signal(false);
  protected readonly busy = signal(false);
  /** Translation key of the last refusal */
  protected readonly error = signal('');

  protected readonly errors = computed<Record<string, string>>(() => {
    this.i18n();
    return {
      required: this.translate.instant('This field is required.'),
      pattern: this.translate.instant('Type the 6-digit code.'),
    };
  });

  protected async signIn() {
    if (this.password.invalid || (this.codeStep() && this.code.invalid)) {
      this.password.markAsTouched();
      this.code.markAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.session.resume(this.password.value, this.codeStep() ? this.code.value : undefined);
      this.reset();
    } catch (error) {
      const code = error instanceof AdminApiError ? error.code : '';
      if (code === 'two_factor_required') {
        this.codeStep.set(true);
        afterNextRender(() => this.codeInput()?.nativeElement.focus(), { injector: this.injector });
      } else {
        this.error.set(SIGN_IN_ERRORS[code] ?? errorMessage(error));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected leave() {
    this.reset();
    this.session.leave();
  }

  private reset() {
    this.password.reset();
    this.code.reset();
    this.codeStep.set(false);
    this.error.set('');
  }
}
