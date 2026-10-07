import { booleanAttribute, ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideInbox } from '@ng-icons/lucide';

/**
 * What to show when a list is empty or a search finds nothing. Buttons go inside.
 *
 *   <ui-empty-state title="No users found" description="Try another search.">
 *     <button uiButton variant="secondary">Clear filters</button>
 *   </ui-empty-state>
 */
@Component({
  selector: 'ui-empty-state',
  imports: [NgIcon],
  template: `
    <span class="ui-empty-icon"><ng-icon [svg]="icon()" /></span>
    <p class="ui-empty-title">{{ title() }}</p>
    @if (description()) {
      <p class="ui-empty-description">{{ description() }}</p>
    }
    <div class="ui-empty-actions"><ng-content /></div>
  `,
  styles: `
    .ui-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem 1.5rem;
      font-family: var(--ui-font);
      text-align: center;

      &.ui-empty-compact {
        padding: 1.75rem 1rem;
      }
    }

    .ui-empty-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin-bottom: .875rem;
      border-radius: 50%;
      background: var(--ui-hover);
      color: var(--ui-muted);
      font-size: 1.375rem;
    }

    .ui-empty-title {
      margin: 0;
      color: var(--ui-heading);
      font-size: .9375rem;
      font-weight: 600;
    }

    .ui-empty-description {
      max-width: 360px;
      margin: .25rem 0 0;
      color: var(--ui-muted);
      font-size: .8125rem;
      line-height: 1.5;
    }

    .ui-empty-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: .5rem;
      margin-top: 1rem;

      &:empty {
        display: none;
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-empty-state', '[class.ui-empty-compact]': 'compact()' },
})
export class UiEmptyState {
  readonly title = input.required<string>();
  readonly description = input('');
  /** SVG markup, for example a Lucide icon */
  readonly icon = input<string>(lucideInbox);
  readonly compact = input(false, { transform: booleanAttribute });
}
