/* The bar's search, as the admin's: the back office's pages and the work waiting, as you type (ux/02: global search) */
import { afterNextRender, Component, computed, DOCUMENT, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideClipboardList, lucideSearch, lucideX } from '@ng-icons/lucide';

import { BackofficeStore } from '../backoffice.store';
import { BoI18n, TxPipe } from '../i18n/bo-i18n';
import { BACKOFFICE_NAV } from './nav';

/** The most of each kind the list shows */
const EACH = 5;

export interface SearchHit {
  key: string;
  name: string;
  detail: string;
  icon: string;
  path: string;
}

/** Pages whose name or group has the text, then work whose title, kind, number or module has it; those starting with it first */
export function searchBackoffice(text: string, work: { id: string; title: string; kind: string; ref: string; module: string; link?: string }[], t: (s: string) => string): SearchHit[] {
  const query = text.trim().toLowerCase();
  if (!query) {
    return [];
  }
  const has = (...words: string[]) => words.some(word => word.toLowerCase().includes(query));
  const first = (a: SearchHit, b: SearchHit) => Number(!a.name.toLowerCase().startsWith(query)) - Number(!b.name.toLowerCase().startsWith(query));
  const pages = BACKOFFICE_NAV.flatMap(group => group.links
    .filter(link => has(link.label, t(link.label), group.label, t(group.label)))
    .map(link => ({ key: link.path, name: t(link.label), detail: t(group.label), icon: group.icon, path: link.path })))
    .sort(first)
    .slice(0, EACH);
  const tasks = work
    .filter(item => has(item.title, t(item.title), item.kind, t(item.kind), item.ref, item.module))
    .map(item => ({ key: item.id, name: t(item.title), detail: `${item.module} · ${t(item.kind)} · ${item.ref}`, icon: lucideClipboardList, path: item.link ?? '/backoffice/home/overview' }))
    .sort(first)
    .slice(0, EACH);
  return [...pages, ...tasks];
}

@Component({
  selector: 'bo-search',
  imports: [NgIcon, RouterLink, TxPipe],
  template: `
    <!-- Phones: the field opens over the bar from this button -->
    <button type="button" class="icon-button search-button" (click)="openSearch()" [attr.aria-label]="'ค้นหาใน BackOffice' | tx">
      <ng-icon [svg]="icons.search" aria-hidden="true" />
    </button>
    <form class="search-form" [class.search-open]="searchOpen()" role="search" (submit)="$event.preventDefault(); submit()" (focusout)="focusOut($event)">
      <ng-icon [svg]="icons.search" class="search-icon" aria-hidden="true" />
      <!-- Hits show as you type (an ARIA combobox): arrow keys pick one, Enter opens it, or the first when none is picked -->
      <input #field type="search" class="search-input" role="combobox" aria-autocomplete="list" aria-controls="bo-search-results"
        [attr.aria-expanded]="shown()" [attr.aria-activedescendant]="active() >= 0 ? 'bo-search-' + active() : null"
        [placeholder]="'ค้นหาหน้า งาน หรือเลขที่' | tx" [attr.aria-label]="'ค้นหาใน BackOffice' | tx" [attr.aria-keyshortcuts]="shortcutKeys"
        [value]="query()" (input)="typed($any($event.target).value)" (focus)="focused.set(true)" (keydown)="key($event)" autocomplete="off">
      <kbd class="search-shortcut" aria-hidden="true">{{ shortcutLabel }}</kbd>
      <button type="button" class="icon-button search-close" (click)="finish()" [attr.aria-label]="'ปิด' | tx">
        <ng-icon [svg]="icons.close" aria-hidden="true" />
      </button>
      @if (focused() && query().trim()) {
        <div class="search-results">
          <div id="bo-search-results" role="listbox" [attr.aria-label]="'ค้นหาใน BackOffice' | tx">
            @for (hit of hits(); track hit.key; let index = $index) {
              <a class="search-result" role="option" tabindex="-1" [id]="'bo-search-' + index" [attr.aria-selected]="index === active()"
                [class.active]="index === active()" [routerLink]="hit.path" (mousedown)="$event.preventDefault()" (click)="finish()">
                <span class="search-result-icon" aria-hidden="true"><ng-icon [svg]="hit.icon" /></span>
                <span class="search-result-text">
                  <span class="search-result-name">{{ hit.name }}</span>
                  <span class="search-result-detail">{{ hit.detail }}</span>
                </span>
              </a>
            }
          </div>
          @if (!hits().length) {
            <p class="search-empty">{{ 'ไม่พบหน้าหรืองานที่ตรงกัน' | tx }}</p>
          }
        </div>
      }
      <span class="ui-sr-only" aria-live="polite">{{ focused() && query().trim() ? ('พบ {n} รายการ' | tx: { n: hits().length }) : '' }}</span>
    </form>
  `,
  host: { class: 'contents', '(document:keydown)': 'shortcut($event)' },
})
export class BackofficeSearch {
  private readonly store = inject(BackofficeStore);
  private readonly i18n = inject(BoI18n);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  protected readonly icons = { search: lucideSearch, close: lucideX };

