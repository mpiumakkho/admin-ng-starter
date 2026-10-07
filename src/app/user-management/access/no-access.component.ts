import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowLeft, lucideShieldOff } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';

import { UiButton, UiCard, UiEmptyState } from '../ui';
import { Session } from './session';

/** Shown in place of a page the signed-in user's role does not allow; the guards in guards.ts send people here */
@Component({
  selector: 'app-no-access',
  imports: [RouterLink, NgIcon, TranslatePipe, UiCard, UiEmptyState, UiButton],
  template: `
    <ui-card>
      <ui-empty-state [icon]="icons.locked" [title]="'You don\\'t have access to this page' | translate"
        [description]="'noAccessHint' | translate: { role: session.role()?.name ?? '' }">
        <button uiButton variant="secondary" type="button" (click)="location.back()"><ng-icon [svg]="icons.back" /> {{ 'Go back' | translate }}</button>
        <a uiButton [routerLink]="session.homeUrl()">{{ 'Go to home' | translate }}</a>
      </ui-empty-state>
    </ui-card>
  `,
})
export class NoAccessComponent {
  protected readonly session = inject(Session);
  protected readonly location = inject(Location);
  protected readonly icons = { locked: lucideShieldOff, back: lucideArrowLeft };
}
