import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal, ViewEncapsulation } from '@angular/core';

/** How long the pointer rests on the control before its tooltip shows */
const HOVER_DELAY = 300;

/**
 * A short text under a control: on hover, on keyboard focus, and at once after a click, so a control that changes
 * something (such as the display size) shows what it changed to. It follows its inputs while it is open.
 *
 *   <ui-tooltip [text]="'Display size 110%'" detail="Press to switch to 125%" align="end">
 *     <button type="button" aria-label="Display size 110% · Press to switch to 125%">…</button>
 *   </ui-tooltip>
 *
 * Screen readers do not read it: give the control the same words as its name (aria-label). As WCAG 1.4.13 asks, the
 * pointer can move onto it without it going, Escape hides it without moving focus or the pointer, and it stays until
 * the pointer and focus leave. `align="end"` lines it up with the control's right edge, for controls at the right of
 * the page.
 */
@Component({
  selector: 'ui-tooltip',
  template: `
    <ng-content />
    @if ((hovered() || focused()) && !dismissed()) {
      <span class="ui-tooltip-panel" [class.ui-tooltip-end]="align() === 'end'" aria-hidden="true" animate.enter="ui-tooltip-in">
        <span class="ui-tooltip-text">{{ text() }}</span>
        @if (detail()) {
          <span class="ui-tooltip-detail">{{ detail() }}</span>
        }
      </span>
    }
  `,
  styles: `
    .ui-tooltip {
      position: relative;
      display: inline-flex;
    }

    .ui-tooltip-panel {
      position: absolute;
      top: calc(100% + .375rem);
      inset-inline-start: 0;
      z-index: 1070;
      display: flex;
      flex-direction: column;
      gap: .125rem;
      padding: .4375rem .75rem;
      border: 1px solid var(--ui-border);
      border-radius: var(--ui-radius);
      background: var(--ui-surface);
      box-shadow: var(--ui-shadow-lg);
      font: 400 .8125rem/1.4 var(--ui-font);
      text-align: start;
      white-space: nowrap;

      // Over the gap to the control, so the pointer can move onto the tooltip without it going
      &::before {
        content: '';
        position: absolute;
        inset: auto 0 100%;
        height: .5rem;
      }
    }

    .ui-tooltip-end {
      inset-inline: auto 0;
    }

    .ui-tooltip-text {
      color: var(--ui-heading);
      font-weight: 600;
    }

    .ui-tooltip-detail {
      color: var(--ui-muted);
      font-size: .75rem;
    }

    .ui-tooltip-in {
      animation: ui-tooltip-in .16s var(--ui-ease);
    }

    @keyframes ui-tooltip-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-tooltip',
    '(mouseenter)': 'pointerIn()',
    '(mouseleave)': 'pointerOut()',
    '(click)': 'clicked()',
    '(focusin)': 'focusIn($event)',
    '(focusout)': 'focusOut($event)',
    '(document:keydown.escape)': 'dismissed.set(true)',
  },
})
export class UiTooltip {
  /** The main line */
  readonly text = input.required<string>();
  /** A second, quieter line, such as what a press does next */
  readonly detail = input('');
  /** Which edge of the control it lines up with */
  readonly align = input<'start' | 'end'>('start');

  protected readonly hovered = signal(false);
  protected readonly focused = signal(false);
  /** Escape hid it; it shows again once the pointer and focus have left and come back */
  protected readonly dismissed = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected pointerIn() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hovered.set(true), HOVER_DELAY);
  }

  protected pointerOut() {
    clearTimeout(this.timer);
    this.hovered.set(false);
    this.dismissed.set(this.focused() && this.dismissed());
  }

  /** At once after a click, without waiting for the hover delay */
  protected clicked() {
    clearTimeout(this.timer);
    this.hovered.set(true);
    this.dismissed.set(false);
  }

  /** Focus from the keyboard shows it; focus from a click is the click's */
  protected focusIn(event: FocusEvent) {
    if ((event.target as Element).matches(':focus-visible')) {
      this.focused.set(true);
    }
  }

  protected focusOut(event: FocusEvent) {
    const host = event.currentTarget as Element;
    if (!host.contains(event.relatedTarget as Node | null)) {
      this.focused.set(false);
      this.dismissed.set(this.hovered() && this.dismissed());
    }
  }
}
