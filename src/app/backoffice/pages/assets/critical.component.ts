/* Critical equipment: what is down or cannot be relied on, why, the beds and units it touches, and what stands in (assets.critical, M22 P2) */
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { inpatients } from '../../../clinic/data/ward';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { criticalBoard, EQUIPMENT_CLASS, openDowntimeOf, READINESS, type Readiness } from '../../data/assets';
import type { Equipment } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const STATES: Readiness[] = ['down', 'attention', 'due', 'ready'];

@Component({
  selector: 'bo-critical',
  imports: [RouterLink, TxPipe, UiButton, PageHead],
  template: `
    @let counts = byState();
    <bo-page-head [heading]="'สถานะอุปกรณ์สำคัญ'" [source]="'M22 P2 · อุปกรณ์ critical ตลอด 24 ชม. · ขัดข้อง PM หรือสอบเทียบเกินกำหนด และไม่มีสัญญาซ่อม ขึ้นก่อน · แก้ไขที่หน้าของแต่ละเรื่อง · ต้นแบบก่อนสัญญาหน้าของ M22 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar"><b>{{ 'ต้องดำเนินการ' | tx }}</b><span class="secondary grow">{{ '{n} จาก {m} เครื่องไม่พร้อม' | tx: { n: counts.down + counts.attention, m: board().length } }}</span></div>
          <div class="table-wrap">
            <table class="bo-table critical">
              <thead>
                <tr>
                  <th scope="col">{{ 'อุปกรณ์' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'ความพร้อม' | tx }}</th>
                  <th scope="col">{{ 'เหตุผล' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'เครื่องที่ใช้แทนได้' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'การทำงาน' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (r of board(); track r.equipment.id) {
                  <tr class="static" [class.open]="r.state === 'down'">
                    <td>
                      <a class="link" [routerLink]="['/backoffice/assets/equipment', r.equipment.id]"><b>{{ r.equipment.name | tx }}</b></a>
                      <div class="secondary">{{ r.equipment.id }} · {{ r.equipment.location | tx }}@if (r.equipment.bed) { · {{ 'เตียง {bed}' | tx: { bed: r.equipment.bed } }}}</div>
                      @if (occupant(r.equipment); as pet) {<div class="text-danger">{{ 'มีสัตว์ป่วยที่เตียง: {pet}' | tx: { pet: pet } }}</div>}
                    </td>
                    <td><span class="chip" [class]="'chip ' + READY[r.state].cls">{{ READY[r.state].label | tx }}</span></td>
                    <td>
                      @if (r.reasons.length) {<ul class="checks">@for (x of r.reasons; track x) {<li>{{ x | tx }}</li>}</ul>} @else {<span class="secondary ok-text">{{ 'ไม่มีรายการค้าง' | tx }}</span>}
                    </td>
                    <td>@for (b of r.backups; track b.id) {<div>{{ b.name | tx }}</div>} @empty {<span class="text-danger">{{ 'ไม่มี' | tx }}</span>}</td>
                    <td>
                      @if (down(r.equipment); as d) {
                        <button uiButton variant="secondary" size="sm" type="button" (click)="actions.closeDowntime(d)">{{ 'กลับมาใช้งาน' | tx }}</button>
                      } @else if (r.state === 'attention') {
                        <a class="link" [routerLink]="next(r.reasons)">{{ 'ไปแก้ไข' | tx }}</a>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <aside class="record-rail">
        <div class="panel action-card">
          <b>{{ 'ความพร้อมตอนนี้' | tx }}</b>
          @for (s of states; track s) {
            <div class="sum-row"><span class="chip" [class]="'chip ' + READY[s].cls">{{ READY[s].label | tx }}</span><b>{{ counts[s] }}</b></div>
          }
        </div>
        <div class="panel action-card">
          <b>{{ 'ตามจุดที่ตั้ง' | tx }}</b>
          @for (l of byLocation(); track l.location) {
            <div class="sum-row"><span>{{ l.location | tx }}</span><span [class.text-danger]="l.notReady">{{ '{a} / {b} พร้อม' | tx: { a: l.ready, b: l.total } }}</span></div>
          }
        </div>
        <div class="panel action-card">
          <b>{{ 'ชนิดที่ไม่มีเครื่องสำรอง' | tx }}</b>
          @for (c of single(); track c) {<span class="text-danger">{{ c | tx }}</span>} @empty {<span class="secondary ok-text">{{ 'ทุกชนิดมีเครื่องสำรอง' | tx }}</span>}
        </div>
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class CriticalComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly READY = READINESS;
  protected readonly states = STATES;

  protected readonly board = computed(() => criticalBoard(this.store.data()));
  protected readonly byState = computed(() => {
    const out = { down: 0, attention: 0, due: 0, ready: 0 };
    for (const r of this.board()) {
      out[r.state]++;
    }
    return out;
  });
  protected readonly byLocation = computed(() => {
    const m = new Map<string, { location: string; total: number; ready: number; notReady: boolean }>();
    for (const r of this.board()) {
      const row = m.get(r.equipment.location) ?? { location: r.equipment.location, total: 0, ready: 0, notReady: false };
      row.total++;
      row.ready += r.state === 'ready' || r.state === 'due' ? 1 : 0;
      row.notReady = row.ready < row.total;
      m.set(r.equipment.location, row);
    }
    return [...m.values()];
  });
  /** The critical kinds with nothing to stand in if the one that works goes down */
  protected readonly single = computed(() => {
    const board = this.board();
    const kinds = [...new Set(board.map(r => r.equipment.cls))];
    return kinds.filter(k => board.filter(r => r.equipment.cls === k && r.state !== 'down').length < 2).map(k => EQUIPMENT_CLASS[k].label);
  });
  private readonly occupied = computed(() => new Map(inpatients(this.store.clinic.data()).map(p => [p.admission!.bed, p.pet])));

  protected occupant(e: Equipment) {
    return e.bed ? this.occupied().get(e.bed) ?? null : null;
  }

  protected down(e: Equipment) {
    return openDowntimeOf(this.store.data(), e.id) ?? null;
  }

  /** Where the first reason is settled */
  protected next(reasons: string[]) {
    const r = reasons[0] ?? '';
    return r.startsWith('PM') ? '/backoffice/assets/pm' : r.startsWith('สอบเทียบ') ? '/backoffice/assets/calibration' : '/backoffice/assets/contracts';
  }
}
