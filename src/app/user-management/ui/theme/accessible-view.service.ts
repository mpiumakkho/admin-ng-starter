import { DOCUMENT, inject, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'accessible-view';
const CLASS = 'ui-aaa';

/**
 * The accessible view: every page as it meets WCAG 2.2 AAA where the usual, more compact look does not. Targets
 * are at least 44 by 44 pixels, text stands out 7:1, lines are spaced 1.5, nothing moves, and nothing changes or
 * goes away by itself (WCAG lets a site meet AAA through such a "conforming alternate version", as long as every page
 * links to it). Sets `ui-aaa` on <body>, which ui.scss and the components respond to, and remembers the choice.
 *
 * index.html sets the same class before the app starts, so the page does not first show the usual look.
 */
@Injectable({ providedIn: 'root' })
export class UiAccessibleViewService {
  private readonly document = inject(DOCUMENT);

  readonly on = signal(this.document.body.classList.contains(CLASS));

  set(on: boolean): void {
    this.on.set(on);
    this.document.body.classList.toggle(CLASS, on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      // Storage can be unavailable (private mode); the view still applies for this visit
    }
  }

  toggle(): void {
    this.set(!this.on());
  }
}
