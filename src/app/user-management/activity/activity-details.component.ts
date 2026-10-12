import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideCopy, lucideMonitor, lucideSmartphone } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { UiBadge, UiButton, UiDetailItem, UiDetailList, UiIconChip, UiPerson, UiTable, UiToastService } from '../ui';
import { AdminStore } from '../data/admin-store';
import { ACTIVITY_KINDS, ACTIVITY_META } from '../data/catalog';
import { Activity } from '../data/models';
import { ActivityText } from '../shared/activity-text';
import { LocalDatePipe, LocalNamePipe, TimeAgoPipe } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import { ActivityFormat } from './activity-format';

type ChangeKind = 'value' | 'list' | 'tone' | 'changed';

/** Everything recorded about one activity entry: who, what, where from, and each field it changed */
@Component({
  selector: 'app-activity-details',
  imports: [RouterLink, NgIcon, TranslatePipe, UiBadge, UiButton, UiDetailList, UiDetailItem, UiIconChip, UiPerson, UiTable, ActivityText, LocalDatePipe, LocalNamePipe, TimeAgoPipe],
  templateUrl: './activity-details.component.html',
  styleUrl: './activity-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityDetails {
  private readonly store = inject(AdminStore);
  private readonly format = inject(ActivityFormat);
  private readonly i18n = translationsChanged();
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);

  readonly entry = input.required<Activity>();

  protected readonly icons = { copy: lucideCopy };

  protected readonly meta = computed(() => ACTIVITY_META[this.entry().action]);
  protected readonly kind = computed(() => ACTIVITY_KINDS[this.meta().kind]);
  protected readonly actor = computed(() => this.store.usersById().get(this.entry().actorId ?? ''));
  protected readonly actorName = computed(() => { this.i18n(); return this.format.actorName(this.entry()); });
  protected readonly action = computed(() => { this.i18n(); return this.format.action(this.entry()); });
  protected readonly target = computed(() => this.format.target(this.entry()));
  protected readonly deviceIcon = computed(() => this.format.isMobile(this.entry()) ? lucideSmartphone : lucideMonitor);

  protected readonly changes = computed(() => {
    this.i18n();
    return (this.entry().changes ?? []).map(change => {
      const kind: ChangeKind = change.added || change.removed ? 'list'
        : change.field === 'tone' ? 'tone'
        : change.field === 'avatar' || (change.from === undefined && change.to === undefined) ? 'changed'
        : 'value';
      return {
        field: change.field,
        label: this.format.field(change),
        kind,
        from: this.format.value(change.field, change.from),
        to: this.format.value(change.field, change.to),
        rawFrom: change.from,
        rawTo: change.to,
        added: (change.added ?? []).map(key => this.format.listItem(change.field, key)),
        removed: (change.removed ?? []).map(key => this.format.listItem(change.field, key)),
      };
    });
  });

  /** Shown instead of the change table when nothing was changed */
  protected readonly noChanges = computed(() =>
    this.entry().action === 'user.password_reset' ? 'Reset link sent by email'
    // An invitation logged without changes is one sent again
    : this.entry().action === 'user.invited' ? 'Invitation sent again by email.'
    : this.entry().action === 'auth.sign_in' ? 'Signed in. No data was changed.'
    : 'No changes were recorded.');

  /** The id, for quoting the entry to someone or finding it in the server's logs */
  protected async copyId() {
    try {
      await navigator.clipboard.writeText(this.entry().id);
      this.toast.show(this.translate.instant('Event reference copied.'));
    } catch {
      this.toast.show(this.translate.instant('Could not copy to the clipboard.'), 'error');
    }
  }
}
