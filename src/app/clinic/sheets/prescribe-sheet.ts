/* Writing a prescription with the drug safety check beside it (seph1-fe screens/CDS.tsx, Chart.tsx LiveOrderEntry) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck, lucideTriangleAlert } from '@ng-icons/lucide';

import { UiButton } from '../../user-management/ui';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { checkPrescription, overrideNeeded, parseUnits, quantityFor } from '../data/cds';
import { FORMULARY, REASON_MIN, RX_DAYS, RX_FREQS, VETS } from '../data/model';
import { inWard, marTimes } from '../data/ward';
import { TxPipe } from '../i18n/clinic-i18n';
import { SheetHead } from './sheet-head';

const round = (n: number) => String(Math.round(n * 100) / 100);

/**
 * A new prescription for the selected patient. The dose starts at the middle of the range for the pet's species and
 * weight; every change runs the safety check again. A finding that is major needs a reason to go ahead, a block also a
 * senior vet's sign-off; both go on the prescription for the pharmacy to see.
 */
@Component({
  selector: 'cl-prescribe-sheet',
  imports: [TxPipe, UiButton, SheetHead, NgIcon],
  template: `
    @let p = store.selected();
    @let c = check();
    <cl-sheet-head [heading]="('สั่งยาใหม่' | tx) + ' · ' + p.pet"
      [sub]="(p.species | tx) + ' · ' + p.breed + ' · ' + p.weight + ' · ' + ('ชั่งเมื่อ' | tx) + ' ' + p.weightAt" />
    <div class="sheet-body">
      @if (closed()) {
        <div class="safety"><b><ng-icon [svg]="icons.alert" aria-hidden="true" />{{ 'ปิด encounter แล้ว — สั่งยาเพิ่มไม่ได้' | tx }}</b></div>
      }
      <div class="section">
        <div class="form-12">
          <div class="field full">
            <label for="rx-drug">{{ 'ยา' | tx }}</label>
            <select class="ui-input" id="rx-drug" (change)="pick($any($event.target).value)">
              <option value="" [selected]="!drugName()">{{ 'เลือกยา' | tx }}</option>
              @for (d of formulary; track d.name) {
                <option [value]="d.name" [selected]="d.name === drugName()">{{ d.name }}</option>
              }
            </select>
          </div>
          @if (drug(); as d) {
            <div class="field">
              <label for="rx-dose">{{ 'ขนาดต่อครั้ง ({unit})' | tx: { unit: (d.unit | tx) } }}</label>
              <input class="ui-input" id="rx-dose" [value]="doseText()" (input)="doseText.set($any($event.target).value)"
                [placeholder]="'เช่น 1 หรือ 1/2' | tx" inputmode="decimal" />
            </div>
            <div class="field">
              <label for="rx-route">{{ 'วิธีให้' | tx }}</label>
              <input class="ui-input" id="rx-route" [value]="d.route | tx" readonly />
            </div>
            @if (c.calc.range && c.calc.mg && c.calc.units) {
              <div class="dose-calc full" role="status">
                <div>
                  {{ 'ขนาดอ้างอิง ({0}): {1}–{2} mg/kg' | tx: { '0': (p.species | tx), '1': c.calc.range[0], '2': c.calc.range[1] } }}
                  · {{ '{0} kg = {1}–{2} mg = {3}–{4} {5}' | tx: { '0': c.calc.kg ?? '', '1': r(c.calc.mg[0]), '2': r(c.calc.mg[1]), '3': r(c.calc.units[0]), '4': r(c.calc.units[1]), '5': (d.unit | tx) } }}
                </div>
                @if (c.calc.askedMgKg !== null) {
                  <div>
                    {{ 'ที่สั่ง: {0} mg = {1} mg/kg' | tx: { '0': r(c.calc.askedMg ?? 0), '1': r(c.calc.askedMgKg) } }}
                    <span class="chip" [class]="'chip ' + doseTone()">{{ doseLabel() | tx }}</span>
                  </div>
                }
                @if (c.calc.suggested !== null && c.calc.suggested !== units()) {
                  <button type="button" class="link" (click)="doseText.set(r(c.calc.suggested))">{{ 'ใช้ขนาดแนะนำ {0} {1}' | tx: { '0': r(c.calc.suggested), '1': (d.unit | tx) } }}</button>
                }
              </div>
            }
            <div class="field short">
              <label for="rx-freq">{{ 'ความถี่' | tx }}</label>
              <select class="ui-input" id="rx-freq" (change)="freq.set($any($event.target).value)">
                @for (f of freqs; track f) {<option [value]="f" [selected]="f === freq()">{{ f | tx }}</option>}
              </select>
            </div>
            <div class="field short">
              <label for="rx-days">{{ 'ระยะเวลา' | tx }}</label>
              <select class="ui-input" id="rx-days" (change)="days.set($any($event.target).value)">
                @for (x of dayOptions; track x) {<option [value]="x" [selected]="x === days()">{{ x | tx }}</option>}
              </select>
            </div>
            <div class="field">
              <label for="rx-qty">{{ 'จำนวนจ่าย' | tx }}</label>
              <input class="ui-input" id="rx-qty" [value]="qtyText() || (autoQty() | tx)" (input)="qtyText.set($any($event.target).value)" [placeholder]="'เช่น 10 เม็ด' | tx" />
            </div>
            <div class="field full">
              <label for="rx-advice">{{ 'คำแนะนำสำหรับเจ้าของ' | tx }} <span class="muted">{{ '(ไม่บังคับ)' | tx }}</span></label>
              <textarea class="ui-input" id="rx-advice" rows="2" [value]="advice()" (input)="advice.set($any($event.target).value)"></textarea>
            </div>
            @if (admitted()) {
              <label class="check full">
                <input type="checkbox" [checked]="inpatient()" (change)="inpatient.set($any($event.target).checked)" />
                {{ 'ให้ในโรงพยาบาล — ขึ้นตารางให้ยาของวอร์ด เวลา {0}' | tx: { '0': marTimes(freq()).join(', ') } }}
              </label>
            }
          }
        </div>
      </div>

      @if (drug()) {
        <div class="section" aria-live="polite">
          <div class="section-title"><h3>{{ 'ผลตรวจความปลอดภัยของยา (CDS)' | tx }}</h3></div>
          @for (f of c.findings; track $index) {
            <div class="safety" [class.warn]="f.severity === 'minor'">
              <b><ng-icon [svg]="icons.alert" aria-hidden="true" />{{ severityLabel[f.severity] | tx }}</b>
              <div class="secondary">{{ f.text | tx: f.vars }}</div>
            </div>
          } @empty {
            <div class="safety ok"><b><ng-icon [svg]="icons.check" aria-hidden="true" />{{ 'ผ่านการตรวจ CDS' | tx }}</b></div>
          }
          @if (need() !== 'none') {
            <div class="form-12 override">
              <div class="field full">
                <label for="rx-reason">{{ 'เหตุผลที่ override (≥{n} ตัวอักษร)' | tx: { n: reasonMin } }}</label>
                <textarea class="ui-input" id="rx-reason" rows="2" [value]="reason()" (input)="reason.set($any($event.target).value)"
                  [placeholder]="'เช่น ประโยชน์มากกว่าความเสี่ยง เจ้าของรับทราบแล้ว' | tx"></textarea>
              </div>
              @if (need() === 'senior') {
                <div class="field">
                  <label for="rx-senior">{{ 'สัตวแพทย์อาวุโสผู้อนุมัติ' | tx }}</label>
                  <select class="ui-input" id="rx-senior" (change)="senior.set($any($event.target).value)">
                    <option value="" [selected]="!senior()">{{ 'เลือกผู้อนุมัติ' | tx }}</option>
                    @for (v of seniors(); track v) {<option [value]="v" [selected]="v === senior()">{{ v | tx }}</option>}
                  </select>
                </div>
                <label class="check full">
                  <input type="checkbox" [checked]="approved()" (change)="approved.set($any($event.target).checked)" />
                  {{ 'ผู้อนุมัติตรวจทานผลตรวจ CDS และยืนยันการสั่งยานี้แล้ว' | tx }}
                </label>
              }
            </div>
          }
        </div>
      }
    </div>
    <div class="sheet-foot">
      <button uiButton variant="secondary" size="sm" type="button" (click)="ui.closeSheet()">{{ 'ยกเลิก' | tx }}</button>
      <span class="grow"></span>
      <button uiButton size="sm" type="button" [variant]="need() === 'none' ? 'primary' : 'danger'" [disabled]="!valid()" (click)="submit()">
        {{ (need() === 'none' ? 'สั่งยา' : 'Override และสั่งยา') | tx }}
      </button>
    </div>
  `,
  host: { class: 'contents' },
})
export class PrescribeSheet {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly icons = { alert: lucideTriangleAlert, check: lucideCheck };
  protected readonly formulary = FORMULARY;
  protected readonly freqs = RX_FREQS;
  protected readonly dayOptions = RX_DAYS;
  protected readonly reasonMin = REASON_MIN;
  protected readonly r = round;
  protected readonly severityLabel = { block: 'ห้ามใช้ · ต้องให้สัตวแพทย์อาวุโสอนุมัติ', major: 'คำเตือนสำคัญ · ต้องระบุเหตุผล', minor: 'ข้อควรระวัง' };

