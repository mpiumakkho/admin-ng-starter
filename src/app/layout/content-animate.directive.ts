import { Directive, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Page load animation. Plays only when the page changes, not when just the query string does
 * (picking a role on the roles page, searching from the navbar), so the content doesn't flash.
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
    this.el.nativeElement.animate?.(
      [
        { transform: 'translateY(-1%)', opacity: 0 },
        { transform: 'translateY(0%)', opacity: 1 },
      ],
      { duration: 500, easing: 'ease-in-out' },
    );
  }
}

function toPath(url: string): string {
  return url.split(/[?#]/)[0];
}
