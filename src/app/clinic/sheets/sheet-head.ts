import { Component, inject, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';

import { ClinicUi } from '../clinic-ui';
import type { Badge } from '../data/types';
import { TxPipe } from '../i18n/clinic-i18n';

/** A sheet's head: its title and status, what it is about, and its sections when it has some */
@Component({
  selector: 'cl-sheet-head',
  imports: [NgIcon, TxPipe],
  template: `
    <div class="sheet-head">
      <h2 id="clinic-sheet-title">{{ heading() | tx }}</h2>
      @if (status(); as status) {
        <span class="status" [class]="'status ' + status.cls">{{ status.text | tx }}</span>
      }
      <span class="spacer"></span>
      <button type="button" class="sheet-icon" [attr.aria-label]="'ปิด' | tx" (click)="ui.closeSheet()"><ng-icon [svg]="close" aria-hidden="true" /></button>
    </div>
    @if (sub()) {
      <div class="sheet-sub">{{ sub() | tx }}</div>
    }
    @if (tabs().length) {
      <div class="sheet-tabs" role="group" [attr.aria-label]="'ส่วนของข้อมูล' | tx">
        @for (tab of tabs(); track tab.id) {
          <button type="button" [class.active]="tab.id === activeTab()" [attr.aria-pressed]="tab.id === activeTab()" (click)="pick(tab.id)">
            {{ tab.label | tx }}
          </button>
        }
      </div>
    }
  `,
  host: { class: 'contents' },
})
export class SheetHead {
  readonly heading = input.required<string>();
  readonly status = input<Badge | null>(null);
  readonly sub = input('');
  readonly tabs = input<{ id: string; label: string }[]>([]);
  readonly activeTab = input('');

  protected readonly ui = inject(ClinicUi);
  protected readonly close = lucideX;

  protected pick(tab: string) {
    const open = this.ui.sheet();
    if (open) {
      this.ui.openSheet(open.kind, { id: open.id, tab });
    }
  }
}