  protected readonly drugName = signal('');
  protected readonly doseText = signal('');
  protected readonly freq = signal('วันละ 2 ครั้ง');
  protected readonly days = signal('5 วัน');
  /** What was typed into the quantity; empty follows the dose */
  protected readonly qtyText = signal('');
  protected readonly advice = signal('');
  protected readonly reason = signal('');
  protected readonly senior = signal('');
  protected readonly approved = signal(false);
  /** For a pet in a bed: the ward gives it, from the treatment sheet */
  protected readonly inpatient = signal(true);
  protected readonly admitted = computed(() => inWard(this.store.selected()));
  protected readonly marTimes = marTimes;

  protected readonly drug = computed(() => FORMULARY.find(d => d.name === this.drugName()));
  protected readonly units = computed(() => parseUnits(this.doseText()));
  protected readonly closed = computed(() => !!this.store.noteFor(this.store.selected()).closedAt);
  /** Drugs written for this pet today, which a new one may clash with */
  private readonly current = computed(() => {
    const p = this.store.selected();
    return this.store.data().prescriptions.filter(rx => rx.pet === p.pet && rx.owner === this.store.owner(p).name).map(rx => rx.drug);
  });
  protected readonly check = computed(() => {
    const drug = this.drug();
    return drug
      ? checkPrescription(this.store.selected(), drug, this.units(), this.current())
      : { calc: { kg: null, range: null, mg: null, units: null, askedMg: null, askedMgKg: null, suggested: null }, findings: [], worst: null };
  });
  protected readonly need = computed(() => overrideNeeded(this.check().worst));
  /** The quantity worked out from the dose, how often and for how long; what is typed takes its place */
  protected readonly autoQty = computed(() => {
    const drug = this.drug();
    const units = this.units();
    return drug && units !== null ? quantityFor(units, this.freq(), this.days(), drug.unit) : '';
  });
  protected readonly qty = computed(() => this.qtyText() || this.autoQty());
  protected readonly seniors = computed(() => VETS.filter(v => v !== this.store.userName()));

