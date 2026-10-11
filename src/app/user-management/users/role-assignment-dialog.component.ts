import { booleanAttribute, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Session } from '../access/session';
import { roleAssignmentState } from '../data/access-rules';
import { AdminStore } from '../data/admin-store';
import { fullName, RoleAssignment, RoleGrant, User } from '../data/models';
import { errorMessage } from '../shared/errors';
import { LocalDatePipe } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import { UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput, UiOption, UiSegmented, UiToastService } from '../ui';

const DAY_MS = 24 * 60 * 60_000;

/**
 * Gives a role, for good or until a date, as Microsoft Entra's role assignments do; or changes when one ends and why.
 *
 * - With `users`: gives one person, or everyone selected on the list, the role picked. People who already hold it are
 *   left as they are.
 * - With `draft`: for a user not saved yet; emits the grant instead of saving it.
 * - With `assignment`: moves its end (extend, shorten, renew one that has expired) or changes its reason.
 *
 * Only roles the signed-in user may give are offered, with each role's own rules (an end within so many days, a
 * reason); the server checks all of it again. Open it with [(open)].
 */
@Component({
  selector: 'app-role-assignment-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, LocalDatePipe, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput, UiSegmented],
  template: `
    <ui-dialog [(open)]="open" [title]="title()" [description]="description()" [closeLabel]="'Close' | translate">
      <form [id]="formId" class="assignment-form" (submit)="$event.preventDefault(); save()" novalidate>
        @if (assignment(); as current) {
          <p class="assignment-role">
            <span>{{ 'Role' | translate }}</span>
            <b>{{ roleName(current.roleId) }}</b>
            @if (store.branchesEnabled() && current.branchId) {
              <span>· {{ branchName(current.branchId) }}</span>
            }
            <span class="assignment-started">{{ (started() ? 'startedOn' : 'startsOn') | translate: { date: (current.startsAt | localDate) } }}</span>
          </p>
        } @else {
          <ui-form-field [label]="'Role' | translate" [for]="formId + '-role'" [hint]="rulesHint()" required>
            <select uiInput [id]="formId + '-role'" [formControl]="role">
              @for (option of offered(); track option.id) {
                <option [value]="option.id">{{ option.name }}</option>
              }
            </select>
          </ui-form-field>
          @if (store.branchesEnabled()) {
            <ui-form-field [label]="'Applies in' | translate" [for]="formId + '-scope'" [hint]="'A role for one branch allows what it allows there only.' | translate">
              <select uiInput [id]="formId + '-scope'" [formControl]="scope">
                <option value="">{{ 'Whole organization' | translate }}</option>
                @for (branch of store.openBranches(); track branch.id) {
                  <option [value]="branch.id">{{ branch.name }}</option>
                }
              </select>
            </ui-form-field>
          }
          <ui-form-field [label]="'Starts' | translate" [for]="formId + '-start'" [errors]="errors()">
            <ui-segmented [options]="startOptions()" [formControl]="startMode" [ariaLabel]="'Starts' | translate" />
            @if (startMode.value === 'date') {
              <input uiInput class="assignment-date" type="date" [id]="formId + '-start'" [formControl]="startDate" [attr.min]="today()" [attr.aria-label]="'Start date' | translate" />
            }
          </ui-form-field>
        }
        <ui-form-field [label]="'Ends' | translate" [for]="formId + '-end'" [errors]="errors()" [hint]="assignment() ? rulesHint() : ''">
          <ui-segmented [options]="endOptions()" [formControl]="endMode" [ariaLabel]="'Ends' | translate" />
          @if (endMode.value === 'date') {
            <input uiInput class="assignment-date" type="date" [id]="formId + '-end'" [formControl]="endDate" [attr.min]="endMin()" [attr.max]="endMax()" [attr.aria-label]="'End date' | translate" />
          }
        </ui-form-field>
        <ui-form-field [label]="'Reason' | translate" [for]="formId + '-reason'" [required]="rules().reasonRequired"
          [optionalLabel]="rules().reasonRequired ? '' : ('(optional)' | translate)" [errors]="errors()">
          <textarea uiInput [id]="formId + '-reason'" rows="2" maxlength="500" [formControl]="reason"></textarea>
        </ui-form-field>
        @if (problem(); as message) {
          <p class="assignment-problem" role="alert">{{ message | translate }}</p>
        }
      </form>
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="open.set(false)">{{ 'Cancel' | translate }}</button>
        <button uiButton type="submit" [attr.form]="formId" [loading]="saving()" [disabled]="!assignment() && !role.value">
          {{ (assignment() ? 'Save changes' : draft() ? 'Add' : 'Give role') | translate }}
        </button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .assignment-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .assignment-date {
      margin-top: .5rem;
      max-width: 14rem;
    }

    .assignment-role {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: .5rem;
      margin: 0;
      color: var(--ui-muted);
      font-size: .8125rem;

      b {
        color: var(--ui-heading);
        font-size: .875rem;
      }
    }

    .assignment-problem {
      margin: 0;
      color: var(--ui-danger-text);
      font-size: .8125rem;
    }
  `,
})
export class RoleAssignmentDialog {
  private static nextId = 0;
  protected readonly store = inject(AdminStore);
  private readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly i18n = translationsChanged();

