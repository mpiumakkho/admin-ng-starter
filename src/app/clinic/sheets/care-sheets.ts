/* The estimate the owner approves before treatment, and the consent they sign against it (data/estimate.ts) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck, lucideTriangleAlert } from '@ng-icons/lucide';

import { UiButton } from '../../user-management/ui';
import { ClinicActions } from '../clinic-actions';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { consentItems, estimateFor, isDnr, needsReapproval, SIGNER_RELATIONS } from '../data/estimate';
import { NOW, NURSES, VETS } from '../data/model';
import { baht } from '../data/rail';
import { TxPipe } from '../i18n/clinic-i18n';
import { SignaturePad } from '../shared/signature-pad';
import { SheetHead } from './sheet-head';

const SHARED = [TxPipe, UiButton, SheetHead, NgIcon];

/* ---- The estimate, worked out from the visit; approved once, approved again when the visit grows past it ---- */
@Component({
  selector: 'cl-estimate-sheet',
  imports: [...SHARED],
  template: `
    @let p = store.selected();
    @let o = store.owner(p);
    @let e = now();
    @let approved = p.estimate;
    <cl-sheet-head [heading]="'Estimate · ' + p.pet" [status]="status()"
      [sub]="'{0} · {1} · ต้องอนุมัติก่อนเริ่มหัตถการ' | tx: { '0': e.no, '1': o.name }" />
    <div class="sheet-body">
      @if (reapprove()) {
        <div class="safety warn">
          <b><ng-icon [svg]="icons.alert" aria-hidden="true" />{{ 'ค่าใช้จ่ายเกินที่เจ้าของอนุมัติไว้' | tx }}</b>
          <div class="secondary">{{ 'อนุมัติไว้ {0} · ตอนนี้ {1} — ขอให้เจ้าของอนุมัติใหม่ก่อนทำต่อ' | tx: { '0': money(approved!.max), '1': money(e.max) } }}</div>
        </div>
      }
      <div class="section">
        <div class="section-title"><h3>{{ 'รายการประมาณการ' | tx }}</h3><span class="secondary">{{ 'จากคำสั่งตรวจและยาของ visit นี้' | tx }}</span></div>
        <table class="mini-table">
          <thead><tr><th scope="col">{{ 'รายการ' | tx }}</th><th scope="col" class="num">{{ 'จำนวน' | tx }}</th><th scope="col" class="num">{{ 'ต่ำสุด' | tx }}</th><th scope="col" class="num">{{ 'สูงสุด' | tx }}</th></tr></thead>
          <tbody>
            @for (line of e.lines; track $index) {
              <tr><td>{{ line[0] | tx }}</td><td class="num">{{ line[1] | tx }}</td><td class="num">{{ money(line[2]) }}</td><td class="num">{{ money(line[3]) }}</td></tr>
            }
          </tbody>
        </table>
        <div class="summary-line total"><span>{{ 'รวม' | tx }}</span><span>{{ range(e.min, e.max) }}</span></div>
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'การอนุมัติ' | tx }}</h3></div>
        @if (approved) {
          <dl class="data-grid">
            <dt>{{ 'ผู้อนุมัติ' | tx }}</dt><dd>{{ approved.approvedBy }}</dd>
            <dt>{{ 'เมื่อ' | tx }}</dt><dd>{{ approved.approvedAt }} · {{ approved.via | tx }}</dd>
            <dt>{{ 'ช่วงที่อนุมัติ' | tx }}</dt><dd>{{ range(approved.min, approved.max) }}</dd>
          </dl>
        } @else {
          <dl class="data-grid">
            <dt>{{ 'ผู้อนุมัติ' | tx }}</dt><dd>{{ o.name }}</dd>
            <dt>{{ 'ช่องทางส่ง' | tx }}</dt><dd>{{ o.prefer | tx }}</dd>
            <dt>{{ 'อายุประมาณการ' | tx }}</dt><dd>{{ '7 วัน' | tx }}</dd>
          </dl>
        }
      </div>
    </div>
    <div class="sheet-foot">
      <button uiButton variant="secondary" size="sm" type="button" (click)="send()">{{ 'ส่งให้เจ้าของ' | tx }}</button>
      <button uiButton variant="secondary" size="sm" type="button" (click)="actions.printEstimate(p)">{{ 'พิมพ์' | tx }}</button>
      <span class="grow"></span>
      @if (approved && !reapprove()) {
        <button uiButton size="sm" type="button" (click)="ui.openSheet('consent')">{{ (p.consentForm ? 'ดูใบยินยอม' : 'ลงนามใบยินยอม') | tx }}</button>
      } @else {
        <button uiButton size="sm" type="button" (click)="actions.approveEstimate(p)">{{ (reapprove() ? 'ขออนุมัติใหม่' : 'อนุมัติ') | tx }}</button>
      }
    </div>
  `,
  host: { class: 'contents' },
})
export class EstimateSheet {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly actions = inject(ClinicActions);
  protected readonly icons = { alert: lucideTriangleAlert };
  protected readonly money = baht;
  protected readonly now = computed(() => estimateFor(this.store.data(), this.store.selected()), { equal: () => false });
  protected readonly reapprove = computed(() => needsReapproval(this.store.selected(), this.now()));
  protected readonly status = computed(() => {
    const p = this.store.selected();
    return this.reapprove() ? { text: 'ต้องอนุมัติใหม่', cls: 'late' } : p.estimate ? { text: 'อนุมัติแล้ว', cls: 'checked' } : { text: 'รออนุมัติ', cls: 'waiting' };
  });

