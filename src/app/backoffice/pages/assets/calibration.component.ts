/* Calibration: each device against its frequency, the log with its certificates, and the lapses in it (assets.calibration, M22 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  addMonths, CALIBRATION_RESULT, CALIBRATION_STATE, calibrationCompliance, calibrationProblems, type CalibrationInput, type CalibrationState, equipmentOf,
} from '../../data/assets';
import { daysUntil } from '../../data/home';
import type { CalibrationRecord } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

const STRIP: CalibrationState[] = ['overdue', 'failed', 'due30', 'scheduled'];

@Component({
  selector: 'bo-calibration',
  imports: [RouterLink, NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    @let c = compliance();
    <bo-page-head [heading]="'การสอบเทียบอุปกรณ์'" [source]="'M22 P2 · ความถี่ตามที่กำหนดต่ออุปกรณ์ (TAHSA-11) · ผลที่ผ่านต้องมีใบรับรอง · สอบเทียบไม่ผ่านจะหยุดใช้อุปกรณ์ · ต้นแบบก่อนสัญญาหน้าของ M22 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="openCreate()"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'บันทึกผลสอบเทียบ' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ c.percent }}%</span><span class="kpi-label">{{ 'ไม่เกินกำหนด {a} จาก {b} เครื่อง' | tx: { a: c.inDate, b: c.required } }}</span></div>
      @for (s of strip; track s) {
        <button type="button" class="kpi" role="listitem" [class.active]="filter() === s" [class.danger]="(s === 'overdue' || s === 'failed') && count(s)" [class.warn]="s === 'due30' && count(s)" (click)="toggle(s)">
          <span class="kpi-value">{{ count(s) }}</span><span class="kpi-label">{{ STATE[s].label | tx }}</span>
        </button>
      }
      <div class="kpi" [class.warn]="c.lapsed" role="listitem"><span class="kpi-value">{{ c.lapsed }}</span><span class="kpi-label">{{ 'เครื่องที่ประวัติเคยขาดช่วง' | tx }}</span></div>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'อุปกรณ์ที่ต้องสอบเทียบ' | tx }}</b><span class="secondary grow">{{ 'เรียงตามวันครบกำหนด' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table calibration">
          <thead>
            <tr>
              <th scope="col">{{ 'อุปกรณ์' | tx }}</th>
              <th scope="col">{{ 'ความถี่' | tx }}</th>
              <th scope="col" class="w-due">{{ 'ครั้งล่าสุด' | tx }}</th>
              <th scope="col" class="w-due">{{ 'ครบกำหนด' | tx }}</th>
              <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'ประวัติ' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of devices(); track r.equipment.id) {
              <tr tabindex="0" [class.selected]="r.last && r.last.id === selectedId()" (click)="r.last ? pick(r.last.id) : startFor(r.equipment.id)" (keydown.enter)="r.last ? pick(r.last.id) : startFor(r.equipment.id)">
                <td><b>{{ r.equipment.name | tx }}</b><div class="secondary">{{ r.equipment.id }} · {{ r.equipment.location | tx }}</div></td>
                <td>{{ 'ทุก {n} เดือน' | tx: { n: r.equipment.calibrationMonths! } }}</td>
                <td class="num">{{ r.last?.date ?? '—' }}</td>
                <td class="num" [class.text-danger]="r.state === 'overdue'">{{ r.last?.nextDue ?? '—' }}@if (r.last && r.state === 'overdue') {<div class="secondary">{{ 'เกินกำหนด {n} วัน' | tx: { n: -days(r.last.nextDue) } }}</div>}</td>
                <td><span class="chip" [class]="'chip ' + STATE[r.state].cls">{{ STATE[r.state].label | tx }}</span></td>
                <td>@if (r.lapses.length) {<span class="text-danger">{{ 'ขาดช่วง {n} ครั้ง' | tx: { n: r.lapses.length } }}</span>} @else {<span class="secondary">{{ 'ครบตามความถี่' | tx }}</span>}</td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="6" class="empty">{{ 'ไม่มีอุปกรณ์ในสถานะนี้' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="split" [class.with-drawer]="selected() || creating()">
      <div class="panel">
        <div class="filter-bar"><b>{{ 'บันทึกการสอบเทียบ' | tx }}</b><span class="secondary grow">{{ 'ล่าสุดก่อน' | tx }}</span></div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead>
              <tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col" class="w-due">{{ 'วันที่' | tx }}</th>
                <th scope="col">{{ 'อุปกรณ์' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'ผู้สอบเทียบ' | tx }}</th>
                <th scope="col" class="w-status">{{ 'ผล' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of ledger(); track r.id) {
                <tr tabindex="0" [class.selected]="r.id === selectedId()" [attr.aria-selected]="r.id === selectedId()" (click)="pick(r.id)" (keydown.enter)="pick(r.id)">
                  <td><b>{{ r.id }}</b></td>
                  <td class="num">{{ r.date }}</td>
                  <td>{{ name(r) | tx }}<div class="secondary">{{ r.equipmentId }}</div></td>
                  <td>{{ r.by | tx }}</td>
                  <td><span class="chip" [class]="'chip ' + RESULT[r.result].cls">{{ RESULT[r.result].label | tx }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (creating()) {
        <bo-drawer [heading]="'บันทึกผลสอบเทียบ'" [sub]="'ผลที่ผ่านต้องแนบใบรับรอง'" (closed)="creating.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'อุปกรณ์' | tx }}
              <select class="ui-input" (change)="pickDevice($any($event.target).value)">
                @for (r of compliance().rows; track r.equipment.id) {<option [value]="r.equipment.id" [selected]="r.equipment.id === form().equipmentId">{{ r.equipment.name | tx }} · {{ r.equipment.id }}</option>}
              </select>
            </label>
            <label>{{ 'วันที่สอบเทียบ' | tx }}<input class="ui-input" type="date" [value]="form().date" (input)="pickDate($any($event.target).value)" /></label>
            <label>{{ 'ผล' | tx }}
              <select class="ui-input" (change)="set('result', $any($event.target).value)">
                @for (k of results; track k) {<option [value]="k" [selected]="k === form().result">{{ RESULT[k].label | tx }}</option>}
              </select>
            </label>
            <label class="full">{{ 'ผู้สอบเทียบ' | tx }}<input class="ui-input" [value]="form().by" (input)="set('by', $any($event.target).value)" /></label>
            <label>{{ 'ใบรับรอง (ไฟล์)' | tx }}<input class="ui-input" [placeholder]="'เช่น CAL-MON03.pdf' | tx" [value]="form().certificate" (input)="set('certificate', $any($event.target).value)" /></label>
            <label>{{ 'ครั้งถัดไป' | tx }}<input class="ui-input" type="date" [value]="form().nextDue" (input)="set('nextDue', $any($event.target).value)" /></label>
            <label class="full">{{ 'ค่าที่วัดได้ / หมายเหตุ' | tx }}<input class="ui-input" [value]="form().reading" (input)="set('reading', $any($event.target).value)" /></label>
          </div>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="creating.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="create()">{{ 'บันทึกผล' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as r) {
        <bo-drawer [heading]="r.id" [sub]="(name(r) | tx) + ' · ' + r.date" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'ผู้สอบเทียบ' | tx }}</dt><dd>{{ r.by | tx }}</dd>
            <dt>{{ 'ผล' | tx }}</dt><dd><span class="chip" [class]="'chip ' + RESULT[r.result].cls">{{ RESULT[r.result].label | tx }}</span></dd>
            <dt>{{ 'ใบรับรอง' | tx }}</dt><dd>{{ r.certificate ?? ('ไม่มี' | tx) }}</dd>
            @if (r.reading) {<dt>{{ 'ค่าที่วัดได้' | tx }}</dt><dd>{{ r.reading | tx }}</dd>}
            <dt>{{ 'ครั้งถัดไป' | tx }}</dt><dd>{{ r.nextDue }}</dd>
            <dt>{{ 'บันทึกโดย' | tx }}</dt><dd>{{ r.enteredBy | tx }}</dd>
          </dl>
          @if (lapsesOf(r).length) {
            <div class="section-title">{{ 'ช่วงที่เกินกำหนด' | tx }}</div>
            <ul class="checks">@for (l of lapsesOf(r); track l[0]) {<li>{{ l[0] }} → {{ l[1] }} · {{ '{n} วัน' | tx: { n: l[2] } }}</li>}</ul>
          }
          <ng-container foot>
            <a class="link" [routerLink]="['/backoffice/assets/equipment', r.equipmentId]">{{ 'เปิดรายละเอียดอุปกรณ์' | tx }}</a>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" (click)="startFor(r.equipmentId)">{{ 'บันทึกผลครั้งใหม่' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class CalibrationComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly STATE = CALIBRATION_STATE;
  protected readonly RESULT = CALIBRATION_RESULT;
  protected readonly strip = STRIP;
  protected readonly results = Object.keys(CALIBRATION_RESULT) as CalibrationRecord['result'][];

  protected readonly filter = signal<CalibrationState | ''>('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly compliance = computed(() => calibrationCompliance(this.store.data()));
  protected readonly devices = computed(() => this.compliance().rows.filter(r => !this.filter() || r.state === this.filter())
    .sort((a, b) => (a.last?.nextDue ?? '').localeCompare(b.last?.nextDue ?? '')));
  protected readonly ledger = computed(() => this.store.data().calibrations.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)));
  protected readonly selected = computed(() => this.store.data().calibrations.find(c => c.id === this.selectedId()) ?? null);

  protected readonly creating = signal(false);
  protected readonly form = signal<CalibrationInput>(this.blank('EQ-ICU-MON-03'));
  protected readonly problems = computed(() => calibrationProblems(this.store.data(), this.form()));

  protected count(s: CalibrationState) {
    return this.compliance().rows.filter(r => r.state === s).length;
  }

  protected days(date: string) {
    return daysUntil(date);
  }

  protected name(r: CalibrationRecord) {
    return equipmentOf(this.store.data(), r.equipmentId)?.name ?? r.equipmentId;
  }

  protected lapsesOf(r: CalibrationRecord) {
    return this.compliance().rows.find(x => x.equipment.id === r.equipmentId)?.lapses ?? [];
  }

  protected toggle(s: CalibrationState) {
    this.filter.set(this.filter() === s ? '' : s);
  }

  protected pick(id: string) {
    this.creating.set(false);
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected openCreate() {
    this.selectedId.set(null);
    this.creating.set(true);
  }

  protected startFor(equipmentId: string) {
    this.form.set(this.blank(equipmentId));
    this.openCreate();
  }

  protected set<K extends keyof CalibrationInput>(key: K, value: CalibrationInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected pickDevice(id: string) {
    this.form.set({ ...this.blank(id), date: this.form().date, by: this.form().by });
  }

  /** A new date moves the next due date a full cycle on */
  protected pickDate(date: string) {
    const months = equipmentOf(this.store.data(), this.form().equipmentId)?.calibrationMonths ?? 12;
    this.form.set({ ...this.form(), date, nextDue: /^\d{4}-\d{2}-\d{2}$/.test(date) ? addMonths(date, months) : '' });
  }

  protected create() {
    this.actions.addCalibration(this.form(), r => {
      this.creating.set(false);
      this.filter.set('');
      this.selectedId.set(r.id);
    });
  }

  private blank(equipmentId: string): CalibrationInput {
    const months = equipmentOf(this.store.data(), equipmentId)?.calibrationMonths ?? 12;
    return { equipmentId, date: TODAY, by: 'บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง', result: 'pass', certificate: '', reading: '', nextDue: addMonths(TODAY, months) };
  }
}
