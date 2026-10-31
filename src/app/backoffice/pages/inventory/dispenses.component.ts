/* Dispense history: what left the pharmacy and the ledger, asked for one patient or one drug at a time, never for everyone (INV-DSP-01) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { dispenseHistory, dispenseScopes, wasteReason } from '../../data/inventory';
import type { DispenseRow } from '../../data/inventory';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

const SOURCE: Record<DispenseRow['source'], { label: string; cls: string }> = {
  pharmacy: { label: 'ห้องยา', cls: 'info' },
  ward: { label: 'วอร์ด', cls: 'quiet' },
  ledger: { label: 'บัญชียาควบคุม', cls: 'warn' },
};

@Component({
  selector: 'bo-dispenses',
  imports: [RouterLink, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'ประวัติการจ่ายยา'" [source]="'M06 · ค้นได้ตามผู้ป่วยหรือตามรายการยาเท่านั้น ไม่มีมุมมองทั้งหมด · รายการเป็น append-only'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <div class="segmented" role="group" [attr.aria-label]="'ขอบเขต' | tx">
            <button type="button" [class.active]="scope() === 'patient'" [attr.aria-pressed]="scope() === 'patient'" (click)="setScope('patient')">{{ 'ตามผู้ป่วย' | tx }}</button>
            <button type="button" [class.active]="scope() === 'drug'" [attr.aria-pressed]="scope() === 'drug'" (click)="setScope('drug')">{{ 'ตามรายการยา' | tx }}</button>
          </div>
          <select class="ui-input" [attr.aria-label]="(scope() === 'patient' ? 'ผู้ป่วย' : 'รายการยา') | tx" (change)="key.set($any($event.target).value)">
            <option value="" [selected]="!key()">{{ (scope() === 'patient' ? '— เลือกผู้ป่วย —' : '— เลือกรายการยา —') | tx }}</option>
            @for (o of options(); track o) {<option [value]="o" [selected]="o === key()">{{ o }}</option>}
          </select>
          <label class="date-field"><span class="visually-hidden">{{ 'ตั้งแต่' | tx }}</span><input class="ui-input" type="date" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
          <span class="secondary">–</span>
          <label class="date-field"><span class="visually-hidden">{{ 'ถึง' | tx }}</span><input class="ui-input" type="date" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
          <span class="secondary grow">{{ key() ? ('{n} รายการ · เวลาตามเขตเวลาของระบบ' | tx: { n: rows().length }) : '' }}</span>
        </div>
        @if (!key()) {
          <div class="prompt">{{ 'เลือกผู้ป่วยหรือรายการยาก่อนค้นหา' | tx }}<div class="secondary">{{ 'ประวัติการจ่ายยาเป็นข้อมูลคุ้มครอง จึงเปิดได้ทีละขอบเขตตามสิทธิ์' | tx }}</div></div>
        } @else {
          <div class="table-wrap">
            <table class="bo-table">
              <thead>
                <tr>
                  <th scope="col" class="w-at">{{ 'เวลา' | tx }}</th>
                  <th scope="col">{{ scope() === 'patient' ? ('รายการยา' | tx) : ('ผู้ป่วย' | tx) }}</th>
                  <th scope="col" class="w-amount num">{{ 'เบิก/ให้จริง' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'ผู้จ่าย' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'พยาน' | tx }}</th>
                  <th scope="col" class="w-ref">{{ 'คำสั่ง / visit' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'ยาเสีย' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'ที่มา' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr tabindex="0" [class.selected]="r.id === selectedId()" [attr.aria-selected]="r.id === selectedId()" (click)="pick(r)" (keydown.enter)="pick(r)">
                    <td class="num">{{ r.at }}</td>
                    <td><b>{{ scope() === 'patient' ? r.drug : r.patient }}</b><div class="secondary">{{ r.id }}</div></td>
                    <td class="num">{{ r.qty | tx }}@if (r.administered) {<div class="secondary">{{ r.administered | tx }}</div>}</td>
                    <td>{{ r.by | tx }}</td>
                    <td>{{ (r.witness ?? '—') | tx }}</td>
                    <td>{{ r.order ?? '—' }}@if (r.encounter) {<div class="secondary">{{ r.encounter }}</div>}</td>
                    <td>@if (r.waste; as w) {<span class="chip warn">{{ w.qty }} {{ w.unit | tx }}</span>} @else {<span class="muted">—</span>}</td>
                    <td><span class="chip" [class]="'chip ' + SOURCE[r.source].cls">{{ SOURCE[r.source].label | tx }}</span></td>
                  </tr>
                } @empty {
                  <tr class="static"><td colspan="8" class="empty">{{ 'ไม่มีการจ่ายยาในขอบเขตที่เลือก' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      @if (selected(); as r) {
        <bo-drawer [heading]="r.drug" [sub]="r.id + ' · ' + r.at" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'ผู้ป่วย' | tx }}</dt><dd>{{ r.patient }}</dd>
            <dt>{{ 'เบิก' | tx }}</dt><dd>{{ r.qty | tx }}</dd>
            @if (r.administered) {<dt>{{ 'ให้จริง' | tx }}</dt><dd>{{ r.administered | tx }} · {{ 'ตามใบให้ยาของวอร์ด' | tx }}</dd>}
            <dt>{{ 'ผู้จ่าย' | tx }}</dt><dd>{{ r.by | tx }}</dd>
            <dt>{{ 'พยาน' | tx }}</dt><dd>{{ (r.witness ?? '—') | tx }}</dd>
            <dt>{{ 'คำสั่ง' | tx }}</dt><dd>{{ r.order ?? '—' }}@if (r.encounter) { · {{ r.encounter }}}</dd>
            <dt>Lot</dt><dd>{{ r.lot ?? ('ยังไม่ผูก lot (GATED)' | tx) }}</dd>
            <dt>{{ 'ที่มา' | tx }}</dt><dd>{{ SOURCE[r.source].label | tx }}</dd>
            @if (r.waste; as w) {<dt>{{ 'ยาเสีย' | tx }}</dt><dd>{{ w.id }} · {{ w.qty }} {{ w.unit | tx }} · {{ reason(w.reason) | tx }}</dd>}
          </dl>
          <p class="secondary">{{ 'รายการจ่ายแก้ ลบ หรือกลับรายการจากหน้านี้ไม่ได้ · การคืนเข้าคลังผ่าน workflow ของ M06' | tx }}</p>
          <ng-container foot>
            @if (r.source === 'ledger' || r.witness) {<a class="link" routerLink="/backoffice/inventory/controlled" [queryParams]="{ drug: r.drug }">{{ 'เปิดบัญชียาควบคุม' | tx }}</a>}
            <span class="grow"></span>
            <button uiButton size="sm" type="button" (click)="actions.openItem(r.drug)">{{ 'เปิดรายการยา' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class DispensesComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly route = inject(ActivatedRoute);
  protected readonly SOURCE = SOURCE;

  protected readonly scope = signal<'patient' | 'drug'>(this.route.snapshot.queryParamMap.get('drug') ? 'drug' : 'patient');
  protected readonly key = signal(this.route.snapshot.queryParamMap.get('drug') ?? this.route.snapshot.queryParamMap.get('patient') ?? '');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly selectedId = signal<string | null>(null);

  protected readonly scopes = computed(() => dispenseScopes(this.store.clinic.data(), this.store.data()));
  protected readonly options = computed(() => (this.scope() === 'patient' ? this.scopes().patients : this.scopes().drugs));
  protected readonly rows = computed(() => dispenseHistory(this.store.clinic.data(), this.store.data(), { [this.scope()]: this.key(), from: this.from(), to: this.to() }));
  protected readonly selected = computed(() => this.rows().find(r => r.id === this.selectedId()) ?? null);

  protected setScope(scope: 'patient' | 'drug') {
    this.scope.set(scope);
    this.key.set('');
    this.selectedId.set(null);
  }

  protected pick(r: DispenseRow) {
    this.selectedId.set(this.selectedId() === r.id ? null : r.id);
  }

  protected reason = (value: Parameters<typeof wasteReason>[0]) => wasteReason(value).label;
}
