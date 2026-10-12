import { TranslateService } from '@ngx-translate/core';

import { AdminStore } from '../data/admin-store';
import { AccessReview } from '../data/models';

/** What a review covers, as its pages say it: "Every role · People of Chiang Mai", "Role: Support · Everyone" */
export function reviewScope(review: AccessReview, store: AdminStore, translate: TranslateService): string {
  const role = review.roleId
    ? translate.instant('roleScope', { role: store.rolesById().get(review.roleId)?.name ?? translate.instant('Deleted role') })
    : translate.instant('Every role');
  const people = review.branchId
    ? translate.instant('peopleOf', { branch: store.branchesById().get(review.branchId)?.name ?? '' })
    : translate.instant('Everyone');
  return `${role} · ${people}`;
}
