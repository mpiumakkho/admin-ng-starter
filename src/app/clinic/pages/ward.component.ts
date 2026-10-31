/*
 * The ward: the bed map, and the treatment sheet of the pet picked from it: its drugs against their times, with each
 * dose recorded at the cage, its drips, its obs and the log of what was given (seph1-fe screens/WardMARQueue.tsx
 * ScreenWardBedMap, ScreenMAR, LiveMARBoard, LiveInfusionPanel).
 */
import { Component, computed, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideBedDouble, lucideCheck, lucideDroplets, lucidePause, lucidePlay, lucidePlus, lucidePrinter, lucideSquare } from '@ng-icons/lucide';

import { UiButton } from '../../user-management/ui';
import { ClinicActions } from '../clinic-actions';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { isControlled } from '../data/dispense';
import { NOW, timeOf, toMin } from '../data/model';
import { outOfRange } from '../data/record';
import type { Infusion, Patient, Prescription } from '../data/types';
import {
  bedsOf, canGive, DOSE_OUTCOMES, doseLog, dosesWaiting, DUE_WINDOW, infusedTotal, INFUSION_STATUS, inpatients, inWard, marOrders, nextObs,
  sheetTimes, slotState, stayDay, stayLine, wardLoad, WARDS,
} from '../data/ward';
import { TxPipe } from '../i18n/clinic-i18n';
import { PetIcon, SafetyChips, Toolbar } from '../shared/parts';

