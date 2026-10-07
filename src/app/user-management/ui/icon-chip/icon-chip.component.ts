import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

import { UiTone } from '../core/types';

/**
 * An icon on a soft tinted square, for stat cards, lists and empty states.
 *
 *   <ui-icon-chip [icon]="lucideUsers" tone="primary" />
 */
@Component({
  selector: 'ui-icon-chip',
  imports: [NgIcon],
  template: `<ng-icon [svg]="icon()" />`,
  styles: `
    .ui-icon-chip {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: var(--ui-chip-size, 40px);
      height: var(--ui-chip-size, 40px);
      border-radius: .625rem;
      background: var(--ui-chip-bg);
      color: var(--ui-chip-fg);
      font-size: calc(var(--ui-chip-size, 40px) * .45);
    }

    .ui-icon-chip-sm { --ui-chip-size: 32px; border-radius: .5rem; }
    .ui-icon-chip-lg { --ui-chip-size: 48px; border-radius: .75rem; }

    .ui-icon-chip-primary { --ui-chip-bg: var(--ui-primary-soft); --ui-chip-fg: var(--ui-primary-text); }
    .ui-icon-chip-success { --ui-chip-bg: var(--ui-success-soft); --ui-chip-fg: var(--ui-success-text); }
    .ui-icon-chip-warning { --ui-chip-bg: var(--ui-warning-soft); --ui-chip-fg: var(--ui-warning-text); }
    .ui-icon-chip-danger { --ui-chip-bg: var(--ui-danger-soft); --ui-chip-fg: var(--ui-danger-text); }
    .ui-icon-chip-info { --ui-chip-bg: var(--ui-info-soft); --ui-chip-fg: var(--ui-info-text); }
    .ui-icon-chip-neutral { --ui-chip-bg: var(--ui-neutral-soft); --ui-chip-fg: var(--ui-neutral-text); }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"ui-icon-chip ui-icon-chip-" + tone() + " ui-icon-chip-" + size()', 'aria-hidden': 'true' },
})
export class UiIconChip {
  /** SVG markup, for example a Lucide icon from @ng-icons/lucide */
  readonly icon = input.required<string>();
  readonly tone = input<UiTone>('primary');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
}
