/* Equipment registry: every device with its readiness, PM and calibration at a glance, and its bed link (assets.registry, M22 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  bedsAt, CALIBRATION_STATE, calibrationState, CLASSES, contractsOf, CRITICALITY, DUE_STATE, EQUIPMENT_CLASS, EQUIPMENT_STATUS, equipmentProblems, type EquipmentInput, LOCATIONS, openPm,
  pmState, READINESS, readiness,
} from '../../data/assets';
import type { Criticality, Equipment, EquipmentClass } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

const STATUSES: Equipment['status'][] = ['in-service', 'down', 'decommissioned'];
const BLANK: EquipmentInput = {
  name: '', cls: 'monitor', maker: '', model: '', serial: '', location: 'ICU', bed: '', criticality: 'high', purchasedAt: TODAY, purchaseCost: '', pmMonths: '6', calibrationMonths: '12',
};

@Component({
  selector: 'bo-equipment-registry',
  imports: [PagerFoot, NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'ทะเบียนอุปกรณ์'" [source]="'M22 P2 · ทะเบียนอุปกรณ์การแพทย์ตาม TAHSA-11 · ผูกเตียงกับผังเตียง M10 · ต้นทุนเป็นข้อมูลการดำเนินงาน ไม่ใช่ทะเบียนสินทรัพย์ทางบัญชี · ต้นแบบก่อนสัญญาหน้าของ M22 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="openCreate()"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'ขึ้นทะเบียนอุปกรณ์' | tx }}</button>
    </bo-page-head>

    <div class="split" [class.with-drawer]="selected() || creating()">
      <div class="panel">
        <div class="filter-bar">
          <input class="ui-input search" type="search" [attr.aria-label]="'ค้นหา' | tx" [placeholder]="'ชื่อ รหัส หรือหมายเลขเครื่อง' | tx" (input)="query.set($any($event.target).value)" />
          <select class="ui-input" [attr.aria-label]="'ที่ตั้ง' | tx" (change)="location.set($any($event.target).value)">
            <option value="">{{ 'ทุกที่ตั้ง' | tx }}</option>
            @for (l of locations; track l) {<option [value]="l">{{ l | tx }}</option>}
          </select>
          <select class="ui-input" [attr.aria-label]="'ชนิด' | tx" (change)="cls.set($any($event.target).value)">
            <option value="">{{ 'ทุกชนิด' | tx }}</option>
            @for (c of classes; track c) {<option [value]="c">{{ CLASS[c].label | tx }}</option>}
          </select>
          <div class="segmented" role="group" [attr.aria-label]="'สถานะ' | tx">
            <button type="button" [class.active]="!status()" [attr.aria-pressed]="!status()" (click)="status.set('')">{{ 'ใช้อยู่' | tx }}</button>
            @for (s of statuses; track s) {<button type="button" [class.active]="status() === s" [attr.aria-pressed]="status() === s" (click)="status.set(s)">{{ STATUS[s].label | tx }}</button>}
          </div>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table equipment">
            <thead>
              <tr>
                <th scope="col">{{ 'อุปกรณ์' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'ที่ตั้ง' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'ความสำคัญ' | tx }}</th>
                <th scope="col" class="w-status">{{ 'ความพร้อม' | tx }}</th>
                <th scope="col" class="w-due">{{ 'PM ถัดไป' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สอบเทียบ' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (e of pager.rows(); track e.id) {
                @let r = ready(e);
                @let pm = pmOf(e);
                @let cal = calOf(e);
                <tr tabindex="0" [class.selected]="e.id === selectedId()" [attr.aria-selected]="e.id === selectedId()" (click)="pick(e.id)" (keydown.enter)="pick(e.id)">
                  <td><b>{{ e.name | tx }}</b><div class="secondary">{{ e.id }} · {{ e.maker }} {{ e.model }}</div></td>
                  <td>{{ e.location | tx }}@if (e.bed) {<div class="secondary">{{ 'เตียง {bed}' | tx: { bed: e.bed } }}</div>}</td>
                  <td><span class="chip" [class]="'chip ' + CRIT[e.criticality].cls">{{ CRIT[e.criticality].label | tx }}</span></td>
                  <td>
                    @if (e.status === 'decommissioned') {<span class="chip quiet">{{ STATUS[e.status].label | tx }}</span>}
                    @else {<span class="chip" [class]="'chip ' + READY[r.state].cls">{{ READY[r.state].label | tx }}</span>}
                  </td>
                  <td class="num">@if (pm) {<span>{{ pm.due }}</span><div class="secondary" [class.text-danger]="pmS(e) === 'overdue'">{{ DUE[pmS(e)!].label | tx }}</div>} @else {—}</td>
                  <td>@if (cal) {<span class="chip" [class]="'chip ' + CAL[cal].cls">{{ CAL[cal].label | tx }}</span>} @else {<span class="secondary">{{ 'ไม่ต้องสอบเทียบ' | tx }}</span>}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ 'ไม่มีอุปกรณ์ที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (creating()) {
        <bo-drawer [heading]="'ขึ้นทะเบียนอุปกรณ์'" [sub]="'PM ครั้งแรกวางแผนหนึ่งรอบจากวันนี้'" (closed)="creating.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'ชื่ออุปกรณ์' | tx }}<input class="ui-input" [value]="form().name" (input)="set('name', $any($event.target).value)" /></label>
            <label>{{ 'ชนิด' | tx }}
              <select class="ui-input" (change)="set('cls', $any($event.target).value)">
                @for (c of classes; track c) {<option [value]="c" [selected]="c === form().cls">{{ CLASS[c].label | tx }}</option>}
              </select>
            </label>
            <label>{{ 'ความสำคัญ' | tx }}
              <select class="ui-input" (change)="set('criticality', $any($event.target).value)">
                @for (c of crits; track c) {<option [value]="c" [selected]="c === form().criticality">{{ CRIT[c].label | tx }}</option>}
              </select>
            </label>
            <label>{{ 'ผู้ผลิต' | tx }}<input class="ui-input" [value]="form().maker" (input)="set('maker', $any($event.target).value)" /></label>
            <label>{{ 'รุ่น' | tx }}<input class="ui-input" [value]="form().model" (input)="set('model', $any($event.target).value)" /></label>
            <label class="full">{{ 'หมายเลขเครื่อง' | tx }}<input class="ui-input" [value]="form().serial" (input)="set('serial', $any($event.target).value)" /></label>
            <label>{{ 'ที่ตั้ง' | tx }}
              <select class="ui-input" (change)="pickLocation($any($event.target).value)">
                @for (l of locations; track l) {<option [value]="l" [selected]="l === form().location">{{ l | tx }}</option>}
              </select>
            </label>
            <label>{{ 'เตียง (M10)' | tx }}
              <select class="ui-input" [disabled]="!beds().length" (change)="set('bed', $any($event.target).value)">
                <option value="" [selected]="!form().bed">{{ 'ไม่ผูกเตียง' | tx }}</option>
                @for (b of beds(); track b) {<option [value]="b" [selected]="b === form().bed">{{ b }}</option>}
              </select>
            </label>
            <label>{{ 'วันที่ซื้อ' | tx }}<input class="ui-input" type="date" [value]="form().purchasedAt" (input)="set('purchasedAt', $any($event.target).value)" /></label>
            <label>{{ 'ราคาซื้อ (บาท)' | tx }}<input class="ui-input" inputmode="decimal" [value]="form().purchaseCost" (input)="set('purchaseCost', $any($event.target).value)" /></label>
            <label>{{ 'รอบ PM (เดือน)' | tx }}<input class="ui-input" inputmode="numeric" [value]="form().pmMonths" (input)="set('pmMonths', $any($event.target).value)" /></label>
            <label>{{ 'รอบสอบเทียบ (เดือน)' | tx }}<input class="ui-input" inputmode="numeric" [placeholder]="'ว่างถ้าไม่ต้องสอบเทียบ' | tx" [value]="form().calibrationMonths" (input)="set('calibrationMonths', $any($event.target).value)" /></label>
          </div>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="creating.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="create()">{{ 'ขึ้นทะเบียน' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as e) {
        @let r = ready(e);
        <bo-drawer [heading]="e.name | tx" [sub]="e.id + ' · ' + (CLASS[e.cls].label | tx)" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'ผู้ผลิต / รุ่น' | tx }}</dt><dd>{{ e.maker }} {{ e.model }}</dd>
            <dt>{{ 'หมายเลขเครื่อง' | tx }}</dt><dd>{{ e.serial }}</dd>
            <dt>{{ 'ที่ตั้ง' | tx }}</dt><dd>{{ e.location | tx }}@if (e.bed) { · {{ 'เตียง {bed}' | tx: { bed: e.bed } }}}</dd>
            <dt>{{ 'สถานะ' | tx }}</dt><dd><span class="chip" [class]="'chip ' + STATUS[e.status].cls">{{ STATUS[e.status].label | tx }}</span></dd>
            <dt>{{ 'สัญญาบริการ' | tx }}</dt><dd>@for (c of contracts(e); track c.id) {<div>{{ c.id }} · {{ c.vendor | tx }}</div>} @empty {<span class="text-danger">{{ 'ไม่มี' | tx }}</span>}</dd>
          </dl>
          @if (e.status !== 'decommissioned') {
            <div class="sum-row"><b>{{ 'ความพร้อม' | tx }}</b><span class="chip" [class]="'chip ' + READY[r.state].cls">{{ READY[r.state].label | tx }}</span></div>
            <ul class="checks">@for (x of r.reasons; track x) {<li>{{ x | tx }}</li>} @empty {<li class="ok-text">{{ 'ไม่มีรายการค้าง' | tx }}</li>}</ul>
          }
          <ng-container foot>
            @if (e.status !== 'decommissioned') {<button uiButton variant="secondary" size="sm" type="button" (click)="actions.moveEquipment(e)">{{ 'แก้ไขที่ตั้ง' | tx }}</button>}
            <span class="grow"></span>
            <button uiButton size="sm" type="button" (click)="actions.openEquipment(e.id)">{{ 'เปิดรายละเอียด' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class RegistryComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly CLASS = EQUIPMENT_CLASS;
  protected readonly CRIT = CRITICALITY;
  protected readonly STATUS = EQUIPMENT_STATUS;
  protected readonly READY = READINESS;
  protected readonly DUE = DUE_STATE;
  protected readonly CAL = CALIBRATION_STATE;
  protected readonly classes = CLASSES;
  protected readonly crits = Object.keys(CRITICALITY) as Criticality[];
  protected readonly locations = Object.keys(LOCATIONS);
  protected readonly statuses = STATUSES;

  protected readonly query = signal('');
  protected readonly location = signal('');
  protected readonly cls = signal<EquipmentClass | ''>('');
  protected readonly status = signal<Equipment['status'] | ''>('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.store.data().equipment.filter(e => (this.status() ? e.status === this.status() : e.status !== 'decommissioned')
      && (!this.location() || e.location === this.location()) && (!this.cls() || e.cls === this.cls())
      && (!q || [e.name, e.id, e.serial, e.maker, e.model].some(v => v.toLowerCase().includes(q))));
  });
  protected readonly selected = computed(() => this.store.data().equipment.find(e => e.id === this.selectedId()) ?? null);

  protected readonly creating = signal(false);
  protected readonly form = signal<EquipmentInput>({ ...BLANK });
  protected readonly beds = computed(() => bedsAt(this.form().location));
  protected readonly problems = computed(() => equipmentProblems(this.store.data(), this.form()));

  protected ready(e: Equipment) {
    return readiness(this.store.data(), e);
  }

  protected pmOf(e: Equipment) {
    return e.status === 'decommissioned' ? undefined : openPm(this.store.data(), e.id);
  }

  protected pmS(e: Equipment) {
    return pmState(this.store.data(), e);
  }

  protected calOf(e: Equipment) {
    return calibrationState(this.store.data(), e);
  }

  protected contracts(e: Equipment) {
    return contractsOf(this.store.data(), e.id);
  }

  protected pick(id: string) {
    this.creating.set(false);
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected openCreate() {
    this.selectedId.set(null);
    this.creating.set(true);
  }

  protected set<K extends keyof EquipmentInput>(key: K, value: EquipmentInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected pickLocation(location: string) {
    this.form.set({ ...this.form(), location, bed: '' });
  }

  protected create() {
    this.actions.addEquipment(this.form(), e => {
      this.creating.set(false);
      this.form.set({ ...BLANK });
      this.status.set('');
      this.selectedId.set(e.id);
    });
  }
}
