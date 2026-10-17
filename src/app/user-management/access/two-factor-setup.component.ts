import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideLogOut, lucideShieldCheck } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';

import { AdminStore } from '../data/admin-store';
import { UiButton, UiCard, UiEmptyState } from '../ui';
import { Session } from './session';
import { TwoFactorDialog } from './two-factor-dialog.component';

/**
 * Where someone lands whose role requires two-step sign-in while it is off (API.md, "Roles that must use two-step
 * sign-in"). Nothing else opens until they turn it on; then the data loads in full and they go on to their first page.
 */
@Component({
  selector: 'app-two-factor-setup',
  imports: [NgIcon, TranslatePipe, UiButton, UiCard, UiEmptyState, TwoFactorDialog],
  template: `
    <div class="setup">
      <ui-card>
        <ui-empty-state [icon]="icons.shield" [title]="'Turn on two-step sign-in to continue' | translate"
          [description]="'twoFactorRequiredHint' | translate: { role: session.role()?.name ?? '' }">
          <button uiButton variant="secondary" type="button" (click)="session.signOut()"><ng-icon [svg]="icons.signOut" /> {{ 'Sign out' | translate }}</button>
          <button uiButton type="button" (click)="open.set(true)">{{ 'Turn on' | translate }}</button>
        </ui-empty-state>
      </ui-card>
    </div>
    <app-two-factor-dialog mode="enable" [(open)]="open" (openChange)="!$event && continue()" />
  `,
  styles: `
    .setup { display: grid; place-items: center; min-height: var(--ui-100vh); padding: 1rem; background: var(--ui-bg); }
    .setup ui-card { width: min(100%, 32rem); }
  `,
})
export class TwoFactorSetupComponent {
  protected readonly session = inject(Session);
  private readonly store = inject(AdminStore);
  private readonly router = inject(Router);

  protected readonly open = signal(false);
  protected readonly icons = { shield: lucideShieldCheck, signOut: lucideLogOut };

  /** After the dialog closes: if two-step sign-in is now on, everything loads and the person goes on */
  protected async continue() {
    await this.store.load().catch(() => undefined);
    if (!this.store.twoFactorSetupRequired()) {
      await this.router.navigateByUrl(this.session.homeUrl());
    }
  }
}
