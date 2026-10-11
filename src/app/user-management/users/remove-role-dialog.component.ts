import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { User } from '../data/models';
import { errorMessage } from '../shared/errors';
import { MAX_REASON } from '../shared/reason-prompt';
import { UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput, UiToastService } from '../ui';

/**
 * Takes a role away from everyone selected on the users list: their current and scheduled assignments of it end now.
 * Only roles someone selected holds, and that the signed-in user may give, are offered. The reason goes to the activity
 * log, required when the settings say so (API.md, "Reasons"). Open it with [(open)].
 */
@Component({
  selector: 'app-remove-role-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput],
  template: `
    <ui-dialog [(open)]="open" [title]="'removeRoleCount' | translate: { count: users().length }"
      [description]="'The role ends now for everyone selected who holds it.' | translate" [closeLabel]="'Close' | translate">
      <form [id]="formId" (submit)="$event.preventDefault(); save()" novalidate>
        <ui-form-field [label]="'Role' | translate" [for]="formId + '-role'">
          <select uiInput [id]="formId + '-role'" [formControl]="role">
            @for (option of offered(); track option.id) {
              <option [value]="option.id">{{ option.name }}</option>
            }
          </select>
        </ui-form-field>
        <ui-form-field class="remove-reason" [label]="'Reason' | translate" [for]="formId + '-reason'" [required]="reasonRequired()"
          [optionalLabel]="reasonRequired() ? '' : ('(optional)' | translate)" [errors]="{ required: 'Give a reason. The activity log keeps it.' | translate }">
          <textarea uiInput [id]="formId + '-reason'" rows="2" [attr.maxlength]="maxReason" [formControl]="reason"></textarea>
        </ui-form-field>
      </form>
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="open.set(false)">{{ 'Cancel' | translate }}</button>
        <button uiButton variant="danger" type="submit" [attr.form]="formId" [loading]="saving()" [disabled]="!role.value">{{ 'Take role away' | translate }}</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .remove-reason {
      margin-top: 1rem;
    }
  `,
})
export class RemoveRoleDialog {
  private static nextId = 0;
  private readonly store = inject(AdminStore);
  private readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);

  readonly users = input.required<User[]>();
  readonly open = model(false);
  /** The roles changed; the list clears its selection */
  readonly done = output<void>();

  protected readonly formId = `remove-role-${RemoveRoleDialog.nextId++}`;
  protected readonly saving = signal(false);
  protected readonly role = new FormControl('', { nonNullable: true });
  protected readonly reason = new FormControl('', { nonNullable: true });
  protected readonly reasonRequired = computed(() => this.store.settings().reasonsRequired.includes('removeRole'));
  protected readonly maxReason = MAX_REASON;
  protected readonly offered = computed(() => this.store.roles().filter(role =>
    this.session.canAssign(role) && this.users().some(user => this.store.holdsOrWillHold(user, role.id))));

  constructor() {
    effect(() => {
      if (this.open()) {
        this.role.setValue(untracked(this.offered)[0]?.id ?? '');
        this.reason.reset('');
      }
    });
  }

  protected async save() {
    const reason = this.reason.value.trim();
    if (this.reasonRequired() && !reason) {
      this.reason.setErrors({ required: true });
      this.reason.markAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const changed = await this.store.assignRoles(this.users().map(user => user.id), {
        removeRoleId: this.role.value, ...(reason ? { reason } : {}),
      });
      this.toast.show(this.translate.instant('toast.roleTaken', { count: changed.length }));
      this.open.set(false);
      this.done.emit();
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
