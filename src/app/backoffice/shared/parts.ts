/* Small building blocks the back office's pages share; their look is in shell/backoffice.scss, under .backoffice */
import { Component, inject, input, output, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideChevronRight, lucideX } from '@ng-icons/lucide';

import { UiButton } from '../../user-management/ui';
import { MODULES } from '../data/types';
import type { Module } from '../data/types';
import { TxPipe } from '../i18n/bo-i18n';
import { BACKOFFICE_NAV } from '../shell/nav';

/** The head of a page, as the admin's: its menu group's icon, the group leading into its name, where its data comes from and how fresh it is, and its actions on the right */
@Component({
  selector: 'bo-page-head',
  imports: [NgIcon, TxPipe],
  template: `
    <div class="page-head">
      @if (group(); as g) {<span class="page-icon" aria-hidden="true"><ng-icon [svg]="g.icon" /></span>}
      <div class="title-block">
        <div class="title-row">
          @if (group(); as g) {
            <nav class="crumbs" [attr.aria-label]="'เส้นทาง' | tx"><span>{{ g.label | tx }}</span><ng-icon [svg]="chevron" class="crumb-separator" aria-hidden="true" /></nav>
          }
          <h1>{{ heading() | tx }}</h1>
        </div>
        <div class="subtitle">
          @if (source()) {<span>{{ source() | tx }}</span>}
          @if (freshness()) {<span class="freshness">{{ freshness() | tx }}</span>}
        </div>
      </div>
      <div class="page-actions"><ng-content /></div>
    </div>
  `,
  host: { class: 'contents' },
})
export class PageHead {
  readonly heading = input.required<string>();
  readonly source = input('');
  readonly freshness = input('');
  protected readonly chevron = lucideChevronRight;
  /** The menu group the page is under, by the longest menu path its address starts with */
  protected readonly group = signal(groupOf('/' + inject(ActivatedRoute).snapshot.pathFromRoot.flatMap(r => r.url.map(u => u.path)).join('/')));
}

function groupOf(url: string) {
  let best: { group: (typeof BACKOFFICE_NAV)[number]; length: number } | undefined;
  for (const group of BACKOFFICE_NAV) {
    for (const link of group.links) {
      if ((url === link.path || url.startsWith(link.path + '/')) && link.path.length > (best?.length ?? 0)) {
        best = { group, length: link.path.length };
      }
    }
  }
  return best?.group;
}

/** A module's tag: its code and name */
@Component({
  selector: 'bo-module',
  imports: [TxPipe],
  template: `<span class="module-tag" [attr.title]="MODULES[code()].name | tx"><b>{{ code() }}</b> {{ MODULES[code()].name | tx }}</span>`,
  host: { class: 'contents' },
})
export class ModuleTag {
  readonly code = input.required<Module>();
  protected readonly MODULES = MODULES;
}

/** The inspector beside a table: the record picked from it, with its actions; Escape or the button closes it */
@Component({
  selector: 'bo-drawer',
  imports: [NgIcon, TxPipe, UiButton],
  template: `
    <aside class="drawer" [attr.aria-label]="heading() | tx" (keydown.escape)="closed.emit()">
      <div class="drawer-head">
        <div>
          <h2>{{ heading() | tx }}</h2>
          @if (sub()) {<div class="secondary">{{ sub() | tx }}</div>}
        </div>
        <button uiButton variant="ghost" size="sm" type="button" [attr.aria-label]="'ปิด' | tx" (click)="closed.emit()"><ng-icon [svg]="x" aria-hidden="true" /></button>
      </div>
      <div class="drawer-body"><ng-content /></div>
      <div class="drawer-foot"><ng-content select="[foot]" /></div>
    </aside>
  `,
  host: { class: 'contents' },
})
export class Drawer {
  readonly heading = input.required<string>();
  readonly sub = input('');
  readonly closed = output<void>();
  protected readonly x = lucideX;
}
