/* The shell bar's search and notifications, and the context rail (the design's GlobalSearch, Notifications, ContextRail) */
import { ConnectedPosition } from '@angular/cdk/overlay';
import { afterNextRender, Component, computed, ElementRef, HostListener, inject, Injector, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideBell, lucideCalendarDays, lucideFlaskConical, lucideHourglass, lucidePawPrint, lucidePill, lucideSearch, lucideTriangleAlert } from '@ng-icons/lucide';

import { UiMenu, UiMenuHeading, UiMenuItem, UiMenuTrigger } from '../../user-management/ui';
import { ClinicUi, SheetKind } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { stageState, statusOf, TODAY } from '../data/model';
import type { Patient } from '../data/types';
import { ClinicI18n, TxPipe } from '../i18n/clinic-i18n';
import { RAIL_ICONS } from '../shared/icons';

interface SearchHit { kind: 'patient' | 'appointment'; id: string; title: string; detail: string; patient?: Patient }

/**
 * Patients in today's queue and upcoming appointments, by name, code, HN or phone. An icon among the bar's others; it
 * opens a panel with the field and the results, as the admin navbar's menus open. Ctrl+K (⌘K) or "/" from anywhere;
 * Escape, a click elsewhere or tabbing away closes it.
 */
@Component({
  selector: 'cl-global-search',
  imports: [NgIcon, TxPipe],
  template: `
    <button #toggle type="button" class="icon-button" [attr.aria-label]="'ค้นหา' | tx" [attr.title]="('ค้นหา' | tx) + ' (' + shortcutLabel + ')'"
      [attr.aria-keyshortcuts]="shortcutKeys" [attr.aria-expanded]="panel()" [attr.aria-controls]="panel() ? 'clinic-search-panel' : null"
      (click)="panel() ? close() : show()">
      <ng-icon [svg]="icons.search" aria-hidden="true" />
    </button>
    @if (panel()) {
      <div class="search-panel" id="clinic-search-panel" role="search" animate.enter="clinic-pop-in" animate.leave="clinic-pop-out" (focusout)="leave($event)">
        <div class="search-form">
          <ng-icon class="search-icon" [svg]="icons.search" aria-hidden="true" />
          <input #field class="search-input" type="search" role="combobox" autocomplete="off" aria-autocomplete="list"
            [attr.aria-label]="'ค้นหาเจ้าของ เบอร์โทร สัตว์ หรือรหัสการมารักษา' | tx"
            [placeholder]="'ค้นหาเจ้าของ เบอร์โทร สัตว์ หรือรหัสการมารักษา' | tx"
            aria-controls="clinic-search-results" [attr.aria-expanded]="searching()" [attr.aria-activedescendant]="hits().length ? 'clinic-hit-' + active() : null"
            [value]="query()" (input)="type($any($event.target).value)" (keydown)="key($event)" />
          <kbd class="search-shortcut" aria-hidden="true">Esc</kbd>
        </div>
        @if (searching()) {
          <div class="search-list" id="clinic-search-results" role="listbox" [attr.aria-label]="'ผลการค้นหา' | tx">
            @for (hit of hits(); track hit.kind + hit.id; let i = $index) {
              <div class="search-result" role="option" [id]="'clinic-hit-' + i" [class.active]="i === active()" [attr.aria-selected]="i === active()"
                (mousedown)="$event.preventDefault()" (click)="choose(hit)" (mousemove)="active.set(i)">
                <span class="search-result-icon"><ng-icon [svg]="hit.kind === 'patient' ? icons.pet : icons.calendar" aria-hidden="true" /></span>
                <span class="search-result-text">
                  <span class="search-result-name">{{ hit.title }}</span>
                  <span class="search-result-detail">{{ hit.detail }}</span>
                </span>
              </div>
            }
          </div>
          @if (!hits().length) {
            <p class="search-empty">{{ 'ไม่พบรายการที่ตรงกับคำค้น' | tx }}</p>
          }
        } @else {
          <p class="search-hint">{{ 'สัตว์ในคิววันนี้และนัดหมายที่จะถึง ค้นจากชื่อสัตว์ เจ้าของ เบอร์โทร HN หรือรหัสการมารักษา' | tx }}</p>
        }
      </div>
    }
  `,
  host: { class: 'contents' },
})
export class GlobalSearch {
  private readonly store = inject(ClinicStore);
  private readonly ui = inject(ClinicUi);
  private readonly router = inject(Router);
  private readonly i18n = inject(ClinicI18n);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly icons = { search: lucideSearch, pet: lucidePawPrint, calendar: lucideCalendarDays };
  // As the admin navbar's search: Ctrl K, or ⌘K on a Mac; "/" works too, as in the design
  private readonly isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  protected readonly shortcutLabel = this.isMac ? '⌘K' : 'Ctrl K';
  protected readonly shortcutKeys = this.isMac ? 'Meta+K /' : 'Control+K /';
  protected readonly panel = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  /** The results show once something is typed; a line on what can be found until then */
  protected readonly searching = computed(() => !!this.query().trim());

