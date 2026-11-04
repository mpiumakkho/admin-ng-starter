import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { afterNextRender, Component, computed, DestroyRef, DOCUMENT, effect, ElementRef, inject, signal, untracked, viewChild, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideAArrowDown, lucideAArrowUp, lucideAccessibility, lucideArrowLeft, lucideBell, lucideChevronRight, lucideDatabaseBackup, lucideLogOut, lucideMenu,
  lucideMoon, lucidePanelLeft, lucideStethoscope, lucideSun,
} from '@ng-icons/lucide';
import { filter } from 'rxjs';

import { ContentAnimateDirective } from '../../layout/content-animate.directive';
import { LanguageCode, LANGUAGES, LanguageService } from '../../layout/language.service';
import { accountText, fullName, Session } from '../../user-management';
import { RoleBadges } from '../../user-management/shared/badges';
import {
  UiAccessibleViewService, UiAvatar, UiConfirmService, UiMenu, UiMenuDivider, UiMenuItem, UiMenuItemCheckbox, UiMenuTrigger, UiScaleService,
  UiThemeService, UiTooltip,
} from '../../user-management/ui';
import { BackofficeUi } from '../backoffice-ui';
import { BackofficeStore } from '../backoffice.store';
import { BoI18n, TxPipe } from '../i18n/bo-i18n';
import { DialogHost } from './dialog-host';
import { BackofficeSearch } from './search';
import { BACKOFFICE_NAV, BRAND_ICON } from './nav';

const percent = (scale: number) => `${Math.round(scale * 100)}%`;
const COLLAPSED_KEY = 'backoffice.sidebar.collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; } };
const SWITCH_TO: Record<LanguageCode, string> = { th: 'เปลี่ยนเป็นภาษาไทย', en: 'เปลี่ยนเป็นภาษาอังกฤษ' };

/**
 * The back office: a sample of the hospital's administration (seph1-docs 26-backoffice-erp), in the app's own colors.
 * It fills the window on its own, without the admin sidebar (app.component.ts), and opens from the account menu, as the
 * clinical workspace does.
 *
 *   bar       the workspace's brand; the tenant and hospital it works in; notifications, theme, display size, language, the person
 *   sidebar   the spec's ten menu groups, those with a page; below 992px it slides in over the page
 *   main      the page
 */
