import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { DEFAULT_LANGUAGE, LanguageService } from './language.service';

describe('LanguageService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideTranslateService()],
    });
  });

  it('should start in the default language', () => {
    const service = TestBed.inject(LanguageService);
    service.init();

    expect(service.current()).toBe(DEFAULT_LANGUAGE);
    expect(TestBed.inject(TranslateService).getCurrentLang()).toBe(DEFAULT_LANGUAGE);
    expect(document.documentElement.lang).toBe(DEFAULT_LANGUAGE);
  });

  it('should switch language and remember the choice', () => {
    TestBed.inject(LanguageService).use('en');

    expect(TestBed.inject(TranslateService).getCurrentLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    expect(TestBed.inject(LanguageService).current()).toBe('en');
  });

  it('should ignore a stored language that is not supported', () => {
    localStorage.setItem('language', 'ar');

    expect(TestBed.inject(LanguageService).current()).toBe(DEFAULT_LANGUAGE);
  });
});
