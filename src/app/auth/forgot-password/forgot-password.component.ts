import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMail } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AdminApi } from '../../user-management';
import { LocalAdminApi } from '../../user-management/data/local-admin-api';
import { localBackendActive } from '../../user-management/data/local-backend';
import { errorMessage } from '../../user-management/shared/errors';
import { translationsChanged } from '../../user-management/shared/i18n';
import { UiAlert, UiButton, UiFormField, UiInput } from '../../user-management/ui';
import { AuthAsideComponent } from '../auth-aside/auth-aside.component';

/**
 * "Forgot password?": asks for an email and has a reset link sent to it. The answer is the same whether or not the
 * email belongs to someone, so the page cannot be used to find out who has an account.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, NgIcon, TranslatePipe, AuthAsideComponent, UiAlert, UiButton, UiFormField, UiInput],
  templateUrl: './forgot-password.component.html',
  styleUrl: '../auth-form.scss',
  viewProviders: [provideIcons({ lucideMail })],
})
export class ForgotPasswordComponent {
  private readonly api = inject(AdminApi);
  private readonly translate = inject(TranslateService);
  private readonly i18n = translationsChanged();

  protected readonly sending = signal(false);
  /** Translation key of the last failure */
  protected readonly error = signal('');
  /** The address the link went to, once sent */
  protected readonly sentTo = signal('');

  /** With the sample data there is no mail server: the email goes to the browser console */
  protected readonly sampleData = this.api instanceof LocalAdminApi || localBackendActive();

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly errors = computed<Record<string, string>>(() => {
    this.i18n();
    return {
      required: this.translate.instant('This field is required.'),
      email: this.translate.instant('Enter a valid email address.'),
    };
  });

  protected async send() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email } = this.form.getRawValue();
    this.sending.set(true);
    this.error.set('');
    try {
      await this.api.requestPasswordReset(email);
      this.sentTo.set(email);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.sending.set(false);
    }
  }

  /** Back to the form, to try another address */
  protected again() {
    this.sentTo.set('');
  }
}
