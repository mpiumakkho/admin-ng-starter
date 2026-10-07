import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

export type UiButtonVariant = 'primary' | 'secondary' | 'soft' | 'outline' | 'ghost' | 'danger' | 'danger-soft';
export type UiButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button styles on a native <button> or <a>, so forms, links and accessibility keep working.
 *
 *   <button uiButton>Save</button>
 *   <button uiButton variant="secondary" size="sm"><ng-icon [svg]="plus" /> Add</button>
 *   <button uiButton variant="ghost" iconOnly aria-label="More"><ng-icon [svg]="dots" /></button>
 *   <button uiButton [loading]="saving()">Save</button>
 */
@Component({
  selector: 'button[uiButton], a[uiButton]',
  template: `
    @if (loading()) {
      <span class="ui-btn-spinner" aria-hidden="true"></span>
    }
    <ng-content />
  `,
  styleUrl: './button.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.aria-busy]': 'loading() || null',
  },
})
export class UiButton {
  readonly variant = input<UiButtonVariant>('primary');
  readonly size = input<UiButtonSize>('md');
  /** Shows a spinner in place of the label and ignores clicks */
  readonly loading = input(false, { transform: booleanAttribute });
  /** Square button holding only an icon; give it an aria-label */
  readonly iconOnly = input(false, { transform: booleanAttribute });
  /** Full width of its container */
  readonly block = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() => [
    'ui-btn',
    `ui-btn-${this.variant()}`,
    `ui-btn-${this.size()}`,
    this.iconOnly() ? 'ui-btn-icon' : '',
    this.block() ? 'ui-btn-block' : '',
    this.loading() ? 'ui-btn-loading' : '',
  ].filter(Boolean).join(' '));
}
