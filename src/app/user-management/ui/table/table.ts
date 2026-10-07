import {
  afterNextRender,
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  output,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowUpDown, lucideChevronDown, lucideChevronUp, lucideChevronsUpDown, lucideX } from '@ng-icons/lucide';

import { UiButton } from '../button/button.component';
import { UiMenu, UiMenuHeading, UiMenuItemRadio, UiMenuTrigger } from '../menu/menu';
import { UiTableState } from './table-state';

/**
 * Gives a native <table> the library's table style. Wrap it in `.ui-table-scroll` on narrow screens.
 * Set `dense` for tighter rows in long lists.
 */
@Directive({
  selector: 'table[uiTable]',
  host: { class: 'ui-table', '[class.ui-table-dense]': 'dense()' },
})
export class UiTable {
  readonly dense = input(false, { transform: booleanAttribute });
}

/**
 * Keeps a table's scroll area at least as tall as `uiTableMinRows` rows, so a short last page or a
 * filtered list doesn't move the pagination below it. Put it on the `.ui-table-scroll` wrapper. The row
 * height is measured from the table. Inside a flex column, such as `<ui-card fit>`, the area can still
 * shrink to the space there is.
 *
 *   <div class="ui-table-scroll" [uiTableMinRows]="10">
 */
@Directive({
  selector: '[uiTableMinRows]',
})
export class UiTableMinRows {
  readonly minRows = input.required<number>({ alias: 'uiTableMinRows' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** Height of a full body row, remembered for pages with fewer rows */
  private rowHeight = 0;

  constructor() {
    afterRenderEffect(() => {
      this.minRows();
      this.update();
    });
    // Rows come and go without the input changing; the table's size says when
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const table = this.host.querySelector('table');
      if (table) {
        const observer = new ResizeObserver(() => this.update());
        observer.observe(table);
        destroyRef.onDestroy(() => observer.disconnect());
      }
    });
  }

  private update(): void {
    const table = this.host.querySelector('table');
    const rows = Array.from(table?.tBodies[0]?.rows ?? []);
    // The last row has no bottom border, so measure the others when there are some
    const fullRows = rows.slice(0, -1).map(row => row.getBoundingClientRect().height);
    if (fullRows.length) {
      this.rowHeight = Math.max(...fullRows);
    } else if (rows.length && !this.rowHeight) {
      this.rowHeight = rows[0].getBoundingClientRect().height + 1;
    }
    const missing = this.minRows() - rows.length;
    const height = table && missing > 0 && this.rowHeight ? table.getBoundingClientRect().height + missing * this.rowHeight : 0;
    // In a flex column a basis keeps the area shrinkable; elsewhere a minimum height does the job
    const inFlex = !!this.host.parentElement && getComputedStyle(this.host.parentElement).display.endsWith('flex');
    this.host.style.flexBasis = height && inFlex ? `${height}px` : '';
    this.host.style.minHeight = height && !inFlex ? `${height}px` : '';
  }
}

/**
 * Scrolls a table's scroll area back to the top when the reader turns the page, changes the page size,
 * sorts, searches or filters, so the new rows start at the first one. Put it on the `.ui-table-scroll` wrapper.
 *
 *   <div class="ui-table-scroll" [uiTableScrollReset]="table">
 */
@Directive({
  selector: '[uiTableScrollReset]',
})
export class UiTableScrollReset {
  readonly table = input.required<UiTableState<any, any>>({ alias: 'uiTableScrollReset' });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterRenderEffect(() => {
      this.table().view();
      untracked(() => host.scrollTo({ top: 0 }));
    });
  }
}

/**
 * A sortable column header. Put it inside the <th>.
 *
 *   <th [attr.aria-sort]="table.sortKey() === 'name' ? …"><ui-sort-header [table]="table" key="name">Name</ui-sort-header></th>
 */
