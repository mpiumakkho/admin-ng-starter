import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { CanDeactivateFn, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideSave, lucideUserPen, lucideUserPlus, lucideUserX } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  UiAlert,
  UiButton,
  UiCard,
  UiCardFooter,
  UiChoice,
  UiChoiceCards,
  UiConfirmService,
  UiEmptyState,
  UiFileDropzone,
  UiFormField,
  UiInput,
  UiOption,
  UiPageHeader,
  UiSegmented,
  UiToastService,
} from '../ui';
import { Session } from '../access/session';
import { AdminApiError } from '../data/admin-api';
import { AdminStore } from '../data/admin-store';
import { DEPARTMENTS, STATUS_META } from '../data/catalog';
import { fullName, UserDraft, UserStatus } from '../data/models';
import { errorMessage } from '../shared/errors';
import { translationsChanged } from '../shared/i18n';

const AVATAR_SIZE = 160;

@Component({
  selector: 'app-user-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    TranslatePipe,
    UiPageHeader,
    UiAlert,
    UiCard,
    UiCardFooter,
    UiButton,
    UiFormField,
    UiInput,
    UiChoiceCards,
    UiSegmented,
    UiFileDropzone,
    UiEmptyState,
  ],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.scss',
})
export class UserFormComponent implements OnInit {
  private readonly store = inject(AdminStore);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly confirm = inject(UiConfirmService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly i18n = translationsChanged();

  /** From the route: missing when adding a user */
  readonly id = input<string>();

  protected readonly icons = { add: lucideUserPlus, edit: lucideUserPen, save: lucideSave, missing: lucideUserX };
  protected readonly departments = DEPARTMENTS;
  protected readonly saving = signal(false);
  private saved = false;

  protected readonly user = computed(() => {
    const id = this.id();
    return id ? this.store.usersById().get(id) : undefined;
  });
  protected readonly isEdit = computed(() => !!this.id());
  protected readonly canListUsers = computed(() => this.session.can('users.view'));
  protected readonly notFound = computed(() => this.isEdit() && this.store.loaded() && !this.user());
  /** People cannot change their own role or status, so they cannot lock themselves out or promote themselves */
  protected readonly isSelf = computed(() => this.isEdit() && this.id() === this.session.userId());
  /** Without users.edit, people editing their own profile change only their name, phone and photo */
  protected readonly profileOnly = computed(() => this.isSelf() && !this.session.can('users.edit'));

  protected readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email, (control: AbstractControl) => this.emailFree(control), (control: AbstractControl) => this.emailDomain(control)]],
    phone: ['', Validators.pattern(/^[0-9+\-\s]{9,15}$/)],
    department: [DEPARTMENTS[0], Validators.required],
    roleId: [this.defaultRoleId(), Validators.required],
    status: ['invited' as UserStatus, Validators.required],
    avatar: [''],
  });

  protected readonly roleChoices = computed<UiChoice[]>(() => {
    this.i18n();
    const current = this.user()?.roleId;
    return this.store.roles().map(role => ({
      value: role.id,
      title: role.name,
      description: role.description,
      meta: this.translate.instant('permissionCount', { count: role.permissions.length }),
      // Nobody gives out more than they have; the role someone already holds stays visible as picked
      disabled: role.id !== current && !this.session.canAssign(role),
    }));
  });

  /** Some roles grant permissions the signed-in user lacks, so they cannot be picked */
  protected readonly someRolesLocked = computed(() => !this.isSelf() && this.roleChoices().some(choice => choice.disabled));

  protected readonly statusOptions = computed<UiOption<UserStatus>[]>(() => {
    this.i18n();
    return (Object.keys(STATUS_META) as UserStatus[]).map(status => ({ value: status, label: this.translate.instant(STATUS_META[status].label) }));
  });

  protected readonly title = computed(() => {
    const user = this.user();
    return user ? fullName(user) : '';
  });

  // Error message per validation error, translated
  protected readonly errorMessages = computed<Record<string, string>>(() => {
    this.i18n();
    const messages = {
      required: 'This field is required.',
      maxlength: 'Use 50 characters or fewer.',
      email: 'Enter a valid email address.',
      taken: 'Another user already has this email.',
      pattern: 'Use 9 to 15 digits.',
    };
    return {
      ...Object.fromEntries(Object.entries(messages).map(([key, message]) => [key, this.translate.instant(message)])),
      domain: this.translate.instant('emailDomainHint', { domains: this.store.settings().allowedDomains.join(', ') }),
    };
  });

  ngOnInit() {
    // Route inputs are set by now; fill the form when editing
    const user = this.user();
    if (user) {
      this.form.reset({
        firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone,
        department: user.department, roleId: user.roleId, status: user.status, avatar: user.avatar,
      });
    }
    if (this.isSelf()) {
      this.form.controls.roleId.disable();
      this.form.controls.status.disable();
    }
    if (this.profileOnly()) {
      this.form.controls.email.disable();
      this.form.controls.department.disable();
    }
  }

  /** The default role from the settings when the signed-in user may give it, otherwise the least powerful role they may give */
  private defaultRoleId(): string {
    const assignable = this.store.roles().filter(role => this.session.canAssign(role));
    return assignable.find(role => role.id === this.store.settings().defaultRoleId)?.id
      ?? [...assignable].sort((a, b) => a.permissions.length - b.permissions.length)[0]?.id
      ?? '';
  }

  /** Allowed domains from the settings; a user keeps an email they already have */
  private emailDomain(control: AbstractControl): ValidationErrors | null {
    const email = String(control.value ?? '').trim().toLowerCase();
    const domains = this.store.settings().allowedDomains;
    const unchanged = email === this.user()?.email.toLowerCase();
    return email.includes('@') && domains.length && !unchanged && !domains.includes(email.split('@')[1]) ? { domain: true } : null;
  }

  private emailFree(control: AbstractControl): ValidationErrors | null {
    const email = String(control.value ?? '');
    return email && this.store.isEmailTaken(email, this.id()) ? { taken: true } : null;
  }

  /** Shrinks the picked image to a small square, so it fits in storage */
  protected async pickAvatar(file: File) {
    if (!file.type.startsWith('image/')) {
      this.toast.show(this.translate.instant('Choose an image file.'), 'error');
      return;
    }
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = AVATAR_SIZE;
    const side = Math.min(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    this.form.controls.avatar.setValue(canvas.toDataURL('image/jpeg', 0.85));
    this.form.markAsDirty();
  }

  protected removeAvatar() {
    this.form.controls.avatar.setValue('');
    this.form.markAsDirty();
  }

  protected async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.show(this.translate.instant('Check the highlighted fields.'), 'error');
      return;
    }
    const draft: UserDraft = this.form.getRawValue();
    this.saving.set(true);
    try {
      const id = this.id();
      const user = id ? await this.store.updateUser(id, draft) : await this.store.createUser(draft);
      this.saved = true;
      this.toast.show(this.translate.instant(id ? 'toast.userUpdated' : 'toast.userCreated', { name: fullName(user) }));
      this.router.navigate(['/users', user.id]);
    } catch (error) {
      if (error instanceof AdminApiError && (error.code === 'email_taken' || error.code === 'email_domain')) {
        this.form.controls.email.setErrors(error.code === 'email_taken' ? { taken: true } : { domain: true });
        this.form.controls.email.markAsTouched();
      } else {
        this.toast.show(this.translate.instant(errorMessage(error)), 'error');
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** Asks before leaving with unsaved changes */
  canLeave(): boolean | Promise<boolean> {
    // After the session ended there is nothing to save to, so leave without asking
    if (this.saved || !this.form.dirty || !this.session.signedIn()) {
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
}

export const confirmLeaveUserForm: CanDeactivateFn<UserFormComponent> = component => component.canLeave();