@Component({
  selector: 'app-clinic-ward',
  imports: [NgIcon, TxPipe, UiButton, Toolbar, PetIcon, SafetyChips],
  template: `
    <cl-toolbar [heading]="'Ward' | tx">
      <span subtitle>
        {{ 'ผู้ป่วยใน {n} ราย' | tx: { n: patients().length } }}
        @if (load().due) {<span class="chip info">{{ '{n} ถึงเวลาให้ยา' | tx: { n: load().due } }}</span>}
        @if (load().late) {<span class="chip danger">{{ '{n} ช้า' | tx: { n: load().late } }}</span>}
      </span>
      <button uiButton size="sm" type="button" (click)="actions.admit()"><ng-icon [svg]="icons.bed" aria-hidden="true" />{{ 'รับเข้าวอร์ด' | tx }}</button>
    </cl-toolbar>

    <div class="ward-layout">
      <!-- The bed map: a press on a bed brings its pet's sheet up -->
      <section class="bed-map" [attr.aria-label]="'ผังเตียง' | tx">
        @for (ward of wards(); track ward.name) {
          <div class="ward-block">
            <div class="section-title">
              <h2>{{ ward.name | tx }}<span class="count">{{ ward.taken }}/{{ ward.beds.length }}</span></h2>
              <span class="secondary">{{ '฿{n}/วัน' | tx: { n: ward.rate } }}</span>
            </div>
            <div class="beds">
              @for (b of ward.beds; track b.bed) {
                @switch (b.state) {
                  @case ('taken') {
                    <button type="button" class="bed taken" [class]="'bed taken ' + b.patient.triageCls" [class.active]="b.patient.id === sheet()?.id"
                      [attr.aria-pressed]="b.patient.id === sheet()?.id" (click)="store.select(b.patient)">
                      <span class="bed-no">{{ b.bed }}</span>
                      <span class="bed-pet"><cl-pet-icon [kind]="b.patient.kind" /><b>{{ b.patient.pet }}</b></span>
                      <span class="secondary">{{ b.patient.admission!.reason | tx }}</span>
                      <span class="bed-foot">
                        <span class="secondary">{{ 'วันที่ {n}' | tx: { n: stayDay(b.patient.admission!) } }}</span>
                        @if (waiting(b.patient); as w) {
                          <span class="chip" [class]="'chip ' + (w.late ? 'danger' : 'info')">{{ (w.late ? '{n} ช้า' : '{n} ถึงเวลา') | tx: { n: w.late || w.due } }}</span>
                        }
                      </span>
                    </button>
                  }
                  @case ('cleaning') {
                    <div class="bed cleaning">
                      <span class="bed-no">{{ b.bed }}</span>
                      <span class="secondary">{{ 'รอทำความสะอาด' | tx }}</span>
                      <button type="button" class="link" (click)="actions.bedCleaned(b.bed)">{{ 'ทำความสะอาดแล้ว' | tx }}</button>
                    </div>
                  }
                  @default {
                    <div class="bed free"><span class="bed-no">{{ b.bed }}</span><span class="muted">{{ 'ว่าง' | tx }}</span></div>
                  }
                }
              }
            </div>
          </div>
        }
      </section>

      @if (sheet(); as p) {
        @let a = p.admission!;
        <section class="treatment-sheet" aria-labelledby="ward-sheet-title">
          <div class="section-title">
            <h2 id="ward-sheet-title">{{ 'ตารางให้ยาและการรักษา' | tx }} · {{ p.pet }}</h2>
            <span class="secondary">{{ stayLine(a) | tx }} · {{ 'รับไว้' | tx }} {{ a.at }} · HN {{ p.hn }} · {{ p.weight }}</span>
          </div>
          <cl-safety-chips [patient]="p" />
          <div class="step-actions">
            <button uiButton size="sm" type="button" (click)="actions.verbalOrder(p)">{{ 'รับคำสั่งวาจา' | tx }}</button>
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.prescribe(p)"><ng-icon [svg]="icons.plus" aria-hidden="true" />{{ 'สั่งยาใหม่' | tx }}</button>
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.printTreatmentSheet(p)"><ng-icon [svg]="icons.print" aria-hidden="true" />{{ 'พิมพ์ MAR' | tx }}</button>
            <span class="grow"></span>
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.leaveWard(p)">{{ 'ออกจากวอร์ด' | tx }}</button>
          </div>

          <!-- Each drug against its times -->
          <div class="section-title">
            <h3>{{ 'ยา' | tx }}</h3>
            <span class="secondary">{{ 'กดช่องที่ถึงเวลาเพื่อบันทึกการให้ยา · ช่วงให้ยา ±{n} นาที' | tx: { n: dueWindow } }}</span>
          </div>
          <div class="table-wrap">
            <table class="mini-table mar-table">
              <thead>
                <tr>
                  <th scope="col">{{ 'ยา' | tx }}</th>
                  @for (time of times(); track time) {
                    <th scope="col" class="num" [class.now]="isNow(time)">{{ time }}</th>
                  }
                  <th scope="col"><span class="visually-hidden">{{ 'การทำงาน' | tx }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (rx of orders(); track rx.id) {
                  <tr>
                    <td>
                      <b>{{ rx.drug }}</b>
                      @if (controlled(rx)) {<span class="chip danger">CTRL</span>}
                      @if (!canGive(rx)) {<span class="chip warn">{{ 'รอห้องยาตรวจสอบ' | tx }}</span>}
                      <div class="secondary">{{ rx.dose | tx }} · {{ rx.route | tx }} · {{ rx.freq | tx }}</div>
                    </td>
                    @for (time of times(); track time) {
                      <td class="num" [class.now]="isNow(time)">
                        @if (rx.marTimes?.includes(time)) {
                          @let dose = doseAt(rx, time);
                          @switch (slotState(rx, time)) {
                            @case ('done') {
                              <span class="chip ok" [attr.title]="dose?.at + ' · ' + (dose?.by | tx)"><ng-icon [svg]="icons.check" aria-hidden="true" />{{ dose?.at }}</span>
                            }
                            @case ('upcoming') { <span class="muted">{{ time }}</span> }
                            @case ('due') {
                              <button type="button" class="chip info" (click)="actions.recordDose(rx, time)">{{ 'ให้ยา' | tx }}</button>
                            }
                            @case ('late') {
                              <button type="button" class="chip danger" (click)="actions.recordDose(rx, time)">{{ 'ช้า {n} นาที' | tx: { n: lateBy(time) } }}</button>
                            }
                            @default {
                              <span class="chip" [class]="'chip ' + outcomeTone(dose!.outcome)" [attr.title]="dose?.reason | tx">{{ outcomeLabel(dose!.outcome) | tx }}</span>
                            }
                          }
                        } @else {
                          <span class="muted" aria-hidden="true">—</span>
                        }
                      </td>
                    }
                    <td class="row-actions">
                      <button type="button" class="link" (click)="ui.openSheet('prescription', { id: rx.id })">{{ 'รายละเอียด' | tx }}</button>
                      <button type="button" class="link" (click)="actions.stopOrder(rx)">{{ 'หยุดยา' | tx }}</button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td [attr.colspan]="times().length + 2" class="muted">{{ 'ยังไม่มีคำสั่งยาในวอร์ด — สั่งยาใหม่หรือรับคำสั่งวาจา' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Drips -->
          <div class="section-title">
            <h3><ng-icon [svg]="icons.drop" aria-hidden="true" />{{ 'สายน้ำเกลือ (IV / CRI)' | tx }}</h3>
            <span class="secondary">{{ '{n} สายที่ให้อยู่' | tx: { n: liveCount() } }}</span>
          </div>
          <div class="table-wrap">
            <table class="mini-table lines-table">
              <thead>
                <tr>
                  <th scope="col">{{ 'สารน้ำ' | tx }}</th><th scope="col">{{ 'ทาง' | tx }}</th><th scope="col" class="num">mL/hr</th>
                  <th scope="col" class="num">{{ 'ให้แล้ว (mL)' | tx }}</th><th scope="col">{{ 'สถานะ' | tx }}</th>
                  <th scope="col"><span class="visually-hidden">{{ 'การทำงาน' | tx }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (line of a.lines; track line.id) {
                  <tr>
                    <td><b>{{ line.fluid }}</b><div class="secondary">{{ 'เริ่ม' | tx }} {{ line.events[0][0] }} · {{ line.events[0][3] | tx }}</div></td>
                    <td>{{ line.route }}</td>
                    <td class="num">{{ line.status === 'stopped' ? '—' : line.rate }}</td>
                    <td class="num">{{ total(line) }}</td>
                    <td><span class="chip" [class]="'chip ' + status[line.status].cls">{{ status[line.status].label | tx }}</span></td>
                    <td class="row-actions">
                      @if (line.status !== 'stopped') {
                        <button type="button" class="link" (click)="actions.changeRate(line)">{{ 'ปรับอัตรา' | tx }}</button>
                        <button type="button" class="link" (click)="actions.pauseLine(line)">
                          <ng-icon [svg]="line.status === 'paused' ? icons.play : icons.pause" aria-hidden="true" />{{ (line.status === 'paused' ? 'ให้ต่อ' : 'พัก') | tx }}
                        </button>
                        <button type="button" class="link" (click)="actions.stopLine(line, total(line))"><ng-icon [svg]="icons.stop" aria-hidden="true" />{{ 'หยุด' | tx }}</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="muted">{{ 'ยังไม่มีสายน้ำเกลือ' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="step-actions">
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.startInfusion(p)"><ng-icon [svg]="icons.plus" aria-hidden="true" />{{ 'เริ่มสายน้ำเกลือ' | tx }}</button>
          </div>

          <!-- Obs -->
          <div class="section-title">
            <h3>{{ 'สัญญาณชีพ' | tx }}</h3>
            <span class="secondary">
              {{ 'วัดทุก {n} ชม.' | tx: { n: a.obsEvery } }}
              @if (obs(); as next) {
                · {{ 'ครั้งถัดไป' | tx }} {{ next.at }}
                @if (next.late) {<span class="chip danger">{{ 'เลยเวลา' | tx }}</span>}
              }
            </span>
          </div>
          <div class="table-wrap">
            <table class="mini-table obs-table">
              <thead>
                <tr>
                  <th scope="col">{{ 'เวลา' | tx }}</th><th scope="col" class="num">T (°C)</th><th scope="col" class="num">HR</th>
                  <th scope="col" class="num">RR</th><th scope="col" class="num">{{ 'ปวด' | tx }}</th><th scope="col">{{ 'โดย' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (v of vitals(); track v.at) {
                  <tr>
                    <td>{{ timeOf(v.at) }}</td>
                    <td class="num" [class.text-danger]="outOfRange(p, 'temp', v.temp)">{{ v.temp || '—' }}</td>
                    <td class="num" [class.text-danger]="outOfRange(p, 'hr', v.hr)">{{ v.hr || '—' }}</td>
                    <td class="num" [class.text-danger]="outOfRange(p, 'rr', v.rr)">{{ v.rr || '—' }}</td>
                    <td class="num">{{ v.pain || '—' }}</td>
                    <td>{{ v.by | tx }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="muted">{{ 'ยังไม่ได้วัดตั้งแต่รับเข้าวอร์ด' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="step-actions">
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.takeObs(p)"><ng-icon [svg]="icons.plus" aria-hidden="true" />{{ 'บันทึกสัญญาณชีพ' | tx }}</button>
          </div>

          <!-- What was given -->
          <div class="section-title"><h3>{{ 'บันทึกการให้ยา' | tx }}</h3><span class="secondary">{{ '{n} รายการ' | tx: { n: log().length } }}</span></div>
          <div class="table-wrap">
            <table class="mini-table dose-log">
              <thead>
                <tr>
                  <th scope="col">{{ 'เวลา' | tx }}</th><th scope="col">{{ 'ยา' | tx }}</th><th scope="col">{{ 'ผล' | tx }}</th>
                  <th scope="col">{{ 'เหตุผล' | tx }}</th><th scope="col">{{ 'โดย' | tx }}</th><th scope="col">{{ 'พยาน' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (x of log(); track $index) {
                  <tr>
                    <td>{{ x.dose.at }}<div class="secondary">{{ 'กำหนด' | tx }} {{ x.dose.slot }}</div></td>
                    <td>{{ x.rx.drug }} @if (controlled(x.rx)) {<span class="chip danger">CTRL</span>}</td>
                    <td><span class="chip" [class]="'chip ' + outcomeTone(x.dose.outcome)">{{ outcomeLabel(x.dose.outcome) | tx }}</span></td>
                    <td>{{ x.dose.reason ? (x.dose.reason | tx) : '—' }}</td>
                    <td>{{ x.dose.by | tx }}</td>
                    <td>{{ x.dose.witness ? (x.dose.witness | tx) : '—' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="muted">{{ 'ยังไม่มีการบันทึก' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      } @else {
        <section class="treatment-sheet empty">
          <p class="muted">{{ 'ไม่มีสัตว์ป่วยในวอร์ด — กด รับเข้าวอร์ด เพื่อรับสัตว์จากคิวเข้าเตียง' | tx }}</p>
        </section>
      }
    </div>
  `,
  host: { class: 'workspace' },
})
export class WardComponent {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly actions = inject(ClinicActions);
  protected readonly icons = {
    bed: lucideBedDouble, check: lucideCheck, plus: lucidePlus, print: lucidePrinter, drop: lucideDroplets, pause: lucidePause, play: lucidePlay, stop: lucideSquare,
  };
  protected readonly status = INFUSION_STATUS;
  protected readonly dueWindow = DUE_WINDOW;
  protected readonly timeOf = timeOf;
  protected readonly stayDay = stayDay;
  protected readonly stayLine = stayLine;
  protected readonly canGive = canGive;
  protected readonly slotState = slotState;
  protected readonly outOfRange = outOfRange;
  protected readonly controlled = (rx: Prescription) => isControlled(rx.drug);

