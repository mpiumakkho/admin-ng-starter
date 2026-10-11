import { afterRenderEffect, Component, computed, ElementRef, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideCopy, lucideLock, lucidePlus, lucideSave, lucideShieldCheck, lucideTrash2, lucideUsers } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiCardFooter,
  UiCheckbox,
  UiConfirmService,
  UiDialog,
  UiDialogFooter,
  UiFormField,
  UiInput,
  UiPageHeader,
  UiSearchInput,
  UiToastService,
  UiTone,
} from '../ui';
import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { ASSIGNMENT_MAX_DAYS, DEFAULT_ASSIGNMENT_RULES, PERMISSION_GROUPS, PermissionGroup, ROLE_TONES, TONE_NAMES } from '../data/catalog';
import { Permission, Role } from '../data/models';
import { errorMessage } from '../shared/errors';
import { translationsChanged } from '../shared/i18n';

/** More roles than this, and the list gets a search box */
const SEARCH_FROM = 6;

@Component({
  selector: 'app-roles',
  imports: [
    FormsModule,
    NgIcon,
    TranslatePipe,
    UiPageHeader,
    UiAlert,
    UiCard,
    UiCardFooter,
    UiButton,
    UiBadge,
    UiCheckbox,
    UiDialog,
    UiDialogFooter,
    UiFormField,
    UiInput,
    UiSearchInput,
  ],
  templateUrl: './roles.component.html',
  styleUrl: './roles.component.scss',
  // Fills the window on desktop, the editor's buttons at the bottom as on the pages with tables; the permissions and
  // a long role list scroll inside
  host: { class: 'page-fit' },
})
export class RolesComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly confirm = inject(UiConfirmService);
  private readonly toast = inject(UiToastService);
  private readonly roleList = viewChild<ElementRef<HTMLElement>>('roleList');

  /** ?role=… picks the role to edit */
  readonly role = input<string>();

  protected readonly icons = { page: lucideShieldCheck, add: lucidePlus, save: lucideSave, remove: lucideTrash2, users: lucideUsers, locked: lucideLock, copy: lucideCopy };
  private readonly i18n = translationsChanged();
  protected readonly groups = PERMISSION_GROUPS;
  protected readonly tones = ROLE_TONES;
  protected readonly toneNames = TONE_NAMES;
  protected readonly saving = signal(false);

  protected readonly selected = computed<Role | undefined>(() =>
    this.store.rolesById().get(this.role() ?? '') ?? this.store.roles()[0]);

  /* Role list */

  /** The list gets a search box once there are more roles than fit at a glance */
  protected readonly searchable = computed(() => this.store.roles().length > SEARCH_FROM);
  protected readonly query = signal('');
  protected readonly shownRoles = computed(() => {
    const query = this.searchable() ? this.query().trim().toLowerCase() : '';
    return query
      ? this.store.roles().filter(role => `${role.name} ${role.description}`.toLowerCase().includes(query))
      : this.store.roles();
  });

  // Editable copies of the selected role; they reset whenever another role is picked or saved
  protected readonly name = linkedSignal(() => this.selected()?.name ?? '');
  protected readonly description = linkedSignal(() => this.selected()?.description ?? '');
  protected readonly tone = linkedSignal<UiTone>(() => this.selected()?.tone ?? 'primary');
  protected readonly permissions = linkedSignal<ReadonlySet<Permission>>(() => new Set(this.selected()?.permissions ?? []));
  protected readonly maxDays = linkedSignal<number | null>(() => this.selected()?.assignment.maxDays ?? null);
  protected readonly reasonRequired = linkedSignal(() => this.selected()?.assignment.reasonRequired ?? false);
  protected readonly maxDayOptions = computed(() => {
    this.i18n();
    // A value set elsewhere stays in the list
    const values = [...new Set([...ASSIGNMENT_MAX_DAYS, this.selected()?.assignment.maxDays ?? null])];
    return values.map(value => ({
      value,
      label: value === null ? this.translate.instant('No limit') : this.translate.instant('dayCount', { count: value }),
    }));
  });

  /* What the signed-in user's role allows here */

  /** Without roles.manage the page is read-only */
  protected readonly canManage = computed(() => this.session.can('roles.manage'));
  /** Nobody changes the permissions of a role they hold, so they cannot lock themselves out or promote themselves */
  protected readonly isOwnRole = computed(() => this.session.roles().some(role => role.id === this.selected()?.id));
  /** Nobody changes a role that allows more than their own, as with people (see access-rules.ts) */
  protected readonly roleEditable = computed(() => this.canManage() && this.session.canAssign(this.selected()));
  /** A built-in role's permissions come from the system */
  protected readonly matrixLocked = computed(() => !this.roleEditable() || this.isOwnRole() || !!this.selected()?.system);
  protected readonly isDefaultRole = computed(() => this.selected()?.id === this.store.settings().defaultRoleId);
  /** Some permissions are ones the signed-in user does not hold, so they cannot tick or untick them */
  protected readonly someLocked = computed(() => !this.matrixLocked() && PERMISSION_GROUPS.some(group =>
    group.permissions.some(permission => !this.session.can(permission.key))));
  /** Roles to copy permissions from: only those that grant nothing the signed-in user lacks */
  protected readonly copyableRoles = computed(() => this.store.roles().filter(role => this.session.canAssign(role)));

  protected readonly dirty = computed(() => {
    const role = this.selected();
    if (!role) {
      return false;
    }
    const current = this.permissions();
    return this.name() !== role.name || this.description() !== role.description || this.tone() !== role.tone
      || current.size !== role.permissions.length || role.permissions.some(permission => !current.has(permission))
      || this.maxDays() !== role.assignment.maxDays || this.reasonRequired() !== role.assignment.reasonRequired;
  });

  protected readonly userCount = computed(() => this.store.roleCounts().get(this.selected()?.id ?? '') ?? 0);
  /** Someone holds it now, or will: it cannot be deleted yet */
  protected readonly inUse = computed(() => {
    const id = this.selected()?.id ?? '';
    return this.store.users().some(user => this.store.holdsOrWillHold(user, id));
  });

  constructor() {
    // The role being edited stays in sight in a long list, as after creating one or opening ?role=…
    afterRenderEffect(() => {
      this.selected();
      this.shownRoles();
      const list = this.roleList()?.nativeElement;
      const row = list?.querySelector<HTMLElement>('.role-item.active');
      if (list && row) {
        const listBox = list.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        // Only the list scrolls, never the page around it
        if (rowBox.top < listBox.top) {
          list.scrollTop -= listBox.top - rowBox.top;
        } else if (rowBox.bottom > listBox.bottom) {
          list.scrollTop += rowBox.bottom - listBox.bottom;
        }
      }
    });
  }

  /** Picks another role through ?role=…, keeping the scroll position */
  private switchTo(roleId: string | null) {
    return this.router.navigate([], { queryParams: { role: roleId }, scroll: 'manual' });
  }

  /** Opens a role in the editor; false, with a reminder, while the editor has unsaved changes */
  protected select(role: Role): boolean {
    if (this.dirty()) {
      this.toast.show(this.translate.instant('Save or discard your changes first.'), 'info');
      return false;
    }
    this.switchTo(role.id);
    return true;
  }

  /** The dropdown on narrow screens; it goes back to the role being edited when that cannot change yet */
  protected pick(field: HTMLSelectElement) {
    const role = this.store.rolesById().get(field.value);
    if (role && !this.select(role)) {
      field.value = this.selected()?.id ?? '';
    }
  }

  /* Permission matrix */

  protected has(permission: Permission) {
    return this.permissions().has(permission);
  }

  /** Whether this box can be changed: the page is editable and the signed-in user holds the permission */
  protected editable(permission: Permission) {
    return !this.matrixLocked() && this.session.can(permission);
  }

  protected groupEditable(group: PermissionGroup) {
    return group.permissions.some(permission => this.editable(permission.key));
  }

  protected toggle(permission: Permission, on: boolean) {
    if (!this.editable(permission)) {
      return;
    }
    this.permissions.update(current => {
      const next = new Set(current);
      if (on) {
        next.add(permission);
      } else {
        next.delete(permission);
      }
      return next;
    });
  }

  protected groupState(group: PermissionGroup): 'all' | 'some' | 'none' {
    const granted = group.permissions.filter(permission => this.has(permission.key)).length;
    return granted === group.permissions.length ? 'all' : granted ? 'some' : 'none';
  }

  protected toggleGroup(group: PermissionGroup) {
    const on = this.groupState(group) !== 'all';
    group.permissions.forEach(permission => this.toggle(permission.key, on));
  }

  /* Saving */

  protected discard() {
    const role = this.selected();
    if (role) {
      this.name.set(role.name);
      this.description.set(role.description);
      this.tone.set(role.tone);
      this.permissions.set(new Set(role.permissions));
      this.maxDays.set(role.assignment.maxDays);
      this.reasonRequired.set(role.assignment.reasonRequired);
    }
  }

  protected async save() {
    const role = this.selected();
    if (!role || !this.name().trim() || !this.roleEditable()) {
      return;
    }
    this.saving.set(true);
    try {
      const assignment = { maxDays: this.maxDays(), reasonRequired: this.reasonRequired() };
      // A built-in role keeps the name, description and permissions the system gives it
      await this.store.updateRole(role.id, role.system ? { tone: this.tone(), assignment } : {
        name: this.name().trim(),
        description: this.description().trim(),
        tone: this.tone(),
        permissions: PERMISSION_GROUPS.flatMap(group => group.permissions.map(permission => permission.key)).filter(key => this.has(key)),
        assignment,
      });
      this.toast.show(this.translate.instant('toast.roleSaved', { name: this.name().trim() }));
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove() {
    const role = this.selected();
    if (!role) {
      return;
    }
    const confirmed = await this.confirm.ask({
      title: this.translate.instant('confirm.deleteRole', { name: role.name }),
      message: this.translate.instant('This cannot be undone.'),
      confirmLabel: this.translate.instant('Delete'),
      cancelLabel: this.translate.instant('Cancel'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.store.deleteRole(role.id);
      this.toast.show(this.translate.instant('toast.roleDeleted', { name: role.name }));
      this.switchTo(null);
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    }
  }

  /* New role dialog */

  protected readonly creating = signal(false);
  protected readonly newName = signal('');
  protected readonly newDescription = signal('');
  protected readonly copyFrom = signal('');

  protected openCreate() {
    this.newName.set('');
    this.newDescription.set('');
    this.copyFrom.set('');
    this.creating.set(true);
  }

  /** A new role of your own, starting as a copy of this one: the way to change what a built-in role allows */
  protected duplicate(role: Role) {
    this.newName.set(this.translate.instant('copyOfRole', { name: role.name }).slice(0, 40));
    this.newDescription.set(role.description);
    this.copyFrom.set(role.id);
    this.creating.set(true);
  }

  protected async create() {
    const name = this.newName().trim();
    if (!name) {
      return;
    }
    const source = this.store.rolesById().get(this.copyFrom());
    try {
      const role = await this.store.createRole({
        name,
        description: this.newDescription().trim(),
        tone: ROLE_TONES[this.store.roles().length % ROLE_TONES.length],
        permissions: source ? [...source.permissions] : this.session.can('users.view') ? ['users.view'] : [],
        assignment: source ? { ...source.assignment } : { ...DEFAULT_ASSIGNMENT_RULES },
      });
      this.creating.set(false);
      this.toast.show(this.translate.instant('toast.roleCreated', { name: role.name }));
      this.switchTo(role.id);
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    }
  }
}