  protected readonly doseTone = computed(() => {
    const dose = this.check().findings.find(f => f.kind === 'dose');
    return !dose ? 'ok' : dose.severity === 'minor' ? 'warn' : 'danger';
  });
  protected readonly doseLabel = computed(() => {
    const dose = this.check().findings.find(f => f.kind === 'dose');
    return !dose ? 'อยู่ในช่วงอ้างอิง' : dose.severity === 'minor' ? 'ต่ำกว่าช่วง' : dose.severity === 'major' ? 'สูงกว่าช่วง' : 'สูงเกิน 2 เท่า';
  });

  protected readonly valid = computed(() => {
    const drug = this.drug();
    const need = this.need();
    return !!drug && !this.closed() && (this.units() !== null || (drug.unit === 'หยด' && !!this.doseText().trim())) && !!this.qty().trim()
      && (need === 'none' || this.reason().trim().length >= REASON_MIN)
      && (need !== 'senior' || (!!this.senior() && this.approved()));
  });

  /** A new drug starts at the middle of its range for this pet */
  protected pick(name: string) {
    this.drugName.set(name);
    this.qtyText.set('');
    const drug = this.drug();
    const suggested = drug ? checkPrescription(this.store.selected(), drug, null, this.current()).calc.suggested : null;
    this.doseText.set(suggested !== null ? round(suggested) : '');
  }

  protected submit() {
    const drug = this.drug();
    if (!drug || !this.valid()) {
      return;
    }
    const p = this.store.selected();
    const c = this.check();
    const units = this.units();
    const rx = this.store.prescribe(p, {
      drug: drug.name, route: drug.route, freq: this.freq(), days: this.days(), qty: this.qty().trim(), advice: this.advice().trim(),
      dose: `${units !== null ? round(units) : this.doseText().trim()} ${drug.unit}`,
      inpatient: this.admitted() && this.inpatient(),
      mgPerKg: c.calc.askedMgKg !== null ? Math.round(c.calc.askedMgKg * 100) / 100 : undefined,
      cds: c.findings.length
        ? {
          findings: c.findings.map(f => f.text.replace(/\{(\w+)\}/g, (_, k: string) => String(f.vars?.[k] ?? ''))),
          override: this.need() !== 'none' ? this.reason().trim() : undefined,
          approvedBy: this.need() === 'senior' ? this.senior() : undefined,
        }
        : undefined,
    });
    this.ui.closeSheet();
    this.ui.toast(this.need() === 'none' ? 'สั่ง {drug} ให้ {pet} แล้ว · {code} ส่งห้องยาตรวจสอบ' : 'Override CDS และสั่ง {drug} ให้ {pet} แล้ว · {code}',
      { drug: drug.name, pet: p.pet, code: rx.code });
  }
}
