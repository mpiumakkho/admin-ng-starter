/* RoPA and cross-border transfers: the processing activities as recorded, generated as a document, and where data leaves the country (GOV-RET-01 quality.ropa, M31 · GATED) */
import { Component, computed, inject } from '@angular/core';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { ropaStale } from '../../data/governance';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-ropa',
  imports: [TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'RoPA และการโอนข้อมูลข้ามประเทศ'" [source]="'GOV-RET-01 · M31 · บันทึกกิจกรรมการประมวลผลจาก ropa_record · สร้างเอกสารภายใน 5 นาที · การโอนข้ามประเทศจาก cross_border_assessment · สัญญาการออกแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="actions.generateRopa()">{{ 'สร้าง/ส่งออก RoPA' | tx }}</button>
    </bo-page-head>
    <p class="notice warn">{{ 'ระบบ PDPA (M31) ยังไม่พร้อม หน้านี้เป็นสัญญาการออกแบบ' | tx }}</p>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'กิจกรรมการประมวลผล' | tx }}</b><span class="secondary grow">{{ '{n} กิจกรรม · ทบทวนอย่างน้อยปีละครั้ง' | tx: { n: ropa().length } }}</span>
        @if (last(); as e) {<span class="secondary">{{ 'สร้างล่าสุด {file} · {at} · {s} วินาที' | tx: { file: e.artifact, at: e.at, s: e.seconds } }}</span>}</div>
      <div class="table-wrap">
        <table class="bo-table ropa">
          <thead><tr>
            <th scope="col">{{ 'กิจกรรม' | tx }}</th>
            <th scope="col">{{ 'ประเภทข้อมูล' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'ผู้รับข้อมูล' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'ระยะเก็บ' | tx }}</th>
            <th scope="col" class="w-due">{{ 'ทบทวนล่าสุด' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (r of ropa(); track r.id) {
              <tr class="static">
                <td><b>{{ r.activity | tx }}</b><div class="secondary">{{ r.id }} · {{ r.purpose | tx }} · {{ 'ฐาน: {b}' | tx: { b: (r.basis | tx) } }}</div></td>
                <td>{{ r.dataKinds | tx }}<div class="secondary">{{ r.subjects | tx }}</div></td>
                <td>{{ r.recipients | tx }}@if (r.crossBorder) {<div class="secondary">{{ 'ข้ามประเทศ {id}' | tx: { id: r.crossBorder } }}</div>}</td>
                <td>{{ r.retention | tx }}</td>
                <td class="num">{{ r.reviewedAt }}@if (stale(r.reviewedAt)) {<div class="secondary text-danger">{{ 'เกิน 1 ปี ต้องทบทวน' | tx }}</div>}<div class="secondary">{{ r.owner | tx }}</div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'การโอนข้อมูลข้ามประเทศ' | tx }}</b><span class="secondary grow">{{ 'ไม่เดาความเพียงพอของประเทศปลายทาง ใช้ผลประเมินที่บันทึกไว้เท่านั้น' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead><tr>
            <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
            <th scope="col">{{ 'ปลายทาง' | tx }}</th>
            <th scope="col">{{ 'ข้อมูลที่โอน' | tx }}</th>
            <th scope="col">{{ 'มาตรการคุ้มครอง' | tx }}</th>
            <th scope="col" class="w-status">{{ 'การประเมิน' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (c of transfers(); track c.id) {
              <tr class="static">
                <td><b>{{ c.id }}</b></td>
                <td>{{ c.destination | tx }}<div class="secondary">{{ c.vendor }}</div></td>
                <td>{{ c.data | tx }}</td>
                <td>{{ c.safeguard | tx }}</td>
                <td><span class="chip" [class]="'chip ' + (c.status === 'assessed' ? 'ok' : 'warn')">{{ (c.status === 'assessed' ? 'ประเมินแล้ว' : 'รอประเมิน') | tx }}</span>@if (c.assessedAt) {<div class="secondary">{{ c.assessedAt }}</div>}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  host: { class: 'page' },
})
export class RopaComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly stale = ropaStale;
  protected readonly ropa = computed(() => this.store.data().ropa);
  protected readonly transfers = computed(() => this.store.data().crossBorder);
  protected readonly last = computed(() => this.store.data().ropaExports[0]);
}
