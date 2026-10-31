/*
 * The controlled-drug ledger (INV-CDL-01): the log of every dispense, waste and count, append-only, and the card that
 * records a new one with the witness the drug's rule asks for; a count that differs opens an investigation that someone
 * else closes one way. Thai classes per ADR-0026; the อย. export waits for the server's own (gated).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  canResolve, CONTROL_SYSTEM, controlledItems, INVESTIGATION, ledgerProblems, NOTE_MIN, openInvestigations, WASTE_REASONS, wasteProblems, wasteReason, witnessesFor,
} from '../../data/inventory';
import type { LedgerDispenseInput, WasteInput } from '../../data/inventory';
import type { CountRecord, WasteReason } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

type Tab = 'dispense' | 'waste' | 'count';
const TABS: { key: Tab; label: string }[] = [{ key: 'dispense', label: 'เบิก-จ่าย' }, { key: 'waste', label: 'ยาเสีย' }, { key: 'count', label: 'นับสต็อก' }];

@Component({
  selector: 'bo-controlled',
  imports: [TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'บัญชียาควบคุม'" [source]="'M06 · ยาเสพติดให้โทษและวัตถุออกฤทธิ์ตาม ADR-0026 · พยานเป็นช่องในรายการเบิกและยาเสีย ไม่มีการลงนามแยก · ทุกรายการ append-only'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <select class="ui-input" [attr.aria-label]="'รายการยา' | tx" (change)="drug.set($any($event.target).value)">
        <option value="" [selected]="!drug()">{{ 'ยาควบคุมทุกรายการ' | tx }}</option>
        @for (i of items(); track i.drug.id) {<option [value]="i.drug.name" [selected]="i.drug.name === drug()">{{ i.drug.name }}</option>}
      </select>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      @for (i of items(); track i.drug.id) {
        <button type="button" class="kpi" [class.warn]="i.isLow" [class.active]="drug() === i.drug.name" role="listitem" (click)="drug.set(drug() === i.drug.name ? '' : i.drug.name)">
          <span class="kpi-value">{{ i.onHand ?? '—' }} <small>{{ i.drug.unit | tx }}</small></span>
          <span class="kpi-label">{{ i.drug.name }} · {{ CONTROL[i.drug.classSystem].short | tx }} {{ i.drug.category }}{{ i.drug.requiresWitnessDispense ? ' · ' + ('เบิกต้องมีพยาน' | tx) : '' }}</span>
        </button>
      }
      <div class="kpi" [class.danger]="open().length" role="listitem"><span class="kpi-value">{{ open().length }}</span><span class="kpi-label">{{ 'การสอบสวนที่เปิดอยู่' | tx }}</span></div>
    </div>

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar">
            <div class="segmented" role="group" [attr.aria-label]="'บันทึกในบัญชี' | tx">
              @for (t of tabs; track t.key) {<button type="button" [class.active]="tab() === t.key" [attr.aria-pressed]="tab() === t.key" (click)="tab.set(t.key)">{{ t.label | tx }}</button>}
            </div>
            @if (tab() === 'count') {<label class="check"><input type="checkbox" [checked]="openOnly()" (change)="openOnly.set($any($event.target).checked)" />{{ 'เฉพาะที่สอบสวนอยู่' | tx }}</label>}
            <span class="secondary grow">{{ '{n} รายการ' | tx: { n: tab() === 'dispense' ? dispenses().length : tab() === 'waste' ? wastes().length : counts().length } }}</span>
          </div>
          <div class="table-wrap">
            @switch (tab()) {
              @case ('dispense') {
                <table class="bo-table">
                  <thead><tr><th scope="col" class="w-at">{{ 'เวลา' | tx }}</th><th scope="col">{{ 'รายการยา' | tx }}</th><th scope="col" class="w-amount num">{{ 'จำนวน' | tx }}</th><th scope="col" class="w-owner">{{ 'ผู้ทำ' | tx }}</th><th scope="col" class="w-owner">{{ 'พยาน' | tx }}</th><th scope="col">{{ 'อ้างอิง' | tx }}</th><th scope="col" class="w-ref">Lot</th></tr></thead>
                  <tbody>
                    @for (d of dispenses(); track d.id) {
                      <tr class="static">
                        <td class="num">{{ d.at }}</td>
                        <td><b>{{ d.drug }}</b><div class="secondary">{{ d.id }}</div></td>
                        <td class="num">{{ d.qty }} {{ d.unit | tx }}</td>
                        <td>{{ d.by | tx }}</td>
                        <td>{{ (d.witness ?? '—') | tx }}</td>
                        <td>{{ d.patient }}<div class="secondary">{{ d.order ?? '—' }}@if (d.encounter) { · {{ d.encounter }}}</div></td>
                        <td>{{ d.lot ?? '—' }}</td>
                      </tr>
                    } @empty {<tr class="static"><td colspan="7" class="empty">{{ 'ยังไม่มีรายการเบิก' | tx }}</td></tr>}
                  </tbody>
                </table>
              }
              @case ('waste') {
                <table class="bo-table">
                  <thead><tr><th scope="col" class="w-at">{{ 'เวลา' | tx }}</th><th scope="col">{{ 'รายการยา' | tx }}</th><th scope="col" class="w-amount num">{{ 'จำนวน' | tx }}</th><th scope="col" class="w-kind">{{ 'เหตุผล' | tx }}</th><th scope="col">{{ 'รายละเอียด' | tx }}</th><th scope="col" class="w-owner">{{ 'ผู้ทำ' | tx }}</th><th scope="col" class="w-owner">{{ 'พยาน' | tx }}</th></tr></thead>
                  <tbody>
                    @for (w of wastes(); track w.id) {
                      <tr class="static">
                        <td class="num">{{ w.at }}</td>
                        <td><b>{{ w.drug }}</b><div class="secondary">{{ w.id }}@if (w.dispenseId) { · {{ w.dispenseId }}}</div></td>
                        <td class="num">{{ w.qty }} {{ w.unit | tx }}</td>
                        <td><span class="chip" [class]="'chip ' + (reason(w.reason).fromStock ? 'warn' : 'quiet')">{{ reason(w.reason).label | tx }}</span></td>
                        <td>{{ w.detail | tx }}</td>
                        <td>{{ w.by | tx }}</td>
                        <td>{{ w.witness | tx }}</td>
                      </tr>
                    } @empty {<tr class="static"><td colspan="7" class="empty">{{ 'ยังไม่มีรายการยาเสีย' | tx }}</td></tr>}
                  </tbody>
                </table>
              }
              @case ('count') {
                <table class="bo-table counts">
                  <thead><tr><th scope="col" class="w-at">{{ 'เวลา' | tx }}</th><th scope="col">{{ 'รายการยา' | tx }}</th><th scope="col" class="w-amount num">{{ 'นับได้' | tx }}</th><th scope="col" class="w-amount num">{{ 'คาด' | tx }}</th><th scope="col" class="w-amount num">{{ 'ส่วนต่าง' | tx }}</th><th scope="col" class="w-owner">{{ 'ผู้นับ' | tx }}</th><th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th><th scope="col" class="w-actions"><span class="visually-hidden">{{ 'การทำงาน' | tx }}</span></th></tr></thead>
                  <tbody>
                    @for (c of counts(); track c.id) {
                      <tr class="static" [class.open]="c.investigation === 'open'">
                        <td class="num">{{ c.at }}</td>
                        <td><b>{{ c.drug }}</b><div class="secondary">{{ c.id }}</div></td>
                        <td class="num">{{ c.actual }} {{ c.unit | tx }}</td>
                        <td class="num">{{ c.expected }}</td>
                        <td class="num" [class.text-danger]="c.discrepancy !== 0">{{ c.discrepancy > 0 ? '+' : '' }}{{ c.discrepancy }}</td>
                        <td>{{ c.by | tx }}@if (c.resolvedBy) {<div class="secondary">{{ 'สรุปโดย' | tx }} {{ c.resolvedBy | tx }} · {{ c.resolvedAt }}</div>}</td>
                        <td><span class="chip" [class]="'chip ' + INVESTIGATION[c.investigation].cls">{{ INVESTIGATION[c.investigation].label | tx }}</span>@if (c.resolutionNotes) {<div class="secondary">{{ c.resolutionNotes | tx }}</div>}</td>
                        <td>
                          @if (c.investigation === 'open') {
                            <div class="row-actions">
                              <button uiButton size="sm" type="button" [disabled]="!canResolve(c)" [title]="canResolve(c) ? '' : ('ผู้นับสรุปผลเองไม่ได้' | tx)" (click)="actions.resolveInvestigation(c, 'resolved')">{{ 'สรุปผลสอบสวน' | tx }}</button>
                              <button uiButton variant="secondary" size="sm" type="button" [disabled]="!canResolve(c)" (click)="actions.resolveInvestigation(c, 'escalated')">{{ 'ส่งต่อระดับสูง' | tx }}</button>
                            </div>
                          }
                        </td>
                      </tr>
                    } @empty {<tr class="static"><td colspan="8" class="empty">{{ (openOnly() ? 'ไม่มีการสอบสวนที่เปิดอยู่' : 'ยังไม่มีการนับ') | tx }}</td></tr>}
                  </tbody>
                </table>
              }
            }
          </div>
        </div>
        <div class="notice">{{ 'ยังไม่มีการส่งออกบัญชีตามรูปแบบ อย. (บจ.8 / บจ.9) — รอ export จากระบบพร้อมหัวใบอนุญาต ไม่สร้างจากแถวที่เห็นในหน้านี้' | tx }}</div>
      </div>

      <!-- The action card: one form per tab, each confirmed once more before it is recorded -->
      <aside class="record-rail">
        <div class="panel action-card">
          <div class="segmented" role="group" [attr.aria-label]="'บันทึกรายการ' | tx">
            @for (t of tabs; track t.key) {<button type="button" [class.active]="form() === t.key" [attr.aria-pressed]="form() === t.key" (click)="form.set(t.key)">{{ t.label | tx }}</button>}
          </div>
          <label class="field">{{ 'รายการยา' | tx }}
            <select class="ui-input" (change)="formDrug.set($any($event.target).value)">
              <option value="" [selected]="!formDrug()">{{ '— เลือกยาควบคุม —' | tx }}</option>
              @for (i of items(); track i.drug.id) {<option [value]="i.drug.name" [selected]="i.drug.name === formDrug()">{{ i.drug.name }} · {{ i.onHand ?? '—' }} {{ i.drug.unit | tx }}</option>}
            </select>
          </label>
          @switch (form()) {
            @case ('dispense') {
              <label class="field">{{ 'ผู้ป่วย' | tx }}
                <select class="ui-input" (change)="patient.set($any($event.target).value)">
                  <option value="" [selected]="!patient()">{{ '— เลือกผู้ป่วย —' | tx }}</option>
                  @for (p of patients(); track p) {<option [value]="p" [selected]="p === patient()">{{ p }}</option>}
                </select>
              </label>
              <div class="two">
                <label class="field">Visit<input class="ui-input" [value]="encounter()" (input)="encounter.set($any($event.target).value)" placeholder="ENC-…" /></label>
                <label class="field">{{ 'คำสั่ง' | tx }}<input class="ui-input" [value]="order()" (input)="order.set($any($event.target).value)" placeholder="RX-…" /></label>
              </div>
              <label class="field">{{ 'จำนวนที่เบิก' | tx }}{{ unit() ? ' (' + (unit() | tx) + ')' : '' }}<input class="ui-input" type="number" min="0" step="any" [value]="qty()" (input)="qty.set($any($event.target).value)" /></label>
              <label class="field">{{ 'พยาน' | tx }} <span class="muted">{{ (needsWitness() ? '(ยานี้บังคับ)' : '(ตามกฎของยา)') | tx }}</span>
                <select class="ui-input" (change)="witness.set($any($event.target).value)">
                  <option value="" [selected]="!witness()">{{ '— ไม่มี —' | tx }}</option>
                  @for (w of witnesses(); track w) {<option [value]="w" [selected]="w === witness()">{{ w | tx }}</option>}
                </select>
              </label>
              @if (dispenseProblems().length) {<ul class="problems">@for (p of dispenseProblems(); track p) {<li>{{ p | tx }}</li>}</ul>}
              <button uiButton size="sm" type="button" [disabled]="dispenseProblems().length > 0" (click)="submitDispense()">{{ 'บันทึกการเบิก' | tx }}</button>
            }
            @case ('waste') {
              <label class="field">{{ 'จำนวน' | tx }}{{ unit() ? ' (' + (unit() | tx) + ')' : '' }}<input class="ui-input" type="number" min="0" step="any" [value]="qty()" (input)="qty.set($any($event.target).value)" /></label>
              <label class="field">{{ 'เหตุผล' | tx }}
                <select class="ui-input" (change)="wasteKind.set($any($event.target).value)">
                  @for (r of reasons; track r.value) {<option [value]="r.value" [selected]="r.value === wasteKind()">{{ r.label | tx }}{{ r.fromStock ? ' · ' + ('ตัดจากคลัง' | tx) : '' }}</option>}
                </select>
              </label>
              <label class="field">{{ 'รายการเบิกที่เกี่ยวข้อง' | tx }} <span class="muted">{{ '(ไม่บังคับ)' | tx }}</span>
                <select class="ui-input" (change)="dispenseId.set($any($event.target).value)">
                  <option value="" [selected]="!dispenseId()">{{ '— ไม่มี —' | tx }}</option>
                  @for (d of drugDispenses(); track d.id) {<option [value]="d.id" [selected]="d.id === dispenseId()">{{ d.id }} · {{ d.patient }} · {{ d.qty }} {{ d.unit | tx }}</option>}
                </select>
              </label>
              <label class="field">{{ 'รายละเอียด (≥{n} ตัวอักษร)' | tx: { n: NOTE_MIN } }}<textarea class="ui-input" rows="2" [value]="detail()" (input)="detail.set($any($event.target).value)"></textarea></label>
              <label class="field">{{ 'พยาน' | tx }} <span class="muted">{{ '(บังคับเสมอ)' | tx }}</span>
                <select class="ui-input" (change)="witness.set($any($event.target).value)">
                  <option value="" [selected]="!witness()">{{ '— เลือกพยาน —' | tx }}</option>
                  @for (w of witnesses(); track w) {<option [value]="w" [selected]="w === witness()">{{ w | tx }}</option>}
                </select>
              </label>
              @if (wasteProblemList().length) {<ul class="problems">@for (p of wasteProblemList(); track p) {<li>{{ p | tx }}</li>}</ul>}
              <button uiButton size="sm" type="button" [disabled]="wasteProblemList().length > 0" (click)="submitWaste()">{{ 'บันทึกยาเสีย' | tx }}</button>
            }
            @case ('count') {
              <label class="field">{{ 'จำนวนที่นับได้' | tx }}{{ unit() ? ' (' + (unit() | tx) + ')' : '' }}<input class="ui-input" type="number" min="0" step="any" [value]="qty()" (input)="qty.set($any($event.target).value)" /></label>
              <p class="secondary">{{ 'กรอกเฉพาะที่นับได้ · จำนวนที่คาดและส่วนต่างเป็นของระบบ แสดงหลังบันทึก · ต่างกันจะเปิดการสอบสวนทันที' | tx }}</p>
              <button uiButton size="sm" type="button" [disabled]="!formDrug() || !(qty() !== '' && +qty() >= 0)" (click)="submitCount()">{{ 'บันทึกการนับ' | tx }}</button>
            }
          }
          <p class="secondary">{{ 'ผู้ทำรายการ: {name}' | tx: { name: store.userName() } }}</p>
        </div>
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class ControlledComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly route = inject(ActivatedRoute);
  protected readonly CONTROL = CONTROL_SYSTEM;
  protected readonly INVESTIGATION = INVESTIGATION;
  protected readonly NOTE_MIN = NOTE_MIN;
  protected readonly tabs = TABS;
  protected readonly reasons = WASTE_REASONS;
  protected readonly reason = wasteReason;

  protected readonly items = computed(() => controlledItems(this.store.stock()));
  protected readonly open = computed(() => openInvestigations(this.store.data()));
  protected readonly drug = signal(this.route.snapshot.queryParamMap.get('drug') ?? '');
  protected readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('tab') as Tab | null) ?? 'dispense');
  protected readonly openOnly = signal(this.route.snapshot.queryParamMap.get('tab') === 'count');
  protected readonly dispenses = computed(() => this.store.data().ledgerDispenses.filter(d => !this.drug() || d.drug === this.drug()));
  protected readonly wastes = computed(() => this.store.data().wastes.filter(w => !this.drug() || w.drug === this.drug()));
  protected readonly counts = computed(() => this.store.data().counts.filter(c => (!this.drug() || c.drug === this.drug()) && (!this.openOnly() || c.investigation === 'open')));

  /* The action card */
  protected readonly form = signal<Tab>('dispense');
  protected readonly formDrug = signal(this.drug());
  protected readonly patient = signal('');
  protected readonly encounter = signal('');
  protected readonly order = signal('');
  protected readonly qty = signal('');
  protected readonly witness = signal('');
  protected readonly wasteKind = signal<WasteReason>('partial_dose');
  protected readonly detail = signal('');
  protected readonly dispenseId = signal('');
  protected readonly patients = computed(() => this.store.clinic.data().patients.map(p => `${p.pet} · ${this.store.clinic.data().owners[p.ownerKey]?.name ?? p.ownerKey}`));
  protected readonly witnesses = computed(() => witnessesFor(this.store.userName()));
  protected readonly selectedItem = computed(() => this.items().find(i => i.drug.name === this.formDrug()) ?? null);
  protected readonly unit = computed(() => this.selectedItem()?.drug.unit ?? '');
  protected readonly needsWitness = computed(() => !!this.selectedItem()?.drug.requiresWitnessDispense);
  protected readonly drugDispenses = computed(() => this.store.data().ledgerDispenses.filter(d => d.drug === this.formDrug()));
  protected readonly dispenseInput = computed<LedgerDispenseInput>(() => ({ drug: this.formDrug(), patient: this.patient(), encounter: this.encounter(), order: this.order(), qty: Number(this.qty()), witness: this.witness() || undefined }));
  protected readonly dispenseProblems = computed(() => Object.values(ledgerProblems(this.store.data(), this.dispenseInput(), this.store.userName(), this.selectedItem()?.onHand ?? null)) as string[]);
  protected readonly wasteInput = computed<WasteInput>(() => ({ drug: this.formDrug(), qty: Number(this.qty()), reason: this.wasteKind(), detail: this.detail(), witness: this.witness(), dispenseId: this.dispenseId() || undefined }));
  protected readonly wasteProblemList = computed(() => Object.values(wasteProblems(this.wasteInput(), this.store.userName())) as string[]);

  protected canResolve(c: CountRecord) {
    return canResolve(c, this.store.userName());
  }

  protected submitDispense() {
    this.actions.ledgerDispense(this.dispenseInput(), () => { this.tab.set('dispense'); this.clear(); });
  }

  protected submitWaste() {
    this.actions.recordWaste(this.wasteInput(), () => { this.tab.set('waste'); this.clear(); });
  }

  protected submitCount() {
    this.actions.recordCount(this.formDrug(), Number(this.qty()), () => { this.tab.set('count'); this.openOnly.set(false); this.clear(); });
  }

  private clear() {
    this.patient.set(''); this.encounter.set(''); this.order.set(''); this.qty.set(''); this.witness.set(''); this.detail.set(''); this.dispenseId.set('');
  }
}
