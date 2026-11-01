/* The quality dashboard: what waits in patient safety, a year of events by month, the KPIs off their target, and the open events (quality.overview, M12 P2) */
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { BackofficeStore } from '../../backoffice.store';
import {
  CATCH_POINT, complaintCounts, HARM, INCIDENT_STATUS, KPI_DOMAIN, kpiNow, NEAR_MISS_STATUS, qualityCounts, reporterOf, SAFETY_CATEGORY, safetyTrend, triageLate,
} from '../../data/quality';
import type { Incident, NearMiss } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

type Row = { kind: 'incident'; at: string; item: Incident } | { kind: 'near-miss'; at: string; item: NearMiss };

@Component({
  selector: 'bo-quality-overview',
  imports: [RouterLink, TxPipe, PageHead],
  template: `
    @let q = counts();
    @let c = complaints();
    <bo-page-head [heading]="'ภาพรวมคุณภาพและความปลอดภัย'" [source]="'M12 P2 · อุบัติการณ์ เหตุเกือบพลาด RCA และตัวชี้วัดเทียบ TAHSA/AAHA · ข้อร้องเรียนจาก M28 · ต้นแบบก่อนสัญญาหน้าของ M12 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <a class="kpi" role="listitem" [class.warn]="q.awaitingTriage" routerLink="/backoffice/quality/incidents">
        <span class="kpi-value">{{ q.awaitingTriage }}</span><span class="kpi-label">{{ 'อุบัติการณ์รอคัดกรอง' | tx }}</span>
        @if (q.triageLate) {<span class="kpi-sub text-danger">{{ 'เกินกำหนดคัดกรอง {n}' | tx: { n: q.triageLate } }}</span>}
      </a>
      <a class="kpi" role="listitem" [class.danger]="q.severeOpen" routerLink="/backoffice/quality/incidents">
        <span class="kpi-value">{{ q.severeOpen }}</span><span class="kpi-label">{{ 'อันตรายรุนแรงที่ยังไม่ปิด' | tx }}</span>
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/quality/near-miss">
        <span class="kpi-value">{{ q.nearMiss30 }}</span><span class="kpi-label">{{ 'เหตุเกือบพลาด 30 วัน' | tx }}</span>
        @if (q.nearMissOpen) {<span class="kpi-sub">{{ 'รอมาตรการ {n}' | tx: { n: q.nearMissOpen } }}</span>}
      </a>
      <a class="kpi" role="listitem" [class.warn]="q.rcaReview" routerLink="/backoffice/quality/rca">
        <span class="kpi-value">{{ q.rcaOpen }}</span><span class="kpi-label">{{ 'RCA ที่ยังไม่อนุมัติ' | tx }}</span>
        @if (q.rcaReview) {<span class="kpi-sub">{{ 'รออนุมัติ {n}' | tx: { n: q.rcaReview } }}</span>}
      </a>
      <a class="kpi" role="listitem" [class.danger]="q.actionsLate" routerLink="/backoffice/quality/rca">
        <span class="kpi-value">{{ q.actionsLate }}</span><span class="kpi-label">{{ 'มาตรการ RCA เกินกำหนด' | tx }}</span>
      </a>
      <a class="kpi" role="listitem" [class.warn]="c.dueSoon || c.breached" routerLink="/backoffice/quality/complaints">
        <span class="kpi-value">{{ c.open }}</span><span class="kpi-label">{{ 'ข้อร้องเรียนที่ยังไม่ตอบ' | tx }}</span>
        @if (c.dueSoon) {<span class="kpi-sub">{{ 'ใกล้ครบกำหนด {n}' | tx: { n: c.dueSoon } }}</span>}
      </a>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'เหตุการณ์ 12 เดือน' | tx }}</b><span class="secondary grow">{{ 'นับตามเดือนที่เกิดเหตุ · เดือนนี้ถึงวันนี้' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table dt-months qps-months">
          <thead><tr><th scope="col">{{ 'ประจำเดือน' | tx }}</th>@for (m of trend(); track m.month) {<th scope="col" class="num">{{ m.month.slice(2).replace('-', '/') }}</th>}</tr></thead>
          <tbody>
            <tr class="static"><th scope="row">{{ 'อุบัติการณ์' | tx }}</th>@for (m of trend(); track m.month) {<td class="num">{{ m.incidents }}</td>}</tr>
            <tr class="static"><th scope="row">{{ 'อันตรายรุนแรงขึ้นไป' | tx }}</th>@for (m of trend(); track m.month) {<td class="num" [class.failure]="m.severe">{{ m.severe || '' }}</td>}</tr>
            <tr class="static"><th scope="row">{{ 'เหตุเกือบพลาด' | tx }}</th>@for (m of trend(); track m.month) {<td class="num" [class.planned]="m.nearMisses">{{ m.nearMisses }}</td>}</tr>
          </tbody>
        </table>
      </div>
      <p class="secondary foot-note">{{ 'เหตุเกือบพลาดที่รายงานมากกว่าอุบัติการณ์ คือสัญญาณว่าการรายงานทำงาน ไม่ใช่ว่าเกิดความผิดพลาดมากขึ้น' | tx }}</p>
    </div>

    <div class="split pair">
      <div class="panel">
        <div class="filter-bar"><b>{{ 'ตัวชี้วัดที่ไม่ถึงเป้า' | tx }}</b><span class="secondary grow">{{ '{n} จาก {all} ตัว' | tx: { n: offTarget().length, all: kpiCount() } }}</span><a class="link" routerLink="/backoffice/quality/kpi">{{ 'คลังตัวชี้วัด' | tx }}</a></div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead><tr><th scope="col">{{ 'ตัวชี้วัด' | tx }}</th><th scope="col" class="num w-kind">{{ 'ล่าสุด' | tx }}</th><th scope="col" class="num w-kind">{{ 'เป้าหมาย' | tx }}</th><th scope="col" class="w-status">{{ 'แนวโน้ม' | tx }}</th></tr></thead>
            <tbody>
              @for (k of offTarget(); track k.def.id) {
                <tr class="static">
                  <td>{{ k.def.name | tx }}<div class="secondary">{{ KPI_DOMAIN[k.def.domain] | tx }} · {{ k.def.unit | tx }}@if (k.now.live) { · {{ 'คำนวณตอนนี้' | tx }}}</div></td>
                  <td class="num text-danger"><b>{{ k.now.value }}</b></td>
                  <td class="num">{{ k.def.better === 'higher' ? '≥' : '≤' }} {{ k.def.target }}</td>
                  <td>{{ (k.now.improving === null ? 'คงที่' : k.now.improving ? 'ดีขึ้น' : 'แย่ลง') | tx }}<div class="secondary">{{ 'เดือนก่อน {v}' | tx: { v: k.now.previous ?? '—' } }}</div></td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="4" class="empty ok-text">{{ 'ทุกตัวชี้วัดถึงเป้า' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="filter-bar"><b>{{ 'เหตุการณ์ที่ยังเปิด' | tx }}</b><span class="secondary grow">{{ '{n} รายการ · ล่าสุดก่อน' | tx: { n: open().length } }}</span></div>
        <div class="table-wrap">
          <table class="bo-table qps-open">
            <thead><tr><th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th><th scope="col">{{ 'เหตุการณ์' | tx }}</th><th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th></tr></thead>
            <tbody>
              @for (r of open(); track r.item.id) {
                <tr tabindex="0" (click)="go(r)" (keydown.enter)="go(r)">
                  <td><b>{{ r.item.id }}</b><div class="secondary">{{ r.at }}</div></td>
                  @if (r.kind === 'incident') {
                    <td>{{ r.item.description | tx }}<div class="secondary">{{ SAFETY_CATEGORY[r.item.category] | tx }} · {{ r.item.location | tx }} · {{ reporter(r.item) | tx }}</div></td>
                    <td>
                      <span class="chip" [class]="'chip ' + HARM[r.item.harm].cls">{{ HARM[r.item.harm].label | tx }}</span>
                      <div class="secondary" [class.text-danger]="late(r.item)">{{ (late(r.item) ? 'เกินกำหนดคัดกรอง' : INCIDENT_STATUS[r.item.status].label) | tx }}</div>
                    </td>
                  } @else {
                    <td>{{ r.item.description | tx }}<div class="secondary">{{ 'เหตุเกือบพลาด' | tx }} · {{ CATCH_POINT[r.item.caughtAt] | tx }} · {{ r.item.location | tx }}</div></td>
                    <td><span class="chip" [class]="'chip ' + NEAR_MISS_STATUS[r.item.status].cls">{{ NEAR_MISS_STATUS[r.item.status].label | tx }}</span></td>
                  }
                </tr>
              } @empty {
                <tr class="static"><td colspan="3" class="empty">{{ 'ไม่มีเหตุการณ์ที่เปิดอยู่' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  host: { class: 'page' },
})
export class QualityOverviewComponent {
  private readonly store = inject(BackofficeStore);
  private readonly router = inject(Router);
  protected readonly HARM = HARM;
  protected readonly INCIDENT_STATUS = INCIDENT_STATUS;
  protected readonly NEAR_MISS_STATUS = NEAR_MISS_STATUS;
  protected readonly SAFETY_CATEGORY = SAFETY_CATEGORY;
  protected readonly CATCH_POINT = CATCH_POINT;
  protected readonly KPI_DOMAIN = KPI_DOMAIN;

  protected readonly counts = computed(() => qualityCounts(this.store.data()));
  protected readonly complaints = computed(() => complaintCounts(this.store.data()));
  protected readonly trend = computed(() => safetyTrend(this.store.data()));
  protected readonly kpiCount = computed(() => this.store.data().kpis.length);
  protected readonly offTarget = computed(() => {
    const d = this.store.data();
    return d.kpis.map(def => ({ def, now: kpiNow(d, def) })).filter(k => !k.now.met);
  });
  protected readonly open = computed(() => {
    const d = this.store.data();
    const rows: Row[] = [
      ...d.incidents.filter(i => i.status !== 'closed').map(item => ({ kind: 'incident' as const, at: item.at, item })),
      ...d.nearMisses.filter(n => n.status === 'open').map(item => ({ kind: 'near-miss' as const, at: item.at, item })),
    ];
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  });

  protected reporter(i: Incident) {
    return reporterOf(i);
  }

  protected late(i: Incident) {
    return triageLate(i);
  }

  protected go(r: Row) {
    this.router.navigate([r.kind === 'incident' ? '/backoffice/quality/incidents' : '/backoffice/quality/near-miss'], { queryParams: { id: r.item.id } });
  }
}
