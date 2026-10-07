import { booleanAttribute, ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, inject, input, model, output, viewChild, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideSearch, lucideX } from '@ng-icons/lucide';

/**
 * A search field with an icon, a clear button and an optional Ctrl+K (⌘K on Mac) shortcut.
 * Escape clears it; Enter emits `submitted`. Set `size="sm"` to match small inputs and buttons in a toolbar.
 *
 *   <ui-search-input [(value)]="query" placeholder="Search users" shortcut />
 */
@Component({
  selector: 'ui-search-input',
  imports: [NgIcon],
  template: `
    <ng-icon [svg]="searchIcon" class="ui-search-icon" />
    <input
      #field
      type="search"
      class="ui-input ui-search-field"
      [class.ui-input-sm]="size() === 'sm'"
      [placeholder]="placeholder()"
      [attr.aria-label]="ariaLabel() || placeholder()"
      [attr.aria-keyshortcuts]="shortcut() ? shortcutKeys : null"
      [value]="value()"
      (input)="value.set($any($event.target).value)"
      (keydown.enter)="submitted.emit(value())"
      (keydown.escape)="clear()" />
    @if (value()) {
      <button type="button" class="ui-search-clear" [attr.aria-label]="clearLabel()" (click)="clear()">
        <ng-icon [svg]="clearIcon" />
      </button>
    } @else if (shortcut()) {
      <kbd class="ui-search-kbd" aria-hidden="true">{{ shortcutLabel }}</kbd>
    }
  `,
  styles: `
    .ui-search-input {
      position: relative;
      display: block;
      min-width: 0;
      font-family: var(--ui-font);
    }

    .ui-search-icon {
      position: absolute;
      top: 50%;
      inset-inline-start: .75rem;
      color: var(--ui-subtle);
      font-size: 1rem;
      transform: translateY(-50%);
      pointer-events: none;
    }

    .ui-search-field.ui-input {
      padding-inline: 2.25rem 3.5rem;

      &::-webkit-search-cancel-button {
        display: none;
      }
    }

    .ui-search-clear {
      position: absolute;
      top: 50%;
      inset-inline-end: .375rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      border-radius: .375rem;
      background: transparent;
      color: var(--ui-subtle);
      transform: translateY(-50%);
      cursor: pointer;

      &:hover {
        background: var(--ui-hover);
        color: var(--ui-heading);
      }
    }

    .ui-search-input-sm {
      .ui-search-field.ui-input {
        padding-inline: 2rem 3.5rem;
      }

      .ui-search-icon {
        inset-inline-start: .625rem;
        font-size: .875rem;
      }

      .ui-search-clear {
        width: 24px;
        height: 24px;
        inset-inline-end: .25rem;
      }
    }

    .ui-search-kbd {
      position: absolute;
      top: 50%;
      inset-inline-end: .5rem;
      padding: .125rem .375rem;
      border: 1px solid var(--ui-border);
      border-radius: .3125rem;
      background: var(--ui-surface-muted);
      color: var(--ui-muted);
      font: 500 .6875rem/1.3 var(--ui-font);
      transform: translateY(-50%);
      pointer-events: none;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-search-input',
    '[class.ui-search-input-sm]': 'size() === "sm"',
    '(document:keydown)': 'focusOnShortcut($event)',
  },
})
export class UiSearchInput {
  private readonly document = inject(DOCUMENT);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  readonly value = model('');
  readonly placeholder = input('Search');
  readonly ariaLabel = input('');
  readonly clearLabel = input('Clear search');
  readonly size = input<'md' | 'sm'>('md');
  /** Focus this field with Ctrl+K, or ⌘K on a Mac. Use on one field per page. */
  readonly shortcut = input(false, { transform: booleanAttribute });
  /** Enter was pressed */
  readonly submitted = output<string>();

  protected readonly searchIcon = lucideSearch;
  protected readonly clearIcon = lucideX;
  private readonly isMac = /Mac|iPhone|iPad/.test(this.document.defaultView?.navigator.userAgent ?? '');
  protected readonly shortcutLabel = this.isMac ? '⌘K' : 'Ctrl K';
  protected readonly shortcutKeys = this.isMac ? 'Meta+K' : 'Control+K';

  focus() {
    this.field().nativeElement.focus();
  }

  protected clear() {
    this.value.set('');
    this.focus();
  }

  protected focusOnShortcut(event: KeyboardEvent) {
    if (this.shortcut() && event.key.toLowerCase() === 'k' && (this.isMac ? event.metaKey : event.ctrlKey)) {
      event.preventDefault();
      this.focus();
    }
  }
}
