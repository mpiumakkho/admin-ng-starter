import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideEllipsis, lucidePencil, lucidePlus, lucideShieldAlert, lucideTrash2 } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { fullName, RoleConflict } from '../data/models';
import { RoleBadge } from '../shared/badges';
import { errorMessage } from '../shared/errors';
import {
  UiBadge,
  UiButton,
  UiCard,
  UiCheckbox,
  UiConfirmService,
  UiDialog,
  UiDialogFooter,
  UiEmptyState,
  UiFormField,
  UiInput,
  UiMenu,
  UiMenuDivider,
  UiMenuItem,
  UiMenuTrigger,
  UiPageHeader,
  UiPerson,
  UiTable,
  UiToastService,
} from '../ui';

/**
 * Roles nobody may hold at the same time, so that one person cannot both do and check the same work: NIST RBAC's
 * static separation of duty (API.md, "Conflicting roles"). Everyone who can see the roles reads the rules; roles.manage
 * adds, changes and deletes them. A rule made while people already hold its roles leaves them, and lists them here to
 * fix, as an access review would.
 */
@Component({
  selector: 'app-role-conflicts',
  imports: [
    FormsModule, RouterLink, NgIcon, TranslatePipe, RoleBadge, UiBadge, UiButton, UiCard, UiCheckbox, UiDialog, UiDialogFooter,
    UiEmptyState, UiFormField, UiInput, UiMenu, UiMenuDivider, UiMenuItem, UiMenuTrigger, UiPageHeader, UiPerson, UiTable,
  ],
  templateUrl: './role-conflicts.component.html',
  styleUrl: './role-conflicts.component.scss',
  // Fills the window on desktop: the lists scroll inside their cards, as on the pages with tables
  host: { class: 'page-fit' },
})
export class RoleConflictsComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly confirm = inject(UiConfirmService);

  protected readonly icons = { page: lucideShieldAlert, add: lucidePlus, more: lucideEllipsis, edit: lucidePencil, remove: lucideTrash2 };
  protected readonly canManage = computed(() => this.session.can('roles.manage'));
  protected readonly fullName = fullName;

  /** The people to fix, while the signed-in user can see people at all */
  protected readonly toFix = computed(() => this.session.can('users.view') ? this.store.roleConflictViolations() : []);

  /** Each rule with how many people break it */
  protected readonly rows = computed(() => this.store.roleConflicts().map(rule => ({
    rule,
    roleIds: rule.roleIds.filter(roleId => this.store.rolesById().has(roleId)),
    toFix: this.toFix().filter(item => item.rule.id === rule.id).length,
  })));

  /* Add and edit */

  protected readonly editing = signal<RoleConflict | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly picked = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly problem = signal('');

  protected add() {
    this.open(null);
  }

  protected edit(rule: RoleConflict) {
    this.open(rule);
  }

  protected toggle(roleId: string, checked: boolean) {
    this.picked.update(ids => checked ? [...ids, roleId] : ids.filter(id => id !== roleId));
  }

  protected async save() {
    const name = this.name().trim();
    // In the order of the roles page
    const roleIds = this.store.roles().map(role => role.id).filter(id => this.picked().includes(id));
    if (!name || roleIds.length < 2) {
      this.problem.set(!name ? 'This field is required.' : 'Pick at least two roles.');
      return;
    }
    this.saving.set(true);
    this.problem.set('');
    try {
      const draft = { name, description: this.description().trim(), roleIds };
      const current = this.editing();
      if (current) {
        await this.store.updateRoleConflict(current.id, draft);
        this.toast.show(this.translate.instant('toast.ruleSaved', { name }));
      } else {
        await this.store.createRoleConflict(draft);
        this.toast.show(this.translate.instant('toast.ruleAdded', { name }));
      }
      this.dialogOpen.set(false);
    } catch (error) {
      this.problem.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(rule: RoleConflict) {
    const confirmed = await this.confirm.ask({
      title: this.translate.instant('confirm.deleteRule', { name: rule.name }),
      message: this.translate.instant('People can then hold these roles together again.'),
      confirmLabel: this.translate.instant('Delete'),
      cancelLabel: this.translate.instant('Cancel'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.store.deleteRoleConflict(rule.id);
      this.toast.show(this.translate.instant('toast.ruleDeleted', { name: rule.name }));
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    }
  }

  private open(rule: RoleConflict | null) {
    this.editing.set(rule);
    this.name.set(rule?.name ?? '');
    this.description.set(rule?.description ?? '');
    this.picked.set(rule ? [...rule.roleIds] : []);
    this.problem.set('');
    this.dialogOpen.set(true);
  }
}
