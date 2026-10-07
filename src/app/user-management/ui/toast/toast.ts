import { ChangeDetectionStrategy, Component, inject, Injectable, signal, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck, lucideInfo, lucideX } from '@ng-icons/lucide';

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
 *   this.toast.show('User saved');
 *   this.toast.show('Could not delete the role', 'error');
 */
@Injectable({ providedIn: 'root' })
export class UiToastService {
  private nextId = 0;
  readonly toasts = signal<UiToast[]>([]);

  show(message: string, tone: UiToastTone = 'success', duration = 3000): void {
    const toast = { id: this.nextId++, message, tone };
    // Keep the three newest so a burst of actions does not cover the page
    this.toasts.update(toasts => [...toasts, toast].slice(-3));
    setTimeout(() => this.dismiss(toast.id), duration);
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
        <button type="button" class="ui-toast-close" aria-label="Dismiss" (click)="service.dismiss(item.id)">
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

    @keyframes ui-toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-toaster', 'aria-live': 'polite' },
})
export class UiToaster {
  protected readonly service = inject(UiToastService);
  protected readonly closeIcon = lucideX;
  protected readonly icons: Record<UiToastTone, string> = {
    success: lucideCircleCheck,
    error: lucideCircleAlert,
    info: lucideInfo,
  };
}
