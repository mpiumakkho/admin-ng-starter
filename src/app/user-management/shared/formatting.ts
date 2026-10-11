import { inject, Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** An idle timeout as people say it: "Never", "30 minutes", "1 hour", "4 hours" */
export function idleTimeoutLabel(translate: TranslateService, minutes: number): string {
  if (!minutes) {
    return translate.instant('Never sign out');
  }
  if (minutes % 60) {
    return translate.instant('minuteCount', { count: minutes });
  }
  return minutes === 60 ? translate.instant('1 hour') : translate.instant('hourCount', { count: minutes / 60 });
}

/** How long the activity log keeps entries: "90 days", "1 year", "5 years" */
export function retentionLabel(translate: TranslateService, days: number): string {
  if (days % 365) {
    return translate.instant('dayCount', { count: days });
  }
  return days === 365 ? translate.instant('1 year') : translate.instant('yearCount', { count: days / 365 });
}

/** The password history setting: "Any password", "Not the current one", "Not the last 3" */
export function passwordHistoryLabel(translate: TranslateService, count: number): string {
  if (!count) {
    return translate.instant('Any password');
  }
  return count === 1 ? translate.instant('Not the current one') : translate.instant('notLastPasswords', { count });
}

/** Locale for Intl formatting: Thai uses the Buddhist calendar, as Thai readers expect */
export function intlLocale(language: string): string {
  return language === 'th' ? 'th-TH' : 'en-GB';
}

/** "3 hours ago" / "3 ชั่วโมงที่แล้ว", in the interface language */
export function timeAgo(iso: string, language: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(intlLocale(language), { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, 'second');
}

/**
 * Time since a date, in the interface language. Reads the language itself, so the pipe is impure;
 * it only does a little arithmetic per call.
 *
 *   {{ user.lastActiveAt | timeAgo }}
 */
@Pipe({ name: 'timeAgo', pure: false })
export class TimeAgoPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(iso: string | null | undefined, fallback = ''): string {
    return iso ? timeAgo(iso, this.translate.currentLang() ?? '') : fallback;
  }
}

/** A date as the interface language writes it, such as "4 ต.ค. 2569", for text built in code */
export function localDate(translate: TranslateService, iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(translate.currentLang() ?? ''), { dateStyle: 'medium' }).format(new Date(iso));
}

/**
 * A date in the interface language.
 *
 *   {{ user.createdAt | localDate }}             4 ต.ค. 2569
 *   {{ entry.at | localDate: 'time' }}           14:05
 *   {{ entry.at | localDate: 'long' }}           วันเสาร์ที่ 4 ตุลาคม 2569
 *   {{ entry.at | localDate: 'full' }}           วันเสาร์ที่ 4 ตุลาคม 2569 เวลา 14:05:32
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(iso: string | null | undefined, style: 'medium' | 'long' | 'full' | 'time' | 'datetime' = 'medium'): string {
    if (!iso) {
      return '';
    }
    const options: Intl.DateTimeFormatOptions =
      style === 'time' ? { timeStyle: 'short' }
      : style === 'datetime' ? { dateStyle: 'medium', timeStyle: 'short' }
      : style === 'long' ? { dateStyle: 'full' }
      : style === 'full' ? { dateStyle: 'full', timeStyle: 'medium' }
      : { dateStyle: 'medium' };
    return new Intl.DateTimeFormat(intlLocale(this.translate.currentLang() ?? ''), options).format(new Date(iso));
  }
}
