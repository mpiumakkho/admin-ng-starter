/* Preventive maintenance: the open PMs with the 30-day alert, the overdue and critical first, recorded or moved with why (assets.pm, M22 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { CRITICALITY, DUE_STATE, dueState, type DueState, equipmentOf, pmCounts, pmProblems, type PmInput } from '../../data/assets';
import { daysUntil } from '../../data/home';
import type { PmTask } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

type View = 'alert' | 'all' | 'done';
const BLANK: PmInput = { doneAt: TODAY, outcome: 'pass', findings: '', cost: '' };

@Component({
  selector: 'bo-pm',
  imports: [PagerFoot, RouterLink, TxPipe, UiButton, PageHead],
  template: `
    @let c = counts();
    <bo-page-head [heading]="'แผนบำรุงรักษาเชิงป้องกัน'" [source]="'M22 P2 · แจ้งเตือนล่วงหน้า 30 วัน · PM ครั้งถัดไปวางแผนจากวันที่ทำ · PM ไม่ผ่านจะหยุดใช้อุปกรณ์ · ไม่มีใบสั่งงานซ่อมและอะไหล่ในขอบเขต · ต้นแบบก่อนสัญญาหน้าของ M22 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <div class="kpi" [class.danger]="c.overdue" role="listitem"><span class="kpi-value">{{ c.overdue }}</span><span class="kpi-label">{{ 'เกินกำหนด' | tx }}</span></div>
      <div class="kpi" [class.danger]="c.criticalOverdue" role="listitem"><span class="kpi-value">{{ c.criticalOverdue }}</span><span class="kpi-label">{{ 'อุปกรณ์ critical เกินกำหนด' | tx }}</span></div>
      <div class="kpi" [class.warn]="c.due30" role="listitem"><span class="kpi-value">{{ c.due30 }}</span><span class="kpi-label">{{ 'ภายใน 30 วัน' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ c.scheduled }}</span><span class="kpi-label">{{ 'ตามแผน' | tx }}</span></div>
    </div>

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar">
            <div class="segmented" role="group" [attr.aria-label]="'มุมมอง' | tx">
              @for (v of views; track v[0]) {<button type="button" [class.active]="view() === v[0]" [attr.aria-pressed]="view() === v[0]" (click)="view.set(v[0])">{{ v[1] | tx }}</button>}
            </div>
            <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
          </div>
          <div class="table-wrap">
            <table class="bo-table pm">
              <thead>
                <tr>
                  <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                  <th scope="col">{{ 'อุปกรณ์' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'ความสำคัญ' | tx }}</th>
                  <th scope="col" class="w-due">{{ 'กำหนด' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (t of pager.rows(); track t.id) {
                  @let e = eq(t);
                  <tr tabindex="0" [class.selected]="t.id === selectedId()" [attr.aria-selected]="t.id === selectedId()" (click)="pick(t.id)" (keydown.enter)="pick(t.id)">
                    <td><b>{{ t.id }}</b></td>
                    <td>{{ e.name | tx }}<div class="secondary">{{ e.id }} · {{ e.location | tx }}</div></td>
                    <td><span class="chip" [class]="'chip ' + CRIT[e.criticality].cls">{{ CRIT[e.criticality].label | tx }}</span></td>
                    <td class="num">{{ t.status === 'open' ? t.due : t.doneAt }}@if (t.movedFrom) {<div class="secondary">{{ 'เลื่อนจาก {date}' | tx: { date: t.movedFrom } }}</div>}</td>
                    <td>
                      @if (t.status === 'open') {
                        <span class="chip" [class]="'chip ' + DUE[state(t)].cls">{{ DUE[state(t)].label | tx }}</span>
                        <div class="secondary" [class.text-danger]="state(t) === 'overdue'">{{ days(t) < 0 ? ('เกินกำหนด {n} วัน' | tx: { n: -days(t) }) : ('อีก {n} วัน' | tx: { n: days(t) }) }}</div>
                      } @else {
                        <span class="chip" [class]="'chip ' + (t.outcome === 'pass' ? 'ok' : 'danger')">{{ (t.outcome === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน') | tx }}</span><div class="secondary">{{ t.doneBy | tx }}</div>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีงาน PM ในมุมมองนี้' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <bo-pager [pager]="pager" />
        </div>
      </div>

      <aside class="record-rail">
        @if (selected(); as t) {
          @let e = eq(t);
          <div class="panel action-card">
            <b>{{ t.id }} · {{ e.name | tx }}</b>
            <span class="secondary">{{ e.id }} · {{ e.location | tx }} · {{ 'ทุก {n} เดือน' | tx: { n: e.pmMonths } }}</span>
            @if (t.status === 'open') {
              <div class="sum-row"><span>{{ 'กำหนด' | tx }}</span><b [class.text-danger]="state(t) === 'overdue'">{{ t.due }}</b></div>
              @if (t.moveReason) {<p class="secondary">{{ 'เลื่อนจาก {date}' | tx: { date: t.movedFrom! } }} — {{ t.moveReason | tx }}</p>}
              @if (e.status === 'down') {<p class="notice warn">{{ 'อุปกรณ์ขัดข้องอยู่ · PM ทำได้เมื่อซ่อมเสร็จ หรือบันทึกพร้อมการซ่อม' | tx }}</p>}
              <div class="section-title">{{ 'บันทึกผล PM' | tx }}</div>
              <div class="two">
                <label class="field">{{ 'วันที่ทำ' | tx }}<input class="ui-input" type="date" [value]="form().doneAt" (input)="set('doneAt', $any($event.target).value)" /></label>
                <label class="field">{{ 'ผล' | tx }}
                  <select class="ui-input" (change)="set('outcome', $any($event.target).value)">
                    <option value="pass" [selected]="form().outcome === 'pass'">{{ 'ผ่าน' | tx }}</option>
                    <option value="fail" [selected]="form().outcome === 'fail'">{{ 'ไม่ผ่าน' | tx }}</option>
                  </select>
                </label>
              </div>
              <label class="field">{{ 'สิ่งที่พบ / ทำ' | tx }}<textarea class="ui-input" rows="2" [value]="form().findings" (input)="set('findings', $any($event.target).value)"></textarea></label>
              <label class="field">{{ 'ค่าใช้จ่าย (บาท)' | tx }}<input class="ui-input" inputmode="decimal" [value]="form().cost" (input)="set('cost', $any($event.target).value)" /></label>
              @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
              <div class="two">
                <button uiButton variant="secondary" size="sm" type="button" (click)="actions.movePm(t)">{{ 'เลื่อน PM' | tx }}</button>
                <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="record(t)">{{ 'บันทึก PM' | tx }}</button>
              </div>
            } @else {
              <div class="sum-row"><span>{{ 'วันที่ทำ' | tx }}</span><b>{{ t.doneAt }}</b></div>
              <div class="sum-row"><span>{{ 'ผล' | tx }}</span><b>{{ (t.outcome === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน') | tx }}</b></div>
              @if (t.findings) {<p class="secondary">{{ t.findings | tx }}</p>}
            }
            <a class="link" [routerLink]="['/backoffice/assets/equipment', e.id]">{{ 'เปิดรายละเอียดอุปกรณ์' | tx }}</a>
          </div>
        } @else {
          <div class="panel action-card">
            <b>{{ 'ต้องทำก่อน' | tx }}</b>
            @for (t of urgent(); track t.id) {
              <button type="button" class="sum-row link-row" (click)="pick(t.id)"><span>{{ eq(t).name | tx }}</span><span class="text-danger">{{ 'เกินกำหนด {n} วัน' | tx: { n: -days(t) } }}</span></button>
            } @empty {
              <p class="secondary ok-text">{{ 'ไม่มี PM เกินกำหนด' | tx }}</p>
            }
            <p class="secondary">{{ 'เลือกงานในตารางเพื่อบันทึกผลหรือเลื่อน' | tx }}</p>
          </div>
        }
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class PmComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly CRIT = CRITICALITY;
  protected readonly DUE = DUE_STATE;
  protected readonly views: [View, string][] = [['alert', 'เกินกำหนดและ 30 วัน'], ['all', 'ที่ค้างทั้งหมด'], ['done', 'ทำแล้ว']];

  protected readonly view = signal<View>('alert');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly counts = computed(() => pmCounts(this.store.data()));
  private readonly open = computed(() => {
    const d = this.store.data();
    return d.pm.filter(t => t.status === 'open' && equipmentOf(d, t.equipmentId)?.status !== 'decommissioned');
  });
  protected readonly rows = computed(() => {
    const v = this.view();
    if (v === 'done') {
      return this.store.data().pm.filter(t => t.status === 'done').sort((a, b) => b.doneAt!.localeCompare(a.doneAt!));
    }
    const rank = (t: PmTask) => (this.eq(t).criticality === 'critical' ? 0 : 1);
    return this.open().filter(t => v === 'all' || dueState(t.due) !== 'scheduled').sort((a, b) => a.due.localeCompare(b.due) || rank(a) - rank(b));
  });
  protected readonly urgent = computed(() => this.open().filter(t => dueState(t.due) === 'overdue').sort((a, b) => a.due.localeCompare(b.due)));
  protected readonly selected = computed(() => this.store.data().pm.find(t => t.id === this.selectedId()) ?? null);
  protected readonly form = signal<PmInput>({ ...BLANK });
  protected readonly problems = computed(() => (this.selected() ? pmProblems(this.selected()!, this.form()) : []));

  protected eq(t: PmTask) {
    return equipmentOf(this.store.data(), t.equipmentId)!;
  }

  protected state(t: PmTask): DueState {
    return dueState(t.due);
  }

  protected days(t: PmTask) {
    return daysUntil(t.due);
  }

  protected pick(id: string) {
    this.form.set({ ...BLANK });
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected set<K extends keyof PmInput>(key: K, value: PmInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected record(t: PmTask) {
    this.actions.completePm(t, this.form(), () => {
      this.form.set({ ...BLANK });
      this.selectedId.set(null);
    });
  }
}
