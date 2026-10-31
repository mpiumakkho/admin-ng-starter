import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { Component, computed, DestroyRef, DOCUMENT, effect, ElementRef, inject, signal, untracked, viewChild, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import {
  lucideAArrowDown, lucideAArrowUp, lucideAccessibility, lucideArrowLeft, lucideBell, lucideChevronRight, lucideDatabaseBackup, lucideLogOut, lucideMenu,
  lucideMoon, lucideStethoscope, lucideSun,
} from '@ng-icons/lucide';
import { filter } from 'rxjs';

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
import { BACKOFFICE_NAV, BRAND_ICON } from './nav';

const percent = (scale: number) => `${Math.round(scale * 100)}%`;
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
    RoleBadges, DialogHost,
  ],
  templateUrl: './backoffice-shell.component.html',
  styleUrl: './backoffice.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'backoffice' },
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
    brand: BRAND_ICON, menu: lucideMenu, bell: lucideBell, chevron: lucideChevronRight, back: lucideArrowLeft, clinic: lucideStethoscope,
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
  /** The groups folded open; the one with the current page always is */
  protected readonly openGroups = signal<ReadonlySet<string>>(new Set(['home']));

  constructor() {
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(event => {
      this.menuOpen.set(false);
      const group = BACKOFFICE_NAV.find(g => g.links.some(l => event.urlAfterRedirects.startsWith(l.path)));
      if (group && !this.openGroups().has(group.key)) {
        this.openGroups.update(set => new Set(set).add(group.key));
      }
    });
    effect(() => {
      const title = this.i18n.t('SLV BackOffice — โรงพยาบาลสวนหลวงสัตวแพทย์');
      untracked(() => { this.document.title = title; });
    });
    inject(DestroyRef).onDestroy(() => this.uiScale.release());
  }

  protected toggleGroup(key: string) {
    this.openGroups.update(set => {
      const next = new Set(set);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
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