  readonly open = model(false);
  /** Who gets the role; one person, or everyone selected */
  readonly users = input<User[]>([]);
  /** For a user not saved yet: the grant is emitted, not saved */
  readonly draft = input(false, { transform: booleanAttribute });
  /** Roles a draft already has, so they are not offered again */
  readonly exclude = input<string[]>([]);
  /** An assignment to change instead of a new one */
  readonly assignment = input<RoleAssignment | null>(null);
  /** A draft's grant */
  readonly granted = output<RoleGrant>();
  /** Saved; the list clears its selection */
  readonly done = output<void>();

  protected readonly formId = `role-assignment-${RoleAssignmentDialog.nextId++}`;
  protected readonly saving = signal(false);
  protected readonly problem = signal('');

  protected readonly role = new FormControl('', { nonNullable: true });
  /** Empty: the whole organization; otherwise a branch id */
  protected readonly scope = new FormControl('', { nonNullable: true });
  protected readonly startMode = new FormControl<'now' | 'date'>('now', { nonNullable: true });
  protected readonly startDate = new FormControl('', { nonNullable: true });
  protected readonly endMode = new FormControl<'never' | 'date'>('never', { nonNullable: true });
  protected readonly endDate = new FormControl('', { nonNullable: true, validators: Validators.required });
  protected readonly reason = new FormControl('', { nonNullable: true });

  private readonly roleId = toSignal(this.role.valueChanges, { initialValue: '' });
  private readonly scopeValue = toSignal(this.scope.valueChanges, { initialValue: '' });
  private readonly startValue = toSignal(this.startDate.valueChanges, { initialValue: '' });
  private readonly startModeValue = toSignal(this.startMode.valueChanges, { initialValue: 'now' as const });

  /** Roles the signed-in user may give, other than ones the person holds now or later where it would apply */
  protected readonly offered = computed(() => {
    const single = this.users().length === 1 ? this.users()[0] : null;
    const excluded = new Set(this.exclude());
    const branchId = this.scopeValue() || null;
    return this.store.roles().filter(role => this.session.canAssign(role) && !excluded.has(role.id)
      && !(single && this.store.holdsOrWillHold(single, role.id, branchId)));
  });
  protected readonly rules = computed(() => {
    const roleId = this.assignment()?.roleId ?? this.roleId();
    return this.store.rolesById().get(roleId)?.assignment ?? { maxDays: null, reasonRequired: false };
  });
  protected readonly started = computed(() => {
    const current = this.assignment();
    return !!current && roleAssignmentState(current, this.store.now()) !== 'scheduled';
  });

  protected readonly title = computed(() => {
    this.i18n();
    const current = this.assignment();
    const users = this.users();
    if (current) {
      return this.translate.instant('changeAssignmentTitle', { role: this.roleName(current.roleId) });
    }
    if (this.draft()) {
      return this.translate.instant('Add a role');
    }
    return users.length === 1
      ? this.translate.instant('giveRoleTo', { name: fullName(users[0]) })
      : this.translate.instant('giveRoleCount', { count: users.length });
  });
  protected readonly description = computed(() => {
    this.i18n();
    if (this.assignment()) {
      return this.translate.instant('Extend it, end it sooner, or renew it after it has ended.');
    }
    return this.translate.instant(this.users().length > 1
      ? 'Everyone selected gets the role. People who already have it are left as they are.'
      : 'Give it for good, or until a date when it ends by itself.');
  });
  /** The role's own rules, under its name */
  protected readonly rulesHint = computed(() => {
    this.i18n();
    const rules = this.rules();
    return [
      rules.maxDays !== null ? this.translate.instant('roleMaxDaysHint', { count: rules.maxDays }) : '',
      rules.reasonRequired ? this.translate.instant('This role needs a reason.') : '',
    ].filter(Boolean).join(' ');
  });
  protected readonly startOptions = computed<UiOption<'now' | 'date'>[]>(() => {
    this.i18n();
    return [{ value: 'now', label: this.translate.instant('Now') }, { value: 'date', label: this.translate.instant('On a date') }];
  });
  protected readonly endOptions = computed<UiOption<'never' | 'date'>[]>(() => {
    this.i18n();
    return [
      { value: 'never', label: this.translate.instant('For good'), disabled: this.rules().maxDays !== null },
      { value: 'date', label: this.translate.instant('On a date') },
    ];
  });
  protected readonly errors = computed<Record<string, string>>(() => {
    this.i18n();
    return { required: this.translate.instant('This field is required.') };
  });

