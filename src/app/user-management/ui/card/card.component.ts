import { booleanAttribute, ChangeDetectionStrategy, Component, contentChild, Directive, input, ViewEncapsulation } from '@angular/core';

/** Marks content shown at the right of the card header, such as buttons or a menu */
@Directive({ selector: '[uiCardActions]' })
export class UiCardActions {}

/** Marks a footer strip at the bottom of the card, usually form buttons */
@Directive({ selector: '[uiCardFooter]' })
export class UiCardFooter {}

/**
 * A surface with an optional header (title, description, actions) and footer.
 *
 *   <ui-card title="Users" description="Everyone with access">
 *     <button uiButton uiCardActions>Add</button>
 *     ...body...
 *     <div uiCardFooter>...</div>
 *   </ui-card>
 *
 * Set `flush` to drop the body padding, for tables and lists that run edge to edge.
 * Set `fit` to let the card shrink to the height its parent gives it: the body becomes a column and a
 * scrolling area inside it, such as `.ui-table-scroll`, takes the difference while the rest keeps its size.
 * Set `fill` to make the card take all the height its parent gives it, as a form on a page-fit page does: the body
 * grows to fill it and scrolls when its content is taller, so the footer's buttons stay at the bottom.
 */
@Component({
  selector: 'ui-card',
  template: `
    @if (title() || description() || actions()) {
      <div class="ui-card-head">
        <div class="ui-card-heading">
          @if (title()) {
            <h3 class="ui-card-title">{{ title() }}</h3>
          }
          @if (description()) {
            <p class="ui-card-description">{{ description() }}</p>
          }
        </div>
        <div class="ui-card-actions">
          <ng-content select="[uiCardActions]" />
        </div>
      </div>
    }
    <div class="ui-card-body" [class.ui-card-body-flush]="flush()">
      <ng-content />
    </div>
    @if (footer()) {
      <div class="ui-card-footer">
        <ng-content select="[uiCardFooter]" />
      </div>
    }
  `,
  styleUrl: './card.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-card', '[class.ui-card-fit]': 'fit()', '[class.ui-card-fill]': 'fill()' },
})
export class UiCard {
  readonly title = input('');
  readonly description = input('');
  readonly flush = input(false, { transform: booleanAttribute });
  readonly fit = input(false, { transform: booleanAttribute });
  readonly fill = input(false, { transform: booleanAttribute });

  protected readonly actions = contentChild(UiCardActions);
  protected readonly footer = contentChild(UiCardFooter);
}
