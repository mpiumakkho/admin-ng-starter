import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideClock } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';

import { UiBadge } from '../ui';
import { roleAssignmentState } from '../data/access-rules';
import { AdminStore } from '../data/admin-store';
import { STATUS_META } from '../data/catalog';
import { Role, User, UserStatus } from '../data/models';
import { LocalDatePipe } from './formatting';

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

/**
 * The roles someone holds now, the ones with most permissions first, up to `max`, then "+2". A role held for a time
 * has a clock and says when it ends.
 */
@Component({
  selector: 'app-role-badges',
  imports: [NgIcon, TranslatePipe, UiBadge, LocalDatePipe],
  template: `
    @for (item of shown(); track item.role.id) {
      <ui-badge [tone]="item.role.tone" [attr.title]="item.endsAt ? ('untilDate' | translate: { date: (item.endsAt | localDate) }) : null">
        {{ item.role.name }}
        @if (item.endsAt) {
          <ng-icon class="role-badge-clock" [svg]="clockIcon" aria-hidden="true" />
          <span class="ui-sr-only">{{ 'untilDate' | translate: { date: (item.endsAt | localDate) } }}</span>
        }
      </ui-badge>
    } @empty {
      <span class="role-badges-none">{{ 'No role' | translate }}</span>
    }
    @if (rest().length) {
      <ui-badge tone="neutral" [attr.title]="restNames()"><span aria-hidden="true">+{{ rest().length }}</span><span class="ui-sr-only">{{ restNames() }}</span></ui-badge>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .25rem;
    }

    .role-badge-clock {
      margin-inline-start: .125rem;
      font-size: .75rem;
    }

    .role-badges-none {
      color: var(--ui-muted);
      font-size: .8125rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleBadges {
  private readonly store = inject(AdminStore);
  readonly user = input.required<Pick<User, 'roles'>>();
  /** How many to show before "+n" */
  readonly max = input(2);

  protected readonly clockIcon = lucideClock;
  private readonly items = computed(() => {
    const now = this.store.now();
    const roles = this.store.rolesById();
    return this.user().roles
      .filter(item => roleAssignmentState(item, now) === 'active')
      .map(item => ({ role: roles.get(item.roleId), endsAt: item.endsAt }))
      .filter((item): item is { role: Role; endsAt: string | null } => !!item.role)
      .sort((a, b) => b.role.permissions.length - a.role.permissions.length);
  });
  protected readonly shown = computed(() => this.items().slice(0, this.max()));
  protected readonly rest = computed(() => this.items().slice(this.max()));
  protected readonly restNames = computed(() => this.rest().map(item => item.role.name).join(', '));
}
