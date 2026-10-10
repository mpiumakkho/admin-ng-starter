import { Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck, lucideCopy } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AdminApiError } from '../data/admin-api';
import { AdminStore } from '../data/admin-store';
import { TwoFactorSetup } from '../data/models';
import { errorMessage } from '../shared/errors';
import { translationsChanged } from '../shared/i18n';
import { UiAlert, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput, UiToastService } from '../ui';

/**
 * Turns two-step sign-in on (scan a QR code with an authenticator app, then type a code to prove it works)
 * or off (type a current code). For the signed-in user only.
 */
@Component({
  selector: 'app-two-factor-dialog',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, UiAlert, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput],
  template: `
    <ui-dialog [(open)]="open" (openChange)="!$event && reset()"
      [title]="(mode() === 'enable' ? 'Turn on two-step sign-in' : 'Turn off two-step sign-in') | translate"
      [description]="(mode() === 'enable' ? 'Signing in will need a code from your phone as well as your password.' : 'Signing in will need only your password again.') | translate"
      [closeLabel]="'Close' | translate">
      <!-- No form group here, so the submit event is handled directly rather than through ngSubmit -->
      <form class="two-factor" [id]="formId" (submit)="$event.preventDefault(); submit()" novalidate>
        @if (mode() === 'enable') {
          <ol class="steps">
            <li>
              <p>{{ 'Scan this code with an authenticator app, such as Google Authenticator or Microsoft Authenticator.' | translate }}</p>
              <div class="qr">
                @if (qr(); as image) {
                  <img [src]="image" width="176" height="176" [alt]="'Code to scan with your authenticator app' | translate" />
                } @else if (failed()) {
                  <ui-alert tone="danger">{{ 'Could not start. Close this and try again.' | translate }}</ui-alert>
                } @else {
                  <span class="qr-loading" aria-hidden="true"></span>
                }
              </div>
              @if (setup(); as current) {
                <p class="manual">{{ 'Cannot scan? Type this key into the app instead:' | translate }}</p>
                <div class="secret">
                  <code>{{ grouped(current.secret) }}</code>
                  <button uiButton variant="ghost" size="sm" iconOnly type="button" (click)="copy(current.secret)" [attr.aria-label]="'Copy key' | translate">
                    <ng-icon [svg]="copied() ? icons.done : icons.copy" />
                  </button>
                </div>
              }
            </li>
            <li>
              <p>{{ 'Type the 6-digit code the app shows.' | translate }}</p>
            </li>
          </ol>
        }
        <ui-form-field [label]="'Code' | translate" [for]="formId + '-code'" [errors]="errors()">
          <input uiInput class="code-input" [id]="formId + '-code'" [formControl]="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" />
        </ui-form-field>
      </form>
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="open.set(false); reset()">{{ 'Cancel' | translate }}</button>
        <button uiButton type="submit" [attr.form]="formId" [variant]="mode() === 'enable' ? 'primary' : 'danger'" [loading]="saving()" [disabled]="mode() === 'enable' && !setup()">
          {{ (mode() === 'enable' ? 'Turn on' : 'Turn off') | translate }}
        </button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .two-factor { display: flex; flex-direction: column; gap: 1rem; }
    .steps { display: flex; flex-direction: column; gap: .75rem; margin: 0; padding-inline-start: 1.25rem; color: var(--ui-text); font-size: .8125rem; }
    .steps p { margin: 0 0 .5rem; }
    .qr { display: flex; justify-content: center; align-items: center; min-height: 192px; }
    .qr img { padding: 8px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: #fff; }
    .qr-loading { width: 176px; height: 176px; border-radius: var(--ui-radius); background: var(--ui-surface-muted); }
    .manual { margin-top: .5rem !important; color: var(--ui-muted); }
    .secret { display: flex; align-items: center; gap: .25rem; }
    .secret code { flex: 1; padding: .375rem .625rem; border-radius: var(--ui-radius); background: var(--ui-surface-muted); color: var(--ui-heading); font-family: var(--ui-font-mono); font-size: .8125rem; letter-spacing: .04em; word-break: break-all; }
    .code-input { max-width: 10rem; font-family: var(--ui-font-mono); font-size: 1rem; letter-spacing: .25em; }
  `,
})
export class TwoFactorDialog {
  private static nextId = 0;
  private readonly store = inject(AdminStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly i18n = translationsChanged();

  readonly mode = input<'enable' | 'disable'>('enable');
  readonly open = model(false);

  protected readonly formId = `two-factor-${TwoFactorDialog.nextId++}`;
  protected readonly icons = { copy: lucideCopy, done: lucideCheck };
  protected readonly setup = signal<TwoFactorSetup | null>(null);
  protected readonly qr = signal<SafeUrl | null>(null);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly copied = signal(false);
  protected readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] });

  protected readonly errors = computed<Record<string, string>>(() => {
    this.i18n();
    return {
      required: this.translate.instant('Type the 6-digit code.'),
      pattern: this.translate.instant('Type the 6-digit code.'),
      wrong: this.translate.instant('That code is not right. Codes change every 30 seconds; try the newest one.'),
    };
  });

  constructor() {
    // Each time it opens to turn on, a new secret: one that was shown and abandoned is never used
    effect(() => {
      if (this.open() && this.mode() === 'enable') {
        untracked(() => this.start());
      }
    });
  }

  protected grouped(secret: string) {
    return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
  }

  protected async copy(secret: string) {
    await navigator.clipboard?.writeText(secret).catch(() => undefined);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  protected async submit() {
    if (this.code.invalid) {
      this.code.markAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      if (this.mode() === 'enable') {
        await this.store.confirmTwoFactor(this.code.value);
        this.toast.show(this.translate.instant('Two-step sign-in is on.'));
      } else {
        await this.store.disableTwoFactor(this.code.value);
        this.toast.show(this.translate.instant('Two-step sign-in is off.'));
      }
      this.open.set(false);
      this.reset();
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'invalid_code') {
        this.code.setErrors({ wrong: true });
        this.code.markAsTouched();
      } else {
        this.toast.show(this.translate.instant(errorMessage(error)), 'error');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected reset() {
    this.setup.set(null);
    this.qr.set(null);
    this.failed.set(false);
    this.code.reset();
  }

  private async start() {
    this.reset();
    try {
      const setup = await this.store.startTwoFactor();
      this.setup.set(setup);
      // The QR code library loads only when someone sets this up
      const { renderSVG } = await import('uqr');
      const svg = renderSVG(setup.uri, { pixelSize: 4, blackColor: '#0f172a' });
      this.qr.set(this.sanitizer.bypassSecurityTrustUrl(`data:image/svg+xml;base64,${btoa(svg)}`));
    } catch {
      this.failed.set(true);
    }
  }
}
