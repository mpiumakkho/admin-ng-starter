import { LiveAnnouncer } from '@angular/cdk/a11y';
import { BreakpointObserver } from '@angular/cdk/layout';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { afterNextRender, Component, computed, DestroyRef, DOCUMENT, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAArrowDown,
  lucideAArrowUp,
  lucideAccessibility,
  lucideActivity,
  lucideBell,
  lucideBlocks,
  lucideBriefcase,
  lucideStethoscope,
  lucideHistory,
  lucideLogOut,
  lucideMenu,
  lucideMoon,
  lucidePanelLeft,
  lucideSearch,
  lucideShieldCheck,
  lucideSun,
  lucideUser,
  lucideX,
} from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';

import { ActivityDialog } from '../../user-management/activity/activity-dialog.component';
import {
  UiAvatar,
  UiMenu,
  UiMenuDivider,
  UiMenuHeading,
  UiMenuItem,
  UiAccessibleViewService,
  UiMenuItemCheckbox,
  UiMenuItemRadio,
  UiMenuTrigger,
  UiOption,
  UiScaleService,
  UiSegmented,
  UiThemeService,
  UiTooltip,
} from '../../user-management/ui';
import { accountText, Activity, AdminStore, fullName, Session, User } from '../../user-management';
import { ActivityText } from '../../user-management/shared/activity-text';
import { RoleBadges } from '../../user-management/shared/badges';
import { idleTimeoutLabel, TimeAgoPipe } from '../../user-management/shared/formatting';
import { translationsChanged } from '../../user-management/shared/i18n';
import { LanguageCode, LANGUAGES, LanguageService } from '../language.service';
import { SidebarState } from '../sidebar/sidebar-state';

/** The most people the search shows as you type; the rest are a click away on the users list */
const QUICK_RESULTS = 6;

/** When the bell menu was last opened, so its dot means "new since you looked" */
const ACTIVITY_SEEN_KEY = 'activity-seen';

@Component({
  selector: 'app-navbar',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    UiAvatar,
    UiMenu,
    UiMenuDivider,
    UiMenuHeading,
    UiMenuItem,
    UiMenuItemCheckbox,
    UiMenuItemRadio,
    UiMenuTrigger,
    UiSegmented,
    UiTooltip,
    ActivityDialog,
    ActivityText,
    RoleBadges,
    TimeAgoPipe,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  viewProviders: [
    provideIcons({ lucideAArrowDown, lucideAArrowUp, lucideBell, lucideMenu, lucideMoon, lucidePanelLeft, lucideSearch, lucideSun, lucideX }),
  ],
  host: {
    '(document:keydown)': 'focusSearchOnShortcut($event)',
  },
})
export class NavbarComponent {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  protected readonly language = inject(LanguageService);
  protected readonly theme = inject(UiThemeService);
  protected readonly uiScale = inject(UiScaleService);
  protected readonly accessibleView = inject(UiAccessibleViewService);
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  protected readonly sidebar = inject(SidebarState);
  private readonly router = inject(Router);
  private readonly announcer = inject(LiveAnnouncer);
  protected readonly fullName = fullName;
  protected readonly accountText = accountText;

  constructor() {
    // Leaving the page with the bar's controls held at their size: the next bar starts at the size of the rest
    inject(DestroyRef).onDestroy(() => this.uiScale.release());
  }
  protected readonly themeToggleLabel = computed(() => this.theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode');
  private readonly translate = inject(TranslateService);
  private readonly i18n = translationsChanged();
  /** How long before the app signs out someone who is away, when the settings say it should (WCAG 2.2.6) */
  protected readonly idleTimeout = computed(() => {
    this.i18n();
    const minutes = this.store.settings().sessionTimeoutMinutes;
    return minutes ? idleTimeoutLabel(this.translate, minutes) : '';
  });

  /** Menu item icons, as SVG for ui-menu */
  protected readonly icons = {
    user: lucideUser, activity: lucideActivity, blocks: lucideBlocks, history: lucideHistory, security: lucideShieldCheck, signOut: lucideLogOut,
    clinic: lucideStethoscope, backoffice: lucideBriefcase,
    accessible: lucideAccessibility,
  };
  /** Menus open under their button, lined up with its right edge, or above it when there is no room below */
  protected readonly menuPosition: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
  ];

  /** The display size: what it is now, and what a press of its button makes it */
  protected readonly scaleNow = computed(() => {
    this.i18n();
    return `${this.translate.instant('Display size')} ${Math.round(this.uiScale.scale() * 100)}%`;
  });
  protected readonly scaleHint = computed(() => {
    this.i18n();
    return this.translate.instant('displaySizeNext', { size: `${Math.round(this.uiScale.next() * 100)}%` });
  });

  /** One size up, or back to 100%; screen readers hear the new size. A press with the pointer (not a key) holds the bar's
   * controls at their size until the pointer leaves the button. */
  protected stepScale(event: MouseEvent) {
    this.uiScale.step({ hold: event.detail > 0 });
    this.announcer.announce(this.scaleNow());
  }

  /** Phones: the language switch moves from the bar into the account menu */
  protected readonly isPhone = toSignal(
    inject(BreakpointObserver).observe('(max-width: 575.98px)').pipe(map(state => state.matches)),
    { initialValue: false },
  );

  /* Language */

  /** TH | EN on screen; each language's own name for screen readers, said in that language */
  protected readonly languageOptions: UiOption<LanguageCode>[] = LANGUAGES.map(lang => ({
    value: lang.code,
    label: lang.code.toUpperCase(),
    ariaLabel: lang.label,
    lang: lang.code,
  }));

