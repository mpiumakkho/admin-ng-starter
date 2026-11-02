/* Audit integrity and retention: per-event hashes as the server checked them, relay gaps kept apart from tampering, chain and retention not enabled yet (GOV-AUD-03, M13 · P3 GATED) */
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { integrity, integrityCounts } from '../../data/governance';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-audit-integrity',
  imports: [PagerFoot, RouterLink, TxPipe, UiButton, PageHead],
  template: `
    @let c = counts();
    <bo-page-head [heading]="'ความถูกต้องและการเก็บ Audit'" [source]="'GOV-AUD-03 · M13 · event_hash ต่อเหตุการณ์ตรวจโดย server · การตรวจแบบลูกโซ่ (prev_hash) และการเก็บ 7 ปีแบ่งรายเดือนเป็น P3 · บันทึกแก้ ลบ หรือซ่อมไม่ได้'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ c.verified }}</span><span class="kpi-label">{{ 'hash ตรวจแล้วถูกต้อง' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.danger]="c.mismatch"><span class="kpi-value">{{ c.mismatch }}</span><span class="kpi-label">{{ 'ไม่ตรงกับ hash' | tx }}</span>@if (c.open) {<span class="kpi-sub text-danger">{{ 'ยังไม่เปิด finding {n}' | tx: { n: c.open } }}</span>}</div>
      <div class="kpi" role="listitem" [class.warn]="c.gaps"><span class="kpi-value">{{ c.gaps }}</span><span class="kpi-label">{{ 'ช่วงที่ relay ขาด' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">P3</span><span class="kpi-label">{{ 'การตรวจแบบลูกโซ่ · การเก็บ 7 ปี' | tx }}</span></div>
    </div>
    <p class="notice info">{{ 'การตรวจสอบแบบลูกโซ่ยังไม่เปิดใช้งาน: ยืนยันได้ว่าเนื้อหาแต่ละเหตุการณ์ไม่ถูกแก้ แต่ยังยืนยันไม่ได้ว่าไม่มีเหตุการณ์หายหรือสลับลำดับ' | tx }}</p>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'หลักฐานความถูกต้องรายเดือน' | tx }}</b><span class="secondary grow">{{ 'ช่องว่างจาก relay คือข้อมูลยังไม่ครบ ไม่ใช่การแก้ไข' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table integrity">
          <thead><tr>
            <th scope="col" class="w-due">{{ 'ช่วง' | tx }}</th>
            <th scope="col" class="num w-kind">{{ 'จำนวนเหตุการณ์' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'event_hash' }}</th>
            <th scope="col">{{ 'ช่องว่างการนำเข้า' | tx }}</th>
            <th scope="col" class="w-at">{{ 'ตรวจเมื่อ' | tx }}</th>
            <th scope="col" class="w-actions">{{ 'finding' }}</th>
          </tr></thead>
          <tbody>
            @for (p of pager.rows(); track p.period) {
              <tr class="static">
                <td><b>{{ p.period }}</b></td>
                <td class="num">{{ p.events }}</td>
                <td>
                  @if (p.mismatch.length) {<span class="chip danger">{{ 'ไม่ตรงกับ hash' | tx }} {{ p.mismatch.length }}</span><div class="secondary">{{ ids(p.mismatch) }}</div>}
                  @else {<span class="chip ok">{{ 'ตรวจแล้วถูกต้อง' | tx }} {{ p.verified }}</span>}
                </td>
                <td>@for (g of p.gaps; track g[0]) {<div>{{ '{at} · {n} นาที' | tx: { at: g[0], n: g[1] } }}</div>} @empty {<span class="secondary">{{ 'ไม่มี' | tx }}</span>}</td>
                <td class="num">{{ p.checkedAt }}</td>
                <td>
                  @if (p.finding; as f) {<span class="chip warn">{{ 'เปิดแล้ว' | tx }}</span><div class="secondary">{{ f.by | tx }} · {{ f.note | tx }}</div>}
                  @else if (p.mismatch.length) {<button uiButton variant="secondary" size="sm" type="button" (click)="actions.recordFinding(p.source, ids(p.mismatch))">{{ 'เปิด finding' | tx }}</button>}
                  @else {<span class="secondary">—</span>}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <bo-pager [pager]="pager" />
      <p class="secondary foot-note">{{ 'hash ที่ไม่ตรงเปิดเป็น finding ให้ Security owner สอบสวน ไม่มีการแก้อัตโนมัติ' | tx }} <a class="link" routerLink="/backoffice/quality/audit">{{ 'เปิดใน Audit Explorer' | tx }}</a></p>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'การเก็บรักษา' | tx }}</b><span class="chip quiet">GATED</span></div>
      <p class="notice warn">{{ 'การบังคับนโยบายการเก็บยังไม่เปิดใช้งาน: เป้าหมาย 7 ปีแบ่ง partition รายเดือน (P3) ยังไม่มีบันทึกการลบ นโยบายอยู่ที่ settings/11' | tx }}</p>
    </div>
  `,
  host: { class: 'page' },
})
export class AuditIntegrityComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly rows = computed(() => integrity(this.store.data()));
  protected readonly counts = computed(() => integrityCounts(this.store.data()));

  protected ids(events: { id: string }[]) {
    return events.map(e => e.id).join(', ');
  }
}
