/* Resolution and trends: the answered complaints to close and follow up, half a year by category, the topics that come back, and how satisfied owners were (quality.resolution, M28 P2) */
import { Component, computed, inject } from '@angular/core';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  complainantOf, COMPLAINT_CATEGORIES, COMPLAINT_CATEGORY, complaintTrend, RECURRING_MIN, recurring, REMEDY, responseCompliance, satisfaction, satisfactionBlock,
} from '../../data/quality';
import type { Complaint } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-resolution',
  imports: [TxPipe, UiButton, PageHead],
  template: `
    @let r = compliance();
    @let s = score();
    <bo-page-head [heading]="'ผลการแก้ไขและแนวโน้มข้อร้องเรียน'" [source]="'M28 P2 · ปิดเรื่องหลังตอบกลับ · ติดตามความพึงพอใจหลังปิดเรื่อง · หัวข้อที่เกิดซ้ำ 3 ครั้งขึ้นไปใน 90 วัน · ต้นแบบก่อนสัญญาหน้าของ M28 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem" [class.warn]="r.percent < 90"><span class="kpi-value">{{ r.percent }}%</span><span class="kpi-label">{{ 'ตอบทันกำหนด' | tx }}</span><span class="kpi-sub">{{ '{met} จาก {n} คำตอบ' | tx: { met: r.met, n: r.sent } }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ s.mean }}<small>/5</small></span><span class="kpi-label">{{ 'ความพึงพอใจเฉลี่ย' | tx }}</span><span class="kpi-sub">{{ '{n} ราย' | tx: { n: s.count } }}</span></div>
      <div class="kpi" role="listitem" [class.warn]="toClose().length"><span class="kpi-value">{{ toClose().length }}</span><span class="kpi-label">{{ 'ตอบแล้ว รอปิดเรื่อง' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.warn]="s.awaiting"><span class="kpi-value">{{ s.awaiting }}</span><span class="kpi-label">{{ 'รอติดตามความพึงพอใจ' | tx }}</span></div>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'รอปิดเรื่องหรือติดตาม' | tx }}</b><span class="secondary grow">{{ '{n} รายการ' | tx: { n: followUps().length } }}</span></div>
      <div class="table-wrap">
        <table class="bo-table complaints">
          <thead><tr>
            <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
            <th scope="col">{{ 'เรื่อง' | tx }}</th>
            <th scope="col" class="w-at">{{ 'ตอบเมื่อ' | tx }}</th>
            <th scope="col" class="w-actions">{{ 'ขั้นต่อไป' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (x of followUps(); track x.id) {
              <tr class="static">
                <td><b>{{ x.id }}</b><div class="secondary">{{ x.receivedAt }}</div></td>
                <td>{{ x.subject | tx }}<div class="secondary">{{ who(x) | tx }} · {{ CATEGORY[x.category] | tx }}@if (x.resolution) { · {{ REMEDY[x.resolution.remedy] | tx }}}</div></td>
                <td class="num">{{ x.response?.sentAt }}</td>
                <td>
                  @if (x.status === 'responded') {<button uiButton size="sm" type="button" (click)="actions.resolveComplaint(x)">{{ 'ปิดเรื่องร้องเรียน' | tx }}</button>}
                  @else {<button uiButton variant="secondary" size="sm" type="button" (click)="actions.recordSatisfaction(x)">{{ 'ติดตามความพึงพอใจ' | tx }}</button>}
                </td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="4" class="empty ok-text">{{ 'ไม่มีเรื่องรอปิดหรือติดตาม' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="split pair">
      <div class="panel">
        <div class="filter-bar"><b>{{ 'ข้อร้องเรียน 6 เดือนตามประเภท' | tx }}</b><span class="secondary grow">{{ 'นับตามเดือนที่รับเรื่อง' | tx }}</span></div>
        <div class="table-wrap">
          <table class="bo-table dt-months">
            <thead><tr><th scope="col">{{ 'ประเภท' | tx }}</th>@for (m of trend(); track m.month) {<th scope="col" class="num">{{ m.month.slice(2).replace('-', '/') }}</th>}</tr></thead>
            <tbody>
              @for (k of categories; track k) {
                <tr class="static"><th scope="row">{{ CATEGORY[k] | tx }}</th>@for (m of trend(); track m.month) {<td class="num" [class.planned]="m[k]">{{ m[k] }}</td>}</tr>
              }
              <tr class="static"><th scope="row"><b>{{ 'รวม' | tx }}</b></th>@for (m of trend(); track m.month) {<td class="num"><b>{{ m.total }}</b></td>}</tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="filter-bar"><b>{{ 'หัวข้อที่เกิดซ้ำ (90 วัน)' | tx }}</b><span class="secondary grow">{{ 'ตั้งแต่ {n} ครั้งขึ้นไป' | tx: { n: min } }}</span></div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead><tr><th scope="col">{{ 'หัวข้อ' | tx }}</th><th scope="col" class="num w-kind">{{ 'จำนวน' | tx }}</th><th scope="col" class="w-due">{{ 'ล่าสุด' | tx }}</th></tr></thead>
            <tbody>
              @for (t of topics(); track t.topic) {
                <tr class="static">
                  <td>{{ t.topic | tx }}@if (t.recurring) { <span class="chip warn">{{ 'เกิดซ้ำ' | tx }}</span>}</td>
                  <td class="num"><b [class.text-danger]="t.recurring">{{ t.count }}</b></td>
                  <td class="num">{{ t.latest.slice(0, 10) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="legend">
          @for (x of s.spread; track x[0]) {<span>{{ '{n} คะแนน: {c} ราย' | tx: { n: x[0], c: x[1] } }}</span>}
        </div>
      </div>
    </div>
  `,
  host: { class: 'page' },
})
export class ResolutionComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly CATEGORY = COMPLAINT_CATEGORY;
  protected readonly REMEDY = REMEDY;
  protected readonly categories = COMPLAINT_CATEGORIES;
  protected readonly min = RECURRING_MIN;

  protected readonly compliance = computed(() => responseCompliance(this.store.data()));
  protected readonly score = computed(() => satisfaction(this.store.data()));
  protected readonly trend = computed(() => complaintTrend(this.store.data()));
  protected readonly topics = computed(() => recurring(this.store.data()));
  protected readonly toClose = computed(() => this.store.data().complaints.filter(x => x.status === 'responded'));
  /** Answered and waiting to be closed, then closed and waiting for the owner's view */
  protected readonly followUps = computed(() => [...this.toClose(), ...this.store.data().complaints.filter(x => !satisfactionBlock(x))]);

  protected who(x: Complaint) {
    return complainantOf(x);
  }
}
