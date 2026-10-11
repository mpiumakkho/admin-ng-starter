import { Component, inject, model, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AdminStore } from '../data/admin-store';
import { errorMessage } from '../shared/errors';
import { UiAlert, UiButton, UiDialog, UiDialogFooter } from '../ui';
import { RecoveryCodes } from './recovery-codes.component';

/**
 * Makes ten new recovery codes for the signed-in user, which replace the old ones, and shows them this once
 * (API.md, "Recovery codes"). A risky change: the password may be asked again first (ReauthDialog).
 */
@Component({
  selector: 'app-recovery-codes-dialog',
  imports: [TranslatePipe, UiAlert, UiButton, UiDialog, UiDialogFooter, RecoveryCodes],
  template: `
    <ui-dialog [(open)]="open" (openChange)="!$event && reset()" [title]="'New recovery codes' | translate"
      [description]="(codes() ? '' : 'New codes replace the ones you have now, so those stop working.') | translate" [closeLabel]="'Close' | translate">
      @if (codes(); as list) {
        <app-recovery-codes [codes]="list" />
      } @else if (error()) {
        <ui-alert tone="danger">{{ error() | translate }}</ui-alert>
      }
      <div uiDialogFooter>
        @if (codes()) {
          <button uiButton type="button" (click)="open.set(false)">{{ 'Done' | translate }}</button>
        } @else {
          <button uiButton variant="secondary" type="button" (click)="open.set(false)">{{ 'Cancel' | translate }}</button>
          <button uiButton type="button" [loading]="saving()" (click)="make()">{{ 'Make new codes' | translate }}</button>
        }
      </div>
    </ui-dialog>
  `,
})
export class RecoveryCodesDialog {
  private readonly store = inject(AdminStore);

  readonly open = model(false);
  /** New codes were made: how many are left changed */
  readonly made = output<void>();

  protected readonly codes = signal<string[] | null>(null);
  protected readonly saving = signal(false);
  /** Translation key of what went wrong */
  protected readonly error = signal('');

  protected async make() {
    this.saving.set(true);
    this.error.set('');
    try {
      this.codes.set(await this.store.createRecoveryCodes());
      this.made.emit();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected reset() {
    this.codes.set(null);
    this.error.set('');
  }
}
