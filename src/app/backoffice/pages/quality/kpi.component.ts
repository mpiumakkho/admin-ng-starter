/* The KPI library: each definition with its formula and source, its value against target and the sample benchmark, and twelve months of it (quality.kpi, M12 P2) */
import { Component, computed, inject, signal } from '@angular/core';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { KPI_DOMAIN, kpiNow, kpiSeries, onTarget } from '../../data/quality';
import type { KpiDefinition } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

type Domain = KpiDefinition['domain'];

@Component({
  selector: 'bo-kpi-library',
  imports: [PagerFoot, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'คลังตัวชี้วัดคุณภาพ'" [source]="'M12 P2 · kpi_definition และ kpi_snapshot รายเดือน · ตัวที่คำนวณตอนนี้อ่านจากโมดูลต้นทาง · ค่าเทียบมาตรฐานเป็นตัวอย่างจนกว่าจะได้เกณฑ์ TAHSA/AAHA ฉบับจริง · ต้นแบบก่อนสัญญาหน้าของ M12 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <div class="segmented" role="group" [attr.aria-label]="'หมวด' | tx">
            <button type="button" [class.active]="!domain()" [attr.aria-pressed]="!domain()" (click)="domain.set('')">{{ 'ทั้งหมด' | tx }}</button>
            @for (d of domains; track d) {<button type="button" [class.active]="domain() === d" [attr.aria-pressed]="domain() === d" (click)="domain.set(d)">{{ DOMAIN[d] | tx }}</button>}
          </div>
          <span class="secondary grow">{{ '{n} ตัว · ไม่ถึงเป้า {off}' | tx: { n: rows().length, off: off() } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table kpis">
            <thead>
              <tr>
                <th scope="col">{{ 'ตัวชี้วัด' | tx }}</th>
                <th scope="col" class="num w-kind">{{ 'ล่าสุด' | tx }}</th>
                <th scope="col" class="num w-kind">{{ 'เป้าหมาย' | tx }}</th>
                <th scope="col" class="num w-owner">{{ 'ค่าเทียบมาตรฐาน' | tx }}</th>
                <th scope="col" class="w-status">{{ 'เทียบเป้า' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of pager.rows(); track r.def.id) {
                <tr tabindex="0" [class.selected]="r.def.id === selectedId()" [attr.aria-selected]="r.def.id === selectedId()" (click)="pick(r.def.id)" (keydown.enter)="pick(r.def.id)">
                  <td><b>{{ r.def.name | tx }}</b><div class="secondary">{{ r.def.id }} · {{ DOMAIN[r.def.domain] | tx }} · {{ r.def.unit | tx }}@if (r.now.live) { · {{ 'คำนวณตอนนี้' | tx }}}</div></td>
                  <td class="num"><b [class.text-danger]="!r.now.met">{{ r.now.value }}</b>
                    <div class="secondary">{{ trendText(r.now) | tx: { v: abs(r.now.change) } }}</div></td>
                  <td class="num">{{ r.def.better === 'higher' ? '≥' : '≤' }} {{ r.def.target }}</td>
                  <td class="num">@if (r.def.benchmark; as b) {<span>{{ b[1] }}</span><div class="secondary">{{ b[0] | tx }}</div>} @else {—}</td>
                  <td><span class="chip" [class]="'chip ' + (r.now.met ? 'ok' : 'danger')">{{ (r.now.met ? 'ถึงเป้า' : 'ไม่ถึงเป้า') | tx }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (selected(); as k) {
        @let now = nowOf(k);
        <bo-drawer [heading]="k.name | tx" [sub]="k.id + ' · ' + (DOMAIN[k.domain] | tx)" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'สูตร' | tx }}</dt><dd>{{ k.formula | tx }}</dd>
            <dt>{{ 'แหล่งข้อมูล' | tx }}</dt><dd>{{ k.source | tx }}</dd>
            <dt>{{ 'หน่วย' | tx }}</dt><dd>{{ k.unit | tx }}</dd>
            <dt>{{ 'ทิศทางที่ดี' | tx }}</dt><dd>{{ (k.better === 'higher' ? 'ยิ่งสูงยิ่งดี' : 'ยิ่งต่ำยิ่งดี') | tx }}</dd>
            <dt>{{ 'เป้าหมาย' | tx }}</dt><dd>{{ k.better === 'higher' ? '≥' : '≤' }} {{ k.target }}</dd>
            <dt>{{ 'ค่าเทียบมาตรฐาน' | tx }}</dt><dd>@if (k.benchmark; as b) {<span>{{ b[1] }} · {{ b[0] | tx }}</span>} @else {<span>{{ 'ไม่มี' | tx }}</span>}</dd>
            <dt>{{ 'ผู้รับผิดชอบ' | tx }}</dt><dd>{{ k.owner | tx }}</dd>
          </dl>
          @if (now.live) {<p class="notice info">{{ 'เดือนนี้คำนวณจากข้อมูลของโมดูลต้นทางตอนเปิดหน้า เดือนก่อนหน้าเป็นค่าที่บันทึกไว้' | tx }}</p>}
          <div class="section-title">{{ '12 เดือน' | tx }}</div>
          <div class="table-wrap">
            <table class="bo-table kpi-months">
              <thead><tr><th scope="col">{{ 'ประจำเดือน' | tx }}</th><th scope="col" class="num">{{ 'ค่า' | tx }}</th><th scope="col">{{ 'เทียบเป้า' | tx }}</th></tr></thead>
              <tbody>
                @for (s of series(k); track s[0]) {
                  <tr class="static"><td>{{ s[0] }}</td><td class="num" [class.text-danger]="!met(k, s[1])">{{ s[1] }}</td><td>{{ (met(k, s[1]) ? 'ถึงเป้า' : 'ไม่ถึงเป้า') | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="section-title">{{ 'ประวัติ' | tx }}</div>
          <ul class="timeline compact">
            @for (h of k.history; track $index) {<li class="tl"><b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}<div class="secondary">{{ h[0] }} · {{ h[3] | tx }}</div></li>}
          </ul>
          <ng-container foot>
            <span class="grow"></span>
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.setKpiTarget(k)">{{ 'เปลี่ยนเป้าหมาย' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class KpiComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly DOMAIN = KPI_DOMAIN;
  protected readonly domains = Object.keys(KPI_DOMAIN) as Domain[];
  protected readonly abs = (n: number) => Math.round(Math.abs(n) * 10) / 10;

  protected readonly domain = signal<Domain | ''>('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly rows = computed(() => {
    const d = this.store.data();
    return d.kpis.filter(k => !this.domain() || k.domain === this.domain()).map(def => ({ def, now: kpiNow(d, def) }));
  });
  protected readonly off = computed(() => this.rows().filter(r => !r.now.met).length);
  protected readonly selected = computed(() => this.store.data().kpis.find(k => k.id === this.selectedId()) ?? null);

  protected nowOf(k: KpiDefinition) {
    return kpiNow(this.store.data(), k);
  }

  protected series(k: KpiDefinition) {
    return [...kpiSeries(this.store.data(), k)].reverse();
  }

  protected met(k: KpiDefinition, v: number) {
    return onTarget(k, v);
  }

  protected trendText(now: ReturnType<typeof kpiNow>) {
    return now.improving === null ? 'คงที่จากเดือนก่อน' : now.improving ? 'ดีขึ้น {v} จากเดือนก่อน' : 'แย่ลง {v} จากเดือนก่อน';
  }

  protected pick(id: string) {
    this.selectedId.set(this.selectedId() === id ? null : id);
  }
}
