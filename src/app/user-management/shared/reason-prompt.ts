import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { AdminStore } from '../data/admin-store';
import { ReasonAction } from '../data/models';
import { UiConfirmOptions, UiConfirmService } from '../ui';

/** As long as a reason may be (API.md, "Reasons") */
export const MAX_REASON = 500;

/**
 * Confirms a change that takes or resets someone's access with the reason the activity log keeps (API.md, "Reasons"):
 * required when the settings' reasonsRequired lists the action, optional otherwise.
 *
 *   const reason = await this.reasons.ask('delete', { title: 'Delete Ann?', confirmLabel: 'Delete', tone: 'danger' });
 *   if (reason !== null) { await this.store.deleteUsers([id], reason || undefined); }
 *
 * A change that asks nothing first, such as suspending someone, passes `onlyIfRequired`: it then asks only when the
 * settings require a reason, and answers '' at once otherwise.
 */
@Injectable({ providedIn: 'root' })
export class ReasonPrompt {
  private readonly store = inject(AdminStore);
  private readonly confirm = inject(UiConfirmService);
  private readonly translate = inject(TranslateService);

  /** The reason, trimmed and maybe empty; null when cancelled */
  async ask(action: ReasonAction, options: UiConfirmOptions, onlyIfRequired = false): Promise<string | null> {
    const required = this.store.settings().reasonsRequired.includes(action);
    if (!required && onlyIfRequired) {
      return '';
    }
    return this.confirm.prompt({
      cancelLabel: this.translate.instant('Cancel'),
      ...options,
      label: this.translate.instant('Reason'),
      required,
      optionalLabel: this.translate.instant('(optional)'),
      requiredMessage: this.translate.instant('Give a reason. The activity log keeps it.'),
      maxLength: MAX_REASON,
    });
  }
}
