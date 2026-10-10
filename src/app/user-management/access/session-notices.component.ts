import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AdminStore } from '../data/admin-store';
import { UiAccessibleViewService, UiAlert, UiButton } from '../ui';
import { Session, TWO_FACTOR_SETUP_PATH } from './session';

/**
 * What the accessible view tells rather than does by itself (WCAG 2.2.4, 3.2.5): that changes made elsewhere are
 * waiting, and that the role now requires two-step sign-in. Each waits for a button; nothing moves until then.
 *
 * Place one above the page content in the app shell.
 */
@Component({
  selector: 'app-session-notices',
  imports: [RouterLink, TranslatePipe, UiAlert, UiButton],
  template: `
    @if (store.changesWaiting()) {
      <ui-alert tone="info" [title]="'Newer changes are waiting' | translate">
        {{ 'changesWaiting' | translate }}
        <button uiAlertActions uiButton variant="secondary" size="sm" type="button" (click)="store.showChanges()">{{ 'Show the changes' | translate }}</button>
      </ui-alert>
    }
    @if (setupRequired()) {
      <ui-alert tone="warning" [title]="'Turn on two-step sign-in' | translate">
        {{ 'Your role requires two-step sign-in. Turn it on to continue.' | translate }}
        <a uiAlertActions uiButton size="sm" [routerLink]="setupPath">{{ 'Set it up' | translate }}</a>
      </ui-alert>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: .75rem;
    }

    :host(.has-notices) {
      margin-bottom: 1rem;
    }
  `,
  host: { '[class.has-notices]': 'store.changesWaiting() || setupRequired()' },
})
export class SessionNotices {
  protected readonly store = inject(AdminStore);
  private readonly session = inject(Session);
  private readonly accessibleView = inject(UiAccessibleViewService);

  protected readonly setupPath = TWO_FACTOR_SETUP_PATH;
  /** In the usual view, Session opens the setup page at once */
  protected readonly setupRequired = computed(() => this.session.twoFactorSetupRequired() && this.accessibleView.on());
}
