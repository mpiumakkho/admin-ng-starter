import { BreakpointObserver } from '@angular/cdk/layout';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { afterNextRender, Component, computed, DOCUMENT, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideActivity,
  lucideBell,
  lucideBlocks,
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
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';

import { ActivityDialog } from '../../user-management/activity/activity-dialog.component';
import {
  UiAvatar,
  UiMenu,
  UiMenuDivider,
  UiMenuHeading,
  UiMenuItem,
  UiMenuItemRadio,
  UiMenuTrigger,
  UiOption,
  UiSegmented,
  UiThemeService,
} from '../../user-management/ui';
import { Activity, AdminStore, fullName, Session } from '../../user-management';
import { ActivityText } from '../../user-management/shared/activity-text';
import { RoleBadge } from '../../user-management/shared/badges';
import { TimeAgoPipe } from '../../user-management/shared/formatting';
import { LanguageCode, LANGUAGES, LanguageService } from '../language.service';
import { SidebarState } from '../sidebar/sidebar-state';

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
    UiMenuItemRadio,
    UiMenuTrigger,
    UiSegmented,
    ActivityDialog,
    ActivityText,
    RoleBadge,
    TimeAgoPipe,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  viewProviders: [
    provideIcons({ lucideBell, lucideMenu, lucideMoon, lucidePanelLeft, lucideSearch, lucideSun, lucideX }),
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
  protected readonly store = inject(AdminStore);
  protected readonly session = inject(Session);
  protected readonly sidebar = inject(SidebarState);
  private readonly router = inject(Router);
  protected readonly fullName = fullName;
  protected readonly themeToggleLabel = computed(() => this.theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode');

  /** Menu item icons, as SVG for ui-menu */
  protected readonly icons = {
    user: lucideUser, activity: lucideActivity, blocks: lucideBlocks, history: lucideHistory, security: lucideShieldCheck, signOut: lucideLogOut,
  };
  /** Menus open under their button, lined up with its right edge, or above it when there is no room below */
  protected readonly menuPosition: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
  ];

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

  protected actorName(id: string) {
    const user = this.store.usersById().get(id);
    return user ? fullName(user) : '';
  }

  protected actorAvatar(id: string) {
    return this.store.usersById().get(id)?.avatar ?? '';
  }

  /* Search */

  // Search opens with Ctrl+K, or Cmd+K on a Mac
  private readonly isMac = /Mac|iPhone|iPad/.test(this.document.defaultView?.navigator.userAgent ?? '');
  protected readonly searchShortcutLabel = this.isMac ? '⌘K' : 'Ctrl K';
  protected readonly searchShortcutKeys = this.isMac ? 'Meta+K' : 'Control+K';

  /** On phones the search field is hidden until the search button opens it over the bar */
  protected readonly searchOpen = signal(false);

  protected openSearch() {
    this.searchOpen.set(true);
    afterNextRender(() => this.search()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeSearch() {
    this.searchOpen.set(false);
  }

  protected focusSearchOnShortcut(event: KeyboardEvent) {
    if (event.key.toLowerCase() === 'k' && (this.isMac ? event.metaKey : event.ctrlKey) && this.session.can('users.view')) {
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
