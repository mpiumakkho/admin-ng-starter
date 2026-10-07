import { Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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

import { UiToaster } from './user-management/ui';
import { ContentAnimateDirective } from './layout/content-animate.directive';
import { FooterComponent } from './layout/footer/footer.component';
import { NavbarComponent } from './layout/navbar/navbar.component';
import { LanguageService } from './layout/language.service';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { SpinnerComponent } from './layout/spinner/spinner.component';

const AUTH_PAGES = ['/login'];
const ERROR_PAGES = ['/error-pages/404', '/error-pages/500'];

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
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly path = signal(toPath(inject(Location).path()));

  protected readonly isLoading = signal(false);
  protected readonly isErrorPage = computed(() => ERROR_PAGES.includes(this.path()));
  // Sidebar, Navbar, Footer and Settings are removed for Error and Auth pages
  protected readonly isFullPage = computed(() => this.isErrorPage() || AUTH_PAGES.includes(this.path()));

  constructor() {
    inject(LanguageService).init();

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
