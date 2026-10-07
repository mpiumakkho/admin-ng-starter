import { computed, DOCUMENT, inject, Injectable, signal } from '@angular/core';

export type UiTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const LIGHT_CLASS = 'theme-light';
const DARK_CLASS = 'theme-dark';

/**
 * Light or dark mode for the whole page. Sets `theme-light` or `theme-dark` on <body>, which the
 * --ui-* variables respond to, and remembers the choice in localStorage.
 *
 * To avoid a flash of the wrong theme, set the same class from a small script in index.html
 * before the app starts; this service reads it back on startup.
 */
@Injectable({ providedIn: 'root' })
export class UiThemeService {
  private readonly document = inject(DOCUMENT);

  readonly theme = signal<UiTheme>(this.document.body.classList.contains(DARK_CLASS) ? 'dark' : 'light');
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.apply(this.theme());
  }

  set(theme: UiTheme): void {
    this.theme.set(theme);
    this.apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this visit
    }
  }

  toggle(): void {
    this.set(this.isDark() ? 'light' : 'dark');
  }

  private apply(theme: UiTheme): void {
    const { body, documentElement } = this.document;
    body.classList.toggle(LIGHT_CLASS, theme === 'light');
    body.classList.toggle(DARK_CLASS, theme === 'dark');
    documentElement.style.colorScheme = theme;
  }
}