  protected setLanguage(code: LanguageCode | null) {
    if (code) {
      this.language.use(code);
    }
  }

  /* Recent activity */

  protected readonly recentActivity = computed(() => this.store.activity().slice(0, 4));
  /** The entry open in the details dialog */
  protected readonly selectedEntry = signal<Activity | null>(null);

  private readonly activitySeenAt = signal(readStorage(ACTIVITY_SEEN_KEY) ?? '');
  /** Something was logged after the bell menu was last opened (the log is newest first) */
  protected readonly hasNewActivity = computed(() => (this.store.activity()[0]?.at ?? '') > this.activitySeenAt());

  protected markActivitySeen() {
    const latest = this.store.activity()[0]?.at;
    if (latest) {
      this.activitySeenAt.set(latest);
      writeStorage(ACTIVITY_SEEN_KEY, latest);
    }
  }

  /** Who did it; nothing for what the server did by itself */
  protected actorName(id: string | null) {
    const user = this.store.usersById().get(id ?? '');
    return user ? fullName(user) : '';
  }

  protected actorAvatar(id: string | null) {
    return this.store.usersById().get(id ?? '')?.avatar ?? '';
  }

  /* Search */

  // Search opens with Ctrl+K, or Cmd+K on a Mac
  private readonly isMac = /Mac|iPhone|iPad/.test(this.document.defaultView?.navigator.userAgent ?? '');
  protected readonly searchShortcutLabel = this.isMac ? '⌘K' : 'Ctrl K';
  protected readonly searchShortcutKeys = this.isMac ? 'Meta+K' : 'Control+K';
  /** The shortcut in words, for its tooltip */
  protected readonly searchShortcutName = this.isMac ? 'Command + K' : 'Control + K';

  /** On phones the search field is hidden until the search button opens it over the bar */
  protected readonly searchOpen = signal(false);

  /* Search as you type */

  protected readonly query = signal('');
  protected readonly searchFocused = signal(false);
  /** The person picked with the arrow keys; one past the last is "see all results", -1 none */
  protected readonly activeIndex = signal(-1);

  /** Everyone the text matches, as the users list searches: name, email or phone. Names that start with it first. */
  protected readonly matches = computed<User[]>(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) {
      return [];
    }
    return this.store.users()
      .filter(user => fullName(user).toLowerCase().includes(query) || user.email.toLowerCase().includes(query) || user.phone.includes(query))
      .sort((a, b) => Number(!fullName(a).toLowerCase().startsWith(query)) - Number(!fullName(b).toLowerCase().startsWith(query)));
  });
  protected readonly results = computed(() => this.matches().slice(0, QUICK_RESULTS));
  protected readonly resultsShown = computed(() => this.searchFocused() && this.matches().length > 0);

  protected typed(value: string) {
    this.query.set(value);
    this.activeIndex.set(-1);
  }

  protected searchKey(event: KeyboardEvent) {
    const options = this.results().length + (this.matches().length ? 1 : 0);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      // Past either end the field itself is picked again (-1), as in most search boxes
      if (options) {
        this.activeIndex.update(index => event.key === 'ArrowDown'
          ? (index + 1 >= options ? -1 : index + 1)
          : (index - 1 < -1 ? options - 1 : index - 1));
      }
    } else if (event.key === 'Enter' && this.activeIndex() >= 0) {
      event.preventDefault();
      this.search()?.nativeElement.closest('form')?.querySelector<HTMLAnchorElement>(`#quick-search-${this.activeIndex()}`)?.click();
    } else if (event.key === 'Escape') {
      // First the list goes, then the text, then (on phones) the field
      if (this.activeIndex() >= 0 || this.resultsShown()) {
        this.activeIndex.set(-1);
        this.searchFocused.set(false);
      } else if (this.query()) {
        this.query.set('');
      } else {
        this.closeSearch();
      }
    }
  }

  /** Enter with nobody picked: the users list, filtered by the text */
  protected submitSearch() {
    const query = this.query();
    this.finishSearch();
    this.searchUsers(query);
  }

  /** The list closes once the keyboard leaves the search, not when a click lands on one of its people */
  protected searchFocusOut(event: FocusEvent) {
    const form = event.currentTarget as HTMLElement;
    if (!form.contains(event.relatedTarget as Node | null)) {
      this.searchFocused.set(false);
      this.activeIndex.set(-1);
    }
  }

  protected finishSearch() {
    this.query.set('');
    this.activeIndex.set(-1);
    this.searchFocused.set(false);
    this.search()?.nativeElement.blur();
    this.closeSearch();
  }

  protected openSearch() {
    this.searchOpen.set(true);
    afterNextRender(() => this.search()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeSearch() {
    this.searchOpen.set(false);
  }

  protected focusSearchOnShortcut(event: KeyboardEvent) {
    if (event.key.toLowerCase() === 'k' && (this.isMac ? event.metaKey : event.ctrlKey) && this.session.canSomewhere('users.view')) {
      event.preventDefault();
      this.openSearch();
    }
  }

  /** Opens the user list filtered by the search text */
  protected searchUsers(query: string) {
    this.closeSearch();
    this.router.navigate(['/users'], { queryParams: { q: query.trim() || null } });
  }

  protected signOut() {
    this.session.signOut();
  }

  /* Sidebar */

  public iconOnlyToggled = false;

  /** Narrows the pinned sidebar to its icons, or back */
  toggleSidebar() {
    this.iconOnlyToggled = !this.iconOnlyToggled;
    this.document.body.classList.toggle('sidebar-icon-only', this.iconOnlyToggled);
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the dot then just shows again next time
  }
}
