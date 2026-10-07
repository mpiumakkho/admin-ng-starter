import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck, lucideInfo, lucideTriangleAlert } from '@ng-icons/lucide';

import { UiTone } from '../core/types';

const ICONS: Partial<Record<UiTone, string>> = {
  success: lucideCircleCheck,
  warning: lucideTriangleAlert,
  danger: lucideCircleAlert,
};

/**
 * A short message in the page, tinted by tone: an error under a form, a note that a page is read-only.
 * Danger alerts are announced to screen readers as they appear.
 *
 *   <ui-alert tone="danger">Wrong email or password.</ui-alert>
 *   <ui-alert tone="info" title="Read-only">Your role can view roles but not change them.</ui-alert>
 */
@Component({
  selector: 'ui-alert',
  imports: [NgIcon],
  template: `
    <ng-icon class="ui-alert-icon" [svg]="iconSvg()" aria-hidden="true" />
    <div class="ui-alert-body">
      @if (title()) {
        <p class="ui-alert-title">{{ title() }}</p>
      }
      <div class="ui-alert-text"><ng-content /></div>
    </div>
    <ng-content select="[uiAlertActions]" />
  `,
  styles: `
    .ui-alert {
      display: flex;
      align-items: flex-start;
      gap: .625rem;
      padding: .625rem .875rem;
      border: 1px solid color-mix(in srgb, var(--ui-alert-fg) 22%, transparent);
      border-radius: var(--ui-radius);
      background: var(--ui-alert-bg);
      color: var(--ui-text);
      font-family: var(--ui-font);
      font-size: .8125rem;
      line-height: 1.5;
    }

    .ui-alert-icon {
      flex-shrink: 0;
      margin-top: .125rem;
      color: var(--ui-alert-fg);
      font-size: 1rem;
    }

    .ui-alert-body {
      flex: 1;
      min-width: 0;
    }

    .ui-alert-title {
      margin: 0 0 .125rem;
      color: var(--ui-heading);
      font-weight: 600;
    }

    .ui-alert-text > :last-child {
      margin-bottom: 0;
    }

    .ui-alert-primary { --ui-alert-bg: var(--ui-primary-soft); --ui-alert-fg: var(--ui-primary-text); }
    .ui-alert-success { --ui-alert-bg: var(--ui-success-soft); --ui-alert-fg: var(--ui-success-text); }
    .ui-alert-warning { --ui-alert-bg: var(--ui-warning-soft); --ui-alert-fg: var(--ui-warning-text); }
    .ui-alert-danger { --ui-alert-bg: var(--ui-danger-soft); --ui-alert-fg: var(--ui-danger-text); }
    .ui-alert-info { --ui-alert-bg: var(--ui-info-soft); --ui-alert-fg: var(--ui-info-text); }
    .ui-alert-neutral { --ui-alert-bg: var(--ui-neutral-soft); --ui-alert-fg: var(--ui-neutral-text); }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"ui-alert ui-alert-" + tone()',
    '[attr.role]': 'tone() === "danger" ? "alert" : "status"',
  },
})
export class UiAlert {
  readonly tone = input<UiTone>('info');
  readonly title = input('');
  /** SVG markup; each tone has a fitting default */
  readonly icon = input<string>();

  protected readonly iconSvg = computed(() => this.icon() ?? ICONS[this.tone()] ?? lucideInfo);
}
