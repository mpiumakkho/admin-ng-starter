/* One drug: its stock and rules, its lots with their expiry, and everything that moved it (INV-STK-02) */
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { map } from 'rxjs';

import { BackofficeStore } from '../../backoffice.store';
import { CONTROL_SYSTEM, EXPIRY_BUCKETS, itemOf, LOT_STATE, MOVEMENT_KIND, movementsOf } from '../../data/inventory';
import type { ExpiryBucket } from '../../data/inventory';
import { TxPipe } from '../../i18n/bo-i18n';

@Component({
  selector: 'bo-item-detail',
  imports: [RouterLink, NgIcon, TxPipe],
  template: `
    @if (item(); as i) {
      <div class="page-head">
        <div class="title-block">
          <a class="link back" routerLink="/backoffice/inventory/stock"><ng-icon [svg]="back" aria-hidden="true" />{{ 'คลังยา' | tx }}</a>
          <h1>{{ i.drug.name }} @if (i.controlled) {<span class="chip" [class]="'chip ' + CONTROL[i.drug.classSystem].cls">{{ CONTROL[i.drug.classSystem].short | tx }} {{ i.drug.category }}</span>}</h1>
          <div class="subtitle">
            <span>{{ i.drug.id }} · {{ i.drug.form | tx }} · {{ 'หน่วย' | tx }} {{ i.drug.unit | tx }} · {{ i.location | tx }}</span>
            <span class="freshness">{{ 'ข้อมูล ณ วันนี้ 11:32' | tx }}</span>
          </div>
        </div>
      </div>

      <div class="record">
        <div class="record-main">
          <div class="panel">
            <dl class="data-grid wide">
              <dt>{{ 'คงเหลือ' | tx }}</dt><dd [class.text-danger]="i.isLow"><b>{{ i.onHand ?? '—' }} {{ i.drug.unit | tx }}</b> · {{ (i.isLow ? 'ต่ำกว่าจุดเติม' : 'พอใช้') | tx }} ({{ 'จุดสั่งเติม' | tx }} {{ i.drug.reorderThreshold }})</dd>
              <dt>{{ 'นับล่าสุด' | tx }}</dt><dd>{{ i.drug.lastCountAt ? i.drug.lastCountAt + ' · ' + (i.drug.lastCountBy | tx) : ('ยังไม่เคยนับ' | tx) }}</dd>
              <dt>{{ 'หมดอายุถัดไป' | tx }}</dt><dd>@if (i.nearest; as n) {{{ n.lot }} · {{ n.expiry }} · <span class="chip" [class]="'chip ' + bucket(n.bucket).cls">{{ bucket(n.bucket).label | tx }}</span>} @else {—}</dd>
              <dt>{{ 'การจำแนก' | tx }}</dt><dd>{{ CONTROL[i.drug.classSystem].label | tx }}@if (i.controlled) { · {{ 'ประเภท' | tx }} {{ i.drug.category }} · {{ (i.drug.requiresWitnessDispense ? 'เบิกต้องมีพยาน' : 'เบิกไม่ต้องมีพยาน') | tx }}} · {{ 'ตรวจสอบโดย' | tx }} {{ i.drug.verifiedBy | tx }}</dd>
            </dl>
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'Lot ทั้งหมด' | tx }}</b><span class="secondary grow">{{ '{n} lot · จำนวนเป็นของระบบ ไม่แก้ในหน้านี้ · Read API ของ lot ยังไม่อนุมัติ (GATED) — ข้อมูลตัวอย่าง' | tx: { n: i.lots.length } }}</span></div>
            <div class="table-wrap">
              <table class="bo-table">
                <thead>
                  <tr>
                    <th scope="col" class="w-ref">Lot</th>
                    <th scope="col" class="w-due">{{ 'วันหมดอายุ' | tx }}</th>
                    <th scope="col" class="w-kind">{{ 'เหลือเวลา' | tx }}</th>
                    <th scope="col" class="w-amount num">{{ 'คงเหลือ' | tx }}</th>
                    <th scope="col" class="w-owner">{{ 'ตำแหน่ง' | tx }}</th>
                    <th scope="col" class="w-status">{{ 'สถานะ Lot' | tx }}</th>
                    <th scope="col">{{ 'การเรียกคืน' | tx }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of i.lots; track l.lot) {
                    <tr class="static">
                      <td><b>{{ l.lot }}</b></td>
                      <td class="num">{{ l.expiry }}</td>
                      <td><span class="chip" [class]="'chip ' + bucket(l.bucket).cls">{{ l.days === null ? '—' : l.days < 0 ? ('หมดอายุแล้ว' | tx) : ('{n} วัน' | tx: { n: l.days }) }}</span></td>
                      <td class="num">{{ l.qty ?? '—' }} {{ l.unit | tx }}</td>
                      <td>{{ l.location | tx }}</td>
                      <td><span class="chip" [class]="'chip ' + LOT_STATE[l.state].cls">{{ LOT_STATE[l.state].label | tx }}</span></td>
                      <td>@if (l.recall; as r) {<a class="link" routerLink="/backoffice/inventory/recall" [queryParams]="{ lot: l.lot }">{{ r.id }}</a>} @else {<span class="muted">—</span>}</td>
                    </tr>
                  } @empty {
                    <tr class="static"><td colspan="7" class="empty">{{ 'รายการนี้ไม่มี lot ในคลัง' | tx }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'ประวัติการเคลื่อนไหว' | tx }}</b><span class="secondary grow">{{ 'รับเข้า จ่ายยา ยาเสีย และการนับ · ล่าสุดก่อน · รายการจ่ายของห้องยาที่ยังไม่ผูก lot แสดงเป็น —' | tx }}</span></div>
            <div class="table-wrap">
              <table class="bo-table">
                <thead>
                  <tr>
                    <th scope="col" class="w-at">{{ 'เวลา' | tx }}</th>
                    <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
                    <th scope="col" class="w-ref">Lot</th>
                    <th scope="col" class="w-amount num">{{ 'จำนวน +/−' | tx }}</th>
                    <th scope="col" class="w-owner">{{ 'ตำแหน่ง' | tx }}</th>
                    <th scope="col">{{ 'อ้างอิง' | tx }}</th>
                    <th scope="col" class="w-owner">{{ 'ผู้ทำ' | tx }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (m of movements(); track $index) {
                    <tr class="static">
                      <td class="num">{{ m.at }}</td>
                      <td><span class="chip" [class]="'chip ' + KIND[m.kind].cls">{{ KIND[m.kind].label | tx }}</span></td>
                      <td>{{ m.lot ?? '—' }}</td>
                      <td class="num" [class.text-danger]="m.qty !== null && m.qty < 0">{{ m.qty === null ? '—' : (m.qty > 0 ? '+' : '') + m.qty + ' ' + (m.unit | tx) }}</td>
                      <td>{{ (m.location ?? '—') | tx }}</td>
                      <td>@if (m.link) {<a class="link" [routerLink]="m.link.split('?')[0]" [queryParams]="params(m.link)">{{ m.ref | tx }}</a>} @else {{{ m.ref | tx }}}</td>
                      <td>{{ m.by | tx }}</td>
                    </tr>
                  } @empty {
                    <tr class="static"><td colspan="7" class="empty">{{ 'ยังไม่มีการเคลื่อนไหว' | tx }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside class="record-rail">
          <div class="panel actions">
            <b>{{ 'การทำงาน' | tx }}</b>
            <a class="link" routerLink="/backoffice/inventory/receipts" [queryParams]="{ drug: i.drug.name }">{{ 'รับเข้าคลัง' | tx }}</a>
            @if (i.isLow) {<a class="link" routerLink="/backoffice/inventory/reorder">{{ 'แจ้งต้องเติม' | tx }}</a>}
            @if (i.controlled) {<a class="link" routerLink="/backoffice/inventory/controlled" [queryParams]="{ drug: i.drug.name }">{{ 'เปิดบัญชียาควบคุม' | tx }}</a>}
            @if (i.lots.length) {<a class="link" routerLink="/backoffice/inventory/recall" [queryParams]="{ lot: (recalledLot() ?? i.lots[0]).lot }">{{ 'ตรวจการเรียกคืน' | tx }}</a>}
            <p class="secondary">{{ 'ไม่มีการแก้จำนวน lot หรือตัดจำหน่ายในหน้านี้ · ปรับผ่านการรับเข้า การนับ หรือยาเสียเท่านั้น' | tx }}</p>
          </div>
          <div class="panel actions">
            <b>{{ 'หลักฐาน' | tx }}</b>
            <p class="secondary">{{ 'จุดสั่งเติมตั้งค่าโดยผู้ดูแลระบบ · การจำแนกยาควบคุมตาม ADR-0026 ตรวจสอบโดยเภสัชกร' | tx }}</p>
          </div>
        </aside>
      </div>
    } @else {
      <div class="panel"><div class="empty">{{ 'ไม่พบรายการยา' | tx }} · <a class="link" routerLink="/backoffice/inventory/stock">{{ 'คลังยา' | tx }}</a></div></div>
    }
  `,
  host: { class: 'page' },
})
export class ItemDetailComponent {
  private readonly store = inject(BackofficeStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly back = lucideArrowLeft;
  protected readonly CONTROL = CONTROL_SYSTEM;
  protected readonly LOT_STATE = LOT_STATE;
  protected readonly KIND = MOVEMENT_KIND;
  private readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: this.route.snapshot.paramMap.get('id') ?? '' });
  protected readonly item = computed(() => itemOf(this.store.clinic.data(), this.store.data(), decodeURIComponent(this.id())));
  protected readonly movements = computed(() => (this.item() ? movementsOf(this.store.clinic.data(), this.store.data(), this.item()!.drug.name) : []));
  protected readonly recalledLot = computed(() => this.item()?.lots.find(l => l.recall));

  protected bucket(key: ExpiryBucket) {
    return EXPIRY_BUCKETS.find(b => b.key === key)!;
  }

  protected params(link: string): Record<string, string> {
    const query = link.split('?')[1];
    return query ? Object.fromEntries(new URLSearchParams(query).entries()) : {};
  }
}
