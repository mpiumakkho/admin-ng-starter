/* The inventory overview: the risks across the shelves, each counted from the rows its own page shows (INV-STK-00, composed over M06) */
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { CONTROL_SYSTEM, EXPIRY_BUCKETS, inventoryOverview, LOT_STATE } from '../../data/inventory';
import type { ExpiryBucket } from '../../data/inventory';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-inventory-overview',
  imports: [RouterLink, TxPipe, PageHead],
  template: `
    @let o = overview();
    <bo-page-head [heading]="'ภาพรวมคลัง'" [source]="'รวมจาก M06 ตามสิทธิ์ · ทุกตัวเลขนับจากแถวเดียวกับหน้าต้นทาง · ไม่แก้ไขที่หน้านี้'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <a class="kpi" [class.warn]="o.low" role="listitem" routerLink="/backoffice/inventory/reorder">
        <span class="kpi-value">{{ o.low }}</span><span class="kpi-label">{{ 'ต่ำกว่าจุดสั่งเติม · จาก {n} รายการ' | tx: { n: o.items } }}</span>
      </a>
      <a class="kpi" [class.danger]="o.expiry.d30" [class.warn]="!o.expiry.d30 && o.expiring" role="listitem" routerLink="/backoffice/inventory/lots">
        <span class="kpi-value">{{ o.expiring }}</span><span class="kpi-label">{{ 'lot หมดอายุใน 90 วัน · ใน 30 วัน {n}' | tx: { n: o.expiry.d30 } }}</span>
      </a>
      <a class="kpi" [class.danger]="o.expiry.expired" role="listitem" routerLink="/backoffice/inventory/lots" [queryParams]="{ bucket: 'expired' }">
        <span class="kpi-value">{{ o.expiry.expired }}</span><span class="kpi-label">{{ 'lot หมดอายุที่ยังมีของ' | tx }}</span>
      </a>
      <a class="kpi" [class.danger]="o.investigations" role="listitem" routerLink="/backoffice/inventory/controlled" [queryParams]="{ tab: 'count' }">
        <span class="kpi-value">{{ o.investigations }}</span><span class="kpi-label">{{ 'การสอบสวนส่วนต่างที่เปิดอยู่' | tx }}</span>
      </a>
      <a class="kpi" [class.danger]="o.recalls" role="listitem" routerLink="/backoffice/inventory/recall">
        <span class="kpi-value">{{ o.recalls }}</span><span class="kpi-label">{{ 'การเรียกคืนที่ยังไม่ปิด' | tx }}</span>
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/inventory/dispenses">
        <span class="kpi-value">{{ o.dispensedToday }}</span><span class="kpi-label">{{ 'จ่ายยาวันนี้ · รับเข้า {n}' | tx: { n: o.receiptsToday } }}</span>
      </a>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'Lot ที่ต้องจัดการก่อน' | tx }}</b><span class="secondary grow">{{ '{n} lot หมดอายุแล้วหรือภายใน 90 วัน · จ่ายก่อนตาม FEFO หรือบันทึกยาเสีย' | tx: { n: o.expiringLots.length } }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead>
            <tr>
              <th scope="col" class="w-ref">Lot</th>
              <th scope="col">{{ 'รายการยา' | tx }}</th>
              <th scope="col" class="w-due">{{ 'วันหมดอายุ' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'เหลือเวลา' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'คงเหลือ' | tx }}</th>
              <th scope="col" class="w-owner">{{ 'ตำแหน่ง' | tx }}</th>
              <th scope="col" class="w-status">{{ 'สถานะ Lot' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (l of o.expiringLots; track l.lot) {
              <tr tabindex="0" (click)="actions.openItem(l.drug)" (keydown.enter)="actions.openItem(l.drug)">
                <td><b>{{ l.lot }}</b></td>
                <td>{{ l.drug }}</td>
                <td class="num">{{ l.expiry }}</td>
                <td><span class="chip" [class]="'chip ' + bucket(l.bucket).cls">{{ l.days! < 0 ? ('หมดอายุแล้ว' | tx) : ('{n} วัน' | tx: { n: l.days! }) }}</span></td>
                <td class="num">{{ l.qty }} {{ l.unit | tx }}</td>
                <td>{{ l.location | tx }}</td>
                <td><span class="chip" [class]="'chip ' + LOT_STATE[l.state].cls">{{ LOT_STATE[l.state].label | tx }}</span></td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="7" class="empty">{{ 'ไม่มี lot ที่ใกล้หมดอายุ' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'ต่ำกว่าจุดสั่งเติม' | tx }}</b><span class="secondary grow">{{ '{n} รายการ · การสั่งซื้ออยู่นอกขอบเขตที่อนุมัติ' | tx: { n: o.lowItems.length } }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead>
            <tr>
              <th scope="col">{{ 'รายการยา' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'คงเหลือ' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'จุดสั่งเติม' | tx }}</th>
              <th scope="col" class="w-at">{{ 'นับล่าสุด' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'ควบคุม' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (i of o.lowItems; track i.drug.id) {
              <tr tabindex="0" (click)="actions.openItem(i.drug.id)" (keydown.enter)="actions.openItem(i.drug.id)">
                <td><b>{{ i.drug.name }}</b><div class="secondary">{{ i.drug.id }} · {{ i.location | tx }}</div></td>
                <td class="num text-danger">{{ i.onHand ?? '—' }} {{ i.drug.unit | tx }}</td>
                <td class="num">{{ i.drug.reorderThreshold }} {{ i.drug.unit | tx }}</td>
                <td class="num">{{ i.drug.lastCountAt ?? '—' }}</td>
                <td>@if (i.controlled) {<span class="chip" [class]="'chip ' + CONTROL[i.drug.classSystem].cls">{{ CONTROL[i.drug.classSystem].short | tx }} {{ i.drug.category }}</span>} @else {<span class="muted">—</span>}</td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีรายการต่ำกว่าจุดสั่งเติม' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  host: { class: 'page' },
})
export class InventoryOverviewComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly LOT_STATE = LOT_STATE;
  protected readonly CONTROL = CONTROL_SYSTEM;
  protected readonly overview = computed(() => inventoryOverview(this.store.clinic.data(), this.store.data()));
  protected bucket(key: ExpiryBucket) {
    return EXPIRY_BUCKETS.find(b => b.key === key)!;
  }
}