  protected readonly hits = computed<SearchHit[]>(() => {
    const needle = this.query().trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    if (!needle) {
      return [];
    }
    const d = this.store.data();
    const matches = (text: string, phone: string) => text.toLowerCase().includes(needle) || (digits.length >= 3 && phone.replace(/\D/g, '').includes(digits));
    const patients: SearchHit[] = d.patients
      .filter(p => matches([p.pet, p.code, p.hn, d.owners[p.ownerKey].name].join(' '), d.owners[p.ownerKey].phone))
      .map(p => ({
        kind: 'patient', id: String(p.id), patient: p, title: `${p.pet} · ${p.code}`,
        detail: `${d.owners[p.ownerKey].name} · ${this.i18n.t(statusOf(p).text)} · ${this.i18n.t('คิววันนี้')} ${p.time}`,
      }));
    const appointments: SearchHit[] = d.appointments
      .filter(a => a.date >= TODAY && a.state !== 'Completed' && matches([a.pet, a.owner].join(' '), a.phone))
      .map(a => ({ kind: 'appointment', id: a.id, title: `${a.pet} · ${a.time === '—' ? this.i18n.t('Waitlist') : a.time}`, detail: `${a.owner} · ${this.i18n.t(a.type)} · ${a.date}` }));
    return [...patients, ...appointments].slice(0, 8);
  });

