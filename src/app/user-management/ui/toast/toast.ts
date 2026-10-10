import { booleanAttribute, ChangeDetectionStrategy, Component, inject, Injectable, input, signal, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck, lucideInfo, lucideX } from '@ng-icons/lucide';

import { UiAccessibleViewService } from '../theme/accessible-view.service';

export type UiToastTone = 'success' | 'error' | 'info';

export interface UiToast {
  id: number;
  message: string;
  tone: UiToastTone;
}

/**
 * Short confirmations that pop up at the bottom of the screen and fade after a few seconds.
 * Place one <ui-toaster /> in the app shell, then call `show` from anywhere.
 *
 * In the accessible view they stay until dismissed (WCAG 2.2.3), so the shell shows them in the page, above its
 * content, where they cover nothing (<ui-toaster inline />, WCAG 2.4.12).
 *
 *   this.toast.show('User saved');
 *   this.toast.show('Could not delete the role', 'error');
 */
@Injectable({ providedIn: 'root' })
export class UiToastService {
  private readonly accessibleView = inject(UiAccessibleViewService);
  private nextId = 0;
  readonly toasts = signal<UiToast[]>([]);

  /** Returns the toast's id, for dismissing it early */
  show(message: string, tone: UiToastTone = 'success', duration = 3000): number {
    const toast = { id: this.nextId++, message, tone };
    // Keep the three newest so a burst of actions does not cover the page
    this.toasts.update(toasts => [...toasts, toast].slice(-3));
    if (!this.accessibleView.on()) {
      setTimeout(() => this.dismiss(toast.id), duration);
    }
    return toast.id;
  }

  dismiss(id: number): void {
    this.toasts.update(toasts => toasts.filter(toast => toast.id !== id));
  }
}

@Component({
  selector: 'ui-toaster',
  imports: [NgIcon],
  template: `
    @for (item of service.toasts(); track item.id) {
      <div class="ui-toast" [class]="'ui-toast ui-toast-' + item.tone" role="status">
        <ng-icon [svg]="icons[item.tone]" class="ui-toast-icon" />
        <span class="ui-toast-message">{{ item.message }}</span>
        <button type="button" class="ui-toast-close" [attr.aria-label]="dismissLabel()" (click)="service.dismiss(item.id)">
          <ng-icon [svg]="closeIcon" />
        </button>
      </div>
    }
  `,
  styles: `
    .ui-toaster {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      z-index: 1100;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .5rem;
      transform: translateX(-50%);
      pointer-events: none;
    }

    .ui-toast {
      display: inline-flex;
      align-items: center;
      gap: .625rem;
      max-width: min(480px, calc(100vw - 2rem));
      padding: .625rem .5rem .625rem 1rem;
      border-radius: 999px;
      background: #0f172a;
      box-shadow: var(--ui-shadow-lg);
      color: #f8fafc;
      font: 500 .8125rem/1.4 var(--ui-font);
      pointer-events: auto;
      animation: ui-toast-in .25s var(--ui-ease);
    }

    .ui-toast-icon {
      flex-shrink: 0;
      font-size: 1rem;
    }

    .ui-toast-success .ui-toast-icon { color: #34d399; }
    .ui-toast-error .ui-toast-icon { color: #f87171; }
    .ui-toast-info .ui-toast-icon { color: #38bdf8; }

    .ui-toast-close {
      display: inline-flex;
      padding: .25rem;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;

      &:hover {
        background: rgba(255, 255, 255, .1);
        color: #ffffff;
      }
    }

    .theme-dark .ui-toast,
    [data-theme="dark"] .ui-toast {
      background: #334155;
    }

    // In the page, above its content: a full-width stack that pushes the page down instead of covering it, drawn
    // like the page's own messages (ui-alert)
    .ui-toaster-inline {
      position: static;
      align-items: stretch;
      transform: none;

      &:not(:empty) {
        margin-bottom: 1rem;
      }

      .ui-toast {
        max-width: none;
        padding: 0 0 0 .875rem;
        border: 1px solid var(--ui-border-strong);
        border-radius: var(--ui-radius);
        background: var(--ui-surface);
        box-shadow: none;
        color: var(--ui-text);
        animation: none;
      }

      .ui-toast-message {
        flex: 1;
      }

      .ui-toast-success .ui-toast-icon { color: var(--ui-success-text); }
      .ui-toast-error .ui-toast-icon { color: var(--ui-danger-text); }
      .ui-toast-info .ui-toast-icon { color: var(--ui-info-text); }

      .ui-toast-close {
        justify-content: center;
        align-items: center;
        color: var(--ui-muted);

        &:hover {
          background: var(--ui-hover);
          color: var(--ui-heading);
        }
      }
    }

    @keyframes ui-toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-toaster', '[class.ui-toaster-inline]': 'inline()', 'aria-live': 'polite' },
})
export class UiToaster {
  /** In the flow of the page rather than floating over its bottom */
  readonly inline = input(false, { transform: booleanAttribute });
  readonly dismissLabel = input('Dismiss');

  protected readonly service = inject(UiToastService);
  protected readonly closeIcon = lucideX;
  protected readonly icons: Record<UiToastTone, string> = {
    success: lucideCircleCheck,
    error: lucideCircleAlert,
    info: lucideInfo,
  };
}
