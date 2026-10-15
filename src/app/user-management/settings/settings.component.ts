import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { CanDeactivateFn, Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideHistory, lucideKeyRound, lucideSave, lucideSettings, lucideShieldCheck, lucideUndo2, lucideUserPlus } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';

import { Session } from '../access/session';
import { ActivityFormat } from '../activity/activity-format';
import { AdminStore } from '../data/admin-store';
import {
  ACTIVITY_RETENTION_DAYS, EMAIL_LANGUAGES, INVITE_EXPIRY_DAYS, PASSWORD_HISTORY, PASSWORD_MIN_LENGTHS, REASON_ACTIONS, REAUTH_MINUTES,
  SESSION_TIMEOUT_MINUTES, SUSPEND_INACTIVE_DAYS,
} from '../data/catalog';
import { ActivityChange, AdminSettings, Language, ReasonAction } from '../data/models';
import { errorMessage } from '../shared/errors';
import { idleTimeoutLabel, inactiveLabel, passwordHistoryLabel, reauthLabel, retentionLabel } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiCheckbox,
  UiCardFooter,
  UiConfirmService,
  UiDialog,
  UiDialogFooter,
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

type SettingKey = keyof AdminSettings;

/** The settings kept as a list: a change adds or takes away items, in any order */
const LIST_SETTINGS: readonly SettingKey[] = ['allowedDomains', 'twoFactorRoleIds', 'reasonsRequired'];

/** The groups of settings in the list on the left, each setting in one group, in the order they show */
export const SETTINGS_SECTIONS = [
  {
    key: 'new-users', label: 'New users', description: 'What people start with when an admin adds or invites them.', icon: lucideUserPlus,
    fields: ['defaultRoleId', 'inviteExpiryDays', 'allowedDomains', 'defaultLanguage', 'branchesEnabled'],
  },
  {
    key: 'sign-in', label: 'Sign-in', description: 'Keeps accounts safe on shared or unattended computers.', icon: lucideShieldCheck,
    fields: ['sessionTimeoutMinutes', 'reauthMinutes', 'suspendInactiveDays', 'twoFactorRoleIds'],
  },
  {
    key: 'passwords', label: 'Passwords', description: 'Rules for new passwords. They apply the next time someone sets one.', icon: lucideKeyRound,
    fields: ['passwordMinLength', 'passwordHistory'],
  },
  {
    key: 'activity-log', label: 'Activity log', description: 'How long each change stays in the log, and which changes must say why.',
    icon: lucideHistory, fields: ['activityRetentionDays', 'reasonsRequired'],
  },
] as const satisfies readonly { key: string; label: string; description: string; icon: string; fields: readonly SettingKey[] }[];

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** A setting changed on the page and not saved yet, in the shape the activity log keeps once it is saved */
interface PendingChange extends ActivityChange {
  field: SettingKey;
  section: SettingsSection;
}

/**
 * How new accounts and sign-ins work. Anyone with settings.view can read it; settings.manage can change it.
 *
 * The groups of settings are listed as the roles are on their page, one open at a time (?section=…). Unlike roles, the
 * settings are one record saved at once: a change in one group stays while another is open, the list marks the groups
 * with changes, and one Save sends all of them, so the log has one entry and the password is asked for once.
 */
