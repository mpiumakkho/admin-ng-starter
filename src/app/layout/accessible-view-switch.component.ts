import { Component, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideAccessibility } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';

import { UiAccessibleViewService } from '../user-management/ui';

/**
 * Turns the accessible view on or off, on the pages without the navbar (signing in, the links in emails, the error
 * pages); signed in, the account menu does it. Every page must lead to the accessible view for it to count as AAA,
 * so this switch meets AAA itself in both views: 44 pixels tall, its text 7:1.
 */
@Component({
  selector: 'app-accessible-view-switch',
  imports: [NgIcon, TranslatePipe],
  template: `
    <button type="button" class="view-switch" role="switch" [attr.aria-checked]="view.on()" (click)="view.toggle()">
      <ng-icon [svg]="icon" aria-hidden="true" />
      {{ 'Accessible view' | translate }}
      <!-- The state is aria-checked for screen readers; the name stays the same as it changes -->
      <span class="view-switch-state" aria-hidden="true">{{ (view.on() ? 'On' : 'Off') | translate }}</span>
    </button>
  `,
  styles: `
    :host {
      position: fixed;
      inset-block-start: .75rem;
      inset-inline-end: .75rem;
      z-index: 20;
    }

    .view-switch {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      min-height: 44px;
      padding: 0 .875rem;
      border: 1px solid var(--ui-border-strong);
      border-radius: 999px;
      background: var(--ui-surface);
      color: var(--ui-heading);
      font: 500 .8125rem/1 var(--ui-font);
      cursor: pointer;

      &:hover {
        background: var(--ui-hover);
      }

      ng-icon {
        font-size: 1.125rem;
      }
    }

    .view-switch-state {
      padding: .25rem .5rem;
      border-radius: 999px;
      background: var(--ui-hover);
      color: var(--ui-heading);
      font-size: .75rem;
      font-weight: 600;
    }
  `,
})
export class AccessibleViewSwitchComponent {
  protected readonly view = inject(UiAccessibleViewService);
  protected readonly icon = lucideAccessibility;
}
