import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ConnectedPosition } from '@angular/cdk/overlay';
import {
  afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, signal, untracked, viewChild, ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideAArrowDown, lucideAArrowUp, lucideAccessibility, lucideArrowLeft, lucideDatabaseBackup, lucideLogOut, lucideMoon, lucidePawPrint,
  lucideSun,
} from '@ng-icons/lucide';
import { filter } from 'rxjs';

import { LanguageCode, LANGUAGES, LanguageService } from '../../layout/language.service';
import { accountText, fullName, Session } from '../../user-management';
import { RoleBadges } from '../../user-management/shared/badges';
import {
  UiAccessibleViewService, UiAvatar, UiConfirmService, UiMenu, UiMenuDivider, UiMenuItem, UiMenuItemCheckbox, UiMenuTrigger, UiScaleService,
  UiThemeService, UiTooltip,
} from '../../user-management/ui';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { ClinicI18n, TxPipe } from '../i18n/clinic-i18n';
import { DialogHost } from '../sheets/dialog-host';
import { SheetHost } from '../sheets/sheet-host';
import { NAV_ICONS } from '../shared/icons';
import { ContextRail, GlobalSearch, Notifications } from './shell-parts';

const percent = (scale: number) => `${Math.round(scale * 100)}%`;

/** What the language button does, by the language it switches to */
const SWITCH_TO: Record<LanguageCode, string> = { th: 'เปลี่ยนเป็นภาษาไทย', en: 'เปลี่ยนเป็นภาษาอังกฤษ' };

/**
 * The clinical workspace: a sample of a veterinary hospital's clinical work (งานตรวจรักษา), drawn after the design in
 * seph1-vet-erp-rc in the app's own colors (--ui-* variables). It fills the window on its own, without the admin
 * sidebar (app.component.ts), and opens from the account menu, as the component gallery does.
 *
 *   bar           as the admin navbar: the workspace's brand; the tabs (queue, appointments, encounter, orders, results,
 *                 dispense: child routes); patient search, notifications, theme, display size, language, the person
 *   main          the tab | the context rail; a side sheet slides out over the tab, one at a time
 */
@Component({
  selector: 'app-clinic-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, NgIcon, TxPipe, UiAvatar, UiMenu, UiMenuItem, UiMenuItemCheckbox, UiMenuDivider, UiMenuTrigger,
    UiTooltip, RoleBadges, GlobalSearch, Notifications, ContextRail, SheetHost, DialogHost,
  ],
  templateUrl: './clinic-shell.component.html',
  styleUrl: './clinic.scss',
  // The look of every part of the workspace is in clinic.scss, under .clinic
  encapsulation: ViewEncapsulation.None,
  host: { class: 'clinic' },
})
export class ClinicShellComponent {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly i18n = inject(ClinicI18n);
  protected readonly theme = inject(UiThemeService);
  protected readonly uiScale = inject(UiScaleService);
  protected readonly accessibleView = inject(UiAccessibleViewService);
  protected readonly language = inject(LanguageService);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly confirm = inject(UiConfirmService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');

  protected readonly fullName = fullName;
  protected readonly accountText = accountText;
  protected readonly icons = {
    paw: lucidePawPrint, back: lucideArrowLeft, reset: lucideDatabaseBackup, signOut: lucideLogOut, moon: lucideMoon, sun: lucideSun,
    accessible: lucideAccessibility, larger: lucideAArrowUp, smaller: lucideAArrowDown,
  };

  protected readonly tabs = [
    { key: 'queue', label: 'Queue', icon: NAV_ICONS.queue },
    { key: 'appointments', label: 'Appointments', icon: NAV_ICONS.appointments },
    { key: 'encounter', label: 'Encounter', icon: NAV_ICONS.encounter },
    { key: 'orders', label: 'Orders', icon: NAV_ICONS.orders },
    { key: 'results', label: 'Results', icon: NAV_ICONS.results },
    { key: 'dispense', label: 'Dispense', icon: NAV_ICONS.dispense },
  ] as const;

  /** As the admin navbar: menus open under their button, lined up with its right edge, or above it when there is no room */
  protected readonly menuPosition: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
  ];

