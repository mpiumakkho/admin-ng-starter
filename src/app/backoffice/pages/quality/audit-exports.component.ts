/* Audit export requests: an export needs a purpose from the approved list and someone else's approval; the server makes the file and audits it (GOV-AUD-02, M13) */
import { Component, computed, inject, signal } from '@angular/core';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { EXPORT_PURPOSES, EXPORT_STATUS, exportDecideBlock, exportProblems, type ExportInput, RANGE_DAYS, SHAPE, SHAPES } from '../../data/governance';
import type { AuditExport } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

const BLANK: ExportInput = { shape: 'patient', value: '', days: 30, purpose: '', reference: '' };

@Component({
  selector: 'bo-audit-exports',
  imports: [PagerFoot, TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'คำขอส่งออก Audit'" [source]="'GOV-AUD-02 · M13 · GET /audit/v1/events/export พร้อม purpose และ approval_id · การดูไม่ใช่การส่งออก · ผู้ขออนุมัติตัวเองไม่ได้ · ทุกการส่งออกบันทึก audit.export.performed'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />
    <p class="notice warn">{{ 'การส่งออกต้องมีวัตถุประสงค์และการอนุมัติก่อน · backend ยังไม่บังคับ purpose/approval_id จึงยังไม่พร้อมใช้งานจริง' | tx }}</p>

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar"><b>{{ 'ประวัติคำขอส่งออก' | tx }}</b><span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span></div>
          <div class="table-wrap">
            <table class="bo-table exports">
              <thead><tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col">{{ 'ขอบเขต' | tx }}</th>
                <th scope="col">{{ 'วัตถุประสงค์' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'ไฟล์ / หมดอายุ' | tx }}</th>
              </tr></thead>
              <tbody>
                @for (x of pager.rows(); track x.id) {
                  <tr tabindex="0" [class.selected]="x.id === selectedId()" [attr.aria-selected]="x.id === selectedId()" (click)="pick(x.id)" (keydown.enter)="pick(x.id)">
                    <td><b>{{ x.id }}</b><div class="secondary">{{ x.requestedAt }}</div></td>
                    <td>{{ SHAPE[x.shape] | tx }}@if (x.value) { · {{ x.value | tx }}}<div class="secondary">{{ x.from }} → {{ x.to }} · {{ x.requestedBy | tx }}</div></td>
                    <td>{{ x.purpose | tx }}<div class="secondary">{{ x.reference }}</div></td>
                    <td><span class="chip" [class]="'chip ' + STATUS[x.status].cls">{{ STATUS[x.status].label | tx }}</span>@if (x.decidedBy) {<div class="secondary">{{ x.decidedBy | tx }}</div>}</td>
                    <td>@if (x.artifact) {<span>{{ x.artifact }}</span><div class="secondary">{{ 'หมดอายุ {d}' | tx: { d: x.expires! } }}</div>} @else {—}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <bo-pager [pager]="pager" />
        </div>
      </div>

      <aside class="record-rail">
        @if (selected(); as x) {
          <div class="panel action-card">
            <b>{{ x.id }} · {{ x.purpose | tx }}</b>
            <span class="secondary">{{ 'ขอโดย {who} · {at}' | tx: { who: (x.requestedBy | tx), at: x.requestedAt } }}</span>
            <div class="sum-row"><span>{{ 'ขอบเขต' | tx }}</span><span>{{ SHAPE[x.shape] | tx }}@if (x.value) { · {{ x.value | tx }}}</span></div>
            <div class="sum-row"><span>{{ 'ช่วงเวลา' | tx }}</span><span>{{ x.from }} → {{ x.to }}</span></div>
            <div class="sum-row"><span>{{ 'อ้างอิง' | tx }}</span><b>{{ x.reference }}</b></div>
            <div class="sum-row"><span>{{ 'สถานะ' | tx }}</span><span class="chip" [class]="'chip ' + STATUS[x.status].cls">{{ STATUS[x.status].label | tx }}</span></div>
            @if (x.decision) {<p class="secondary">{{ x.decidedBy | tx }} · {{ x.decidedAt }} — {{ x.decision | tx }}</p>}
            @if (x.status === 'pending') {
              @if (decideIssue(x); as b) {<p class="secondary">{{ b | tx }}</p>}
              <div class="two">
                <button uiButton variant="secondary" size="sm" type="button" [disabled]="!!decideIssue(x)" (click)="actions.decideExport(x, false)">{{ 'ปฏิเสธการส่งออก' | tx }}</button>
                <button uiButton size="sm" type="button" [disabled]="!!decideIssue(x)" (click)="actions.decideExport(x, true)">{{ 'อนุมัติการส่งออก' | tx }}</button>
              </div>
            } @else if (x.status === 'approved') {
              <button uiButton size="sm" type="button" (click)="actions.performExport(x)">{{ 'ส่งออก' | tx }}</button>
            } @else if (x.status === 'ready') {
              <div class="sum-row"><span>{{ 'ไฟล์' | tx }}</span><b>{{ x.artifact }}</b></div>
              <div class="sum-row"><span>{{ 'แถว' | tx }}</span><span>{{ x.rows }}</span></div>
              <p class="secondary">{{ 'ไฟล์สร้างโดย server และบันทึก audit.export.performed แล้ว ดาวน์โหลดได้จนถึง {d}' | tx: { d: x.expires! } }}</p>
            } @else if (x.status === 'expired') {
              <p class="secondary">{{ 'ไฟล์หมดอายุแล้ว ต้องยื่นคำขอใหม่' | tx }}</p>
            }
            <button uiButton variant="ghost" size="sm" type="button" (click)="selectedId.set(null)">{{ 'ยื่นคำขอใหม่' | tx }}</button>
          </div>
        } @else {
          <div class="panel action-card">
            <b>{{ 'ยื่นคำขอส่งออก' | tx }}</b>
            <label class="field">{{ 'รูปแบบการค้น' | tx }}
              <select class="ui-input" (change)="set('shape', $any($event.target).value)">
                @for (s of shapes; track s) {<option [value]="s" [selected]="s === form().shape">{{ SHAPE[s] | tx }}</option>}
              </select>
            </label>
            @if (form().shape !== 'tenant') {
              <label class="field">{{ (form().shape === 'patient' ? 'HN' : 'ผู้ใช้งาน') | tx }}<input class="ui-input" [value]="form().value" (input)="set('value', $any($event.target).value)" /></label>
            }
            <label class="field">{{ 'ช่วงเวลา' | tx }}
              <select class="ui-input" (change)="set('days', +$any($event.target).value)">
                @for (n of ranges; track n) {<option [value]="n" [selected]="n === form().days">{{ (n === 1 ? 'วันนี้' : '{n} วันล่าสุด') | tx: { n: n } }}</option>}
              </select>
            </label>
            <label class="field">{{ 'วัตถุประสงค์' | tx }}
              <select class="ui-input" (change)="set('purpose', $any($event.target).value)">
                <option value="" [selected]="!form().purpose">{{ 'เลือก' | tx }}</option>
                @for (p of purposes; track p) {<option [value]="p" [selected]="p === form().purpose">{{ p | tx }}</option>}
              </select>
            </label>
            <label class="field">{{ 'เลขอ้างอิงของวัตถุประสงค์' | tx }}<input class="ui-input" [placeholder]="'เช่น DSAR-2609-004' | tx" [value]="form().reference" (input)="set('reference', $any($event.target).value)" /></label>
            @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="submit()">{{ 'ยื่นคำขอ' | tx }}</button>
          </div>
        }
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class AuditExportsComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly SHAPE = SHAPE;
  protected readonly STATUS = EXPORT_STATUS;
  protected readonly shapes = SHAPES;
  protected readonly ranges = RANGE_DAYS;
  protected readonly purposes = EXPORT_PURPOSES;

  /** The requests change in place, so every change of the data is a change here */
  protected readonly rows = computed(() => this.store.data().auditExports, { equal: () => false });
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.rows().find(x => x.id === this.selectedId()) ?? null, { equal: () => false });
  protected readonly form = signal<ExportInput>({ ...BLANK });
  protected readonly problems = computed(() => exportProblems(this.form()));

  protected decideIssue(x: AuditExport) {
    return exportDecideBlock(x, this.store.userName());
  }

  protected pick(id: string) {
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected set<K extends keyof ExportInput>(key: K, value: ExportInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected submit() {
    this.actions.requestExport(this.form(), x => {
      this.form.set({ ...BLANK });
      this.selectedId.set(x.id);
    });
  }
}
