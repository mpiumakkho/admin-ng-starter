import { Directive, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Page load animation: a short fade, so the new page reads as new without making anyone wait for it. Plays only
 * when the page changes, not when just the query string does (picking a role on the roles page, searching from the
 * navbar), so the content doesn't flash; and not at all when the system asks for less motion (WCAG 2.3.3).
 */
@Directive({
  selector: '[contentAnimate]',
})
export class ContentAnimateDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const router = inject(Router);
    let path = toPath(router.url);
    router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(event => {
        const next = toPath(event.urlAfterRedirects);
        if (next !== path) {
          path = next;
          this.play();
        }
      });
  }

  private play(): void {
    const element = this.el.nativeElement;
    // Nor in the accessible view (UiAccessibleViewService), which keeps everything still
    if (element.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
      || element.ownerDocument.body.classList.contains('ui-aaa')) {
      return;
    }
    element.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
  }
}

function toPath(url: string): string {
  return url.split(/[?#]/)[0];
}