  /** The language a press of the language button switches to: the other one */
  private readonly otherLanguage = computed<LanguageCode>(() => LANGUAGES.find(lang => lang.code !== this.language.current())?.code ?? 'th');
  /** What the button shows (TH), then what it does, so a voice command with what is on it still finds it */
  protected readonly languageLabel = computed(() => `${this.language.current().toUpperCase()} · ${this.i18n.t(SWITCH_TO[this.otherLanguage()])}`);

  /**
   * Below 992px the tabs leave the bar for a row of their own, where they keep their names and scroll sideways. By the
   * workspace's own width, as its stylesheet's container queries are: the display size zooms it, and the window's width
   * (a media query) does not show that.
   */
  private readonly tabsOwnRow = signal(false);
  /** In the bar, the tabs show just their icon and count when their names do not fit; the name is still read out, and shown on hover */
  protected readonly compactTabs = signal(false);
  /** How wide the tabs are with their names, from when they last had them */
  private namedWidth = 0;

  /** The display size: what it is now, and what a press of its button makes it */
  protected readonly scaleNow = computed(() => `${this.i18n.t('ขนาดการแสดงผล')} ${percent(this.uiScale.scale())}`);
  protected readonly scaleHint = computed(() => this.i18n.t('กดเพื่อเปลี่ยนเป็น {size}', { size: percent(this.uiScale.next()) }));

  protected readonly themeLabel = computed(() => (this.theme.isDark() ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'));

  constructor() {
    // Another tab closes the sheet, as the design does
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.ui.closeSheet());

    // The document's title follows the language
    effect(() => {
      const title = this.i18n.t('SLV — โรงพยาบาลสวนหลวงสัตวแพทย์');
      untracked(() => { document.title = title; });
    });

    // The tabs' names come back whenever what they say or the room for them changes, and go again if they do not fit
    effect(() => {
      this.language.current();
      this.store.counts();
      this.tabsOwnRow();
      untracked(() => this.compactTabs.set(false));
      afterNextRender(() => this.fitTabs(), { injector: this.injector });
    });
    const resize = new ResizeObserver(() => {
      this.tabsOwnRow.set(this.host.clientWidth < 992);
      this.fitTabs();
    });
    afterNextRender(() => {
      resize.observe(this.host);
      resize.observe(this.nav().nativeElement);
    });
    inject(DestroyRef).onDestroy(() => {
      resize.disconnect();
      this.uiScale.release();
    });
  }

  /** Names off when the tabs overflow the bar, back on once the bar is as wide as they were with them */
  private fitTabs() {
    const nav = this.nav().nativeElement;
    if (this.tabsOwnRow()) {
      return;
    }
    if (!this.compactTabs()) {
      this.namedWidth = nav.scrollWidth;
      if (nav.scrollWidth > nav.clientWidth) {
        this.compactTabs.set(true);
      }
    } else if (nav.clientWidth >= this.namedWidth) {
      this.compactTabs.set(false);
    }
  }

  /** One size up, or back to 100%; screen readers hear the new size. A press with the pointer (not a key) holds the bar's
   * controls at their size until the pointer leaves the button. */
  protected stepScale(event: MouseEvent) {
    this.uiScale.step({ hold: event.detail > 0 });
    this.announcer.announce(this.scaleNow());
  }

  protected switchLanguage() {
    this.language.use(this.otherLanguage());
  }

  protected skipToContent(event: Event) {
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  protected async resetSample() {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('รีเซ็ตข้อมูลตัวอย่าง'),
      message: this.i18n.t('ข้อมูลที่เพิ่มหรือแก้ไขทั้งหมดในเครื่องนี้ (visit นัดหมาย order ใบแจ้งหนี้ ฯลฯ) จะถูกลบ และกลับไปเป็นข้อมูลตัวอย่างตั้งต้น'),
      confirmLabel: this.i18n.t('รีเซ็ตข้อมูล'),
      cancelLabel: this.i18n.t('ยกเลิก'),
      tone: 'danger',
    });
    if (confirmed) {
      this.ui.closeSheet();
      this.store.reset();
      this.ui.toast('รีเซ็ตเป็นข้อมูลตัวอย่างแล้ว');
    }
  }

  protected signOut() {
    this.session.signOut();
  }
}