@Component({
  selector: 'app-backoffice-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, NgIcon, TxPipe, UiAvatar, UiMenu, UiMenuItem, UiMenuItemCheckbox, UiMenuDivider, UiMenuTrigger, UiTooltip,
    RoleBadges, DialogHost, ContentAnimateDirective, BackofficeSearch,
  ],
  templateUrl: './backoffice-shell.component.html',
  styleUrl: './backoffice.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'backoffice', '[class.collapsed]': 'folded()' },
})
export class BackofficeShellComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly ui = inject(BackofficeUi);
  protected readonly i18n = inject(BoI18n);
  protected readonly theme = inject(UiThemeService);
  protected readonly uiScale = inject(UiScaleService);
  protected readonly accessibleView = inject(UiAccessibleViewService);
  protected readonly language = inject(LanguageService);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly confirm = inject(UiConfirmService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly document = inject(DOCUMENT);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  protected readonly fullName = fullName;
  protected readonly accountText = accountText;
  protected readonly icons = {
    brand: BRAND_ICON, menu: lucideMenu, bell: lucideBell, chevron: lucideChevronRight, collapse: lucidePanelLeft, back: lucideArrowLeft, clinic: lucideStethoscope,
    reset: lucideDatabaseBackup, signOut: lucideLogOut, moon: lucideMoon, sun: lucideSun, accessible: lucideAccessibility, larger: lucideAArrowUp, smaller: lucideAArrowDown,
  };
  /** The groups with a page; the reserved ones never are here (nav.ts) */
  protected readonly groups = BACKOFFICE_NAV.filter(g => g.links.length);
  /** The hospital the work is in: the tenant and hospital context the spec allows, and nothing finer */
  protected readonly context = { tenant: 'SLV', hospital: 'โรงพยาบาลสวนหลวงสัตวแพทย์' };

  protected readonly menuPosition: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
  ];
  private readonly otherLanguage = computed<LanguageCode>(() => LANGUAGES.find(lang => lang.code !== this.language.current())?.code ?? 'th');
  protected readonly languageLabel = computed(() => `${this.language.current().toUpperCase()} · ${this.i18n.t(SWITCH_TO[this.otherLanguage()])}`);
  protected readonly scaleNow = computed(() => `${this.i18n.t('ขนาดการแสดงผล')} ${percent(this.uiScale.scale())}`);
  protected readonly scaleHint = computed(() => this.i18n.t('กดเพื่อเปลี่ยนเป็น {size}', { size: percent(this.uiScale.next()) }));
  protected readonly themeLabel = computed(() => (this.theme.isDark() ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'));

  /** The menu, on narrow screens: open over the page */
  protected readonly menuOpen = signal(false);
  /** The group with the current page */
  protected readonly activeKey = signal('home');
  /** The one group folded open, as the admin's menu: the current page's, until another is opened or this one closed */
  protected readonly openKey = signal<string | null>('home');
  /** The menu folded to its icons (on wide screens), remembered on this device */
  protected readonly collapsed = signal(readCollapsed());
  /** Wide enough for the menu beside the page (992px); narrower, it slides in whole and never folds */
  private readonly wide = signal(true);
  protected readonly folded = computed(() => this.collapsed() && this.wide());
  /** Folded, the group whose pages show beside it, and how far down */
  protected readonly flyoutKey = signal<string | null>(null);
  protected readonly flyoutTop = signal(0);
  private flyoutTimer?: ReturnType<typeof setTimeout>;
  private refocusing = false;

  constructor() {
    let path = this.router.url.split(/[?#]/)[0];
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(event => {
      // Another page starts at its top, as the admin's do; the query string alone keeps the place
      const next = event.urlAfterRedirects.split(/[?#]/)[0];
      if (next !== path) {
        path = next;
        this.main().nativeElement.scrollTop = 0;
      }
      this.menuOpen.set(false);
      this.flyoutKey.set(null);
      const group = BACKOFFICE_NAV.find(g => g.links.some(l => event.urlAfterRedirects.startsWith(l.path)));
      if (group) {
        this.activeKey.set(group.key);
        this.openKey.set(group.key);
      }
    });
    effect(() => {
      const title = this.i18n.t('SLV BackOffice — โรงพยาบาลสวนหลวงสัตวแพทย์');
      untracked(() => { this.document.title = title; });
    });
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.uiScale.release());
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.wide.set(host.clientWidth >= 992));
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Opens a group and closes the one open, or closes it; folded, shows or hides its pages beside it */
  protected groupClicked(key: string, event: Event) {
    if (this.folded()) {
      if (this.flyoutKey() === key) { this.flyoutKey.set(null); } else { this.showFlyout(key, event); }
      return;
    }
    this.openKey.set(this.openKey() === key ? null : key);
  }

  protected toggleCollapsed() {
    this.collapsed.set(!this.collapsed());
    this.flyoutKey.set(null);
    try { localStorage.setItem(COLLAPSED_KEY, this.collapsed() ? '1' : '0'); } catch { /* the menu just opens wide next time */ }
  }

  protected showFlyout(key: string, event: Event) {
    clearTimeout(this.flyoutTimer);
    const group = (event.currentTarget as HTMLElement).closest('.nav-group');
    // The page's display size zooms the document; the box is measured zoomed, the offset is set before zooming
    const zoom = parseFloat(getComputedStyle(this.document.documentElement).zoom) || 1;
    this.flyoutTop.set(Math.round((group?.getBoundingClientRect().top ?? 0) / zoom));
    this.flyoutKey.set(key);
  }

  /** A short delay, so the pointer can cross from the icon to the pages */
  protected hideFlyout() {
    clearTimeout(this.flyoutTimer);
    this.flyoutTimer = setTimeout(() => this.flyoutKey.set(null), 120);
  }

  protected keepFlyout() {
    clearTimeout(this.flyoutTimer);
  }

  protected flyoutLeft(event: FocusEvent) {
    const group = (event.currentTarget as HTMLElement).closest('.nav-group');
    if (!group?.contains(event.relatedTarget as Node | null)) {
      this.hideFlyout();
    }
  }

  protected groupFocused(key: string, event: Event) {
    if (this.folded() && !this.refocusing) {
      this.showFlyout(key, event);
    }
  }

  /** Escape closes the pages and hands focus back to the group's icon, without opening them again */
  protected closeFlyout(key: string) {
    this.flyoutKey.set(null);
    this.refocusing = true;
    (this.document.querySelector(`[aria-controls="nav-${key}"]`) as HTMLElement | null)?.focus();
    this.refocusing = false;
  }

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
      message: this.i18n.t('คำขออนุมัติ ข้อยกเว้น และกิจกรรมที่เปลี่ยนไปในเครื่องนี้จะกลับไปเป็นข้อมูลตัวอย่างตั้งต้น ข้อมูลของงานตรวจรักษาไม่เปลี่ยน'),
      confirmLabel: this.i18n.t('รีเซ็ตข้อมูล'),
      cancelLabel: this.i18n.t('ยกเลิก'),
      tone: 'danger',
    });
    if (confirmed) {
      this.store.reset();
      this.ui.toast('รีเซ็ตเป็นข้อมูลตัวอย่างแล้ว');
    }
  }

  protected signOut() {
    this.session.signOut();
  }
}
