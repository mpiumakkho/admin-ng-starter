import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

// Each code needs a matching file in src/assets/i18n/<code>.json
export const LANGUAGES = [
  { code: 'th', label: 'ไทย' },
  { code: 'en', label: 'English' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: LanguageCode = 'th';
// Used when a translation isn't found in the current language
export const FALLBACK_LANGUAGE: LanguageCode = 'en';

const STORAGE_KEY = 'language';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  readonly languages = LANGUAGES;
  readonly current = signal<LanguageCode>(this.restore());

  init(): void {
    this.use(this.current());
  }

  use(code: LanguageCode): void {
    this.current.set(code);
    this.translate.use(code);
    this.document.documentElement.lang = code;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Storage can be unavailable (private mode); the choice just won't persist
    }
  }

  private restore(): LanguageCode {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Fall through to the default language
    }
    return LANGUAGES.find(language => language.code === stored)?.code ?? DEFAULT_LANGUAGE;
  }
}
