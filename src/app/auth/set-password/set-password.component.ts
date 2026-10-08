import { Component, computed, inject, input, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AdminApi, AdminApiError } from '../../user-management';
import { NEW_PASSWORD_LENGTH } from '../../user-management/data/access-rules';
import { errorMessage } from '../../user-management/shared/errors';
import { translationsChanged } from '../../user-management/shared/i18n';
import { UiAlert, UiButton, UiFormField, UiInput } from '../../user-management/ui';
import { AuthAsideComponent } from '../auth-aside/auth-aside.component';

/** Which email the link came from */
export type EmailLinkKind = 'invite' | 'reset';

/**
 * Where the links in emails lead: /activate?token=… from an invitation, /reset-password?token=… from a password
 * reset. Both ask for a new password; after that the person signs in with it.
 */
@Component({
  selector: 'app-set-password',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, AuthAsideComponent, UiAlert, UiButton, UiFormField, UiInput],
  templateUrl: './set-password.component.html',
  styleUrl: '../auth-form.scss',
})
export class SetPasswordComponent {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly i18n = translationsChanged();

  /** ?token=…, from the link */
  readonly token = input<string>();
  /** From the route: which email the link came from */
  readonly link = input<EmailLinkKind>('invite');

  protected readonly saving = signal(false);
  /** Translation key of the last refusal */
  protected readonly error = signal('');
  /** The server turned the link down: expired, used already, or never made */
  protected readonly deadLink = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, Validators.minLength(NEW_PASSWORD_LENGTH)]],
    repeat: ['', [Validators.required, (control: AbstractControl) => this.matches(control)]],
  });

  protected readonly errors = computed<Record<string, string>>(() => {
    this.i18n();
    return {
      required: this.translate.instant('This field is required.'),
      minlength: this.translate.instant('Use at least 8 characters.'),
      mismatch: this.translate.instant('The passwords do not match.'),
    };
  });

  protected async save() {
    const token = this.token();
    this.form.controls.repeat.updateValueAndValidity();
    if (!token || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { password } = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');
    try {
      if (this.link() === 'invite') {
        await this.api.acceptInvitation(token, password);
      } else {
        await this.api.confirmPasswordReset(token, password);
      }
      await this.router.navigate(['/login'], { queryParams: { password: this.link() === 'invite' ? 'set' : 'changed' } });
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'invalid_token') {
        this.deadLink.set(true);
      } else {
        this.error.set(errorMessage(error));
      }
    } finally {
      this.saving.set(false);
    }
  }

  private matches(control: AbstractControl): ValidationErrors | null {
    const password = control.parent?.get('password')?.value;
    return control.value && password && control.value !== password ? { mismatch: true } : null;
  }
}
