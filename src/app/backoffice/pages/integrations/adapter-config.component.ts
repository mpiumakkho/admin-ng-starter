/* The accounting adapter's settings, read from its typed schema step by step, with what a test can and cannot tell; saving, activating and rotating wait for their contracts (INT-ACC-01, GATED) */
import { Component, computed, inject, signal } from '@angular/core';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { ADAPTER, ADAPTER_TARGETS, CONFIG_STEPS, reviewChecklist } from '../../data/integrations';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-adapter-config',
  imports: [TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'ตั้งค่า Accounting Adapter'" [source]="'INT-ACC-01 · M11 · ADR-0009 (Proposed) · ค่าจาก typed schema ของ adapter · ไม่มีการตั้งค่า e-Tax · สัญญาการออกแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />
    <p class="notice warn">{{ 'สัญญา config schema ข้อมูลลับ และการเปิดใช้ยังไม่อนุมัติ หน้านี้อ่านอย่างเดียว ยกเว้นการทดสอบการเชื่อมต่อ' | tx }}</p>

    <div class="segmented steps" role="group" [attr.aria-label]="'ขั้นตอนการตั้งค่า' | tx">
      @for (s of steps; track s[0]) {<button type="button" [class.active]="step() === s[0]" [attr.aria-pressed]="step() === s[0]" (click)="step.set(s[0])">{{ s[1] | tx }}</button>}
    </div>

    <div class="split with-drawer">
      <section class="panel config-form" [attr.aria-label]="stepLabel() | tx">
        <div class="filter-bar"><b>{{ stepLabel() | tx }}</b><span class="secondary grow">{{ 'อ่านจาก {v}' | tx: { v: adapter.contractVersion } }}</span></div>
        @switch (step()) {
          @case ('adapter') {
            <ul class="target-list">
              @for (t of targets; track t.key) {
                <li [class.current]="t.key === adapter.target"><b>{{ t.name }}</b> <span class="secondary">{{ t.mode | tx }}</span>@if (t.key === adapter.target) { <span class="chip info">{{ 'ใช้งานอยู่' | tx }}</span>}</li>
              }
            </ul>
            <dl class="data-grid">
              <dt>{{ 'สถานะ' | tx }}</dt><dd><span class="chip info">{{ 'เปิดใช้งาน' | tx }}</span> {{ adapter.activatedAt }} · {{ adapter.activatedBy | tx }}</dd>
              <dt>{{ 'เวอร์ชันสัญญา' | tx }}</dt><dd>{{ adapter.contractVersion }}</dd>
              <dt>{{ 'ความสามารถ' | tx }}</dt>
              <dd>@for (c of adapter.capabilities; track c[0]) {<div>{{ (c[1] ? 'มี' : 'ไม่มี') | tx }} · {{ c[0] | tx }}</div>}</dd>
            </dl>
          }
          @case ('connection') {
            <dl class="data-grid">
              @for (f of adapter.connection; track f[0]) {<dt>{{ f[0] | tx }}</dt><dd>{{ f[1] | tx }}</dd>}
              <dt>{{ 'ข้อมูลลับ' | tx }}</dt>
              <dd><span class="chip quiet">{{ 'ตั้งค่าข้อมูลลับแล้ว' | tx }}</span> {{ adapter.credential.label }} · {{ adapter.credential.fingerprint }}
                <div class="secondary">{{ 'เปลี่ยนล่าสุด {at} · {by}' | tx: { at: adapter.credential.rotatedAt, by: (adapter.credential.rotatedBy | tx) } }}</div></dd>
            </dl>
            <p class="secondary foot-note">{{ 'ไม่แสดงหรือคัดลอกค่าข้อมูลลับหลังบันทึก · ไม่มีใบรับรอง e-Tax หรือข้อมูลกรมสรรพากรใน SEPH-1' | tx }}</p>
          }
          @case ('mapping') {
            <div class="table-wrap">
              <table class="bo-table">
                <thead><tr><th scope="col">{{ 'ใน SEPH-1' | tx }}</th><th scope="col">{{ 'ใน PEAK' | tx }}</th></tr></thead>
                <tbody>@for (m of adapter.mapping; track m[0]) {<tr class="static"><td>{{ m[0] | tx }}</td><td>{{ m[1] | tx }}</td></tr>}</tbody>
              </table>
            </div>
            <p class="secondary foot-note">{{ 'การตรวจการจับคู่ข้อมูลแยกจากการตรวจการเชื่อมต่อ · {v}' | tx: { v: adapter.mappingVersion } }}</p>
          }
          @case ('retry') {
            <dl class="data-grid">@for (f of adapter.retry; track f[0]) {<dt>{{ f[0] | tx }}</dt><dd>{{ f[1] | tx }}</dd>}</dl>
            <p class="secondary foot-note">{{ 'ค่าจาก delivery contract · การส่งใหม่ใช้ idempotency key เดิม' | tx }}</p>
          }
          @case ('reconciliation') {
            <dl class="data-grid">@for (f of adapter.reconciliation; track f[0]) {<dt>{{ f[0] | tx }}</dt><dd>{{ f[1] | tx }}</dd>}</dl>
          }
          @case ('review') {
            <ul class="checklist">
              @for (c of checklist(); track c[0]) {<li><span class="chip" [class]="'chip ' + (c[1] ? 'ok' : 'danger')">{{ (c[1] ? 'ผ่าน' : 'ยังไม่ผ่าน') | tx }}</span> <b>{{ c[0] | tx }}</b> <span class="secondary">{{ c[2] | tx }}</span></li>}
            </ul>
            <p class="secondary foot-note">{{ 'ไม่มีการเปลี่ยนแปลงที่รอบันทึก' | tx }}</p>
          }
        }
      </section>

      <aside class="panel config-rail" [attr.aria-label]="'ผลกระทบและการตรวจสอบ' | tx">
        <h2 class="rail-title">{{ 'ทดสอบการเชื่อมต่อ' | tx }}</h2>
        @if (tests()[0]; as t) {
          <p><span class="chip" [class]="'chip ' + (t.result === 'passed' ? 'ok' : 'danger')">{{ (t.result === 'passed' ? 'ผ่าน' : 'ยืนยันตัวตนไม่ผ่าน') | tx }}</span> {{ t.at }}@if (t.code) { · {{ t.code }}}</p>
        }
        <p class="notice info">{{ 'ผลนี้ยืนยันเฉพาะการเชื่อมต่อ' | tx }}</p>
        <button uiButton size="sm" type="button" (click)="actions.testAdapter()">{{ 'ทดสอบการเชื่อมต่อ' | tx }}</button>
        <ol class="test-log">
          @for (t of tests().slice(0, 5); track t.id) {<li><b>{{ t.id }}</b> {{ t.at }} · {{ (t.result === 'passed' ? 'ผ่าน' : 'ยืนยันตัวตนไม่ผ่าน') | tx }}@if (t.ms) { · {{ t.ms }} ms}<div class="secondary">{{ t.by | tx }}</div></li>}
        </ol>
        <h2 class="rail-title">{{ 'action ที่ยังไม่เปิด (GATED)' | tx }}</h2>
        <ul class="plain">@for (g of adapter.gated; track g) {<li>{{ g | tx }}</li>}</ul>
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class AdapterConfigComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly adapter = ADAPTER;
  protected readonly targets = ADAPTER_TARGETS;
  protected readonly steps = CONFIG_STEPS;
  protected readonly step = signal('adapter');
  protected readonly stepLabel = computed(() => CONFIG_STEPS.find(s => s[0] === this.step())![1]);
  protected readonly tests = computed(() => this.store.data().adapterTests.slice());
  protected readonly checklist = computed(() => reviewChecklist(this.store.data()));
}