  protected range(min: number, max: number) {
    return min === max ? baht(min) : `${baht(min)} – ${baht(max)}`;
  }

  protected send() {
    const p = this.store.selected();
    const o = this.store.owner(p);
    const e = this.now();
    this.actions.sendMessage(p, 'ประมาณการค่าใช้จ่าย',
      `เรียนคุณ ${o.name}\nประมาณการค่าใช้จ่ายของ ${p.pet} (${e.no}) อยู่ที่ ${this.range(e.min, e.max)} (มีอายุ 7 วัน)\nกรุณาตรวจสอบและยืนยันการอนุมัติกับเจ้าหน้าที่`,
      channel => this.store.mutate(() => {
        if (p.handoff.estimate.state !== 'done') {
          p.handoff.estimate = { state: 'active', note: `ส่งทาง ${channel} แล้ว` };
        }
      }));
  }
}

/* ---- The owner's consent to today's treatment: what it covers, the risks, resuscitation, a signature and a witness ---- */
@Component({
  selector: 'cl-consent-sheet',
  imports: [...SHARED, SignaturePad],
  template: `
    @let p = store.selected();
    @let o = store.owner(p);
    @let signed = p.consentForm;
    <cl-sheet-head [heading]="('ใบยินยอมการรักษา' | tx) + ' · ' + p.pet" [status]="signed ? { text: 'ลงนามแล้ว', cls: 'checked' } : { text: 'รอลงนาม', cls: 'waiting' }"
      [sub]="o.name + ' · ' + p.hn + ' · ' + (p.estimate?.no ?? ('ยังไม่มีประมาณการที่อนุมัติ' | tx))" />
    <div class="sheet-body">
      @if (signed) {
        <div class="safety ok">
          <b><ng-icon [svg]="icons.check" aria-hidden="true" />{{ 'ลงนามแล้ว {0} · {1} ({2}) · พยาน {3}' | tx: { '0': signed.at, '1': signed.signer, '2': (signed.relation | tx), '3': (signed.witness | tx) } }}</b>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'การรักษาที่ยินยอม' | tx }}</h3></div>
          <ul class="plain-list">@for (item of signed.items; track $index) {<li>{{ item | tx }}</li>}</ul>
          <p class="sheet-text">{{ 'ประมาณการ {0} · {1}' | tx: { '0': signed.estimateNo, '1': range(signed.min, signed.max) } }}</p>
          <p class="sheet-text">{{ (signed.cpr ? 'ยินยอมให้ช่วยชีวิตเมื่อหัวใจหยุดเต้น (CPR)' : 'ไม่ทำ CPR (DNR)') | tx }}</p>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'ลายเซ็น' | tx }}</h3></div>
          @if (signed.signature) {
            <img class="sig-image" [src]="signed.signature" [alt]="'ลายเซ็นของ {0}' | tx: { '0': signed.signer }" />
          } @else {
            <p class="sheet-text">{{ 'ลงนามบนกระดาษ — เก็บฉบับจริงในแฟ้ม' | tx }}</p>
          }
        </div>
      } @else if (!p.estimate || reapprove()) {
        <div class="safety warn">
          <b><ng-icon [svg]="icons.alert" aria-hidden="true" />{{ (reapprove() ? 'ค่าใช้จ่ายเกินที่เจ้าของอนุมัติไว้' : 'ยังไม่ได้อนุมัติประมาณการ') | tx }}</b>
          <div class="secondary">{{ 'เจ้าของต้องอนุมัติประมาณการก่อนลงนามใบยินยอม' | tx }}</div>
        </div>
      } @else {
        <div class="section">
          <div class="section-title"><h3>{{ 'การรักษาที่ขอความยินยอม' | tx }}</h3></div>
          <ul class="plain-list">@for (item of items(); track $index) {<li>{{ item | tx }}</li>} @empty {<li>{{ 'ตรวจรักษาทั่วไป' | tx }}</li>}</ul>
          <p class="sheet-text">{{ 'ประมาณการ {0} · {1}' | tx: { '0': p.estimate.no, '1': range(p.estimate.min, p.estimate.max) } }}</p>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'ข้อตกลง' | tx }}</h3></div>
          <label class="check"><input type="checkbox" [checked]="risks()" (change)="risks.set($any($event.target).checked)" />
            {{ 'สัตวแพทย์อธิบายวิธีรักษา ทางเลือก และความเสี่ยง รวมถึงความเสี่ยงของยาซึมและยาสลบแล้ว' | tx }}</label>
          <label class="check"><input type="checkbox" [checked]="costs()" (change)="costs.set($any($event.target).checked)" />
            {{ 'รับทราบค่าใช้จ่ายตามประมาณการ และโรงพยาบาลจะแจ้งก่อนหากเกิน' | tx }}</label>
          <div class="field">
            <label for="consent-cpr">{{ 'เมื่อหัวใจหยุดเต้น' | tx }}</label>
            <select class="ui-input" id="consent-cpr" (change)="cpr.set($any($event.target).value === 'yes')">
              <option value="yes" [selected]="cpr()">{{ 'ยินยอมให้ช่วยชีวิตเมื่อหัวใจหยุดเต้น (CPR)' | tx }}</option>
              <option value="no" [selected]="!cpr()">{{ 'ไม่ทำ CPR (DNR)' | tx }}</option>
            </select>
            @if (dnr() && cpr()) {
              <p class="field-error" role="alert">{{ 'สัตว์ตัวนี้มี alert DNR — ตรวจกับเจ้าของอีกครั้ง' | tx }}</p>
            }
          </div>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'ผู้ลงนาม' | tx }}</h3></div>
          <div class="form-12">
            <div class="field">
              <label for="consent-signer">{{ 'ชื่อผู้ลงนาม' | tx }}</label>
              <input class="ui-input" id="consent-signer" [value]="signer()" (input)="signer.set($any($event.target).value)" />
            </div>
            <div class="field">
              <label for="consent-relation">{{ 'ความเกี่ยวข้อง' | tx }}</label>
              <select class="ui-input" id="consent-relation" (change)="relation.set($any($event.target).value)">
                @for (r of relations; track r) {<option [value]="r" [selected]="r === relation()">{{ r | tx }}</option>}
              </select>
            </div>
            <div class="field full">
              <span class="field-label">{{ 'ลายเซ็น' | tx }}</span>
              @if (!paper()) {
                <cl-signature-pad [label]="'ช่องลงลายมือชื่อ' | tx" (signed)="signature.set($event)" />
              }
              <label class="check"><input type="checkbox" [checked]="paper()" (change)="paper.set($any($event.target).checked)" />
                {{ 'ลงนามบนกระดาษแทน (เก็บฉบับจริงในแฟ้ม)' | tx }}</label>
            </div>
            <div class="field">
              <label for="consent-witness">{{ 'พยาน (เจ้าหน้าที่)' | tx }}</label>
              <select class="ui-input" id="consent-witness" (change)="witness.set($any($event.target).value)">
                <option value="" [selected]="!witness()">{{ 'เลือกพยาน' | tx }}</option>
                @for (w of staff; track w) {<option [value]="w" [selected]="w === witness()">{{ w | tx }}</option>}
              </select>
            </div>
          </div>
        </div>
      }
    </div>
    <div class="sheet-foot">
      @if (signed) {
        <button uiButton variant="secondary" size="sm" type="button" (click)="actions.printConsent(p)">{{ 'พิมพ์ใบยินยอม' | tx }}</button>
      } @else if (!p.estimate || reapprove()) {
        <span class="grow"></span>
        <button uiButton size="sm" type="button" (click)="ui.openSheet('estimate')">{{ 'เปิด Estimate' | tx }}</button>
      } @else {
        <span class="grow"></span>
        <button uiButton size="sm" type="button" [disabled]="!valid()" (click)="sign()">{{ 'บันทึกการลงนาม' | tx }}</button>
      }
    </div>
  `,
  host: { class: 'contents' },
})
export class ConsentSheet {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly actions = inject(ClinicActions);
  protected readonly icons = { alert: lucideTriangleAlert, check: lucideCheck };
  protected readonly relations = SIGNER_RELATIONS;
  protected readonly staff = [...VETS, ...NURSES];

