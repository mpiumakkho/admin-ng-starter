/* Decommission: requests decided by someone else, what each takes away, and the disposal evidence; the device's history stays (assets.decommission, M22 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  active, costOf, decideBlock, DECOMMISSION_METHOD, DECOMMISSION_STATUS, decommissionImpact, type DecommissionInput, equipmentOf, requestProblems,
} from '../../data/assets';
import type { Decommission } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const baht = (n: number) => `฿${n.toLocaleString('en-US')}`;
const BLANK: DecommissionInput = { equipmentId: 'EQ-DEN-DEN-01', reason: '', method: 'scrap', replacement: '' };

@Component({
  selector: 'bo-decommission',
  imports: [RouterLink, TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'การเลิกใช้งานอุปกรณ์'" [source]="'M22 P2 · ขอ → ผู้อื่นอนุมัติ → จำหน่ายพร้อมหลักฐาน · ยกเลิกการผูกเตียง PM ที่ค้าง และสัญญาโดยอัตโนมัติ · ประวัติเก็บไว้ · การตัดจำหน่ายทางบัญชีอยู่นอกขอบเขต · ต้นแบบก่อนสัญญาหน้าของ M22 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" variant="secondary" type="button" (click)="selectedId.set(null)">{{ 'ขอเลิกใช้งาน' | tx }}</button>
    </bo-page-head>

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar"><b>{{ 'คำขอเลิกใช้งาน' | tx }}</b><span class="secondary grow">{{ 'ที่ยังไม่ปิดก่อน แล้วตามวันที่ขอ' | tx }}</span></div>
          <div class="table-wrap">
            <table class="bo-table">
              <thead>
                <tr>
                  <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                  <th scope="col">{{ 'อุปกรณ์' | tx }}</th>
                  <th scope="col">{{ 'เหตุผล' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'วิธี' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr tabindex="0" [class.selected]="r.id === selectedId()" [attr.aria-selected]="r.id === selectedId()" (click)="pick(r.id)" (keydown.enter)="pick(r.id)">
                    <td><b>{{ r.id }}</b><div class="secondary">{{ r.requestedAt }}</div></td>
                    <td>{{ name(r) | tx }}<div class="secondary">{{ r.equipmentId }}</div></td>
                    <td>{{ r.reason | tx }}</td>
                    <td>{{ METHOD[r.method] | tx }}</td>
                    <td><span class="chip" [class]="'chip ' + STATUS[r.status].cls">{{ STATUS[r.status].label | tx }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <aside class="record-rail">
        @if (selected(); as r) {
          @let e = eq(r.equipmentId);
          @let impact = impactOf(r);
          <div class="panel action-card">
            <b>{{ r.id }} · {{ e.name | tx }}</b>
            <span class="secondary">{{ e.id }} · {{ e.serial }} · {{ e.location | tx }}</span>
            <div class="sum-row"><span>{{ 'ขอโดย' | tx }}</span><span>{{ r.requestedBy | tx }}</span></div>
            <div class="sum-row"><span>{{ 'วิธี' | tx }}</span><span>{{ METHOD[r.method] | tx }}</span></div>
            @if (r.replacement) {<div class="sum-row"><span>{{ 'เครื่องทดแทน' | tx }}</span><span>{{ r.replacement | tx }}</span></div>}
            <div class="sum-row"><span>{{ 'ต้นทุนสะสม' | tx }}</span><span>{{ fmt(cost(r).total) }}</span></div>
            @if (r.status === 'requested' || r.status === 'approved') {
              <div class="section-title">{{ 'ผลเมื่อเลิกใช้' | tx }}</div>
              <ul class="checks">
                @for (i of impact; track i.text) {<li [class.hard]="i.severe">{{ i.text | tx }}</li>} @empty {<li class="ok-text">{{ 'ไม่มีรายการที่ผูกอยู่' | tx }}</li>}
              </ul>
            }
            @if (r.status === 'requested') {
              @if (block(r); as b) {<p class="notice info">{{ b | tx }}</p>}
              <div class="two">
                <button uiButton variant="secondary" size="sm" type="button" [disabled]="!!block(r)" (click)="actions.decideDecommission(r, 'rejected')">{{ 'ไม่อนุมัติการเลิกใช้' | tx }}</button>
                <button uiButton size="sm" type="button" [disabled]="!!block(r)" (click)="actions.decideDecommission(r, 'approved')">{{ 'อนุมัติ' | tx }}</button>
              </div>
            } @else if (r.status === 'approved') {
              <p class="secondary">{{ 'อนุมัติโดย' | tx }} {{ r.decidedBy | tx }} · {{ r.decidedAt }} — {{ r.decisionNote | tx }}</p>
              <button uiButton variant="danger" size="sm" type="button" (click)="actions.completeDecommission(r)">{{ 'ยืนยันการเลิกใช้' | tx }}</button>
            } @else {
              <p class="secondary">{{ STATUS[r.status].label | tx }} · {{ r.decidedBy | tx }} · {{ r.decidedAt }}@if (r.decisionNote) { — {{ r.decisionNote | tx }}}</p>
              @if (r.evidence) {<div class="sum-row"><span>{{ 'หลักฐาน' | tx }}</span><span>{{ r.evidence | tx }}</span></div>}
              @if (r.completedAt) {<p class="secondary">{{ 'จำหน่ายเมื่อ {at} โดย {by}' | tx: { at: r.completedAt, by: ((r.completedBy ?? '') | tx) } }}</p>}
            }
            <a class="link" [routerLink]="['/backoffice/assets/equipment', e.id]">{{ 'เปิดรายละเอียดอุปกรณ์' | tx }}</a>
          </div>
        } @else {
          @let picked = eq(form().equipmentId);
          <div class="panel action-card">
            <b>{{ 'ขอเลิกใช้งาน' | tx }}</b>
            <label class="field">{{ 'อุปกรณ์' | tx }}
              <select class="ui-input" (change)="set('equipmentId', $any($event.target).value)">
                @for (e of devices(); track e.id) {<option [value]="e.id" [selected]="e.id === form().equipmentId">{{ e.name | tx }} · {{ e.id }}</option>}
              </select>
            </label>
            <label class="field">{{ 'วิธี' | tx }}
              <select class="ui-input" (change)="set('method', $any($event.target).value)">
                @for (m of methods; track m) {<option [value]="m" [selected]="m === form().method">{{ METHOD[m] | tx }}</option>}
              </select>
            </label>
            <label class="field">{{ 'เหตุผล' | tx }}<textarea class="ui-input" rows="2" [value]="form().reason" (input)="set('reason', $any($event.target).value)"></textarea></label>
            <label class="field">{{ 'เครื่องทดแทน' | tx }}<input class="ui-input" [placeholder]="'(ไม่บังคับ)' | tx" [value]="form().replacement" (input)="set('replacement', $any($event.target).value)" /></label>
            <div class="section-title">{{ 'ผลเมื่อเลิกใช้' | tx }}</div>
            <ul class="checks">
              @for (i of formImpact(); track i.text) {<li [class.hard]="i.severe">{{ i.text | tx }}</li>} @empty {<li class="ok-text">{{ 'ไม่มีรายการที่ผูกอยู่' | tx }}</li>}
            </ul>
            <div class="sum-row"><span>{{ 'ต้นทุนสะสม' | tx }}</span><span>{{ fmt(costOf(picked).total) }}</span></div>
            @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="submit()">{{ 'ส่งคำขอ' | tx }}</button>
          </div>
        }
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class DecommissionComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly STATUS = DECOMMISSION_STATUS;
  protected readonly METHOD = DECOMMISSION_METHOD;
  protected readonly methods = Object.keys(DECOMMISSION_METHOD) as Decommission['method'][];
  protected readonly fmt = baht;
  protected readonly costOf = costOf;

  protected readonly selectedId = signal<string | null>('DEC-2609-001');
  protected readonly rows = computed(() => {
    const open = (r: Decommission) => Number(r.status === 'requested' || r.status === 'approved');
    return this.store.data().decommissions.slice().sort((a, b) => open(b) - open(a) || b.requestedAt.localeCompare(a.requestedAt));
  });
  protected readonly selected = computed(() => this.store.data().decommissions.find(r => r.id === this.selectedId()) ?? null);
  protected readonly devices = computed(() => active(this.store.data()));
  protected readonly form = signal<DecommissionInput>({ ...BLANK });
  protected readonly problems = computed(() => requestProblems(this.store.data(), this.form()));
  protected readonly formImpact = computed(() => decommissionImpact(this.store.data(), this.eq(this.form().equipmentId)));

  protected eq(id: string) {
    return equipmentOf(this.store.data(), id)!;
  }

  protected name(r: Decommission) {
    return this.eq(r.equipmentId).name;
  }

  protected cost(r: Decommission) {
    return costOf(this.eq(r.equipmentId));
  }

  protected impactOf(r: Decommission) {
    return decommissionImpact(this.store.data(), this.eq(r.equipmentId));
  }

  protected block(r: Decommission) {
    return decideBlock(r, this.store.userName());
  }

  protected pick(id: string) {
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected set<K extends keyof DecommissionInput>(key: K, value: DecommissionInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected submit() {
    this.actions.requestDecommission(this.form(), r => {
      this.form.set({ ...BLANK });
      this.selectedId.set(r.id);
    });
  }
}
