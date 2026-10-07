import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { UiBadge } from '../ui';
import { AdminStore } from '../data/admin-store';
import { STATUS_META } from '../data/catalog';
import { UserStatus } from '../data/models';

/** A user's status as a colored badge */
@Component({
  selector: 'app-status-badge',
  imports: [UiBadge, TranslatePipe],
  template: `<ui-badge [tone]="meta().tone" dot>{{ meta().label | translate }}</ui-badge>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  readonly status = input.required<UserStatus>();
  protected readonly meta = computed(() => STATUS_META[this.status()]);
}

/** A role's name in its color */
@Component({
  selector: 'app-role-badge',
  imports: [UiBadge],
  template: `
    @if (role(); as role) {
      <ui-badge [tone]="role.tone">{{ role.name }}</ui-badge>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleBadge {
  private readonly store = inject(AdminStore);
  readonly roleId = input.required<string>();
  protected readonly role = computed(() => this.store.rolesById().get(this.roleId()));
}
