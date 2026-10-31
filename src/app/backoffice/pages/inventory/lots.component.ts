/* Lots and expiry: every lot on every shelf, the soonest to expire first, in the 30/60/90-day windows (inventory.lotsExpiry, the lot read model of INV-STK-02) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { allLots, EXPIRY_BUCKETS, expiryCounts, LOT_STATE } from '../../data/inventory';
import type { ExpiryBucket, LotRow } from '../../data/inventory';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-lots',
  imports: [RouterLink, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'Lot และวันหมดอายุ'" [source]="'M06 · lot ของทุกรายการยา เรียงตามวันหมดอายุ · ช่วงเตือน 30/60/90 วันนับถึงวันสุดท้ายของเดือนที่ระบุ · Read API ของ lot ยังไม่อนุมัติ (GATED) — ข้อมูลตัวอย่าง'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      @for (b of buckets; track b.key) {
        <button type="button" class="kpi" [class]="'kpi ' + (counts()[b.key] > 0 && b.key !== 'ok' ? b.cls : '')" [class.active]="bucket() === b.key" role="listitem" (click)="bucket.set(bucket() === b.key ? '' : b.key)">
          <span class="kpi-value">{{ counts()[b.key] }}</span><span class="kpi-label">{{ b.label | tx }}</span>
        </button>
      }
    </div>

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <input class="ui-input search" type="search" [placeholder]="'ค้นหายาหรือ lot' | tx" [attr.aria-label]="'ค้นหา lot' | tx" [value]="q()" (input)="q.set($any($event.target).value)" />
          <label class="check"><input type="checkbox" [checked]="withStock()" (change)="withStock.set($any($event.target).checked)" />{{ 'เฉพาะ lot ที่มีของ' | tx }}</label>
          <span class="secondary grow">{{ '{n} lot' | tx: { n: rows().length } }}</span>
        </div>
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
              @for (l of rows(); track l.lot) {
                <tr tabindex="0" [class.selected]="l.lot === selectedLot()" [attr.aria-selected]="l.lot === selectedLot()" (click)="pick(l)" (keydown.enter)="pick(l)">
                  <td><b>{{ l.lot }}</b></td>
                  <td>{{ l.drug }}</td>
                  <td class="num">{{ l.expiry }}</td>
                  <td><span class="chip" [class]="'chip ' + info(l.bucket).cls">{{ l.days === null ? '—' : l.days < 0 ? ('หมดอายุแล้ว' | tx) : ('{n} วัน' | tx: { n: l.days }) }}</span></td>
                  <td class="num">{{ l.qty ?? '—' }} {{ l.unit | tx }}</td>
                  <td>{{ l.location | tx }}</td>
                  <td><span class="chip" [class]="'chip ' + LOT_STATE[l.state].cls">{{ LOT_STATE[l.state].label | tx }}</span></td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="7" class="empty">{{ (bucket() || q() ? 'ไม่มี lot ที่ตรงกับตัวกรอง' : 'ไม่มี lot ในคลัง') | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (selected(); as l) {
        <bo-drawer [heading]="l.lot" [sub]="l.drug" (closed)="selectedLot.set(null)">
          <dl class="data-grid">
            <dt>{{ 'วันหมดอายุ' | tx }}</dt><dd>{{ l.expiry }} · <span class="chip" [class]="'chip ' + info(l.bucket).cls">{{ info(l.bucket).label | tx }}</span></dd>
            <dt>{{ 'คงเหลือ' | tx }}</dt><dd>{{ l.qty ?? '—' }} {{ l.unit | tx }} · {{ l.location | tx }}</dd>
            <dt>{{ 'สถานะ Lot' | tx }}</dt><dd><span class="chip" [class]="'chip ' + LOT_STATE[l.state].cls">{{ LOT_STATE[l.state].label | tx }}</span>@if (l.recall; as r) { · {{ r.id }}}</dd>
          </dl>
          <p class="secondary">{{ l.bucket === 'expired' ? 'หมดอายุแล้ว — ห้องยาจ่ายจาก lot นี้ไม่ได้ · บันทึกเป็นยาเสียเมื่อทำลาย' : l.bucket === 'ok' ? 'ยังไม่ถึงช่วงเตือน' : 'จ่ายจาก lot นี้ก่อนตาม FEFO · ห้องยาเลือก lot ที่หมดอายุก่อนให้อัตโนมัติ' | tx }}</p>
          <ng-container foot>
            <a class="link" routerLink="/backoffice/inventory/recall" [queryParams]="{ lot: l.lot }">{{ 'ตรวจการเรียกคืน' | tx }}</a>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" (click)="actions.openItem(l.drug)">{{ 'เปิดรายการยา' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class LotsComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly route = inject(ActivatedRoute);
  protected readonly buckets = EXPIRY_BUCKETS;
  protected readonly LOT_STATE = LOT_STATE;

  protected readonly q = signal('');
  protected readonly bucket = signal<ExpiryBucket | ''>((this.route.snapshot.queryParamMap.get('bucket') as ExpiryBucket | null) ?? '');
  protected readonly withStock = signal(true);
  protected readonly selectedLot = signal<string | null>(null);
  protected readonly counts = computed(() => expiryCounts(this.store.stock()));
  protected readonly rows = computed(() => allLots(this.store.stock(), { bucket: this.bucket(), q: this.q(), withStock: this.withStock() }));
  protected readonly selected = computed(() => this.rows().find(l => l.lot === this.selectedLot()) ?? null);

  protected pick(l: LotRow) {
    this.selectedLot.set(this.selectedLot() === l.lot ? null : l.lot);
  }

  protected info(key: ExpiryBucket) {
    return EXPIRY_BUCKETS.find(b => b.key === key)!;
  }
}
