/* A table's pages, as the admin's tables have them: so many rows a page, the range shown and the way to the others */
import { Component, computed, input, signal, type Signal } from '@angular/core';

import { UiPagination } from '../../user-management/ui';
import { TxPipe } from '../i18n/bo-i18n';

export const PAGE_SIZES = [10, 20, 50];

/** A list cut into pages; the page stays within the list when a filter shortens it */
export class Pager<T> {
  readonly size = signal(PAGE_SIZES[0]);
  readonly page = signal(1);
  readonly total = computed(() => this.source().length);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));
  readonly current = computed(() => Math.min(this.page(), this.pageCount()));
  readonly rows = computed(() => this.source().slice((this.current() - 1) * this.size(), this.current() * this.size()));
  readonly from = computed(() => (this.total() ? (this.current() - 1) * this.size() + 1 : 0));
  readonly to = computed(() => Math.min(this.current() * this.size(), this.total()));

  constructor(private readonly source: Signal<T[]> | (() => T[])) {}

  resize(size: number) {
    this.size.set(size);
    this.page.set(1);
  }
}

/** The foot of a table: the rows shown of how many, rows a page, and the pages */
@Component({
  selector: 'bo-pager',
  imports: [TxPipe, UiPagination],
  template: `
    @let p = pager();
    @if (p.total()) {
      <div class="table-footer">
        <span class="pager-range">{{ 'แสดง {from}–{to} จาก {n} รายการ' | tx: { from: p.from(), to: p.to(), n: p.total() } }}</span>
        <label class="pager-size">
          <span>{{ 'แถวต่อหน้า' | tx }}</span>
          <select class="ui-input" (change)="p.resize(+$any($event.target).value)">
            @for (s of sizes; track s) {<option [value]="s" [selected]="s === p.size()">{{ s }}</option>}
          </select>
        </label>
        <ui-pagination [page]="p.current()" (pageChange)="p.page.set($event)" [pageCount]="p.pageCount()" [ariaLabel]="'หน้าของตาราง' | tx"
          [firstLabel]="'หน้าแรก' | tx" [previousLabel]="'หน้าก่อน' | tx" [nextLabel]="'หน้าถัดไป' | tx" [lastLabel]="'หน้าสุดท้าย' | tx" />
      </div>
    }
  `,
  host: { class: 'contents' },
})
export class PagerFoot {
  readonly pager = input.required<Pager<unknown>>();
  protected readonly sizes = PAGE_SIZES;
}