  // Ctrl+K, or Cmd+K on a Mac, as the admin's
  private readonly isMac = /Mac|iPhone|iPad/.test(inject(DOCUMENT).defaultView?.navigator.userAgent ?? '');
  protected readonly shortcutLabel = this.isMac ? '⌘K' : 'Ctrl K';
  protected readonly shortcutKeys = this.isMac ? 'Meta+K' : 'Control+K';

  /** On phones the field is hidden until the search button opens it over the bar */
  protected readonly searchOpen = signal(false);
  protected readonly query = signal('');
  protected readonly focused = signal(false);
  /** The hit picked with the arrow keys; -1 none */
  protected readonly active = signal(-1);

  protected readonly hits = computed(() => searchBackoffice(this.query(), this.store.worklist(), s => this.i18n.t(s)));
  protected readonly shown = computed(() => this.focused() && this.hits().length > 0);

  protected typed(value: string) {
    this.query.set(value);
    this.active.set(-1);
  }

  protected key(event: KeyboardEvent) {
    const count = this.hits().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      // Past either end the field itself is picked again (-1), as in most search boxes
      if (count) {
        this.active.update(index => event.key === 'ArrowDown'
          ? (index + 1 >= count ? -1 : index + 1)
          : (index - 1 < -1 ? count - 1 : index - 1));
      }
    } else if (event.key === 'Escape') {
      // First the list goes, then the text, then (on phones) the field
      if (this.active() >= 0 || this.shown()) {
        this.active.set(-1);
        this.focused.set(false);
      } else if (this.query()) {
        this.query.set('');
      } else {
        this.searchOpen.set(false);
      }
    }
  }

  /** Enter: the hit picked, or the first */
  protected submit() {
    const hit = this.hits()[Math.max(this.active(), 0)];
    if (hit) {
      this.finish();
      void this.router.navigateByUrl(hit.path);
    }
  }

  /** The list closes once the keyboard leaves the search, not when a click lands on a hit */
  protected focusOut(event: FocusEvent) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
      this.focused.set(false);
      this.active.set(-1);
    }
  }

  protected finish() {
    this.query.set('');
    this.active.set(-1);
    this.focused.set(false);
    this.field().nativeElement.blur();
    this.searchOpen.set(false);
  }

  protected openSearch() {
    this.searchOpen.set(true);
    afterNextRender(() => this.field().nativeElement.focus(), { injector: this.injector });
  }

  protected shortcut(event: KeyboardEvent) {
    if (event.key.toLowerCase() === 'k' && (this.isMac ? event.metaKey : event.ctrlKey)) {
      event.preventDefault();
      this.openSearch();
    }
  }
}