@Component({
  selector: 'app-settings',
  // Fills the window on desktop, the buttons at the bottom as on the pages with tables; the settings scroll inside
  // the card when they are taller than the window
  host: { class: 'page-fit' },
  imports: [
    ReactiveFormsModule, NgIcon, TranslatePipe, UiPageHeader, UiAlert, UiBadge, UiCard, UiCardFooter, UiButton, UiCheckbox, UiDialog,
    UiDialogFooter, UiFormField, UiInput, UiSegmented, UiSwitch,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  protected readonly store = inject(AdminStore);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly confirm = inject(UiConfirmService);
  private readonly format = inject(ActivityFormat);
  private readonly i18n = translationsChanged();

  /** From ?section=…; the first group when there is none */
  readonly section = input<string>();

  protected readonly icons = { page: lucideSettings, save: lucideSave, undo: lucideUndo2 };
  protected readonly sections = SETTINGS_SECTIONS;
  protected readonly canManage = computed(() => this.session.can('settings.manage'));
  protected readonly saving = signal(false);
  /** The list of the changes not saved yet is open */
  protected readonly reviewing = signal(false);

  protected readonly selected = computed<SettingsSection>(() =>
    SETTINGS_SECTIONS.find(section => section.key === this.section()) ?? SETTINGS_SECTIONS[0]);

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
    reasonsRequired: [[] as ReasonAction[]],
    reauthMinutes: [10],
    suspendInactiveDays: [0],
    defaultLanguage: ['th' as Language],
  });

  /** What the form holds now, after every edit, touch or check */
  private readonly value = toSignal(this.form.events.pipe(map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });

  /** Each setting that differs from the saved one, in the order of the groups; changing one back takes it off */
  protected readonly changes = computed<PendingChange[]>(() => {
    const saved = this.store.settings();
    const now = this.toSettings(this.value());
    return SETTINGS_SECTIONS.flatMap(section => section.fields.flatMap<PendingChange>(field => {
      if (LIST_SETTINGS.includes(field)) {
        const before = saved[field] as readonly string[];
        const after = now[field] as readonly string[];
        const added = after.filter(item => !before.includes(item));
        const removed = before.filter(item => !after.includes(item));
        return added.length || removed.length ? [{ field, section, added, removed }] : [];
      }
      return saved[field] === now[field] ? [] : [{ field, section, from: String(saved[field]), to: String(now[field]) }];
    }));
  });

  /** The groups with changes, each with its own */
  protected readonly changedSections = computed(() => SETTINGS_SECTIONS
    .map(section => ({ section, changes: this.changes().filter(change => change.section === section) }))
    .filter(group => group.changes.length));

  /** How many changes each group has, for the marks in the list */
  protected readonly changeCounts = computed(() => new Map(this.changedSections().map(group => [group.section.key, group.changes.length])));

  /** The groups with a field showing an error, so the list says where to look */
  protected readonly invalidSections = computed(() => {
    this.value();
    return new Set(SETTINGS_SECTIONS
      .filter(section => section.fields.some(field => {
        const control = this.form.controls[field];
        return control.invalid && (control.touched || control.dirty);
      }))
      .map(section => section.key));
  });

  /** Saving would hold the signed-in administrator back: said wherever Save can be pressed, not only under the roles */
  protected readonly holdsBackSelfOnSave = computed(() =>
    this.changes().some(change => change.field === 'twoFactorRoleIds') && this.holdsBackSelf());

  /** Each by its own name */
  protected readonly languages = Object.entries(EMAIL_LANGUAGES).map(([code, name]) => ({ code, name }));

  /** The changes that can require a reason, in the order of REASON_ACTIONS */
  protected readonly reasonActions = (Object.keys(REASON_ACTIONS) as ReasonAction[]).map(key => ({ key, label: REASON_ACTIONS[key] }));

  protected readonly expiryOptions = computed<UiOption<number>[]>(() => {
    this.i18n();
    return INVITE_EXPIRY_DAYS.map(days => ({ value: days, label: this.translate.instant('dayCount', { count: days }) }));
  });

  protected readonly timeoutOptions = computed(() => {
    this.i18n();
    return SESSION_TIMEOUT_MINUTES.map(minutes => ({ value: minutes, label: idleTimeoutLabel(this.translate, minutes) }));
  });

  protected readonly reauthOptions = computed(() => {
    this.i18n();
    return REAUTH_MINUTES.map(minutes => ({ value: minutes, label: reauthLabel(this.translate, minutes) }));
  });

  protected readonly inactiveOptions = computed(() => {
    this.i18n();
    return SUSPEND_INACTIVE_DAYS.map(days => ({ value: days, label: inactiveLabel(this.translate, days) }));
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

  /** Opens a group; the changes in the others stay */
  protected open(section: SettingsSection) {
    this.reviewing.set(false);
    return this.router.navigate([], { queryParams: { section: section === SETTINGS_SECTIONS[0] ? null : section.key }, scroll: 'manual' });
  }

  /** The dropdown on narrow screens */
  protected pick(field: HTMLSelectElement) {
    const section = SETTINGS_SECTIONS.find(item => item.key === field.value);
    if (section) {
      this.open(section);
    }
  }

  /** A group in the dropdown, with how many of its changes are not saved */
  protected sectionOption(section: SettingsSection): string {
    this.i18n();
    const label = this.translate.instant(section.label);
    const count = this.changeCounts().get(section.key);
    return count ? this.translate.instant('sectionChanged', { section: label, count }) : label;
  }

  protected fieldLabel(change: PendingChange): string {
    this.i18n();
    return this.format.field(change);
  }

  /** One change as the activity log shows it once saved, every item of a list named */
  protected describe(change: PendingChange): string {
    this.i18n();
    if (change.added || change.removed) {
      return [
        ...(change.added ?? []).map(item => '+' + this.format.listItem(change.field, item)),
        ...(change.removed ?? []).map(item => '−' + this.format.listItem(change.field, item)),
      ].join(', ');
    }
    return `${this.format.value(change.field, change.from)} → ${this.format.value(change.field, change.to)}`;
  }

  /** Puts one setting back as it was saved */
  protected undo(field: SettingKey) {
    const control: AbstractControl = this.form.controls[field];
    control.setValue(this.toForm(this.store.settings())[field]);
    control.markAsUntouched();
    if (!this.changes().length) {
      this.reviewing.set(false);
    }
  }

  /** Puts the open group back as it was saved, leaving the changes in the others */
  protected undoSection(section: SettingsSection) {
    section.fields.forEach(field => this.undo(field));
  }

  /** Every change, in every group; asks first when some are in groups out of sight */
  protected async discard() {
    const elsewhere = this.changedSections().filter(group => group.section !== this.selected());
    if (elsewhere.length && !this.reviewing()) {
      const confirmed = await this.confirm.ask({
        title: this.translate.instant('Discard all changes?'),
        message: this.translate.instant('discardElsewhere', { sections: this.sectionNames(elsewhere.map(group => group.section)) }),
        confirmLabel: this.translate.instant('Discard all'),
        cancelLabel: this.translate.instant('Keep editing'),
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }
    }
    this.reviewing.set(false);
    this.reset(this.store.settings());
  }

  protected async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // To the first group with a field to correct, where its message shows
      const first = SETTINGS_SECTIONS.find(section => section.fields.some(field => this.form.controls[field].invalid));
      if (first && first !== this.selected()) {
        this.open(first);
      }
      this.reviewing.set(false);
      return;
    }
    this.saving.set(true);
    try {
      const settings = await this.store.updateSettings(this.toSettings(this.form.getRawValue()));
      this.reset(settings);
      this.reviewing.set(false);
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

  /** Ticks or unticks a change that must have a reason */
  protected toggleReason(action: ReasonAction, required: boolean) {
    const control = this.form.controls.reasonsRequired;
    const others = control.value.filter(item => item !== action);
    // In the order of the list, as the log shows them
    control.setValue(this.reasonActions.map(item => item.key).filter(key => key === action ? required : others.includes(key)));
    control.markAsDirty();
  }

  /** Saving would hold the signed-in administrator back until they turn on two-step sign-in themselves (API.md) */
  protected holdsBackSelf(): boolean {
    const me = this.session.user();
    const required = this.value().twoFactorRoleIds;
    return !!me && !me.twoFactor && this.session.roles().some(role => required.includes(role.id));
  }

  /** Asks before leaving with unsaved changes, saying in which groups */
  canLeave(): boolean | Promise<boolean> {
    // After the session ended there is nothing to save to, so leave without asking
    if (!this.changes().length || !this.session.signedIn()) {
      return true;
    }
    return this.confirm.ask({
      title: this.translate.instant('Discard your changes?'),
      message: this.translate.instant('unsavedIn', { sections: this.sectionNames(this.changedSections().map(group => group.section)) }),
      confirmLabel: this.translate.instant('Discard'),
      cancelLabel: this.translate.instant('Keep editing'),
      tone: 'danger',
    });
  }

  private reset(settings: AdminSettings) {
    this.form.reset(this.toForm(settings));
  }

  private toForm(settings: AdminSettings) {
    return { ...settings, allowedDomains: settings.allowedDomains.join(', ') };
  }

  private toSettings(value: Omit<AdminSettings, 'allowedDomains'> & { allowedDomains: string }): AdminSettings {
    return { ...value, allowedDomains: parseDomains(value.allowedDomains) };
  }

  /** "New users and Passwords", in the language of the page */
  private sectionNames(sections: readonly SettingsSection[]): string {
    const names = sections.map(section => this.translate.instant(section.label));
    return names.length > 1 ? this.translate.instant('listAnd', { items: names.slice(0, -1).join(', '), last: names.at(-1) }) : names[0] ?? '';
  }
}

export const confirmLeaveSettings: CanDeactivateFn<SettingsComponent> = component => component.canLeave();
