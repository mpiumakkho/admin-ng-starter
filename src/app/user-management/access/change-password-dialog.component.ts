import { Component, computed, inject, model, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AdminApiError } from '../data/admin-api';
import { AdminStore } from '../data/admin-store';
import { errorMessage } from '../shared/errors';
import { translationsChanged } from '../shared/i18n';
import { UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput, UiToastService } from '../ui';
import { Session } from './session';

/** Lets the signed-in user change their own password. Open it with [(open)]. */
@Component({
  selector: 'app-change-password-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput],
  template: `
    <ui-dialog [(open)]="open" (openChange)="!$event && reset()" [title]="'Change password' | translate"
      [description]="'Use one you do not use anywhere else.' | translate" [closeLabel]="'Close' | translate">
      <form class="password-form" [id]="ids.form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <!-- Lets password managers match the new password to the account -->
        <input type="text" class="ui-sr-only" autocomplete="username" [value]="session.user()?.email ?? ''" tabindex="-1" aria-hidden="true" readonly />
        <ui-form-field [label]="'Current password' | translate" [for]="ids.current" required [errors]="errors()">
          <input uiInput [id]="ids.current" type="password" formControlName="current" autocomplete="current-password" />
        </ui-form-field>
        <ui-form-field [label]="'New password' | translate" [for]="ids.next" required [errors]="errors()" [hint]="'atLeastCharacters' | translate: { count: minLength() }">
          <input uiInput [id]="ids.next" type="password" formControlName="next" autocomplete="new-password" />
        </ui-form-field>
        <ui-form-field [label]="'Repeat the new password' | translate" [for]="ids.repeat" required [errors]="errors()">
          <input uiInput [id]="ids.repeat" type="password" formControlName="repeat" autocomplete="new-password" />
        </ui-form-field>
      </form>
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="open.set(false); reset()">{{ 'Cancel' | translate }}</button>
        <button uiButton type="submit" [attr.form]="ids.form" [loading]="saving()">{{ 'Change password' | translate }}</button>
      </div>
    </ui-dialog>
  `,
  styles: `.password-form { display: flex; flex-direction: column; gap: 1rem; }`,
})
export class ChangePasswordDialog {
  private static nextId = 0;
  protected readonly session = inject(Session);
  private readonly store = inject(AdminStore);
  /** The shortest password the settings allow */
  protected readonly minLength = computed(() => this.store.settings().passwordMinLength);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly i18n = translationsChanged();

  readonly open = model(false);
  protected readonly saving = signal(false);
  protected readonly ids = (id => ({ form: `password-${id}`, current: `password-${id}-current`, next: `password-${id}-new`, repeat: `password-${id}-repeat` }))(ChangePasswordDialog.nextId++);

  protected readonly form = inject(NonNullableFormBuilder).group({
    current: ['', Validators.required],
    next: ['', [Validators.required, (control: AbstractControl) => this.longEnough(control)]],
    repeat: ['', [Validators.required, (control: AbstractControl) => this.matches(control)]],
  });

  protected readonly errors = computed<Record<string, string>>(() => {
    this.i18n();
    return {
      required: this.translate.instant('This field is required.'),
      minlength: this.translate.instant('useAtLeastCharacters', { count: this.minLength() }),
      mismatch: this.translate.instant('The passwords do not match.'),
      wrong: this.translate.instant('The current password is not right.'),
    };
  });

  protected async save() {
    this.form.controls.repeat.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { current, next } = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.session.changePassword(current, next);
      this.toast.show(this.translate.instant('Your password has been changed.'));
      this.open.set(false);
      this.reset();
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'invalid_credentials') {
        this.form.controls.current.setErrors({ wrong: true });
      } else {
        this.toast.show(this.translate.instant(errorMessage(error)), 'error');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected reset() {
    this.form.reset();
  }

  private longEnough(control: AbstractControl): ValidationErrors | null {
    return control.value && control.value.length < this.minLength() ? { minlength: true } : null;
  }

  private matches(control: AbstractControl): ValidationErrors | null {
    const next = control.parent?.get('next')?.value;
    return control.value && next && control.value !== next ? { mismatch: true } : null;
  }
}