  protected readonly patients = computed(() => inpatients(this.store.data()));
  protected readonly load = computed(() => wardLoad(this.store.data()));
  protected readonly wards = computed(() => {
    const d = this.store.data();
    return WARDS.map(w => {
      const beds = bedsOf(d, w);
      return { name: w.name, rate: w.rate, beds, taken: beds.filter(b => b.state === 'taken').length };
    });
  });
  /** The sheet shown: the selected pet when it is in a bed, else the first in a bed */
  protected readonly sheet = computed<Patient | null>(() => {
    const selected = this.store.selected();
    return inWard(selected) ? selected : this.patients()[0] ?? null;
  });
  protected readonly orders = computed(() => (this.sheet() ? marOrders(this.store.data(), this.sheet()!) : []));
  protected readonly times = computed(() => sheetTimes(this.orders()));
  protected readonly liveCount = computed(() => this.sheet()?.admission?.lines.filter(l => l.status !== 'stopped').length ?? 0);
  protected readonly obs = computed(() => (this.sheet() ? nextObs(this.sheet()!) : null));
  /** The obs taken since the pet came in, newest first */
  protected readonly vitals = computed(() => {
    const p = this.sheet();
    return p ? (p.vitals ?? []).filter(v => v.at >= p.admission!.at).slice().reverse() : [];
  });
  protected readonly log = computed(() => (this.sheet() ? doseLog(this.store.data(), this.sheet()!) : []));

  protected waiting(p: Patient): { due: number; late: number } | null {
    const list = dosesWaiting(this.store.data(), p);
    const late = list.filter(x => x.state === 'late').length;
    return list.length ? { due: list.length - late, late } : null;
  }

  protected isNow(time: string): boolean {
    return Math.abs(toMin(time) - toMin(NOW)) <= DUE_WINDOW;
  }

  protected lateBy(time: string): number {
    return toMin(NOW) - toMin(time);
  }

  protected doseAt(rx: Prescription, slot: string) {
    return rx.doses?.find(d => d.slot === slot);
  }

  protected outcomeLabel(outcome: string): string {
    return DOSE_OUTCOMES.find(o => o.value === outcome)?.label ?? outcome;
  }

  protected outcomeTone(outcome: string): string {
    return DOSE_OUTCOMES.find(o => o.value === outcome)?.tone ?? 'quiet';
  }

  protected total(line: Infusion): number {
    return infusedTotal(line);
  }
}
