/* Downtime: what is out now, MTBF/MTTR and availability over the year, a month-by-month view, and each incident opened and closed (assets.downtime, M22 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { active, addMonths, CRITICALITY, DOWNTIME_KIND, downtimeHours, downtimeProblems, type DowntimeInput, equipmentOf, hoursBetween, reliability } from '../../data/assets';
import type { Downtime } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

const hours = (n: number | null) => (n === null ? '—' : n >= 100 ? Math.round(n).toLocaleString('en-US') : Number.isInteger(n) ? String(n) : n.toFixed(1));
/** The twelve months to this one: 2025-10 … 2026-09 */
const MONTHS = Array.from({ length: 12 }, (_, i) => addMonths(`${TODAY.slice(0, 7)}-01`, i - 11).slice(0, 7));
type View = 'open' | 'all';

@Component({
  selector: 'bo-downtime',
  imports: [RouterLink, TxPipe, UiButton, PageHead, Drawer],
  template: `
    @let k = kpis();
    <bo-page-head [heading]="'การขัดข้องและหยุดใช้งาน'" [source]="'M22 P2 · MTBF ชั่วโมงที่ใช้งานได้ระหว่างการขัดข้อง · MTTR ชั่วโมงเฉลี่ยที่ใช้ซ่อม · คิดย้อนหลัง 12 เดือน · กลับมาใช้ได้เมื่อทดสอบแล้ว · ต้นแบบก่อนสัญญาหน้าของ M22 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton variant="danger" size="sm" type="button" (click)="openCreate()">{{ 'แจ้งขัดข้อง' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      <div class="kpi" [class.danger]="k.open" role="listitem"><span class="kpi-value">{{ k.open }}</span><span class="kpi-label">{{ 'หยุดใช้อยู่ตอนนี้' | tx }}</span></div>
      <div class="kpi" [class.danger]="k.criticalOpen" role="listitem"><span class="kpi-value">{{ k.criticalOpen }}</span><span class="kpi-label">{{ 'อุปกรณ์ critical ที่หยุดใช้' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ fmt(k.all.mtbf) }}</span><span class="kpi-label">{{ 'MTBF ทั้งหมด (ชม.)' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ fmt(k.all.mttr) }}</span><span class="kpi-label">{{ 'MTTR ทั้งหมด (ชม.)' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ (k.critical.availability * 100).toFixed(2) }}%</span><span class="kpi-label">{{ 'ความพร้อมใช้ของอุปกรณ์ critical' | tx }}</span></div>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ '12 เดือนที่ผ่านมา' | tx }}</b><span class="secondary grow">{{ 'ชั่วโมงที่หยุดใช้ต่อเดือน · แดงคือขัดข้อง เทาคือหยุดตามแผน' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table dt-months">
          <thead>
            <tr>
              <th scope="col">{{ 'อุปกรณ์' | tx }}</th>
              @for (m of months; track m) {<th scope="col" class="num">{{ m.slice(5) }}/{{ m.slice(2, 4) }}</th>}
              <th scope="col" class="num">{{ 'MTBF' | tx }}</th>
              <th scope="col" class="num">{{ 'MTTR' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of timeline(); track row.id) {
              <tr class="static">
                <th scope="row"><a class="link" [routerLink]="['/backoffice/assets/equipment', row.id]">{{ row.name | tx }}</a></th>
                @for (cell of row.cells; track $index) {
                  <td class="num" [class]="'num ' + cell.cls">{{ cell.h ? fmt(cell.h) : '' }}</td>
                }
                <td class="num">{{ fmt(row.rel.mtbf) }}</td>
                <td class="num">{{ fmt(row.rel.mttr) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="split" [class.with-drawer]="selected() || creating()">
      <div class="panel">
        <div class="filter-bar">
          <div class="segmented" role="group" [attr.aria-label]="'มุมมอง' | tx">
            <button type="button" [class.active]="view() === 'open'" [attr.aria-pressed]="view() === 'open'" (click)="view.set('open')">{{ 'ยังไม่ปิด' | tx }}</button>
            <button type="button" [class.active]="view() === 'all'" [attr.aria-pressed]="view() === 'all'" (click)="view.set('all')">{{ 'ทั้งหมด' | tx }}</button>
          </div>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead>
              <tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col">{{ 'อุปกรณ์' | tx }}</th>
                <th scope="col">{{ 'อาการ' | tx }}</th>
                <th scope="col" class="w-at">{{ 'เริ่ม' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ชั่วโมง' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (d of rows(); track d.id) {
                <tr tabindex="0" [class.selected]="d.id === selectedId()" [class.open]="!d.to" [attr.aria-selected]="d.id === selectedId()" (click)="pick(d.id)" (keydown.enter)="pick(d.id)">
                  <td><b>{{ d.id }}</b><div class="secondary">{{ KIND[d.kind] | tx }}</div></td>
                  <td>{{ eq(d).name | tx }}<div class="secondary"><span class="chip" [class]="'chip ' + CRIT[eq(d).criticality].cls">{{ CRIT[eq(d).criticality].label | tx }}</span></div></td>
                  <td>{{ d.problem | tx }}@if (d.impact) {<div class="secondary">{{ d.impact | tx }}</div>}</td>
                  <td class="num">{{ d.from }}<div class="secondary">{{ d.to ?? ('ยังไม่ปิด' | tx) }}</div></td>
                  <td class="num">{{ fmt(dh(d)) }}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีอุปกรณ์ที่หยุดใช้อยู่' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (creating()) {
        <bo-drawer [heading]="'แจ้งขัดข้อง'" [sub]="'อุปกรณ์หยุดใช้ตั้งแต่ตอนนี้จนกว่าจะปิดรายการ'" (closed)="creating.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'อุปกรณ์' | tx }}
              <select class="ui-input" (change)="set('equipmentId', $any($event.target).value)">
                @for (e of devices(); track e.id) {<option [value]="e.id" [selected]="e.id === form().equipmentId">{{ e.name | tx }} · {{ e.id }}</option>}
              </select>
            </label>
            <label class="full">{{ 'ประเภท' | tx }}
              <select class="ui-input" (change)="set('kind', $any($event.target).value)">
                <option value="failure" [selected]="form().kind === 'failure'">{{ KIND.failure | tx }}</option>
                <option value="planned" [selected]="form().kind === 'planned'">{{ KIND.planned | tx }}</option>
              </select>
            </label>
            <label class="full">{{ 'อาการ' | tx }}<textarea class="ui-input" rows="2" [value]="form().problem" (input)="set('problem', $any($event.target).value)"></textarea></label>
            <label class="full">{{ 'ผลกระทบ' | tx }}<input class="ui-input" [placeholder]="'เช่น ย้ายเคสไปห้องผ่าตัด 2' | tx" [value]="form().impact" (input)="set('impact', $any($event.target).value)" /></label>
          </div>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="creating.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton variant="danger" size="sm" type="button" [disabled]="problems().length > 0" (click)="create()">{{ 'แจ้งขัดข้อง' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as d) {
        <bo-drawer [heading]="d.id" [sub]="(eq(d).name | tx) + ' · ' + (KIND[d.kind] | tx)" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'อาการ' | tx }}</dt><dd>{{ d.problem | tx }}</dd>
            <dt>{{ 'ผลกระทบ' | tx }}</dt><dd>{{ (d.impact || '—') | tx }}</dd>
            <dt>{{ 'แจ้งโดย' | tx }}</dt><dd>{{ d.reportedBy | tx }} · {{ d.from }}</dd>
            <dt>{{ 'หยุดใช้' | tx }}</dt><dd>{{ '{n} ชม.' | tx: { n: fmt(dh(d)) } }}</dd>
            @if (d.to) {
              <dt>{{ 'การแก้ไข' | tx }}</dt><dd>{{ d.fix | tx }}</dd>
              <dt>{{ 'ปิดโดย' | tx }}</dt><dd>{{ d.closedBy | tx }} · {{ d.to }}</dd>
            }
          </dl>
          <ng-container foot>
            <a class="link" [routerLink]="['/backoffice/assets/equipment', d.equipmentId]">{{ 'เปิดรายละเอียดอุปกรณ์' | tx }}</a>
            <span class="grow"></span>
            @if (!d.to) {<button uiButton size="sm" type="button" (click)="actions.closeDowntime(d)">{{ 'กลับมาใช้งาน' | tx }}</button>}
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class DowntimeComponent {
  private readonly store = inject(BackofficeStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly actions = inject(BackofficeActions);
  protected readonly KIND = DOWNTIME_KIND;
  protected readonly CRIT = CRITICALITY;
  protected readonly months = MONTHS;
  protected readonly fmt = hours;
  protected readonly dh = downtimeHours;

  protected readonly view = signal<View>('open');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly rows = computed(() => this.store.data().downtime.filter(d => this.view() === 'all' || !d.to).sort((a, b) => b.from.localeCompare(a.from)));
  protected readonly selected = computed(() => this.store.data().downtime.find(d => d.id === this.selectedId()) ?? null);
  protected readonly devices = computed(() => active(this.store.data()));
  protected readonly kpis = computed(() => {
    const d = this.store.data();
    const ids = active(d).map(e => e.id);
    const open = d.downtime.filter(x => !x.to);
    return {
      open: open.length, criticalOpen: open.filter(x => equipmentOf(d, x.equipmentId)?.criticality === 'critical').length,
      all: reliability(d, ids), critical: reliability(d, ids.filter(id => equipmentOf(d, id)!.criticality === 'critical')),
    };
  });
  /** Each device with downtime this year: its hours out, month by month */
  protected readonly timeline = computed(() => {
    const d = this.store.data();
    const now = `${TODAY} 23:59`;
    const ids = [...new Set(d.downtime.filter(x => (x.to ?? now).slice(0, 7) >= MONTHS[0]).map(x => x.equipmentId))];
    return ids.map(id => {
      const e = equipmentOf(d, id)!;
      const cells = MONTHS.map(m => {
        const start = `${m}-01 00:00`;
        const end = `${addMonths(`${m}-01`, 1)} 00:00`;
        const hits = d.downtime.filter(x => x.equipmentId === id).map(x => ({ x, from: x.from > start ? x.from : start, to: (x.to ?? now) < end ? (x.to ?? now) : end }))
          .filter(y => y.to > y.from);
        const h = hits.reduce((n, y) => n + hoursBetween(y.from, y.to), 0);
        const failure = hits.some(y => y.x.kind === 'failure');
        const cls = failure ? (hits.some(y => !y.x.to) ? 'failure open' : 'failure') : hits.length ? 'planned' : '';
        return { h: Math.round(h * 10) / 10, cls };
      });
      return { id, name: e.name, cells, rel: reliability(d, [id]) };
    }).sort((a, b) => a.id.localeCompare(b.id));
  });

  protected readonly creating = signal(false);
  protected readonly form = signal<DowntimeInput>({ equipmentId: 'EQ-ICU-MON-02', kind: 'failure', problem: '', impact: '' });
  protected readonly problems = computed(() => downtimeProblems(this.store.data(), this.form()));

  constructor() {
    // A report started from a device's own page
    const id = this.route.snapshot.queryParamMap.get('report');
    if (id && equipmentOf(this.store.data(), id)) {
      this.form.set({ ...this.form(), equipmentId: id });
      this.creating.set(true);
    }
  }

  protected eq(d: Downtime) {
    return equipmentOf(this.store.data(), d.equipmentId)!;
  }

  protected pick(id: string) {
    this.creating.set(false);
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected openCreate() {
    this.selectedId.set(null);
    this.creating.set(true);
  }

  protected set<K extends keyof DowntimeInput>(key: K, value: DowntimeInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected create() {
    this.actions.openDowntime(this.form(), d => {
      this.creating.set(false);
      this.form.set({ ...this.form(), problem: '', impact: '' });
      this.view.set('open');
      this.selectedId.set(d.id);
    });
  }
}
