import { Injectable, signal } from '@angular/core';

/**
 * Whether the menu is open on screens too narrow to keep it in view (below 992px), where it slides in from
 * the left. The navbar's menu button opens it; picking a page, the backdrop or Escape closes it.
 */
@Injectable({ providedIn: 'root' })
export class SidebarState {
  readonly open = signal(false);

  toggle() {
    this.open.update(open => !open);
  }

  close() {
    this.open.set(false);
  }
}
