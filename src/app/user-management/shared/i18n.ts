import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { merge } from 'rxjs';

/**
 * A signal that changes whenever the language or its translations change. Read it inside a
 * computed() that calls TranslateService.instant(), so the computed updates once a language loads.
 *
 *   private readonly i18n = translationsChanged();
 *   readonly label = computed(() => { this.i18n(); return this.translate.instant('Active'); });
 */
export function translationsChanged(): Signal<unknown> {
  const translate = inject(TranslateService);
  return toSignal(merge(translate.onLangChange, translate.onTranslationChange), { initialValue: null });
}
