import { Location } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  RouteConfigLoadEnd,
  RouteConfigLoadStart,
  Router,
  RouterOutlet,
} from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';

import { ReauthDialog, Session, SessionNotices } from './user-management';
import { UiAccessibleViewService, UiToaster } from './user-management/ui';
import { AccessibleViewSwitchComponent } from './layout/accessible-view-switch.component';
import { ContentAnimateDirective } from './layout/content-animate.directive';
import { FooterComponent } from './layout/footer/footer.component';
import { NavbarComponent } from './layout/navbar/navbar.component';
import { LanguageService } from './layout/language.service';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { SpinnerComponent } from './layout/spinner/spinner.component';

const AUTH_PAGES = ['/login', '/forgot-password', '/activate', '/reset-password', '/setup-two-factor'];
const ERROR_PAGES = ['/error-pages/404', '/error-pages/500'];
/** Workspaces with their own shell bar and menu, which fill the window */
const WORKSPACES = ['/clinic'];
/** Read by index.html: someone was signed in when the app last ran */
const SIGNED_IN_KEY = 'app-signed-in';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    NavbarComponent,
    SidebarComponent,
    FooterComponent,
    SpinnerComponent,
    UiToaster,
    ContentAnimateDirective,
    AccessibleViewSwitchComponent,
    ReauthDialog,
    SessionNotices,
    TranslatePipe,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly path = signal(toPath(inject(Location).path()));
  protected readonly accessibleView = inject(UiAccessibleViewService);

  protected readonly isLoading = signal(false);
  protected readonly isErrorPage = computed(() => ERROR_PAGES.includes(this.path()));
  protected readonly isWorkspace = computed(() => WORKSPACES.some(path => this.path() === path || this.path().startsWith(path + '/')));
  // Sidebar, Navbar, Footer and Settings are removed for Error and Auth pages, and for workspaces, which bring their own
  protected readonly isFullPage = computed(() => this.isErrorPage() || AUTH_PAGES.includes(this.path()) || this.isWorkspace());

  constructor() {
    inject(LanguageService).init();

    // Tells index.html, on the next load, to show the app's frame rather than a spinner while the session loads
    const session = inject(Session);
    effect(() => {
      try {
        if (session.signedIn()) {
          localStorage.setItem(SIGNED_IN_KEY, '1');
        } else {
          localStorage.removeItem(SIGNED_IN_KEY);
        }
      } catch {
        // Storage unavailable: the spinner shows instead
      }
    });

    const router = inject(Router);
    router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.path.set(toPath(event.url));
      } else if (event instanceof NavigationEnd) {
        this.path.set(toPath(event.urlAfterRedirects));
      } else if (event instanceof NavigationCancel || event instanceof NavigationError) {
        // Stayed where it was, for example to keep unsaved changes: back to that page's layout
        this.path.set(toPath(router.url));
        this.isLoading.set(false);
      } else if (event instanceof RouteConfigLoadStart) {
        // Spinner for lazyload modules
        this.isLoading.set(true);
      } else if (event instanceof RouteConfigLoadEnd) {
        this.isLoading.set(false);
      }
    });
  }
}

function toPath(url: string): string {
  return url.split(/[?#]/)[0];
}
