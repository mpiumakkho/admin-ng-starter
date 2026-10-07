import { ChangeDetectionStrategy, Component, computed, input, model, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';

type PageItem = number | 'gap-start' | 'gap-end';

/**
 * Page buttons with previous and next. Long ranges collapse into "…".
 *
 *   <ui-pagination [(page)]="page" [pageCount]="12" />
 */
@Component({
  selector: 'ui-pagination',
  imports: [NgIcon],
  template: `
    <button type="button" class="ui-page ui-page-arrow" [disabled]="page() <= 1" [attr.aria-label]="previousLabel()" (click)="go(page() - 1)">
      <ng-icon [svg]="previousIcon" />
    </button>
    @for (item of items(); track item) {
      @if (item === 'gap-start' || item === 'gap-end') {
        <span class="ui-page-gap" aria-hidden="true">…</span>
      } @else {
        <button type="button" class="ui-page" [class.ui-page-active]="item === page()" [attr.aria-current]="item === page() ? 'page' : null" (click)="go(item)">{{ item }}</button>
      }
    }
    <button type="button" class="ui-page ui-page-arrow" [disabled]="page() >= pageCount()" [attr.aria-label]="nextLabel()" (click)="go(page() + 1)">
      <ng-icon [svg]="nextIcon" />
    </button>
  `,
  styles: `
    .ui-pagination {
      display: inline-flex;
      align-items: center;
      gap: .25rem;
      font-family: var(--ui-font);
    }

    .ui-page {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      height: 34px;
      padding: 0 .625rem;
      border: 1px solid var(--ui-border);
      border-radius: var(--ui-radius);
      background: var(--ui-surface);
      color: var(--ui-text);
      font: 500 .8125rem/1 var(--ui-font);
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      transition: background-color .15s ease, color .15s ease, border-color .15s ease;

      &:hover:not(:disabled):not(.ui-page-active) {
        background: var(--ui-hover);
        color: var(--ui-heading);
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--ui-ring);
      }

      &:disabled {
        color: var(--ui-subtle);
        cursor: not-allowed;
      }

      ng-icon {
        font-size: 1rem;
      }

      .rtl & ng-icon,
      [dir="rtl"] & ng-icon {
        transform: scaleX(-1);
      }
    }

    .ui-page-active {
      border-color: var(--ui-primary);
      background: var(--ui-primary);
      color: var(--ui-on-primary);
      cursor: default;
    }

    .ui-page-gap {
      min-width: 1.5rem;
      color: var(--ui-subtle);
      text-align: center;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-pagination', role: 'navigation', '[attr.aria-label]': 'ariaLabel()' },
})
export class UiPagination {
  readonly page = model(1);
  readonly pageCount = input.required<number>();
  readonly previousLabel = input('Previous page');
  readonly nextLabel = input('Next page');
  readonly ariaLabel = input('Pagination');

  protected readonly previousIcon = lucideChevronLeft;
  protected readonly nextIcon = lucideChevronRight;

  // First, last, and the pages either side of the current one; the rest become gaps
  protected readonly items = computed<PageItem[]>(() => {
    const count = Math.max(1, this.pageCount());
    const current = Math.min(Math.max(1, this.page()), count);
    if (count <= 7) {
      return Array.from({ length: count }, (_, index) => index + 1);
    }
    const start = Math.max(2, Math.min(current - 1, count - 4));
    const end = Math.min(count - 1, Math.max(current + 1, 5));
    const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    return [1, ...(start > 2 ? ['gap-start' as const] : []), ...middle, ...(end < count - 1 ? ['gap-end' as const] : []), count];
  });

  protected go(page: number) {
    this.page.set(Math.min(Math.max(1, page), Math.max(1, this.pageCount())));
  }
}
