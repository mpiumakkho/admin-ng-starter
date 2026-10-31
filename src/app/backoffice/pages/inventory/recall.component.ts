/* Drug recall: one lot traced to the shelf and to the patients it reached, and what was done about it (INV-RCL-01; the trace is a gated design) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { allLots, LOT_STATE, RECALL_NEXT, RECALL_SEVERITY, RECALL_STATUS, traceLot } from '../../data/inventory';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-recall',
  imports: [TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'การเรียกคืนยา'" [source]="'M06 · ตาม lot ไปยังคงคลังและผู้ป่วยที่ได้รับ · การเรียกคืนเปลี่ยนสถานะ lot และบันทึกหลักฐาน ไม่แก้รายการจ่ายยา · traceback API ยังไม่อนุมัติ (GATED) — ข้อมูลตัวอย่าง'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <select class="ui-input" [attr.aria-label]="'เลือกยา/Lot' | tx" (change)="lot.set($any($event.target).value)">
        <option value="" [selected]="!lot()">{{ '— เลือกยา/Lot —' | tx }}</option>
        @for (l of lots(); track l.lot) {<option [value]="l.lot" [selected]="l.lot === lot()">{{ l.drug }} · {{ l.lot }}{{ l.recall ? ' · ' + l.recall.id : '' }}</option>}
      </select>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      @for (r of recalls(); track r.id) {
        <button type="button" class="kpi" [class]="'kpi ' + (r.status === 'closed' ? '' : RECALL_STATUS[r.status].cls)" [class.active]="lot() === r.lot" role="listitem" (click)="lot.set(r.lot)">
          <span class="kpi-value">{{ r.id }}</span><span class="kpi-label">{{ r.drug }} · {{ r.lot }} · {{ RECALL_STATUS[r.status].label | tx }}</span>
        </button>
      } @empty {
        <div class="kpi" role="listitem"><span class="kpi-value">0</span><span class="kpi-label">{{ 'ยังไม่มีการเรียกคืน' | tx }}</span></div>
      }
    </div>

    @if (lot()) {
      @let t = trace();
      <div class="record">
        <div class="record-main">
          <div class="panel">
            <div class="filter-bar">
              <b>{{ 'รายการที่ได้รับผลกระทบ' | tx }}</b>
              <span class="secondary grow">{{ '{n} รายการ · คงคลัง {a} · จ่ายแล้ว {b}' | tx: { n: t.onHand.length + t.dispensed.length, a: t.onHand.length, b: t.dispensed.length } }}</span>
            </div>
            @if (t.untraced) {<div class="notice warn">{{ 'ผลการ trace อาจยังไม่ครบ — {n} รายการจ่ายของยานี้ไม่ได้ผูก lot (dispense ยังไม่บันทึก lot ตาม slice ปัจจุบัน)' | tx: { n: t.untraced } }}</div>}
            <div class="table-wrap">
              <table class="bo-table">
                <thead>
                  <tr>
                    <th scope="col" class="w-kind">{{ 'ประเภทผลกระทบ' | tx }}</th>
                    <th scope="col" class="w-ref">Lot</th>
                    <th scope="col">{{ 'ตำแหน่ง / ผู้ป่วย' | tx }}</th>
                    <th scope="col" class="w-amount num">{{ 'จำนวน' | tx }}</th>
                    <th scope="col" class="w-ref">{{ 'อ้างอิง' | tx }}</th>
                    <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of t.onHand; track l.lot + l.location) {
                    <tr class="static">
                      <td><span class="chip info">{{ 'คงคลัง' | tx }}</span></td>
                      <td><b>{{ l.lot }}</b></td>
                      <td>{{ l.location | tx }}<div class="secondary">{{ l.drug }} · {{ 'หมดอายุ' | tx }} {{ l.expiry }}</div></td>
                      <td class="num">{{ l.qty ?? '—' }} {{ l.unit | tx }}</td>
                      <td>—</td>
                      <td><span class="chip" [class]="'chip ' + LOT_STATE[l.state].cls">{{ LOT_STATE[l.state].label | tx }}</span>@if (held()) {<div class="secondary">{{ 'กันไว้แล้ว' | tx }}</div>}</td>
                    </tr>
                  }
                  @for (d of t.dispensed; track d.id) {
                    <tr class="static">
                      <td><span class="chip" [class]="'chip ' + (d.administered ? 'danger' : 'warn')">{{ (d.administered ? 'ให้ยาแล้ว' : 'จ่ายแล้ว') | tx }}</span></td>
                      <td>{{ d.lot }}</td>
                      <td>{{ d.patient }}<div class="secondary">{{ d.at }} · {{ d.by | tx }}</div></td>
                      <td class="num">{{ d.qty | tx }}@if (d.administered) {<div class="secondary">{{ 'ให้แล้ว' | tx }} {{ d.administered | tx }}</div>}</td>
                      <td>{{ d.order ?? d.id }}</td>
                      <td><span class="chip quiet">{{ 'ติดตามทางคลินิก' | tx }}</span></td>
                    </tr>
                  }
                  @if (!t.onHand.length && !t.dispensed.length) {
                    <tr class="static"><td colspan="6" class="empty">{{ 'ไม่พบ lot นี้ในคลังหรือในรายการจ่าย' | tx }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          @if (recall(); as r) {
            <div class="panel">
              <div class="filter-bar"><b>{{ 'ลำดับเหตุการณ์' | tx }}</b><span class="secondary grow">{{ r.id }} · {{ 'เปิดโดย' | tx }} {{ r.openedBy | tx }} · {{ r.openedAt }}</span></div>
              <div class="timeline">
                @for (u of r.updates; track $index) {
                  <div class="tl"><span class="chip" [class]="'chip ' + RECALL_STATUS[u[2]].cls">{{ RECALL_STATUS[u[2]].label | tx }}</span>{{ u[0] }} · {{ u[1] | tx }} — {{ u[3] | tx }}</div>
                }
              </div>
            </div>
          }
        </div>

        <aside class="record-rail">
          <div class="panel actions">
            @if (recall(); as r) {
              <b>{{ r.id }} <span class="chip" [class]="'chip ' + RECALL_STATUS[r.status].cls">{{ RECALL_STATUS[r.status].label | tx }}</span></b>
              <dl class="data-grid">
                <dt>{{ 'รายการยา' | tx }}</dt><dd>{{ r.drug }} · {{ r.lot }}</dd>
                <dt>{{ 'ระดับ' | tx }}</dt><dd>{{ r.severity ? (SEVERITY[r.severity] | tx) : ('ยังไม่ระบุ' | tx) }}</dd>
                <dt>{{ 'เหตุผล' | tx }}</dt><dd>{{ r.reason | tx }}</dd>
                <dt>{{ 'ผู้รับผิดชอบ' | tx }}</dt><dd>{{ r.openedBy | tx }}</dd>
              </dl>
              @if (NEXT[r.status].length) {<button uiButton size="sm" type="button" (click)="actions.updateRecall(r)">{{ 'อัปเดตการเรียกคืน' | tx }}</button>}
              @if (t.onHand.length && !held() && r.status !== 'closed') {<button uiButton variant="secondary" size="sm" type="button" (click)="actions.quarantine(lot(), r)">{{ 'กันของคงคลัง' | tx }}</button>}
              @if (held()) {<p class="secondary">{{ 'lot นี้ถูกกันไว้ — ห้องยาจ่ายจาก lot นี้ไม่ได้' | tx }}</p>}
            } @else {
              <b>{{ 'ยังไม่มีการเรียกคืน lot นี้' | tx }}</b>
              <p class="secondary">{{ 'เปิดการเรียกคืนเมื่อมีประกาศจากผู้ผลิตหรือ อย. · ผู้อำนวยการรับผิดชอบการอนุมัติ' | tx }}</p>
              @if (t.onHand.length || t.dispensed.length) {<button uiButton size="sm" type="button" (click)="actions.openRecall(t.onHand[0]?.drug ?? t.dispensed[0].drug, lot())">{{ 'เริ่มการเรียกคืน' | tx }}</button>}
            }
          </div>
          <div class="panel actions">
            <b>{{ 'หลักฐาน' | tx }}</b>
            <p class="secondary">{{ 'การแจ้งเจ้าของทำผ่านโมดูลการสื่อสารตามความยินยอม ไม่ใช่หน้านี้' | tx }}</p>
            <p class="secondary">{{ 'ยังไม่มีการส่งออกรายงานการเรียกคืน — รอ export จากระบบพร้อมสิทธิ์และการปกปิดข้อมูล' | tx }}</p>
          </div>
        </aside>
      </div>
    } @else {
      <div class="panel"><div class="prompt">{{ 'เลือกยา/Lot เพื่อดูรายการที่ได้รับผลกระทบ' | tx }}<div class="secondary">{{ 'หรือกดการเรียกคืนที่เปิดอยู่ด้านบน' | tx }}</div></div></div>
    }
  `,
  host: { class: 'page' },
})
export class RecallComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly route = inject(ActivatedRoute);
  protected readonly RECALL_STATUS = RECALL_STATUS;
  protected readonly SEVERITY = RECALL_SEVERITY;
  protected readonly NEXT = RECALL_NEXT;
  protected readonly LOT_STATE = LOT_STATE;

  protected readonly lot = signal(this.route.snapshot.queryParamMap.get('lot') ?? '');
  protected readonly lots = computed(() => allLots(this.store.stock()).sort((a, b) => a.drug.localeCompare(b.drug) || a.lot.localeCompare(b.lot)));
  protected readonly recalls = computed(() => this.store.data().recalls);
  protected readonly recall = computed(() => this.recalls().find(r => r.lot === this.lot() && r.status !== 'closed') ?? this.recalls().find(r => r.lot === this.lot()) ?? null);
  protected readonly trace = computed(() => traceLot(this.store.clinic.data(), this.store.data(), this.lot()));
  protected readonly held = computed(() => !!this.store.clinic.data().holds?.[this.lot()]);
}