  @HostListener('document:keydown', ['$event'])
  protected shortcut(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const typing = target.matches('input, textarea, select, [contenteditable="true"]');
    if ((event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
      event.preventDefault();
      this.show();
    }
  }

  /** Opens the panel, or goes back to its field when it is open */
  protected show() {
    const field = this.field();
    if (field) {
      field.nativeElement.focus();
      return;
    }
    this.panel.set(true);
    afterNextRender(() => this.field()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Closes the panel and forgets the search; `refocus` puts focus back on the icon, as Escape does */
  protected close(refocus = false) {
    this.panel.set(false);
    this.query.set('');
    this.active.set(0);
    if (refocus) {
      this.toggle().nativeElement.focus();
    }
  }

  protected type(value: string) {
    this.query.set(value);
    this.active.set(0);
  }

  protected key(event: KeyboardEvent) {
    const count = this.hits().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active.update(i => (i + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active.update(i => (i - 1 + count) % count);
    } else if (event.key === 'Enter' && count) {
      event.preventDefault();
      this.choose(this.hits()[this.active()]);
    } else if (event.key === 'Escape') {
      // Only the panel: a sheet open behind it stays open
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    }
  }

  protected choose(hit: SearchHit) {
    this.close();
    if (hit.patient) {
      this.store.select(hit.patient);
      this.ui.openSheet('visit');
    } else {
      this.router.navigate(['/clinic/appointments']).then(() => this.ui.openSheet('appointment', { id: hit.id }));
    }
  }

  /** Tabbing out of the panel closes it; a click elsewhere is outside()'s */
  protected leave(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && !this.host.nativeElement.contains(next)) {
      this.close();
    }
  }

  @HostListener('document:click', ['$event'])
  protected outside(event: MouseEvent) {
    if (this.panel() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}

interface Notice { id: string; tone: 'danger' | 'warn' | 'info'; icon: string; title: string; detail: string; go: () => void }

/** What needs the vet now, worked out from the data: critical and new results, pets over their SLA, verbal orders */
@Component({
  selector: 'cl-notifications',
  imports: [NgIcon, TxPipe, UiMenu, UiMenuItem, UiMenuHeading, UiMenuTrigger],
  template: `
    <button type="button" class="icon-button count-indicator" [uiMenuTrigger]="menu" [uiMenuPosition]="position" (menuOpened)="markSeen()"
      [attr.aria-label]="unread() ? ('การแจ้งเตือน ยังไม่อ่าน {n}' | tx: { n: unread() }) : ('การแจ้งเตือน' | tx)">
      <ng-icon [svg]="bell" aria-hidden="true" />
      @if (unread()) {
        <span class="count" aria-hidden="true"></span>
      }
    </button>
    <ng-template #menu>
      <ui-menu class="clinic-activity-menu" [attr.aria-label]="'การแจ้งเตือน' | tx">
        <div uiMenuHeading>{{ 'การแจ้งเตือน' | tx }}</div>
        @for (notice of notices(); track notice.id) {
          <button uiMenuItem class="clinic-activity-item" (triggered)="go(notice)">
            <span class="clinic-notice-icon" [class]="'clinic-notice-icon ' + notice.tone"><ng-icon [svg]="notice.icon" aria-hidden="true" /></span>
            <span class="clinic-activity-text">
              <span class="clinic-activity-title">{{ notice.title }}</span>
              <span class="clinic-activity-time">{{ notice.detail }}</span>
            </span>
          </button>
        } @empty {
          <p class="clinic-activity-empty">{{ 'ไม่มีการแจ้งเตือน' | tx }}</p>
        }
      </ui-menu>
    </ng-template>
  `,
  host: { class: 'contents' },
})
export class Notifications {
  private readonly store = inject(ClinicStore);
  private readonly ui = inject(ClinicUi);
  private readonly router = inject(Router);
  private readonly i18n = inject(ClinicI18n);

  protected readonly bell = lucideBell;
  protected readonly position: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
  ];
  /** The notices seen when the menu was last opened; the dot means something came since, as the admin bell */
  protected readonly seen = signal(new Set<string>());

  protected readonly notices = computed<Notice[]>(() => {
    const d = this.store.data();
    const t = (key: string, vars?: Record<string, string | number>) => this.i18n.t(key, vars);
    const list: Notice[] = [];
    for (const r of d.results.filter(x => !x.ack)) {
      const critical = r.flag === 'critical';
      list.push({
        id: 'r' + r.id, tone: critical ? 'danger' : 'info', icon: critical ? lucideTriangleAlert : lucideFlaskConical,
        title: `${r.pet} · ${t(r.name)}`, detail: t(critical ? 'ค่าวิกฤต · ต้องรับทราบทางโทรศัพท์' : 'ผลตรวจใหม่รอรับทราบ'),
        go: () => this.router.navigate(['/clinic/results']).then(() => this.ui.openSheet('result', { id: r.id })),
      });
    }
    for (const p of d.patients.filter(x => stageState(x) === 'late')) {
      list.push({
        id: 'q' + p.id, tone: 'warn', icon: lucideHourglass, title: `${p.pet} · ${t(statusOf(p).text)}`, detail: t('ค้างเกินเกณฑ์เวลาของขั้นตอน'),
        go: () => { this.store.select(p); this.router.navigate(['/clinic/queue']).then(() => this.ui.openSheet('visit')); },
      });
    }
    for (const rx of d.prescriptions.filter(x => x.verbal && !x.cosignedBy)) {
      list.push({
        id: 'x' + rx.id, tone: 'warn', icon: lucidePill, title: `${rx.pet} · ${rx.drug}`, detail: t('คำสั่งวาจา · รอเซ็นกำกับ'),
        go: () => this.router.navigate(['/clinic/orders']),
      });
    }
    return list;
  });
  protected readonly unread = computed(() => this.notices().filter(n => !this.seen().has(n.id)).length);

  protected markSeen() {
    this.seen.set(new Set(this.notices().map(n => n.id)));
  }

  protected go(notice: Notice) {
    notice.go();
  }
}

interface RailItem { sep?: boolean; icon?: string; label?: string; kind?: SheetKind; tab?: string; badge?: (p: Patient) => number; danger?: boolean }

/** Shortcuts to the selected patient's sheets, beside the page (the collapsed right sidebar) */
@Component({
  selector: 'cl-context-rail',
  imports: [NgIcon, TxPipe],
  template: `
    @let p = store.selected();
    <aside class="rail" [attr.aria-label]="'Context rail' | tx">
      @for (item of items; track $index) {
        @if (item.sep) {
          <span class="rail-sep" aria-hidden="true"></span>
        } @else {
          @let n = item.badge ? item.badge(p) : 0;
          <button type="button" class="rail-btn" [class.active]="isOpen(item)" [attr.aria-pressed]="isOpen(item)"
            [attr.aria-label]="(item.label! | tx) + (n ? ': ' + n : '') + ' · ' + p.pet" [attr.title]="(item.label! | tx) + ' · ' + p.pet"
            (click)="ui.toggleSheet(item.kind!, item.tab)">
            <ng-icon [svg]="item.icon!" aria-hidden="true" />
            @if (n) {
              <span class="badge" [class.danger]="item.danger" aria-hidden="true">{{ n }}</span>
            }
          </button>
        }
      }
    </aside>
  `,
  host: { class: 'contents' },
})
export class ContextRail {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);

  protected readonly items: RailItem[] = [
    { icon: RAIL_ICONS.alerts, label: 'Clinical alerts', kind: 'patient', tab: 'alerts', danger: true, badge: p => p.alerts.length },
    { icon: RAIL_ICONS.patient, label: 'Patient summary', kind: 'patient', tab: 'overview' },
    { icon: RAIL_ICONS.owner, label: 'Owner', kind: 'owner' },
    { sep: true },
    { icon: RAIL_ICONS.problems, label: 'Problem list', kind: 'patient', tab: 'problems', badge: p => p.problems.length },
    { icon: RAIL_ICONS.meds, label: 'Medications', kind: 'patient', tab: 'meds', badge: p => p.meds.length },
    { icon: RAIL_ICONS.vaccines, label: 'Vaccines / reminders', kind: 'patient', tab: 'vaccines', badge: p => p.vaccines.filter(v => v[2] !== 'ok').length },
    { icon: RAIL_ICONS.visits, label: 'Visit history', kind: 'patient', tab: 'visits' },
    { icon: RAIL_ICONS.docs, label: 'Documents', kind: 'patient', tab: 'docs' },
    { icon: RAIL_ICONS.notes, label: 'Notes', kind: 'notes' },
    { sep: true },
    { icon: RAIL_ICONS.results, label: 'Results preview', kind: 'results', badge: p => this.store.resultsFor(p).filter(r => !r.ack).length },
    { icon: RAIL_ICONS.estimate, label: 'Estimate', kind: 'estimate' },
  ];

  protected isOpen(item: RailItem): boolean {
    const open = this.ui.sheet();
    return !!open && open.kind === item.kind && (!item.tab || open.tab === item.tab);
  }
}