  protected readonly today = computed(() => dateInput(this.store.now()));
  /** When it starts, as the dates stand */
  private readonly start = computed(() => {
    const current = this.assignment();
    if (current) {
      return Math.max(new Date(current.startsAt).getTime(), this.store.now());
    }
    const value = this.startModeValue() === 'date' ? this.startValue() : '';
    return Math.max(value ? startOfDay(value) : 0, this.store.now());
  });
  protected readonly endMin = computed(() => dateInput(this.start()));
  protected readonly endMax = computed(() => {
    const maxDays = this.rules().maxDays;
    return maxDays === null ? null : dateInput(this.start() + maxDays * DAY_MS);
  });

  constructor() {
    // Each time it opens: the assignment as it is, or the first role offered, from now, for good when its rules allow
    effect(() => {
      if (!this.open()) {
        return;
      }
      untracked(() => {
        const current = this.assignment();
        this.problem.set('');
        this.scope.setValue(current?.branchId ?? '');
        this.role.setValue(current?.roleId ?? this.offered()[0]?.id ?? '');
        this.startMode.setValue('now');
        this.startDate.setValue(this.today());
        this.reason.setValue(current?.reason ?? '');
        this.setEnd(current?.endsAt ?? null);
      });
    });
    // A role that must end gets an end at its longest
    this.role.valueChanges.subscribe(() => {
      if (!this.assignment()) {
        this.setEnd(null);
      }
    });
    // Another scope can leave the role picked already held there: the first one offered instead
    effect(() => {
      const offered = this.offered();
      untracked(() => {
        if (this.open() && !this.assignment() && !offered.some(role => role.id === this.role.value)) {
          this.role.setValue(offered[0]?.id ?? '');
        }
      });
    });
  }

  protected roleName(roleId: string): string {
    return this.store.rolesById().get(roleId)?.name ?? '';
  }

  protected branchName(branchId: string): string {
    return this.store.branchesById().get(branchId)?.name ?? '';
  }

  protected async save() {
    this.problem.set('');
    this.endDate.markAsTouched();
    const grant = this.grant();
    if (!grant) {
      return;
    }
    const current = this.assignment();
    if (this.draft() && !current) {
      this.granted.emit(grant);
      this.open.set(false);
      return;
    }
    this.saving.set(true);
    try {
      if (current) {
        await this.store.updateRoleAssignment(current.id, { endsAt: grant.endsAt, reason: grant.reason ?? '' });
        this.toast.show(this.translate.instant('Role assignment saved.'));
      } else if (this.users().length === 1) {
        await this.store.assignRole({ userId: this.users()[0].id, ...grant });
        this.toast.show(this.translate.instant('Role given.'));
      } else {
        const changed = await this.store.assignRoles(this.users().map(user => user.id), { add: grant });
        this.toast.show(this.translate.instant('toast.roleGiven', { count: changed.length }));
      }
      this.open.set(false);
      this.done.emit();
    } catch (error) {
      this.problem.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** The form as a grant, or null with what is wrong shown */
  private grant(): RoleGrant | null {
    const rules = this.rules();
    const now = Date.now();
    const start = this.assignment() || this.startMode.value === 'now' || !this.startDate.value
      ? null : startOfDay(this.startDate.value);
    if (start !== null && start < startOfDay(dateInput(now))) {
      this.problem.set('Pick today or a later day.');
      return null;
    }
    let endsAt: string | null = null;
    if (this.endMode.value === 'date') {
      if (!this.endDate.value) {
        return null;
      }
      const from = Math.max(start ?? now, this.assignment() ? new Date(this.assignment()!.startsAt).getTime() : 0, now);
      let end = endOfDay(this.endDate.value);
      // The last day allowed ends when the role's longest assignment does
      if (rules.maxDays !== null) {
        end = Math.min(end, from + rules.maxDays * DAY_MS);
      }
      if (end <= from) {
        this.problem.set('Pick an end after the start.');
        return null;
      }
      endsAt = new Date(end).toISOString();
    }
    const reason = this.reason.value.trim();
    if (rules.reasonRequired && !reason) {
      this.problem.set('This role needs a reason.');
      return null;
    }
    return {
      roleId: this.assignment()?.roleId ?? this.role.value,
      ...(!this.assignment() && this.scope.value ? { branchId: this.scope.value } : {}),
      ...(start !== null && start > now ? { startsAt: new Date(start).toISOString() } : {}),
      endsAt,
      ...(reason ? { reason } : {}),
    };
  }

  /** For good, or the given end; a role that must end defaults to its longest */
  private setEnd(endsAt: string | null) {
    const maxDays = untracked(this.rules).maxDays;
    if (endsAt) {
      this.endMode.setValue('date');
      this.endDate.setValue(dateInput(new Date(endsAt).getTime()));
    } else if (maxDays !== null) {
      this.endMode.setValue('date');
      this.endDate.setValue(dateInput(untracked(this.start) + maxDays * DAY_MS));
    } else {
      this.endMode.setValue('never');
      this.endDate.setValue(dateInput(untracked(this.start) + 30 * DAY_MS));
    }
  }
}

/** A moment as a date input's value, in local time: "2026-10-31" */
function dateInput(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

/** The last moment of a date, in local time: a role "until 31 Oct" lasts the whole of that day */
function endOfDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}
