import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { AdminStore } from '../data/admin-store';
import { ACTIVITY_META, FIELD_LABELS, PERMISSION_LABELS, REASON_ACTIONS, SIGN_IN_FAILURES, STATUS_META } from '../data/catalog';
import { Activity, ActivityChange, fullName, ReasonAction, UserStatus } from '../data/models';
import { idleTimeoutLabel, inactiveLabel, localDate, passwordHistoryLabel, reauthLabel, retentionLabel } from '../shared/formatting';

/** Where an entry's target can be opened, if it still exists */
export interface ActivityTarget {
  link: string[];
  queryParams?: Record<string, string>;
  /** A translation key to show instead of the entry's target label, for targets that are not people or roles */
  label?: string;
}

/**
 * Turns activity entries into display text in the current language. The answers change with the
 * language, so read them inside a computed that also tracks `translationsChanged()`.
 */
@Injectable({ providedIn: 'root' })
export class ActivityFormat {
  private readonly store = inject(AdminStore);
  private readonly translate = inject(TranslateService);

  /** Who did it: a name, "System" for what the server did by itself, or "Deleted user" */
  actorName(entry: Activity): string {
    if (entry.actorId === null) {
      return this.translate.instant('System');
    }
    const user = this.store.usersById().get(entry.actorId);
    return user ? fullName(user) : this.translate.instant('Deleted user');
  }

  /** Short label for tables, such as "Suspended user" */
  action(entry: Activity): string {
    return this.translate.instant(ACTIVITY_META[entry.action].label);
  }

  /** The whole event as a sentence, such as "Henry Klein suspended Jane Doe" */
  sentence(entry: Activity): string {
    return this.translate.instant(ACTIVITY_META[entry.action].message, { actor: this.actorName(entry), target: entry.targetLabel });
  }

  target(entry: Activity): ActivityTarget | null {
    if (entry.action === 'settings.updated') {
      return { link: ['/settings'], label: 'Settings' };
    }
    if (!entry.targetId || entry.action === 'auth.sign_in') {
      return null;
    }
    if (entry.action.startsWith('role_conflict.')) {
      return this.store.roleConflicts().some(rule => rule.id === entry.targetId) ? { link: ['/roles/conflicts'] } : null;
    }
    if (ACTIVITY_META[entry.action].kind === 'roles') {
      return this.store.rolesById().has(entry.targetId) ? { link: ['/roles'], queryParams: { role: entry.targetId } } : null;
    }
    if (ACTIVITY_META[entry.action].kind === 'branches') {
      return this.store.branchesById().has(entry.targetId) ? { link: ['/branches'] } : null;
    }
    return this.store.usersById().has(entry.targetId) ? { link: ['/users', entry.targetId] } : null;
  }

  field(change: ActivityChange): string {
    return this.translate.instant(FIELD_LABELS[change.field] ?? change.field);
  }

  /** One stored value as people read it: a role name instead of its id, a translated status */
  value(field: string, raw: string | null | undefined): string {
    if (!raw) {
      return '—';
    }
    switch (field) {
      case 'roleId':
      case 'defaultRoleId':
        return this.store.rolesById().get(raw)?.name ?? raw;
      case 'branchId':
        return this.store.branchesById().get(raw)?.name ?? raw;
      case 'active':
        return this.translate.instant(raw === 'true' ? 'Open' : 'Closed');
      case 'branchesEnabled':
        return this.translate.instant(raw === 'true' ? 'On' : 'Off');
      case 'startsAt':
      case 'endsAt':
        return localDate(this.translate, raw);
      case 'maxDays':
        return raw === 'null' ? this.translate.instant('No limit') : this.translate.instant('dayCount', { count: Number(raw) });
      case 'reasonRequired':
        return this.translate.instant(raw === 'true' ? 'Yes' : 'No');
      case 'inviteExpiryDays':
        return this.translate.instant('dayCount', { count: Number(raw) });
      case 'sessionTimeoutMinutes':
        return idleTimeoutLabel(this.translate, Number(raw));
      case 'reauthMinutes':
        return reauthLabel(this.translate, Number(raw));
      case 'suspendInactiveDays':
        return inactiveLabel(this.translate, Number(raw));
      case 'inactiveDays':
        return this.translate.instant('dayCount', { count: Number(raw) });
      case 'passwordMinLength':
        return this.translate.instant('characterCount', { count: Number(raw) });
      case 'passwordHistory':
        return passwordHistoryLabel(this.translate, Number(raw));
      case 'activityRetentionDays':
        return retentionLabel(this.translate, Number(raw));
      case 'cause':
        return SIGN_IN_FAILURES[raw] ? this.translate.instant(SIGN_IN_FAILURES[raw]) : raw;
      case 'lockMinutes':
        return this.translate.instant('minuteCount', { count: Number(raw) });
      case 'status':
        return this.translate.instant(STATUS_META[raw as UserStatus]?.label ?? raw);
      case 'department':
        return this.translate.instant(raw);
      default:
        return raw;
    }
  }

  permission(key: string): string {
    const label = PERMISSION_LABELS.get(key);
    return label ? this.translate.instant(label) : key;
  }

  /** One item of a list change: a permission's label, a role's name, a change that needs a reason, or the item itself */
  listItem(field: string, key: string): string {
    if (field === 'reasonsRequired') {
      const label = REASON_ACTIONS[key as ReasonAction];
      return label ? this.translate.instant(label) : key;
    }
    return field === 'twoFactorRoleIds' || field === 'roles' ? this.store.rolesById().get(key)?.name ?? key : this.permission(key);
  }

  /** One line for the table, such as "Department: Sales → Marketing · +1" */
  summary(entry: Activity): string {
    const changes = entry.changes ?? [];
    if (!changes.length) {
      return entry.action === 'user.password_reset' ? this.translate.instant('Reset link sent by email') : '';
    }
    const shown = changes.slice(0, 2).map(change => `${this.field(change)}: ${this.describe(change)}`);
    const more = changes.length - shown.length;
    return shown.join(' · ') + (more > 0 ? ` · +${more}` : '');
  }

  isMobile(entry: Activity): boolean {
    return entry.os === 'iOS' || entry.os === 'Android';
  }

  private describe(change: ActivityChange): string {
    if (change.added || change.removed) {
      const added = change.added ?? [];
      const removed = change.removed ?? [];
      // Name a couple of permissions; count a longer list
      if (added.length + removed.length <= 2) {
        return [
          ...added.map(key => '+' + this.listItem(change.field, key)),
          ...removed.map(key => '−' + this.listItem(change.field, key)),
        ].join(', ');
      }
      return [added.length ? `+${added.length}` : '', removed.length ? `−${removed.length}` : ''].filter(Boolean).join(' ');
    }
    // Photos and colors have no readable value
    if (change.field === 'avatar' || change.field === 'tone' || (change.from === undefined && change.to === undefined)) {
      return this.translate.instant('Changed');
    }
    if (change.from !== undefined && change.to !== undefined) {
      return `${this.value(change.field, change.from)} → ${this.value(change.field, change.to)}`;
    }
    return this.value(change.field, change.to ?? change.from);
  }
}
