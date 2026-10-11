import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { CanDeactivateFn } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideSave, lucideSettings } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { ACTIVITY_RETENTION_DAYS, INVITE_EXPIRY_DAYS, PASSWORD_HISTORY, PASSWORD_MIN_LENGTHS, SESSION_TIMEOUT_MINUTES } from '../data/catalog';
import { AdminSettings } from '../data/models';
import { errorMessage } from '../shared/errors';
import { idleTimeoutLabel, passwordHistoryLabel, retentionLabel } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import {
  UiAlert,
  UiButton,
  UiCard,
  UiCheckbox,
  UiCardFooter,
  UiConfirmService,
  UiFormField,
  UiInput,
  UiOption,
  UiPageHeader,
  UiSegmented,
  UiSwitch,
  UiToastService,
} from '../ui';

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** "example.com, Example.co.th" → ["example.com", "example.co.th"] */
function parseDomains(text: string): string[] {
  return [...new Set(text.split(/[,\s]+/).map(domain => domain.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
}

function validDomains(control: AbstractControl): ValidationErrors | null {
  return parseDomains(String(control.value ?? '')).every(domain => DOMAIN.test(domain)) ? null : { domains: true };
}

/** How new accounts and sign-ins work. Anyone with settings.view can read it; settings.manage can change it. */
@Component({
  selector: 'app-settings',
  // Fills the window on desktop, the buttons at the bottom as on the pages with tables; the settings scroll inside
  // the card when they are taller than the window
  host: { class: 'page-fit' },
  imports: [
    ReactiveFormsModule, NgIcon, TranslatePipe, UiPageHeader, UiAlert, UiCard, UiCardFooter, UiButton, UiCheckbox, UiFormField, UiInput,
    UiSegmented, UiSwitch,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  protected readonly store = inject(AdminStore);
  private readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly confirm = inject(UiConfirmService);
  private readonly i18n = translationsChanged();

  protected readonly icons = { page: lucideSettings, save: lucideSave };
  protected readonly canManage = computed(() => this.session.can('settings.manage'));
  protected readonly saving = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    defaultRoleId: ['', Validators.required],
    allowedDomains: ['', validDomains],
    inviteExpiryDays: [7],
    sessionTimeoutMinutes: [0],
    twoFactorRoleIds: [[] as string[]],
    passwordMinLength: [8],
    passwordHistory: [0],
    activityRetentionDays: [730],
    branchesEnabled: [false],
  });

  protected readonly expiryOptions = computed<UiOption<number>[]>(() => {
    this.i18n();
    return INVITE_EXPIRY_DAYS.map(days => ({ value: days, label: this.translate.instant('dayCount', { count: days }) }));
  });

  protected readonly timeoutOptions = computed(() => {
    this.i18n();
    return SESSION_TIMEOUT_MINUTES.map(minutes => ({ value: minutes, label: idleTimeoutLabel(this.translate, minutes) }));
  });

  protected readonly passwordLengthOptions = computed(() => {
    this.i18n();
    return PASSWORD_MIN_LENGTHS.map(count => ({ value: count, label: this.translate.instant('characterCount', { count }) }));
  });

  protected readonly historyOptions = computed(() => {
    this.i18n();
    return PASSWORD_HISTORY.map(count => ({ value: count, label: passwordHistoryLabel(this.translate, count) }));
  });

  protected readonly retentionOptions = computed(() => {
    this.i18n();
    return ACTIVITY_RETENTION_DAYS.map(days => ({ value: days, label: retentionLabel(this.translate, days) }));
  });

  protected readonly errorMessages = computed<Record<string, string>>(() => {
    this.i18n();
    return {
      required: this.translate.instant('This field is required.'),
      domains: this.translate.instant('Enter domains such as example.com, separated by commas.'),
    };
  });

  ngOnInit() {
    this.reset(this.store.settings());
    if (!this.canManage()) {
      this.form.disable();
    }
  }

  protected discard() {
    this.reset(this.store.settings());
  }

  protected async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    try {
      const settings = await this.store.updateSettings({ ...value, allowedDomains: parseDomains(value.allowedDomains) });
      this.reset(settings);
      this.toast.show(this.translate.instant('Settings saved.'));
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    } finally {
      this.saving.set(false);
    }
  }

  /** Ticks or unticks a role in the list that must use two-step sign-in */
  protected toggleTwoFactorRole(roleId: string, required: boolean) {
    const control = this.form.controls.twoFactorRoleIds;
    const others = control.value.filter(id => id !== roleId);
    control.setValue(required ? [...others, roleId] : others);
    control.markAsDirty();
  }

  /** Saving would hold the signed-in administrator back until they turn on two-step sign-in themselves (API.md) */
  protected holdsBackSelf(): boolean {
    const me = this.session.user();
    const required = this.form.controls.twoFactorRoleIds.value;
    return !!me && !me.twoFactor && this.session.roles().some(role => required.includes(role.id));
  }

  /** Asks before leaving with unsaved changes */
  canLeave(): boolean | Promise<boolean> {
    // After the session ended there is nothing to save to, so leave without asking
    if (!this.form.dirty || !this.session.signedIn()) {
      return true;
    }
    return this.confirm.ask({
      title: this.translate.instant('Discard your changes?'),
      message: this.translate.instant('The changes you made on this page are not saved yet.'),
      confirmLabel: this.translate.instant('Discard'),
      cancelLabel: this.translate.instant('Keep editing'),
      tone: 'danger',
    });
  }

  private reset(settings: AdminSettings) {
    this.form.reset({ ...settings, allowedDomains: settings.allowedDomains.join(', ') });
  }
}

export const confirmLeaveSettings: CanDeactivateFn<SettingsComponent> = component => component.canLeave();
