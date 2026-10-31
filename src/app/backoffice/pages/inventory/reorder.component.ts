/* The reorder worklist: what is at or below its reorder point, to read before buying elsewhere; nothing is ordered or acknowledged here (INV-ROP-01) */
import { Component, computed, inject, signal } from '@angular/core';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { CONTROL_SYSTEM, stockList } from '../../data/inventory';
import type { StockItem } from '../../data/inventory';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-reorder',
  imports: [TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'รายการยาที่ต้องเติม'" [source]="'M06 · รายการที่คงเหลือถึงจุดสั่งเติม (is_low) · อ่านอย่างเดียว ไม่มีการรับทราบ มอบหมาย หรือปิดรายการ'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="notice">{{ 'การสั่งซื้ออยู่นอกขอบเขตที่อนุมัติ — ไม่มีการสร้างใบขอซื้อ ใบสั่งซื้อ หรือเลือกผู้จำหน่ายจากหน้านี้ · จุดสั่งเติมตั้งค่าโดยผู้ดูแลระบบ' | tx }}</div>

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <input class="ui-input search" type="search" [placeholder]="'ค้นหายาหรือรหัส' | tx" [attr.aria-label]="'ค้นหายา' | tx" [value]="q()" (input)="q.set($any($event.target).value)" />
          <span class="secondary grow">{{ '{n} รายการ · เรียงตามสัดส่วนที่เหลือของจุดสั่งเติม' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead>
              <tr>
                <th scope="col">{{ 'รายการยา' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'คงเหลือ' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'จุดสั่งเติม' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ขาด' | tx }}</th>
                <th scope="col" class="w-at">{{ 'นับล่าสุด' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'ควบคุม' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (i of rows(); track i.drug.id) {
                <tr tabindex="0" [class.selected]="i.drug.id === selectedId()" [attr.aria-selected]="i.drug.id === selectedId()" (click)="pick(i)" (keydown.enter)="pick(i)">
                  <td><b>{{ i.drug.name }}</b><div class="secondary">{{ i.drug.id }} · {{ i.location | tx }}</div></td>
                  <td class="num text-danger">{{ i.onHand ?? '—' }} {{ i.drug.unit | tx }}</td>
                  <td class="num">{{ i.drug.reorderThreshold }}</td>
                  <td class="num">{{ gap(i) }}</td>
                  <td class="num">{{ i.drug.lastCountAt ?? '—' }}</td>
                  <td>@if (i.controlled) {<span class="chip" [class]="'chip ' + CONTROL[i.drug.classSystem].cls">{{ CONTROL[i.drug.classSystem].short | tx }} {{ i.drug.category }}</span>} @else {<span class="muted">—</span>}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ (q() ? 'ไม่มีรายการที่ตรงกับตัวกรอง' : 'ไม่มีรายการถึงจุดสั่งเติม') | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (selected(); as i) {
        <bo-drawer [heading]="i.drug.name" [sub]="i.drug.id + ' · ' + i.location" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'คงเหลือ' | tx }}</dt><dd class="text-danger">{{ i.onHand ?? '—' }} {{ i.drug.unit | tx }}</dd>
            <dt>{{ 'จุดสั่งเติม' | tx }}</dt><dd>{{ i.drug.reorderThreshold }} {{ i.drug.unit | tx }} · {{ 'ขาด' | tx }} {{ gap(i) }}</dd>
            <dt>{{ 'นับล่าสุด' | tx }}</dt><dd>{{ i.drug.lastCountAt ? i.drug.lastCountAt + ' · ' + (i.drug.lastCountBy | tx) : ('ยังไม่เคยนับ' | tx) }}</dd>
            <dt>{{ 'หมดอายุถัดไป' | tx }}</dt><dd>{{ i.nearest ? i.nearest.lot + ' · ' + i.nearest.expiry : '—' }}</dd>
          </dl>
          <p class="secondary">{{ 'การจัดหาทำนอกระบบนี้จนกว่า procurement จะมีสัญญา · เมื่อรับยาเข้าคลังแล้ว รายการจะพ้นจากหน้านี้เอง' | tx }}</p>
          <ng-container foot>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" (click)="actions.openItem(i.drug.id)">{{ 'เปิดรายการยา' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class ReorderComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly CONTROL = CONTROL_SYSTEM;
  protected readonly q = signal('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly rows = computed(() => stockList(this.store.stock(), { lowOnly: true, q: this.q() }).sort((a, b) => (a.onHand ?? 0) / a.drug.reorderThreshold - (b.onHand ?? 0) / b.drug.reorderThreshold));
  protected readonly selected = computed(() => this.rows().find(i => i.drug.id === this.selectedId()) ?? null);

  protected pick(i: StockItem) {
    this.selectedId.set(this.selectedId() === i.drug.id ? null : i.drug.id);
  }

  protected gap(i: StockItem) {
    return Math.round((i.drug.reorderThreshold - (i.onHand ?? 0)) * 100) / 100;
  }
}
