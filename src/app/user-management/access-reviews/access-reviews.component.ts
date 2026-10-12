import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideClipboardCheck, lucidePlus } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';

import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { REVIEW_STATUS } from '../data/catalog';
import { AccessReview } from '../data/models';
import { LocalDatePipe } from '../shared/formatting';
import { UiAlert, UiBadge, UiButton, UiCard, UiEmptyState, UiPageHeader, UiTable } from '../ui';
import { StartReviewDialog } from './start-review-dialog.component';

/**
 * Access reviews (API.md, "Access reviews"): rounds of checking that people still need the roles they hold, as audits
 * ask. People with reviews.manage see and start them all; anyone else sees the ones they decide in, with how many roles
 * wait for them.
 */
@Component({
  selector: 'app-access-reviews',
  imports: [RouterLink, NgIcon, TranslatePipe, LocalDatePipe, UiAlert, UiBadge, UiButton, UiCard, UiEmptyState, UiPageHeader, UiTable, StartReviewDialog],
  templateUrl: './access-reviews.component.html',
  styleUrl: './access-reviews.component.scss',
  // Fills the window on desktop; the list scrolls inside its card
  host: { class: 'page-fit' },
})
export class AccessReviewsComponent {
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly icons = { page: lucideClipboardCheck, add: lucidePlus };
  protected readonly status = REVIEW_STATUS;
  protected readonly canManage = computed(() => this.session.can('reviews.manage'));
  protected readonly starting = signal(false);

  /** Each review with how far its decisions have got, in percent */
  protected readonly rows = computed(() => this.store.accessReviews().map(review => ({
    review,
    progress: review.itemCount ? Math.round(review.decidedCount / review.itemCount * 100) : 100,
  })));

  protected roleName(roleId: string): string {
    return this.store.rolesById().get(roleId)?.name ?? '';
  }

  protected branchName(branchId: string): string {
    return this.store.branchesById().get(branchId)?.name ?? '';
  }

  protected open(review: AccessReview) {
    this.router.navigate(['/access-reviews', review.id]);
  }
}
