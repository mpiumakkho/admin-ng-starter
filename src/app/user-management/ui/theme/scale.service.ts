import { computed, DOCUMENT, inject, Injectable, signal } from '@angular/core';

/** The sizes the whole UI comes in: as designed, and larger for those who find small text hard to read */
export const UI_SCALES = [1, 1.1, 1.25] as const;
export type UiScale = (typeof UI_SCALES)[number];

const STORAGE_KEY = 'ui-scale';
const VARIABLE = '--ui-zoom';
const HOLD_VARIABLE = '--ui-zoom-hold';

/**
 * The size of the whole UI, text, icons and spacing alike, as a browser's zoom makes it: 100%, 110% or 125%. Sets
 * --ui-zoom on <html>, which ui.scss zooms the app and the menus over it by, and remembers the choice. public/theme.js sets
 * the same before the app starts, so the page does not first show at 100%.
 *
 * Media queries still see the window's own width: at 125%, a window 1280 pixels wide has the layout made for 1280
 * pixels, in 1024 pixels' room. The layouts give way inside (tables scroll, the clinic's tabs keep just their icons).
 */
@Injectable({ providedIn: 'root' })
export class UiScaleService {
  private readonly document = inject(DOCUMENT);

  readonly scale = signal<UiScale>(this.read());
  /** The size a step goes to: the next larger one, or back to 100% from the largest */
  readonly next = computed<UiScale>(() => UI_SCALES[(UI_SCALES.indexOf(this.scale()) + 1) % UI_SCALES.length]);
  /** The largest size: the next step goes back to 100% */
  readonly atLargest = computed(() => this.scale() === UI_SCALES[UI_SCALES.length - 1]);

  set(scale: UiScale): void {
    this.scale.set(scale);
    const style = this.document.documentElement.style;
    if (scale === 1) {
      style.removeProperty(VARIABLE);
    } else {
      style.setProperty(VARIABLE, String(scale));
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(scale));
    } catch {
      // Storage can be unavailable (private mode); the size still applies for this visit
    }
  }

  /** The size the bar's controls keep while the pointer stays on the display size button, if it does */
  private held: UiScale | null = null;

  /**
   * One step: 100% → 110% → 125% → 100%. `hold`, for a press with the pointer: the bar's controls (which zoom by
   * --ui-zoom-hold besides --ui-zoom) keep the size they had until release(), so the button stays under the pointer for
   * the next press rather than moving with the bar as it grows. The rest of the page takes the new size at once.
   */
  step(options: { hold?: boolean } = {}): void {
    if (options.hold) {
      this.held ??= this.scale();
    }
    this.set(this.next());
    this.applyHold();
  }

  /** The bar's controls take the size of the rest: the pointer has left the button */
  release(): void {
    this.held = null;
    this.applyHold();
  }

  private applyHold(): void {
    const style = this.document.documentElement.style;
    if (this.held === null || this.held === this.scale()) {
      style.removeProperty(HOLD_VARIABLE);
    } else {
      style.setProperty(HOLD_VARIABLE, String(this.held / this.scale()));
    }
  }

  /** What public/theme.js set before the app started */
  private read(): UiScale {
    const value = Number(this.document.documentElement.style.getPropertyValue(VARIABLE));
    return UI_SCALES.find(scale => scale === value) ?? 1;
  }
}