  protected readonly dnr = computed(() => isDnr(this.store.selected()));
  protected readonly reapprove = computed(() => needsReapproval(this.store.selected(), estimateFor(this.store.data(), this.store.selected())));
  protected readonly items = computed(() => consentItems(this.store.selected().estimate ?? { lines: [] }));
  protected readonly risks = signal(false);
  protected readonly costs = signal(false);
  protected readonly cpr = signal(!this.dnr());
  protected readonly signer = signal(this.store.owner(this.store.selected()).name);
  protected readonly relation = signal(SIGNER_RELATIONS[0]);
  protected readonly signature = signal('');
  protected readonly paper = signal(false);
  protected readonly witness = signal('');
  protected readonly valid = computed(() =>
    this.risks() && this.costs() && !!this.signer().trim() && !!this.witness() && (this.paper() || !!this.signature()));

  protected range(min: number, max: number) {
    return min === max ? baht(min) : `${baht(min)} – ${baht(max)}`;
  }

  protected sign() {
    const p = this.store.selected();
    const e = p.estimate;
    if (!e || !this.valid()) {
      return;
    }
    this.store.signConsent(p, {
      at: NOW, signer: this.signer().trim(), relation: this.relation(), witness: this.witness(),
      signature: this.paper() ? undefined : this.signature(), cpr: this.cpr(),
      estimateNo: e.no, min: e.min, max: e.max, items: this.items(),
    });
    this.ui.toast('บันทึกใบยินยอมของ {pet} แล้ว · ลงนามโดย {signer}', { pet: p.pet, signer: this.signer().trim() });
  }
}
