/* Overtime summary: the hours the schedule holds against each contract, and the call-outs, for a week; operational, not payroll (workforce.overtime, M24 P2) */
import { Component, computed, inject, signal } from '@angular/core';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeStore } from '../../backoffice.store';
import { addDays, overtime, ROLE, weekOf } from '../../data/workforce';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const THIS_WEEK = weekOf(TODAY);
const WEEKS = [THIS_WEEK, addDays(THIS_WEEK, 7)];
const hours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

@Component({
  selector: 'bo-overtime',
  imports: [TxPipe, UiButton, PageHead],
  template: `
    @let t = totals();
    <bo-page-head [heading]="'สรุปการทำงานล่วงเวลา'" [source]="'M24 P2 · คำนวณจากเวรในตาราง (ไม่นับวันลา) เทียบชั่วโมงตามสัญญา และชั่วโมงที่ถูกเรียกเข้าตอนรับเวร on-call · ตัวเลขเพื่อการดำเนินงาน ไม่ใช่ข้อมูลเงินเดือน'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" variant="secondary" type="button" disabled [attr.title]="'ส่งออกได้เมื่อสัญญาของ M24 อนุมัติ (GATED)' | tx">{{ 'ส่งออก (รอสัญญา)' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      <div class="kpi" [class.warn]="t.total" role="listitem"><span class="kpi-value">{{ fmt(t.total) }}</span><span class="kpi-label">{{ 'ชั่วโมงล่วงเวลารวม' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ t.people }}</span><span class="kpi-label">{{ 'คนที่มีล่วงเวลา' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ fmt(t.callOut) }}</span><span class="kpi-label">{{ 'ชั่วโมงถูกเรียกเข้า' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ fmt(t.night) }}</span><span class="kpi-label">{{ 'ชั่วโมงเวรดึก' | tx }}</span></div>
    </div>

    <div class="panel">
      <div class="filter-bar">
        <div class="segmented" role="group" [attr.aria-label]="'สัปดาห์' | tx">
          @for (w of weeks; track w) {<button type="button" [class.active]="w === week()" [attr.aria-pressed]="w === week()" (click)="week.set(w)">{{ label(w) }}</button>}
        </div>
        <span class="secondary grow">{{ 'สัปดาห์ที่ยังเป็นฉบับร่างคำนวณจากเวรที่จัดไว้ · เปลี่ยนได้จนกว่าจะประกาศ' | tx }}</span>
      </div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead>
            <tr>
              <th scope="col">{{ 'ชื่อบุคลากร' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'จำนวนเวร' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'ชั่วโมงในตาราง' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'เวรดึก' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'ตามสัญญา' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'เกินจากตาราง' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'ถูกเรียกเข้า' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'ล่วงเวลารวม' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.staff.id) {
              <tr class="static">
                <td><b>{{ r.staff.name | tx }}</b><div class="secondary">{{ ROLE[r.staff.role].label | tx }}</div></td>
                <td class="num">{{ r.shifts }}</td>
                <td class="num">{{ fmt(r.hours) }}</td>
                <td class="num">{{ fmt(r.night) }}</td>
                <td class="num">{{ r.contract }}</td>
                <td class="num">{{ r.scheduled ? fmt(r.scheduled) : '—' }}</td>
                <td class="num">{{ r.callOut ? fmt(r.callOut) : '—' }}</td>
                <td class="num" [class.text-danger]="r.total >= 16"><b>{{ r.total ? fmt(r.total) : '—' }}</b></td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr class="static">
              <th scope="row">{{ 'รวม' | tx }}</th>
              <td class="num">{{ t.shifts }}</td>
              <td class="num">{{ fmt(t.hours) }}</td>
              <td class="num">{{ fmt(t.night) }}</td>
              <td></td>
              <td class="num">{{ fmt(t.scheduled) }}</td>
              <td class="num">{{ fmt(t.callOut) }}</td>
              <td class="num"><b>{{ fmt(t.total) }}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="secondary foot-note">{{ 'ไม่มีอัตราค่าจ้าง ภาษี หรือสวัสดิการในหน้านี้ — การคำนวณเงินต้องมีกฎ payroll ที่อนุมัติแล้ว ซึ่งอยู่นอกขอบเขต' | tx }}</p>
    </div>
  `,
  host: { class: 'page' },
})
export class OvertimeComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly ROLE = ROLE;
  protected readonly weeks = WEEKS;
  protected readonly fmt = hours;

  protected readonly week = signal(THIS_WEEK);
  protected readonly rows = computed(() => overtime(this.store.data(), this.week()).sort((a, b) => b.total - a.total || a.staff.id.localeCompare(b.staff.id)));
  protected readonly totals = computed(() => {
    const rows = this.rows();
    const sum = (k: 'shifts' | 'hours' | 'night' | 'scheduled' | 'callOut' | 'total') => rows.reduce((n, r) => n + r[k], 0);
    return { shifts: sum('shifts'), hours: sum('hours'), night: sum('night'), scheduled: sum('scheduled'), callOut: sum('callOut'), total: sum('total'), people: rows.filter(r => r.total).length };
  });

  protected label(monday: string) {
    return `${monday.slice(8)}/${monday.slice(5, 7)} – ${addDays(monday, 6).slice(8)}/${addDays(monday, 6).slice(5, 7)}`;
  }
}
