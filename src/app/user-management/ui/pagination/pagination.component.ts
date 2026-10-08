import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, input, model, ViewEncapsulation,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight, lucideChevronsLeft, lucideChevronsRight } from '@ng-icons/lucide';

/** The most page numbers shown at once */
const VISIBLE_PAGES = 5;

/**
 * Page buttons with previous and next. At most five page numbers show, with the current one in the middle where it
 * can be; with more pages than that, first and last buttons appear on the outside: << < 6 7 8 9 10 > >>
 *
 *   <ui-pagination [(page)]="page" [pageCount]="12" />
 */
@Component({
  selector: 'ui-pagination',
  imports: [NgIcon],
  template: `
    @if (hasMore()) {
      <button type="button" class="ui-page ui-page-arrow" [disabled]="current() <= 1" [attr.aria-label]="firstLabel()" (click)="go(1, $event)">
        <ng-icon [svg]="icons.first" />
      </button>
    }
    <button type="button" class="ui-page ui-page-arrow" [disabled]="current() <= 1" [attr.aria-label]="previousLabel()" (click)="go(current() - 1, $event)">
      <ng-icon [svg]="icons.previous" />
    </button>
    @for (item of items(); track item) {
      <button type="button" class="ui-page" [class.ui-page-active]="item === current()" [attr.aria-current]="item === current() ? 'page' : null" (click)="go(item, $event)">{{ item }}</button>
    }
    <button type="button" class="ui-page ui-page-arrow" [disabled]="current() >= count()" [attr.aria-label]="nextLabel()" (click)="go(current() + 1, $event)">
      <ng-icon [svg]="icons.next" />
    </button>
    @if (hasMore()) {
      <button type="button" class="ui-page ui-page-arrow" [disabled]="current() >= count()" [attr.aria-label]="lastLabel()" (click)="go(count(), $event)">
        <ng-icon [svg]="icons.last" />
      </button>
    }
  `,
  styles: `
    // Wraps onto a second line rather than run off the narrowest screens
    .ui-pagination {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
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

    // Nine buttons fit across most phones; each stays above the 24px a finger needs (WCAG 2.5.8)
    @media (max-width: 479px) {
      .ui-pagination {
        gap: .125rem;
      }

      .ui-page {
        min-width: 30px;
        height: 32px;
        padding: 0 .375rem;
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-pagination', role: 'navigation', '[attr.aria-label]': 'ariaLabel()' },
})
export class UiPagination {
  readonly page = model(1);
  readonly pageCount = input.required<number>();
  readonly firstLabel = input('First page');
  readonly previousLabel = input('Previous page');
  readonly nextLabel = input('Next page');
  readonly lastLabel = input('Last page');
  readonly ariaLabel = input('Pagination');

  protected readonly icons = { first: lucideChevronsLeft, previous: lucideChevronLeft, next: lucideChevronRight, last: lucideChevronsRight };

  protected readonly count = computed(() => Math.max(1, this.pageCount()));
  protected readonly current = computed(() => Math.min(Math.max(1, this.page()), this.count()));
  /** More pages than fit: the first and last buttons show */
  protected readonly hasMore = computed(() => this.count() > VISIBLE_PAGES);

  // Five pages with the current one in the middle, moved along at either end so there are always five
  protected readonly items = computed<number[]>(() => {
    const shown = Math.min(this.count(), VISIBLE_PAGES);
    const start = Math.min(Math.max(1, this.current() - Math.floor(VISIBLE_PAGES / 2)), this.count() - shown + 1);
    return Array.from({ length: shown }, (_, index) => start + index);
  });

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected go(page: number, event: Event) {
    this.page.set(Math.min(Math.max(1, page), this.count()));
    // First, previous, next and last turn off at either end; the keyboard focus moves to the current page instead of
    // being lost with them
    const button = event.currentTarget as HTMLButtonElement;
    afterNextRender(() => {
      if (button.disabled) {
        this.host.querySelector<HTMLButtonElement>('.ui-page-active')?.focus();
      }
    }, { injector: this.injector });
  }
}
