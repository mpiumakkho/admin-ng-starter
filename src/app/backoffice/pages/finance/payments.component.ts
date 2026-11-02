/* The payment ledger: every payment and refund across the bills, to review what was collected (FIN-PAY-01) */
import { Component, computed, inject, signal } from '@angular/core';

import { baht } from '../../../clinic/data/rail';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { ledger, PAYMENT_METHODS, PAYMENT_STATUS } from '../../data/finance';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-payments',
  imports: [PagerFoot, TxPipe, PageHead],
  template: `
    <bo-page-head [heading]="'รายการชำระเงิน'" [source]="'M11 · การรับชำระและการคืนเงินข้ามทุกใบแจ้งหนี้ · รับชำระทำที่ใบแจ้งหนี้'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(sum().received) }}</span><span class="kpi-label">{{ 'รับชำระ · {n} รายการ' | tx: { n: sum().payments } }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(sum().refunded) }}</span><span class="kpi-label">{{ 'คืนเงิน · {n} รายการ' | tx: { n: sum().refunds } }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(sum().received - sum().refunded) }}</span><span class="kpi-label">{{ 'สุทธิตามตัวกรอง' | tx }}</span></div>
    </div>

    <div class="panel">
      <div class="filter-bar">
        <input class="ui-input search" type="search" [placeholder]="'ค้นหาเลขอ้างอิง ใบแจ้งหนี้ หรือเจ้าของ' | tx" [attr.aria-label]="'ค้นหา' | tx" [value]="q()" (input)="q.set($any($event.target).value)" />
        <select class="ui-input" [attr.aria-label]="'ช่องทาง' | tx" (change)="method.set($any($event.target).value)">
          <option value="" [selected]="!method()">{{ 'ทุกช่องทาง' | tx }}</option>
          @for (m of methods; track m.value) {<option [value]="m.value" [selected]="m.value === method()">{{ m.label | tx }}</option>}
        </select>
        <select class="ui-input" [attr.aria-label]="'สถานะ' | tx" (change)="status.set($any($event.target).value)">
          <option value="" [selected]="!status()">{{ 'ทุกสถานะ' | tx }}</option>
          <option value="completed" [selected]="status() === 'completed'">{{ 'รับชำระแล้ว' | tx }}</option>
          <option value="reversed" [selected]="status() === 'reversed'">{{ 'กลับรายการแล้ว' | tx }}</option>
          <option value="refund" [selected]="status() === 'refund'">{{ 'คืนเงิน' | tx }}</option>
        </select>
        <label class="date-field"><span class="visually-hidden">{{ 'ตั้งแต่' | tx }}</span><input class="ui-input" type="date" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
        <span class="secondary">–</span>
        <label class="date-field"><span class="visually-hidden">{{ 'ถึง' | tx }}</span><input class="ui-input" type="date" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
        <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
      </div>
      <div class="table-wrap">
        <table class="bo-table ledger">
          <thead>
            <tr>
              <th scope="col" class="w-at">{{ 'เมื่อ' | tx }}</th>
              <th scope="col" class="w-ref">{{ 'ใบแจ้งหนี้' | tx }}</th>
              <th scope="col">{{ 'เจ้าของ / สัตว์' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'ช่องทาง' | tx }}</th>
              <th scope="col" class="w-ref">{{ 'เลขอ้างอิง' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'จำนวนเงิน' | tx }}</th>
              <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              <th scope="col" class="w-owner">{{ 'โดย' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of pager.rows(); track r.id) {
              <tr tabindex="0" (click)="actions.openInvoice(r.invoice)" (keydown.enter)="actions.openInvoice(r.invoice)">
                <td class="num">{{ r.at }}</td>
                <td><b>{{ r.invoice.no }}</b><div class="secondary">{{ r.id }}</div></td>
                <td>{{ r.invoice.ownerKey }}<div class="secondary">{{ r.invoice.pet }}</div></td>
                <td>{{ r.method | tx }}</td>
                <td>{{ r.reference || '—' }}</td>
                <td class="num" [class.text-danger]="r.amount < 0">{{ r.amount < 0 ? '−' + baht(-r.amount) : baht(r.amount) }}</td>
                <td>
                  @if (r.kind === 'refund') {<span class="chip quiet">{{ 'คืนเงิน' | tx }}</span>}
                  @else {<span class="chip" [class]="'chip ' + PAYMENT_STATUS[r.status === 'reversed' ? 'reversed' : 'completed'].cls">{{ PAYMENT_STATUS[r.status === 'reversed' ? 'reversed' : 'completed'].label | tx }}</span>}
                </td>
                <td>{{ r.by | tx }}</td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="8" class="empty">{{ 'ไม่มีรายการที่ตรงกับตัวกรอง' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <bo-pager [pager]="pager" />
    </div>
  `,
  host: { class: 'page' },
})
export class PaymentsComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly baht = baht;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly PAYMENT_STATUS = PAYMENT_STATUS;

  protected readonly q = signal('');
  protected readonly method = signal('');
  protected readonly status = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');

  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return ledger(this.store.clinic.data()).filter(r => (!this.method() || r.method === this.method())
      && (!this.status() || (this.status() === 'refund' ? r.kind === 'refund' : r.kind === 'payment' && r.status === this.status()))
      && (!this.from() || r.at >= this.from()) && (!this.to() || r.at.slice(0, 10) <= this.to())
      && (!q || `${r.reference} ${r.invoice.no} ${r.invoice.ownerKey} ${r.invoice.pet} ${r.id}`.toLowerCase().includes(q)));
  });
  protected readonly sum = computed(() => {
    const rows = this.rows();
    const payments = rows.filter(r => r.kind === 'payment' && r.status === 'completed');
    const refunds = rows.filter(r => r.kind === 'refund');
    return { payments: payments.length, received: payments.reduce((s, r) => s + r.amount, 0), refunds: refunds.length, refunded: -refunds.reduce((s, r) => s + r.amount, 0) };
  });
}
