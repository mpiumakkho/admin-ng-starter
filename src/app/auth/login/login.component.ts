import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, signal, viewChild } from '@angular/core';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff, lucideLockKeyhole, lucideMail } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AdminApi, AdminApiError, Session } from '../../user-management';
import { LocalAdminApi } from '../../user-management/data/local-admin-api';
import { localBackendActive } from '../../user-management/data/local-backend';
import { DEMO_ACCOUNTS } from '../../user-management/data/mock-data';
import { translationsChanged } from '../../user-management/shared/i18n';
import { UiAlert, UiButton, UiCheckbox, UiFormField, UiInput } from '../../user-management/ui';
import { AuthAsideComponent } from '../auth-aside/auth-aside.component';

/** What to tell someone whose sign-in was refused */
const SIGN_IN_ERRORS: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  account_suspended: 'This account is suspended. Ask an administrator to restore it.',
  invite_pending: 'This account has not been activated yet. Accept the invitation email first.',
  invalid_code: 'That code is not right. Codes change every 30 seconds; try the newest one.',
  too_many_requests: 'Too many attempts. Wait a few minutes and try again.',
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, NgIcon, TranslatePipe, AuthAsideComponent, UiAlert, UiButton, UiCheckbox, UiFormField, UiInput],
  templateUrl: './login.component.html',
  styleUrls: ['../auth-page.scss', './login.component.scss'],
  viewProviders: [provideIcons({ lucideEye, lucideEyeOff, lucideLockKeyhole, lucideMail })],
})
export class LoginComponent {
  private readonly router = inject(Router);
  private readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly i18n = translationsChanged();
  private readonly injector = inject(Injector);
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  /** ?returnUrl=…: the page to open after signing in, set by the guards */
  readonly returnUrl = input<string>();
  /** ?expired=ended or ?expired=idle: why the session ended while the app was open */
  readonly expired = input<string>();
  /** ?password=set or ?password=changed: back from a link in an email, with a new password to sign in with */
  readonly password = input<string>();

  protected readonly showPassword = signal(false);
  protected readonly signingIn = signal(false);
  /** Translation key of the last refusal */
  protected readonly error = signal('');
  /** The password was right and the account uses two-step sign-in: now the code from the app */
  protected readonly codeStep = signal(false);
  protected readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] });

  /** With the sample data, in the browser or behind the pretend server, one account per role to try; a real server has none */
  protected readonly demoAccounts = inject(AdminApi) instanceof LocalAdminApi || localBackendActive() ? DEMO_ACCOUNTS : [];

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true],
  });

  protected readonly errors = computed<Record<string, string>>(() => {
    this.i18n();
    return {
      required: this.translate.instant('This field is required.'),
      email: this.translate.instant('Enter a valid email address.'),
      minlength: this.translate.instant('Use at least 6 characters.'),
      pattern: this.translate.instant('Type the 6-digit code.'),
    };
  });

  protected async signIn() {
    if (this.form.invalid || (this.codeStep() && this.code.invalid)) {
      this.form.markAllAsTouched();
      this.code.markAsTouched();
      return;
    }
    const { email, password, remember } = this.form.getRawValue();
    this.signingIn.set(true);
    this.error.set('');
    try {
      await this.session.signIn(email, password, remember, this.codeStep() ? this.code.value : undefined);
      await this.router.navigateByUrl(this.safeReturnUrl() ?? this.session.homeUrl());
    } catch (error) {
      const code = error instanceof AdminApiError ? error.code : '';
      if (code === 'two_factor_required') {
        this.codeStep.set(true);
        afterNextRender(() => this.codeInput()?.nativeElement.focus(), { injector: this.injector });
      } else {
        this.error.set(SIGN_IN_ERRORS[code] ?? 'Could not sign in. Try again.');
      }
    } finally {
      this.signingIn.set(false);
    }
  }

  /** Back from the code to the email and password, to use another account */
  protected startOver() {
    this.codeStep.set(false);
    this.code.reset();
    this.error.set('');
  }

  /** Fills in a sample account and signs in with it */
  protected signInAs(email: string) {
    this.startOver();
    this.form.setValue({ email, password: 'demo-password', remember: this.form.controls.remember.value });
    this.signIn();
  }

  /** Only addresses inside this app, so a link cannot send someone elsewhere after signing in */
  private safeReturnUrl(): string | null {
    const url = this.returnUrl();
    return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
  }
}
