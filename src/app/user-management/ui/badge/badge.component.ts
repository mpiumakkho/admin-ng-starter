import { booleanAttribute, ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

import { UiTone } from '../core/types';

/**
 * A small tinted label, for statuses and categories.
 *
 *   <ui-badge tone="success" dot>Active</ui-badge>
 */
@Component({
  selector: 'ui-badge',
  template: `
    @if (dot()) {
      <span class="ui-badge-dot" aria-hidden="true"></span>
    }
    <ng-content />
  `,
  styles: `
    .ui-badge {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      padding: .1875rem .625rem;
      border-radius: 999px;
      background: var(--ui-badge-bg);
      color: var(--ui-badge-fg);
      font: 600 .71875rem/1.2 var(--ui-font);
      letter-spacing: .01em;
      white-space: nowrap;
      vertical-align: middle;
    }

    .ui-badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    .ui-badge-primary { --ui-badge-bg: var(--ui-primary-soft); --ui-badge-fg: var(--ui-primary-text); }
    .ui-badge-success { --ui-badge-bg: var(--ui-success-soft); --ui-badge-fg: var(--ui-success-text); }
    .ui-badge-warning { --ui-badge-bg: var(--ui-warning-soft); --ui-badge-fg: var(--ui-warning-text); }
    .ui-badge-danger { --ui-badge-bg: var(--ui-danger-soft); --ui-badge-fg: var(--ui-danger-text); }
    .ui-badge-info { --ui-badge-bg: var(--ui-info-soft); --ui-badge-fg: var(--ui-info-text); }
    .ui-badge-neutral { --ui-badge-bg: var(--ui-neutral-soft); --ui-badge-fg: var(--ui-neutral-text); }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"ui-badge ui-badge-" + tone()' },
})
export class UiBadge {
  readonly tone = input<UiTone>('neutral');
  /** A colored dot before the label */
  readonly dot = input(false, { transform: booleanAttribute });
}
