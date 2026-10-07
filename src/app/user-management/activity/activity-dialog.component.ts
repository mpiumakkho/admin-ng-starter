import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { UiButton, UiDialog, UiDialogFooter } from '../ui';
import { Activity } from '../data/models';
import { translationsChanged } from '../shared/i18n';
import { ActivityDetails } from './activity-details.component';
import { ActivityFormat } from './activity-format';

/** One activity entry in a dialog, with a button to the user or role it was about. Used by the log and the overview. */
@Component({
  selector: 'app-activity-dialog',
  imports: [RouterLink, TranslatePipe, UiButton, UiDialog, UiDialogFooter, ActivityDetails],
  template: `
    <ui-dialog [open]="!!entry()" (openChange)="!$event && closed.emit()" [title]="title()" size="lg" [closeLabel]="'Close' | translate">
      @if (entry(); as current) {
        <app-activity-details [entry]="current" />
      }
      <div uiDialogFooter>
        @if (target(); as link) {
          <a uiButton variant="secondary" [routerLink]="link.link" [queryParams]="link.queryParams">
            {{ (entry()?.action?.startsWith('role.') ? 'Open role' : 'View profile') | translate }}
          </a>
        }
        <button uiButton type="button" (click)="closed.emit()">{{ 'Close' | translate }}</button>
      </div>
    </ui-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityDialog {
  private readonly format = inject(ActivityFormat);
  private readonly i18n = translationsChanged();

  /** The entry to show; null keeps the dialog closed */
  readonly entry = input<Activity | null>(null);
  readonly closed = output<void>();

  protected readonly title = computed(() => {
    this.i18n();
    const entry = this.entry();
    return entry ? this.format.action(entry) : '';
  });

  protected readonly target = computed(() => {
    const entry = this.entry();
    return entry ? this.format.target(entry) : null;
  });
}
