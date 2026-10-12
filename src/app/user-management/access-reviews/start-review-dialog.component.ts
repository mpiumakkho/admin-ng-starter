import { Component, computed, effect, inject, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { roleAssignmentState } from '../data/access-rules';
import { AdminStore } from '../data/admin-store';
import { REVIEW_DAYS, REVIEW_MAX_DAYS } from '../data/catalog';
import { AccessReview, fullName, User } from '../data/models';
import { errorMessage } from '../shared/errors';
import { intlLocale } from '../shared/formatting';
import { translationsChanged } from '../shared/i18n';
import { UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput, UiToastService } from '../ui';

const DAY_MS = 24 * 60 * 60_000;
/** The most people a review may name to decide all of it (API.md, "Access reviews") */
const MAX_REVIEWERS = 20;

/**
 * Starts an access review (reviews.manage): which roles, whose, until when, and who else decides besides each person's
 * administrators. It says how many role assignments it will cover before it starts. Open it with [(open)].
 */
@Component({
  selector: 'app-start-review-dialog',
  imports: [FormsModule, NgIcon, TranslatePipe, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput],
  template: `
    <ui-dialog [(open)]="open" [title]="'Start access review' | translate" [description]="'The people who look after each person decide whether they keep each role.' | translate" [closeLabel]="'Close' | translate">
      <form class="review-form" id="startReviewForm" (ngSubmit)="start()" novalidate>
        <ui-form-field [label]="'Name' | translate" for="reviewName" required>
          <input uiInput id="reviewName" name="name" [ngModel]="name()" (ngModelChange)="name.set($event)" maxlength="100" autocomplete="off" />
        </ui-form-field>
        <div class="review-scope">
          <ui-form-field [label]="'Roles' | translate" for="reviewRole">
            <select uiInput id="reviewRole" name="role" [ngModel]="roleId()" (ngModelChange)="roleId.set($event)">
              <option value="">{{ 'Every role' | translate }}</option>
              @for (role of store.roles(); track role.id) {
                <option [value]="role.id">{{ role.name }}</option>
              }
            </select>
          </ui-form-field>
          @if (store.branchesEnabled()) {
            <ui-form-field [label]="'People' | translate" for="reviewBranch">
              <select uiInput id="reviewBranch" name="branch" [ngModel]="branchId()" (ngModelChange)="branchId.set($event)">
                <option value="">{{ 'Everyone' | translate }}</option>
                @for (branch of store.branches(); track branch.id) {
                  <option [value]="branch.id">{{ 'peopleOf' | translate: { branch: branch.name } }}</option>
                }
              </select>
            </ui-form-field>
          }
        </div>
        <p class="review-covers" [class.review-covers-none]="!covered()" aria-live="polite">
          {{ (covered() ? 'reviewCovers' : 'Nobody holds these roles now.') | translate: { count: covered() } }}
        </p>
        <ui-form-field [label]="'Closes' | translate" for="reviewDue" [hint]="'At the end of that day the roles marked Remove are taken away. Roles nobody decided stay.' | translate" required>
          <input uiInput class="review-date" type="date" id="reviewDue" name="due" [ngModel]="due()" (ngModelChange)="due.set($event)" [min]="today()" [max]="lastDay()" />
        </ui-form-field>
        <ui-form-field [label]="'Reviewers' | translate" for="reviewReviewer" [optionalLabel]="'(optional)' | translate"
          [hint]="'Each person\\'s administrators decide about their roles. Add anyone else who should decide all of them, such as a department head.' | translate">
          <select uiInput id="reviewReviewer" (change)="addReviewer($any($event.target))" [disabled]="reviewerIds().length >= maxReviewers">
            <option value="">{{ 'Add a reviewer…' | translate }}</option>
            @for (user of candidates(); track user.id) {
              <option [value]="user.id">{{ fullName(user) }}</option>
            }
          </select>
          @if (reviewers().length) {
            <ul class="review-reviewers" [attr.aria-label]="'Reviewers' | translate">
              @for (user of reviewers(); track user.id) {
                <li>
                  <span>{{ fullName(user) }}</span>
                  <button uiButton variant="ghost" size="sm" iconOnly type="button" (click)="removeReviewer(user.id)" [attr.aria-label]="'removeReviewer' | translate: { name: fullName(user) }">
                    <ng-icon [svg]="icons.remove" />
                  </button>
                </li>
              }
            </ul>
          }
        </ui-form-field>
        @if (problem(); as message) {
          <p class="review-problem" role="alert">{{ message | translate }}</p>
        }
      </form>
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="open.set(false)">{{ 'Cancel' | translate }}</button>
        <button uiButton type="submit" form="startReviewForm" [loading]="saving()" [disabled]="!covered()">{{ 'Start review' | translate }}</button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .review-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .review-scope {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      gap: 1rem;
    }

    .review-covers {
      margin: -.25rem 0 0;
      color: var(--ui-muted);
      font-size: .8125rem;
    }

    .review-covers-none {
      color: var(--ui-warning-text);
    }

    .review-date {
      max-width: 14rem;
    }

    .review-reviewers {
      display: flex;
      flex-wrap: wrap;
      gap: .375rem;
      margin: .5rem 0 0;
      padding: 0;
      list-style: none;

      li {
        display: inline-flex;
        align-items: center;
        gap: .125rem;
        padding-inline-start: .625rem;
        border: 1px solid var(--ui-border);
        border-radius: 999px;
        background: var(--ui-surface-muted);
        color: var(--ui-heading);
        font-size: .8125rem;
      }
    }

    .review-problem {
      margin: 0;
      color: var(--ui-danger-text);
      font-size: .8125rem;
    }
  `,
})
export class StartReviewDialog {
  protected readonly store = inject(AdminStore);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly i18n = translationsChanged();

  readonly open = model(false);
  /** The review, once started */
  readonly started = output<AccessReview>();

  protected readonly icons = { remove: lucideX };
  protected readonly fullName = fullName;
  protected readonly maxReviewers = MAX_REVIEWERS;

  protected readonly name = signal('');
  /** Empty: every role */
  protected readonly roleId = signal('');
  /** Empty: everyone */
  protected readonly branchId = signal('');
  protected readonly due = signal('');
  protected readonly reviewerIds = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly problem = signal('');

  protected readonly today = computed(() => dateInput(this.store.now()));
  /** Within a year of starting; the last day ends a little before that */
  protected readonly lastDay = computed(() => dateInput(this.store.now() + (REVIEW_MAX_DAYS - 1) * DAY_MS));

  /** How many role assignments it would cover now: held now or later, of the role picked, by the people picked */
  protected readonly covered = computed(() => {
    const now = this.store.now();
    const roleId = this.roleId();
    const branchId = this.branchId();
    return this.store.users()
      .filter(user => !branchId || user.branchId === branchId)
      .reduce((count, user) => count + user.roles.filter(item => (!roleId || item.roleId === roleId)
        && roleAssignmentState(item, now) !== 'expired').length, 0);
  });

  protected readonly reviewers = computed(() => this.reviewerIds()
    .map(id => this.store.usersById().get(id))
    .filter((user): user is User => !!user));
  /** Active people not named yet, by name */
  protected readonly candidates = computed(() => this.store.users()
    .filter(user => user.status === 'active' && !this.reviewerIds().includes(user.id))
    .sort((a, b) => fullName(a).localeCompare(fullName(b))));

  constructor() {
    // Each time it opens: named after this month, every role of everyone, closing in two weeks
    effect(() => {
      if (!this.open()) {
        return;
      }
      untracked(() => {
        this.i18n();
        const month = new Intl.DateTimeFormat(intlLocale(this.translate.currentLang() ?? ''), { month: 'long', year: 'numeric' }).format(new Date());
        this.name.set(this.translate.instant('reviewName', { month }));
        this.roleId.set('');
        this.branchId.set('');
        this.due.set(dateInput(Date.now() + REVIEW_DAYS * DAY_MS));
        this.reviewerIds.set([]);
        this.problem.set('');
      });
    });
  }

  /** Adds the person picked, and puts the list back to its prompt */
  protected addReviewer(select: HTMLSelectElement) {
    const id = select.value;
    select.value = '';
    if (id && !this.reviewerIds().includes(id)) {
      this.reviewerIds.update(ids => [...ids, id]);
    }
  }

  protected removeReviewer(id: string) {
    this.reviewerIds.update(ids => ids.filter(item => item !== id));
  }

  protected async start() {
    const name = this.name().trim();
    const due = this.due() ? endOfDay(this.due()) : 0;
    if (!name) {
      this.problem.set('Give the review a name.');
      return;
    }
    if (due <= Date.now() || due > Date.now() + REVIEW_MAX_DAYS * DAY_MS) {
      this.problem.set('Pick a day from today to a year from now.');
      return;
    }
    this.saving.set(true);
    this.problem.set('');
    try {
      const review = await this.store.startAccessReview({
        name, roleId: this.roleId() || null, branchId: this.branchId() || null, dueAt: new Date(due).toISOString(), reviewerIds: this.reviewerIds(),
      });
      this.toast.show(this.translate.instant('toast.reviewStarted', { name }));
      this.open.set(false);
      this.started.emit(review);
    } catch (error) {
      this.problem.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}

/** A moment as a date input's value, in local time: "2026-10-31" */
function dateInput(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The last moment of a date, in local time: a review "closing on 31 Oct" takes all of that day */
function endOfDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}
