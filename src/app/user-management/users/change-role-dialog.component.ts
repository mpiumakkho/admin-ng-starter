import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { User } from '../data/models';
import { errorMessage } from '../shared/errors';
import { UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput, UiToastService } from '../ui';

/**
 * Gives everyone selected on the users list the same role. Only roles the signed-in user may assign are offered;
 * the server checks that again, and that each person is someone they manage. Open it with [(open)].
 */
@Component({
  selector: 'app-change-role-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput],
  template: `
    <ui-dialog [(open)]="open" [title]="'changeRoleTitle' | translate: { count: users().length }"
      [description]="'Everyone selected gets the role you pick.' | translate" [closeLabel]="'Close' | translate">
      <form [id]="formId" (submit)="$event.preventDefault(); save()" novalidate>
        <ui-form-field [label]="'New role' | translate" [for]="formId + '-role'">
          <select uiInput [id]="formId + '-role'" [formControl]="role">
            @for (option of roles(); track option.id) {
              <option [value]="option.id">{{ option.name }}</option>
            }
          </select>
        </ui-form-field>
      </form>
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="open.set(false)">{{ 'Cancel' | translate }}</button>
        <button uiButton type="submit" [attr.form]="formId" [loading]="saving()" [disabled]="!role.value">{{ 'Change role' | translate }}</button>
      </div>
    </ui-dialog>
  `,
})
export class ChangeRoleDialog {
  private static nextId = 0;
  private readonly store = inject(AdminStore);
  private readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);

  readonly users = input.required<User[]>();
  readonly open = model(false);
  /** The roles changed; the list clears its selection */
  readonly done = output<void>();

  protected readonly formId = `change-role-${ChangeRoleDialog.nextId++}`;
  protected readonly saving = signal(false);
  protected readonly role = new FormControl('', { nonNullable: true });
  protected readonly roles = computed(() => this.store.roles().filter(role => this.session.canAssign(role)));

  constructor() {
    // Each time it opens: the role everyone selected already shares, or the first one offered
    effect(() => {
      if (this.open()) {
        const shared = new Set(untracked(this.users).map(user => user.roleId));
        const offered = untracked(this.roles);
        this.role.setValue(shared.size === 1 && offered.some(role => shared.has(role.id)) ? [...shared][0] : offered[0]?.id ?? '');
      }
    });
  }

  protected async save() {
    this.saving.set(true);
    try {
      const changed = await this.store.setUsersRole(this.users().map(user => user.id), this.role.value);
      this.toast.show(this.translate.instant('toast.roleChanged', { count: changed.length }));
      this.open.set(false);
      this.done.emit();
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
