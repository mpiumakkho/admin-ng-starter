/* Accounting delivery: every bill, receipt and credit note on its way to the accounting system, and another try when one failed (INT-ACC-02, finance projection) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { baht } from '../../../clinic/data/rail';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { DOC_TYPE, EXPORT_STATUS } from '../../data/finance';
import type { AccountingExport } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-exports',
  imports: [PagerFoot, RouterLink, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'ส่งข้อมูลบัญชี'" [source]="'M11 · คิวส่งไป PEAK ชุดเดียวกับ Integration Center · สถานะส่งแล้วคือระบบบัญชีรับข้อมูล ไม่ใช่ e-Tax'" [freshness]="'รอบส่งล่าสุด 06:00'" />

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
          <input class="ui-input search" type="search" [placeholder]="'ค้นหาเอกสารหรือเลขอ้างอิง' | tx" [attr.aria-label]="'ค้นหา' | tx" [value]="q()" (input)="q.set($any($event.target).value)" />
          <select class="ui-input" [attr.aria-label]="'ประเภทเอกสาร' | tx" (change)="docType.set($any($event.target).value)">
            <option value="" [selected]="!docType()">{{ 'ทุกประเภท' | tx }}</option>
            @for (d of docTypes; track d) {<option [value]="d" [selected]="d === docType()">{{ DOC_TYPE[d] | tx }}</option>}
          </select>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead>
              <tr>
                <th scope="col" class="w-ref">{{ 'รหัสส่ง' | tx }}</th>
                <th scope="col">{{ 'เอกสาร' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'จำนวนเงิน' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                <th scope="col" class="w-priority num">{{ 'ครั้ง' | tx }}</th>
                <th scope="col" class="w-at">{{ 'ล่าสุด' | tx }}</th>
                <th scope="col" class="w-ref">{{ 'อ้างอิง PEAK' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (x of pager.rows(); track x.id) {
                <tr [class.selected]="x.id === selected()?.id" tabindex="0" (click)="pick(x)" (keydown.enter)="pick(x)" [attr.aria-selected]="x.id === selected()?.id">
                  <td><b>{{ x.id }}</b></td>
                  <td>{{ x.document }}<div class="secondary">{{ DOC_TYPE[x.docType] | tx }} · {{ 'วันทำการ' | tx }} {{ x.businessDate }}</div></td>
                  <td class="num">{{ baht(x.amount) }}</td>
                  <td><span class="chip" [class]="'chip ' + EXPORT_STATUS[x.status].cls">{{ EXPORT_STATUS[x.status].label | tx }}</span></td>
                  <td class="num">{{ x.attempts }}</td>
                  <td class="num">{{ x.lastAt }}</td>
                  <td>{{ x.externalRef ?? '—' }}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="7" class="empty">{{ 'ไม่มีรายการที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (selected(); as x) {
        <bo-drawer [heading]="x.document" [sub]="x.id + ' · ' + DOC_TYPE[x.docType]" (closed)="selected.set(null)">
          <dl class="data-grid">
            <dt>{{ 'สถานะ' | tx }}</dt><dd><span class="chip" [class]="'chip ' + EXPORT_STATUS[x.status].cls">{{ EXPORT_STATUS[x.status].label | tx }}</span></dd>
            <dt>{{ 'จำนวนเงิน' | tx }}</dt><dd>{{ baht(x.amount) }} · {{ 'วันทำการ' | tx }} {{ x.businessDate }}</dd>
            <dt>Adapter</dt><dd>{{ x.adapter }}</dd>
            <dt>{{ 'ส่งครั้งแรก' | tx }}</dt><dd>{{ x.firstAt }}</dd>
            <dt>{{ 'ล่าสุด' | tx }}</dt><dd>{{ x.lastAt }} · {{ 'ครั้งที่' | tx }} {{ x.attempts }}</dd>
            @if (x.deliveredAt) {<dt>{{ 'ส่งสำเร็จ' | tx }}</dt><dd>{{ x.deliveredAt }} · {{ x.externalRef }}</dd>}
            @if (x.errorCode) {<dt>{{ 'ข้อผิดพลาด' | tx }}</dt><dd class="text-danger">{{ x.errorCode }} · {{ x.errorText | tx }}</dd>}
            <dt>Idempotency</dt><dd>{{ x.idempotencyKey }}</dd>
          </dl>
          <p class="secondary">{{ 'ไม่แสดง payload เต็ม · ความลับของ adapter ไม่อยู่ในหน้านี้' | tx }}</p>
          <ng-container foot>
            <a class="link" [routerLink]="['/backoffice/finance/invoices', x.invoiceId]">{{ 'เปิดใบแจ้งหนี้' | tx }}</a>
            <span class="grow"></span>
            @if (x.status !== 'delivered' && x.retryable) {
              <button uiButton size="sm" type="button" (click)="actions.retryExport(x)">{{ 'ส่งใหม่' | tx }}</button>
            }
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class ExportsComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly baht = baht;
  protected readonly EXPORT_STATUS = EXPORT_STATUS;
  protected readonly DOC_TYPE = DOC_TYPE;
  protected readonly statusKeys = Object.keys(EXPORT_STATUS) as AccountingExport['status'][];
  protected readonly docTypes = Object.keys(DOC_TYPE) as AccountingExport['docType'][];
  protected readonly q = signal('');
  protected readonly status = signal<AccountingExport['status'] | ''>('');
  protected readonly docType = signal<AccountingExport['docType'] | ''>('');
  protected readonly selected = signal<AccountingExport | null>(null);
  protected readonly all = computed(() => this.store.data().accountingExports.slice().sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
  protected readonly counts = computed(() => {
    const counts: Record<AccountingExport['status'], number> = { queued: 0, delivered: 0, failed: 0 };
    this.all().forEach(x => counts[x.status]++);
    return counts;
  });
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.all().filter(x => (!this.status() || x.status === this.status()) && (!this.docType() || x.docType === this.docType())
      && (!q || `${x.id} ${x.document} ${x.externalRef ?? ''}`.toLowerCase().includes(q)));
  });

  protected pick(x: AccountingExport) {
    this.selected.set(this.selected()?.id === x.id ? null : x);
  }
}
