/* The accounting delivery queue, the integration side of Finance's records: adapter, tries, error class and the accounting system's reference, one record in two views (INT-ACC-02) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { baht } from '../../../clinic/data/rail';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { DOC_TYPE, EXPORT_STATUS, INVOICE_STATUS, statusOf } from '../../data/finance';
import { attemptsOf, ERROR_CLASS, type ErrorClass, errorClassOf, payloadMeta } from '../../data/integrations';
import type { AccountingExport } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-delivery-queue',
  imports: [RouterLink, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'คิวส่งข้อมูลบัญชี'" [source]="'INT-ACC-02 · M11 accounting_export_log · record ชุดเดียวกับการเงิน > ส่งข้อมูลบัญชี · สถานะส่งแล้วไม่ใช่ผล e-Tax'" [freshness]="'รอบส่งล่าสุด 06:00'" />

    <div class="kpi-strip" role="list">
      @for (s of statusKeys; track s) {
        <button type="button" class="kpi" [class]="'kpi ' + (counts()[s] ? EXPORT_STATUS[s].cls : '')" [class.active]="status() === s" role="listitem" (click)="status.set(status() === s ? '' : s)">
          <span class="kpi-value">{{ counts()[s] }}</span><span class="kpi-label">{{ EXPORT_STATUS[s].label | tx }}</span>
        </button>
      }
    </div>

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <input class="ui-input search" type="search" [placeholder]="'ค้นหาเอกสาร รหัสส่ง หรือเลขอ้างอิง' | tx" [attr.aria-label]="'ค้นหา' | tx" [value]="q()" (input)="q.set($any($event.target).value)" />
          <select class="ui-input" [attr.aria-label]="'ประเภทเอกสาร' | tx" (change)="docType.set($any($event.target).value)">
            <option value="" [selected]="!docType()">{{ 'ทุกประเภท' | tx }}</option>
            @for (d of docTypes; track d) {<option [value]="d" [selected]="d === docType()">{{ DOC_TYPE[d] | tx }}</option>}
          </select>
          <select class="ui-input" [attr.aria-label]="'ประเภทข้อผิดพลาด' | tx" (change)="errorClass.set($any($event.target).value)">
            <option value="" [selected]="!errorClass()">{{ 'ทุกข้อผิดพลาด' | tx }}</option>
            @for (e of errorClasses; track e) {<option [value]="e" [selected]="e === errorClass()">{{ ERROR_CLASS[e] | tx }}</option>}
          </select>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table delivery-queue">
            <thead><tr>
              <th scope="col">{{ 'เอกสารต้นทาง' | tx }}</th>
              <th scope="col" class="w-due">{{ 'วันทำการ' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'จำนวนเงิน' | tx }}</th>
              <th scope="col" class="w-kind">Adapter</th>
              <th scope="col" class="w-status">{{ 'สถานะการส่ง' | tx }}</th>
              <th scope="col" class="w-priority num">{{ 'ครั้ง' | tx }}</th>
              <th scope="col" class="w-at">{{ 'ส่งล่าสุด' | tx }}</th>
              <th scope="col" class="w-ref">{{ 'เลขอ้างอิงระบบบัญชี' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'ประเภทข้อผิดพลาด' | tx }}</th>
            </tr></thead>
            <tbody>
              @for (x of rows(); track x.id) {
                <tr [class.selected]="x.id === selectedId()" tabindex="0" (click)="pick(x)" (keydown.enter)="pick(x)" [attr.aria-selected]="x.id === selectedId()" [attr.aria-label]="x.id + ' ' + x.document">
                  <td><b>{{ x.document }}</b><div class="secondary">{{ x.id }} · {{ DOC_TYPE[x.docType] | tx }}</div></td>
                  <td class="num">{{ x.businessDate }}</td>
                  <td class="num">{{ baht(x.amount) }}</td>
                  <td>{{ x.adapter }}<div class="secondary">API</div></td>
                  <td><span class="chip" [class]="'chip ' + EXPORT_STATUS[x.status].cls">{{ EXPORT_STATUS[x.status].label | tx }}</span></td>
                  <td class="num">{{ x.attempts }}</td>
                  <td class="num">{{ x.attempts ? x.lastAt : '—' }}</td>
                  <td>{{ x.externalRef ?? '—' }}</td>
                  <td>@if (errorClassOf(x.errorCode); as e) {<span class="text-danger">{{ ERROR_CLASS[e] | tx }}</span><div class="secondary">{{ x.errorCode }}</div>} @else {<span class="secondary">—</span>}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="9" class="empty">{{ 'ไม่มีรายการที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p class="secondary foot-note">{{ 'วันทำการเป็นวันของเอกสาร เวลาส่งเป็นเวลาของ adapter' | tx }}</p>
      </div>

      @if (selected(); as x) {
        <bo-drawer [heading]="x.document" [sub]="x.id + ' · ' + DOC_TYPE[x.docType]" (closed)="selectedId.set(null)">
          <h3>{{ 'เอกสารธุรกิจ' | tx }}</h3>
          <dl class="data-grid">
            @if (invoice(); as i) {<dt>{{ 'สถานะเอกสาร' | tx }}</dt><dd><span class="chip" [class]="'chip ' + INVOICE_STATUS[statusOf(i)].cls">{{ INVOICE_STATUS[statusOf(i)].label | tx }}</span></dd>}
            <dt>{{ 'จำนวนเงิน' | tx }}</dt><dd>{{ baht(x.amount) }} · {{ 'วันทำการ' | tx }} {{ x.businessDate }}</dd>
          </dl>
          <h3>{{ 'การส่ง' | tx }}</h3>
          <dl class="data-grid">
            <dt>{{ 'สถานะการส่ง' | tx }}</dt><dd><span class="chip" [class]="'chip ' + EXPORT_STATUS[x.status].cls">{{ EXPORT_STATUS[x.status].label | tx }}</span>@if (x.retryable && x.status === 'failed') { · {{ 'ส่งใหม่ได้' | tx }}}</dd>
            @if (x.errorCode) {<dt>{{ 'ข้อผิดพลาด' | tx }}</dt><dd class="text-danger">{{ x.errorCode }} · {{ x.errorText | tx }}</dd>}
            @if (x.externalRef) {<dt>{{ 'เลขอ้างอิงระบบบัญชี' | tx }}</dt><dd>{{ x.externalRef }} · {{ x.deliveredAt }}</dd>}
            <dt>Idempotency</dt><dd>{{ x.idempotencyKey }}</dd>
          </dl>
          @if (x.status === 'delivered') {<p class="notice info">{{ 'ส่งข้อมูลถึง PEAK แล้ว ไม่ใช่ผล e-Tax' | tx }}</p>}
          <h3>{{ 'การส่งแต่ละครั้ง' | tx }}</h3>
          <ol class="attempts">
            @for (t of attempts(); track t.n) {<li><b>{{ 'ครั้งที่ {n}' | tx: { n: t.n } }}</b> {{ t.at }} · {{ t.result | tx }}@if (t.code) { · {{ t.code }}}</li>}
            @empty {<li class="secondary">{{ 'ยังไม่ได้ส่ง' | tx }}</li>}
          </ol>
          <h3>{{ 'ข้อมูลกำกับ Payload' | tx }}</h3>
          @if (meta(); as m) {
            <dl class="data-grid">
              <dt>Schema</dt><dd>{{ m.schema }}</dd>
              <dt>Mapping</dt><dd>{{ m.mapping }}</dd>
              <dt>{{ 'ขนาด' | tx }}</dt><dd>{{ m.contentType }} · {{ m.size }}</dd>
              <dt>Checksum</dt><dd>{{ m.checksum }}</dd>
            </dl>
          }
          <p class="secondary">{{ 'ไม่แสดง payload เต็ม · ความลับของ adapter ไม่อยู่ในหน้านี้ · การประมวลผลเหตุการณ์ใหม่ (replay) รอสัญญา' | tx }}</p>
          <ng-container foot>
            <a class="link" [routerLink]="['/backoffice/finance/invoices', x.invoiceId]">{{ 'เปิดเอกสารในการเงิน' | tx }}</a>
            <span class="grow"></span>
            @if (x.status === 'failed' && x.retryable) {
              <button uiButton size="sm" type="button" (click)="actions.retryExport(x)">{{ 'ลองส่งใหม่' | tx }}</button>
            }
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class DeliveryQueueComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly baht = baht;
  protected readonly statusOf = statusOf;
  protected readonly errorClassOf = errorClassOf;
  protected readonly EXPORT_STATUS = EXPORT_STATUS;
  protected readonly INVOICE_STATUS = INVOICE_STATUS;
  protected readonly DOC_TYPE = DOC_TYPE;
  protected readonly ERROR_CLASS = ERROR_CLASS;
  protected readonly statusKeys = Object.keys(EXPORT_STATUS) as AccountingExport['status'][];
  protected readonly docTypes = Object.keys(DOC_TYPE) as AccountingExport['docType'][];
  protected readonly errorClasses = Object.keys(ERROR_CLASS) as ErrorClass[];
  protected readonly q = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('q') ?? '');
  protected readonly status = signal<AccountingExport['status'] | ''>('');
  protected readonly docType = signal<AccountingExport['docType'] | ''>('');
  protected readonly errorClass = signal<ErrorClass | ''>('');
  protected readonly selectedId = signal<string | null>(null);

  protected readonly all = computed(() => this.store.data().accountingExports.slice().sort((a, b) => b.lastAt.localeCompare(a.lastAt) || b.id.localeCompare(a.id)));
  protected readonly counts = computed(() => {
    const counts: Record<AccountingExport['status'], number> = { queued: 0, delivered: 0, failed: 0 };
    this.all().forEach(x => counts[x.status]++);
    return counts;
  });
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.all().filter(x => (!this.status() || x.status === this.status()) && (!this.docType() || x.docType === this.docType())
      && (!this.errorClass() || errorClassOf(x.errorCode) === this.errorClass())
      && (!q || `${x.id} ${x.document} ${x.externalRef ?? ''}`.toLowerCase().includes(q)));
  });
  protected readonly selected = computed(() => this.store.data().accountingExports.find(x => x.id === this.selectedId()), { equal: () => false });
  protected readonly invoice = computed(() => this.store.clinic.data().invoices.find(i => i.id === this.selected()?.invoiceId));
  protected readonly attempts = computed(() => (this.selected() ? attemptsOf(this.selected()!) : []), { equal: () => false });
  protected readonly meta = computed(() => (this.selected() ? payloadMeta(this.selected()!) : null));

  protected pick(x: AccountingExport) {
    this.selectedId.set(this.selectedId() === x.id ? null : x.id);
  }
}
