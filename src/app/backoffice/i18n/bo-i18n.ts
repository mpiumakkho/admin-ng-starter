import { computed, inject, Injectable, Pipe, PipeTransform } from '@angular/core';

import { LanguageService } from '../../layout/language.service';
import { EN_BO } from './en';
import { TH_BO } from './th';

/*
 * The back office's language: the same engine as the clinical workspace's (clinic/i18n/clinic-i18n.ts), with its own
 * dictionaries. The source text is the key, usually Thai: en.ts gives its English, th.ts proper Thai for keys that are
 * English (module codes, statuses, sample data). A key with no entry shows as written. It follows the app's TH / EN
 * choice (LanguageService), so one switch changes both.
 *
 *   {{ 'ภาพรวมงาน' | tx }}                 a source string
 *   {{ '{n} รายการ' | tx: { n: 5 } }}       with placeholders
 *   {{ item.title | tx }}                   text from data: exact key, then a template key, then piece by piece
 */

type Lang = 'th' | 'en';
type Vars = Record<string, string | number>;
interface Pattern { re: RegExp; names: string[]; out: string }

const DICTS: Record<Lang, Record<string, string>> = {
  th: { ...TH_BO },
  en: { ...EN_BO },
};
/** Thai letters and marks (not the baht sign) or Latin letters: anything worth looking up */
const LETTERS = /[ก-ฺเ-๛A-Za-z]/;
/** Coarse pieces of a stored string ("จ่ายยาแล้ว · น.สพ. นรินทร์ — พยาน …"), then finer ones */
const SEP_COARSE = /( · | — |, |\n)/;
const SEP_FINE = /( \(|\)|, |: |\/| \| )/;
/** Runs of words in one script, so a known Thai name inside an English line still translates, and the reverse */
const W = '[^\\s·—()/,:|]*';
const THAI_RUN = new RegExp(`${W}[\\u0e01-\\u0e3a\\u0e40-\\u0e5b]${W}(?: ${W}[\\u0e01-\\u0e3a\\u0e40-\\u0e5b]${W})*`, 'g');
const LATIN_RUN = new RegExp(`(?<![\\u0e01-\\u0e5b])${W}[A-Za-z]${W}(?: ${W}[A-Za-z]${W})*`, 'g');

const fill = (s: string, vars: Vars) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

@Injectable({ providedIn: 'root' })
export class BoI18n {
  private readonly language = inject(LanguageService);
  readonly lang = computed<Lang>(() => (this.language.current() === 'en' ? 'en' : 'th'));

  private readonly patterns: Partial<Record<Lang, Pattern[]>> = {};
  private readonly cache: Record<Lang, Map<string, string>> = { th: new Map(), en: new Map() };

  /** A source string; `{name}` placeholders filled from `vars` */
  t(key: string, vars?: Vars): string {
    const hit = DICTS[this.lang()][key];
    if (hit !== undefined) {
      return vars ? fill(hit, vars) : hit;
    }
    return this.tr(vars ? fill(key, vars) : key);
  }

  /** Text that comes from data: exact key, template key, then piece by piece */
  tr(s: string | null | undefined): string {
    if (!s || !LETTERS.test(s)) {
      return s ?? '';
    }
    const lang = this.lang();
    const exact = DICTS[lang][s];
    if (exact !== undefined) {
      return exact;
    }
    const cache = this.cache[lang];
    const cached = cache.get(s);
    if (cached !== undefined) {
      return cached;
    }
    const out = this.byPattern(s) ?? this.piecewise(s, SEP_COARSE, p => this.piecewise(p, SEP_FINE, w => this.byWords(w)));
    if (cache.size > 4000) {
      cache.clear();
    }
    cache.set(s, out);
    return out;
  }

  private compiled(): Pattern[] {
    const lang = this.lang();
    return (this.patterns[lang] ??= Object.keys(DICTS[lang])
      .filter(k => /\{\w+\}/.test(k))
      .sort((a, b) => b.length - a.length)
      .map(k => {
        const names: string[] = [];
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('^' + escaped.replace(/\\\{(\w+)\\\}/g, (_, n: string) => { names.push(n); return '(.+?)'; }) + '$');
        return { re, names, out: DICTS[lang][k] };
      }));
  }

  private byPattern(s: string): string | null {
    for (const p of this.compiled()) {
      const m = p.re.exec(s);
      if (m) {
        const vars: Vars = {};
        p.names.forEach((n, i) => { vars[n] = this.tr(m[i + 1]); });
        return fill(p.out, vars);
      }
    }
    return null;
  }

  private lookup(s: string): string | null {
    return DICTS[this.lang()][s] ?? this.byPattern(s);
  }

  /** The longest known term at the start of a word list, then the rest; `whole` demands every word is covered */
  private chain(words: string[], whole: boolean): string | null {
    if (!words.length) {
      return '';
    }
    for (let n = words.length; n > 0; n--) {
      const hit = this.lookup(words.slice(0, n).join(' '));
      if (hit === null) {
        continue;
      }
      const rest = this.chain(words.slice(n), whole);
      if (rest !== null) {
        return hit + (rest ? ' ' + rest : '');
      }
      if (!whole) {
        return hit + ' ' + words.slice(n).join(' ');
      }
    }
    return null;
  }

  /** Last resort: translate the word runs inside mixed text */
  private byWords(s: string): string {
    const thai = s.replace(THAI_RUN, run => {
      const words = run.split(' ');
      for (let n = words.length; n > 0; n--) {
        const hit = this.lookup(words.slice(0, n).join(' '));
        if (hit !== null) {
          return hit + (n < words.length ? ' ' + this.byWords(words.slice(n).join(' ')) : '');
        }
      }
      return run;
    });
    return thai.replace(LATIN_RUN, run => (run.split(' ').some(w => /[A-Za-z]/.test(w)) ? this.chain(run.split(' '), true) ?? run : run));
  }

  private piecewise(s: string, sep: RegExp, next: (p: string) => string): string {
    // Pieces at even indexes, separators at odd ones; the longest run of pieces that is a key wins
    const parts = s.split(sep);
    if (parts.length === 1) {
      return next(s);
    }
    let out = '';
    for (let i = 0; i < parts.length; i += 2) {
      let hit: string | null = null;
      let j = parts.length - 1;
      for (; j > i; j -= 2) {
        hit = this.lookup(parts.slice(i, j + 1).join(''));
        if (hit !== null) {
          break;
        }
      }
      if (hit !== null) {
        out += hit;
        i = j;
      } else {
        out += this.lookup(parts[i]) ?? next(parts[i]);
      }
      if (i + 1 < parts.length) {
        out += parts[i + 1];
      }
    }
    return out;
  }
}

/** The workspace's text in the app's language; re-runs when the language changes (it reads the language signal) */
@Pipe({ name: 'tx', pure: false })
export class TxPipe implements PipeTransform {
  private readonly i18n = inject(BoI18n);

  transform(value: string | null | undefined, vars?: Vars): string {
    return value == null ? '' : this.i18n.t(value, vars);
  }
}
