/* The on-call rotation: the vets' nights, made fair by the generator, adjusted by hand and published (workforce.onCall, M24 P2) */
import { Component, computed, inject, signal } from '@angular/core';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import type { OnCallSlot } from '../../data/types';
import { addDays, daysOf, fairness, isWeekend, licenseOf, licenseState, onCallEligible, onLeave, slotProblem, staffOf, weekday, weekOf } from '../../data/workforce';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const THIS_WEEK = weekOf(TODAY);
/** What is out, and the two weeks after it to plan */
const PERIODS = [
  { key: 'now', from: THIS_WEEK, to: addDays(THIS_WEEK, 6) },
  { key: 'next', from: addDays(THIS_WEEK, 7), to: addDays(THIS_WEEK, 20) },
];

@Component({
  selector: 'bo-on-call',
  imports: [TxPipe, UiButton, PageHead],
  template: `
    @let f = fair();
    <bo-page-head [heading]="'ตารางเวร On-call'" [source]="'M24 P2 · สัตวแพทย์รับเวรคืนละคน 20:00–08:00 · สร้างอัตโนมัติให้คนที่มีคืนน้อยก่อน วันหยุดนับแยก เลี่ยงสองคืนติดกัน · ชั่วโมงที่ถูกเรียกเข้านับเป็นล่วงเวลา · ต้นแบบก่อนสัญญาหน้าของ M24 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" variant="secondary" type="button" (click)="actions.generateOnCall(period().from, period().to)">{{ 'สร้างตารางอัตโนมัติ' | tx }}</button>
      <button uiButton size="sm" type="button" [disabled]="!drafts()" (click)="actions.publishOnCall(period().from, period().to)">{{ 'ประกาศตาราง' | tx }}</button>
    </bo-page-head>

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar">
            <div class="segmented" role="group" [attr.aria-label]="'ช่วง' | tx">
              @for (p of periods; track p.key) {<button type="button" [class.active]="p.key === periodKey()" [attr.aria-pressed]="p.key === periodKey()" (click)="periodKey.set(p.key)">{{ label(p.from, p.to) }}</button>}
            </div>
            <span class="secondary grow">{{ '{n} คืน · จัดแล้ว {m} · ฉบับร่าง {d}' | tx: { n: nights().length, m: filled(), d: drafts() } }}</span>
          </div>
          <div class="oncall-cal">
            @for (d of weekdays; track $index) {<div class="head">{{ d | tx }}</div>}
            @for (n of nights(); track n.date) {
              <div class="night" [class.weekend]="n.weekend" [class.today]="n.date === today" [class.problem]="n.problem">
                <div class="secondary">{{ n.date.slice(8) }}/{{ n.date.slice(5, 7) }}</div>
                @if (n.slot; as s) {
                  <button type="button" class="who" [class.draft]="s.status === 'draft'" [attr.aria-label]="('ปรับเวร on-call {date}' | tx: { date: n.date }) + ' · ' + (name(s.staffId) | tx)" (click)="actions.adjustOnCall(s)">{{ name(s.staffId) | tx }}</button>
                  @if (s.status === 'draft') {<span class="secondary">{{ 'ฉบับร่าง' | tx }}</span>}
                  @if (n.problem) {<span class="secondary text-danger">{{ n.problem | tx }}</span>}
                } @else {
                  <span class="secondary">{{ 'ยังไม่จัด' | tx }}</span>
                }
                @for (c of n.callOuts; track c.id) {<span class="callout">{{ 'ถูกเรียก {h} ชม.' | tx: { h: c.hours } }} · {{ c.reason | tx }}</span>}
              </div>
            }
          </div>
        </div>
      </div>

      <aside class="record-rail">
        <div class="panel actions">
          <b>{{ 'การกระจายเวร' | tx }}</b>
          <table class="mini-lines">
            <thead><tr><th>{{ 'สัตวแพทย์' | tx }}</th><th class="num">{{ 'คืน' | tx }}</th><th class="num">{{ 'วันหยุด' | tx }}</th></tr></thead>
            <tbody>
              @for (r of f.rows; track r.staff.id) {
                <tr><td>{{ r.staff.name | tx }}@if (!eligible(r.staff.id)) {<div class="secondary text-danger">{{ ineligible(r.staff.id) | tx }}</div>}</td><td class="num">{{ r.nights }}</td><td class="num">{{ r.weekends }}</td></tr>
              }
            </tbody>
          </table>
          <span class="chip" [class]="'chip ' + (f.fair ? 'ok' : 'warn')">{{ (f.fair ? 'สมดุล · ต่างกันไม่เกิน 1 คืน' : 'ไม่สมดุล · ต่างกัน {n} คืน') | tx: { n: f.spread } }}</span>
          <p class="secondary">{{ 'รับเวรได้: สัตวแพทย์ที่ใบอนุญาตตรวจสอบแล้วและยังไม่หมดอายุ ไม่ได้ลาคืนนั้น' | tx }}</p>
        </div>
        <div class="panel actions">
          <b>{{ 'การถูกเรียกเข้า' | tx }}</b>
          @for (c of callOuts(); track c.id) {
            <div class="sum-row"><span>{{ c.date }} · {{ name(c.staffId) | tx }}<div class="secondary">{{ c.reason | tx }}</div></span><b>{{ c.hours }} {{ 'ชม.' | tx }}</b></div>
          } @empty {
            <p class="secondary">{{ 'ไม่มีการเรียกเข้าในช่วงนี้' | tx }}</p>
          }
        </div>
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class OnCallComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly periods = PERIODS;
  protected readonly today = TODAY;
  protected readonly weekdays = daysOf(THIS_WEEK).map(weekday);

  protected readonly periodKey = signal('now');
  protected readonly period = computed(() => PERIODS.find(p => p.key === this.periodKey())!);
  protected readonly nights = computed(() => {
    const d = this.store.data();
    const { from, to } = this.period();
    const out = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const slot = d.onCall.find(s => s.date === date) as OnCallSlot | undefined;
      out.push({ date, slot, weekend: isWeekend(date), problem: slot ? slotProblem(d, slot) : null, callOuts: d.callOuts.filter(c => c.date === date) });
    }
    return out;
  });
  protected readonly filled = computed(() => this.nights().filter(n => n.slot).length);
  protected readonly drafts = computed(() => this.nights().filter(n => n.slot?.status === 'draft').length);
  protected readonly fair = computed(() => fairness(this.store.data(), this.period().from, this.period().to));
  protected readonly callOuts = computed(() => this.store.data().callOuts.filter(c => this.period().from <= c.date && c.date <= this.period().to));

  protected label(from: string, to: string) {
    return `${from.slice(8)}/${from.slice(5, 7)} – ${to.slice(8)}/${to.slice(5, 7)}`;
  }

  protected name(id: string) {
    return staffOf(this.store.data(), id)?.name ?? id;
  }

  protected eligible(id: string) {
    return onCallEligible(this.store.data(), this.period().from).some(s => s.id === id);
  }

  /** Why a vet is off the list from the period's first night */
  protected ineligible(id: string) {
    const d = this.store.data();
    const leave = onLeave(d, id, this.period().from);
    if (leave) {
      return 'ลาในช่วงนี้';
    }
    const l = licenseOf(d, id, 'vet-license');
    return !l ? 'ไม่มีใบอนุญาตในทะเบียน' : licenseState(l) === 'expired' ? 'ใบอนุญาตหมดอายุ' : 'ใบอนุญาตประกอบวิชาชีพยังไม่ได้ตรวจสอบ';
  }
}
