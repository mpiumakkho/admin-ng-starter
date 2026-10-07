import { Component, computed, DOCUMENT, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideChevronRight } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { Session } from '../../user-management';
import { MENU, MenuItem } from './menu';
import { SidebarState } from './sidebar-state';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, NgIcon, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  host: {
    '(document:keydown.escape)': 'state.close()',
  },
})
export class SidebarComponent {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  protected readonly session = inject(Session);
  protected readonly state = inject(SidebarState);

  /** The menu without the pages the signed-in user's role does not allow, and without groups or sections left empty */
  protected readonly menu = computed(() => MENU
    .map(section => ({
      ...section,
      items: section.items
        .filter(item => this.allowed(item.permission))
        .map(item => item.children ? { ...item, children: item.children.filter(child => this.allowed(child.permission)) } : item)
        .filter(item => !item.children || item.children.length),
    }))
    .filter(section => section.items.length));
  /** Points right when a group is closed and turns clockwise to point down as it opens */
  protected readonly chevron = lucideChevronRight;

  // Groups that are expanded, keyed by the group's label
  protected readonly openGroups = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // Open the group that holds the current page, on load and after every navigation
    this.openGroupFor(this.router.url);
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(event => {
        this.openGroupFor(event.urlAfterRedirects);
        // A page was picked: the menu makes way for it
        this.state.close();
      });

    // While the menu is open over the page, the page behind it does not scroll
    effect(() => this.document.body.classList.toggle('menu-open', this.state.open()));

  }

  /** In the icon-only layout, the item under the pointer shows its name and pages in a flyout */
  protected readonly flyout = signal<string | null>(null);

  protected showFlyout(label: string) {
    if (this.document.body.classList.contains('sidebar-icon-only')) {
      this.flyout.set(label);
    }
  }

  protected isOpen(group: string) {
    return this.openGroups().has(group);
  }

  protected toggle(group: string) {
    this.openGroups.update(groups => {
      const next = new Set(groups);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  private allowed(permission: MenuItem['permission']) {
    return !permission || this.session.can(permission);
  }

  /** Opens the group that holds this address, so the current page is in view */
  private openGroupFor(url: string) {
    const path = url.split(/[?#]/)[0];
    const group = MENU.flatMap(section => section.items)
      .find(item => item.children?.some(child => path === child.link || path.startsWith(child.link + '/')));
    if (group && !this.openGroups().has(group.label)) {
      this.openGroups.update(groups => new Set(groups).add(group.label));
    }
  }
}