@Component({
  selector: 'ui-sort-header',
  imports: [NgIcon],
  template: `
    <button type="button" class="ui-sort" (click)="table().sortBy(key())">
      <ng-content />
      <ng-icon [svg]="icon()" [class.ui-sort-idle]="!active()" />
    </button>
  `,
  styles: `
    .ui-sort {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      cursor: pointer;

      &:hover {
        color: var(--ui-heading);
      }

      &:focus-visible {
        border-radius: 4px;
        outline: none;
        box-shadow: var(--ui-ring);
      }

      ng-icon {
        font-size: .875rem;
      }
    }

    .ui-sort-idle {
      opacity: .45;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSortHeader {
  readonly table = input.required<UiTableState<any, any>>();
  readonly key = input.required<string>();

  protected readonly active = computed(() => this.table().sortKey() === this.key());
  protected readonly icon = computed(() =>
    !this.active() ? lucideArrowUpDown : this.table().sortDirection() === 'asc' ? lucideChevronUp : lucideChevronDown);
}

/**
 * A strip shown while table rows are selected: how many, the bulk actions (as content) and a clear button.
 *
 *   @if (table.selectedIds().size) {
 *     <ui-bulk-bar [label]="table.selectedIds().size + ' selected'" (cleared)="table.clearSelection()">
 *       <button uiButton size="sm" variant="danger-soft">Delete</button>
 *     </ui-bulk-bar>
 *   }
 */
@Component({
  selector: 'ui-bulk-bar',
  imports: [NgIcon, UiButton],
  template: `
    <span class="ui-bulk-label">{{ label() }}</span>
    <ng-content />
    <button uiButton variant="ghost" size="sm" type="button" class="ui-bulk-clear" (click)="cleared.emit()">
      <ng-icon [svg]="clearIcon" /> {{ clearLabel() }}
    </button>
  `,
  styles: `
    .ui-bulk-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .5rem;
      padding: .625rem 1.5rem;
      border-bottom: 1px solid var(--ui-border);
      background: var(--ui-primary-soft);
      font-family: var(--ui-font);
      animation: ui-bulk-in .2s var(--ui-ease);
    }

    .ui-bulk-label {
      margin-inline-end: .5rem;
      color: var(--ui-heading);
      font-size: .8125rem;
      font-weight: 600;
    }

    .ui-bulk-clear {
      margin-inline-start: auto;
    }

    @keyframes ui-bulk-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-bulk-bar' },
})
export class UiBulkBar {
  readonly label = input.required<string>();
  readonly clearLabel = input('Clear');
  readonly cleared = output<void>();

  protected readonly clearIcon = lucideX;
}

/**
 * The "1–10 of 48" line of a table footer as a button that opens a menu of page sizes.
 *
 *   <ui-page-size [table]="table" [label]="'1–10 of 48'" heading="Rows per page" />
 */
@Component({
  selector: 'ui-page-size',
  imports: [NgIcon, UiButton, UiMenu, UiMenuHeading, UiMenuItemRadio, UiMenuTrigger],
  template: `
    <button uiButton variant="secondary" size="sm" type="button" [uiMenuTrigger]="menu">
      {{ label() }}
      <ng-icon [svg]="openIcon" />
    </button>
    <ng-template #menu>
      <ui-menu class="ui-page-size-menu" [attr.aria-label]="heading() || null">
        @if (heading()) {
          <div uiMenuHeading>{{ heading() }}</div>
        }
        @for (size of sizes(); track size) {
          <button uiMenuItemRadio [checked]="size === table().pageSize()" (triggered)="table().setPageSize(size)">{{ size }}</button>
        }
      </ui-menu>
    </ng-template>
  `,
  styles: `
    .ui-menu.ui-page-size-menu {
      min-width: 9rem;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiPageSize {
  readonly table = input.required<UiTableState<any, any>>();
  /** The button text, for example "1–10 of 48" */
  readonly label = input.required<string>();
  /** Shown above the sizes and read out as the menu's name */
  readonly heading = input('Rows per page');
  readonly sizes = input<number[]>([10, 25, 50, 100]);

  protected readonly openIcon = lucideChevronsUpDown;
}
