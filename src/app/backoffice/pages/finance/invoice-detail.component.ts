/* One invoice: its lines, what it comes to, its payments and refunds, and what may be done with it in its state (FIN-BILL-02) */
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowLeft, lucidePrinter } from '@ng-icons/lucide';
import { map } from 'rxjs';

import { UiButton } from '../../../user-management/ui';
import { baht } from '../../../clinic/data/rail';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { DISCOUNT_STATUS, EXPORT_STATUS, DOC_TYPE, exportsOf, INVOICE_STATUS, linesOf, lineTotal, PAYMENT_STATUS, REFUND_STATUS, refundable, statusOf, summaryOf } from '../../data/finance';
import { TxPipe } from '../../i18n/bo-i18n';

@Component({
  selector: 'bo-invoice-detail',
  imports: [RouterLink, NgIcon, TxPipe, UiButton],
  template: `
    @if (invoice(); as i) {
      @let st = statusOf(i);
      @let sum = summaryOf(i);
      <div class="page-head">
        <div class="title-block">
          <a class="link back" routerLink="/backoffice/finance/invoices"><ng-icon [svg]="icons.back" aria-hidden="true" />{{ 'ใบแจ้งหนี้' | tx }}</a>
          <h1>{{ i.no || (('ฉบับร่าง' | tx) + ' ' + i.id) }} <span class="chip" [class]="'chip ' + STATUS[st].cls">{{ STATUS[st].label | tx }}</span></h1>
          <div class="subtitle">
            <span>{{ i.ownerKey }} · {{ i.pet }} · {{ i.title | tx }}</span>
            @if (i.encounter) {<span>{{ 'Visit' | tx }} {{ i.encounter }}</span>}
            <span>{{ 'สร้าง' | tx }} {{ i.date }}</span>
            @if (i.issuedAt) {<span>{{ 'ออก' | tx }} {{ i.issuedAt }}</span>}
            @if (i.dueAt) {<span>{{ 'ครบกำหนด' | tx }} {{ i.dueAt }}</span>}
            @if (i.cancelledAt) {<span class="text-danger">{{ 'ยกเลิก' | tx }} {{ i.cancelledAt }} · {{ i.cancelReason | tx }}</span>}
          </div>
        </div>
        <div class="page-actions">
          @if (st !== 'draft') {
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.printInvoice(i)"><ng-icon [svg]="icons.print" aria-hidden="true" />{{ 'พิมพ์ใบแจ้งหนี้' | tx }}</button>
          }
        </div>
      </div>

      <div class="record">
        <div class="record-main">
          <div class="panel">
            <div class="filter-bar"><b>{{ 'รายการ' | tx }}</b><span class="secondary grow">{{ '{n} รายการ · ราคาและยอดรวมมาจากบันทึก ไม่คำนวณใหม่ในหน้านี้' | tx: { n: lines().length } }}</span></div>
            <div class="table-wrap">
              <table class="bo-table lines">
                <thead>
                  <tr>
                    <th scope="col" class="w-kind">{{ 'ต้นทาง' | tx }}</th>
                    <th scope="col">{{ 'รายการ' | tx }}</th>
                    <th scope="col" class="w-amount num">{{ 'จำนวน' | tx }}</th>
                    <th scope="col" class="w-amount num">{{ 'ราคาต่อหน่วย' | tx }}</th>
                    <th scope="col" class="w-amount num">{{ 'ส่วนลด' | tx }}</th>
                    <th scope="col" class="w-amount num">{{ 'ภาษี' | tx }}</th>
                    <th scope="col" class="w-amount num">{{ 'รวม' | tx }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of lines(); track $index) {
                    <tr class="static">
                      <td class="muted">{{ l.source }}</td>
                      <td>{{ l.name | tx }}</td>
                      <td class="num">{{ l.qty }}</td>
                      <td class="num">{{ baht(l.unitPrice) }}</td>
                      <td class="num">{{ l.discount ? baht(l.discount) : '—' }}</td>
                      <td class="num">{{ l.taxRate ? l.taxRate + '%' : '—' }}</td>
                      <td class="num">{{ baht(lineTotal(l)) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Every payment, and the refunds against it -->
          <div class="panel">
            <div class="filter-bar"><b>{{ 'การรับชำระและคืนเงิน' | tx }}</b><span class="secondary grow">{{ 'คืนเงินผูกกับการชำระแต่ละครั้ง ไม่ใช่ใบแจ้งหนี้ทั้งใบ' | tx }}</span></div>
            <div class="table-wrap">
              <table class="bo-table ledger">
                <thead>
                  <tr>
                    <th scope="col" class="w-at">{{ 'เมื่อ' | tx }}</th>
                    <th scope="col" class="w-kind">{{ 'ช่องทาง' | tx }}</th>
                    <th scope="col">{{ 'เลขอ้างอิง / เหตุผล' | tx }}</th>
                    <th scope="col" class="w-amount num">{{ 'จำนวนเงิน' | tx }}</th>
                    <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                    <th scope="col" class="w-owner">{{ 'โดย' | tx }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of i.payments ?? []; track $index; let index = $index) {
                    <tr class="static">
                      <td class="num">{{ p[0] }}</td>
                      <td>{{ p[2] | tx }}</td>
                      <td>{{ p[4] || '—' }}@if (refundable(i, index) < p[1]) {<div class="secondary">{{ 'คืนได้อีก' | tx }} {{ baht(refundable(i, index)) }}</div>}</td>
                      <td class="num">{{ baht(p[1]) }}</td>
                      <td><span class="chip" [class]="'chip ' + PAYMENT_STATUS[p[5] ?? 'completed'].cls">{{ PAYMENT_STATUS[p[5] ?? 'completed'].label | tx }}</span></td>
                      <td>{{ p[3] | tx }}</td>
                    </tr>
                    @for (r of refundsOf(i, index); track r.id) {
                      <tr class="static nested">
                        <td class="num">{{ r.decidedAt ?? r.at }}</td>
                        <td class="muted">{{ 'คืนเงิน' | tx }} · {{ r.id }}</td>
                        <td>{{ r.reason | tx }}@if (r.approvalId) {<div class="secondary"><a class="link" routerLink="/backoffice/home/approvals">{{ 'ผ่านการอนุมัติ' | tx }} {{ r.approvalId }}</a></div>}</td>
                        <td class="num text-danger">−{{ baht(r.amount) }}</td>
                        <td><span class="chip" [class]="'chip ' + REFUND_STATUS[r.status].cls">{{ REFUND_STATUS[r.status].label | tx }}</span></td>
                        <td>{{ (r.decidedBy ?? r.by) | tx }}</td>
                      </tr>
                    }
                  } @empty {
                    <tr class="static"><td colspan="6" class="empty">{{ 'ยังไม่มีการรับชำระ' | tx }}</td></tr>
                  }
                  @for (r of unlinkedRefunds(i); track r.id) {
                    <tr class="static">
                      <td class="num">{{ r.at }}</td>
                      <td class="muted">{{ 'คืนเงิน' | tx }} · {{ r.id }}</td>
                      <td>{{ r.reason | tx }}</td>
                      <td class="num">{{ baht(r.amount) }}</td>
                      <td><span class="chip" [class]="'chip ' + REFUND_STATUS[r.status].cls">{{ REFUND_STATUS[r.status].label | tx }}</span></td>
                      <td>{{ r.by | tx }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- What went to the accounting system, and what the back office did -->
          <div class="panel">
            <div class="filter-bar"><b>{{ 'บัญชีและบันทึกตรวจสอบ' | tx }}</b><span class="secondary grow">{{ '"ส่งแล้ว" หมายถึงระบบบัญชีรับข้อมูล ไม่ใช่ GL หรือ e-Tax' | tx }}</span></div>
            <div class="timeline">
              @for (x of exports(); track x.id) {
                <div class="tl">
                  <span class="chip" [class]="'chip ' + EXPORT_STATUS[x.status].cls">{{ EXPORT_STATUS[x.status].label | tx }}</span>
                  <b>{{ DOC_TYPE[x.docType] | tx }} · {{ baht(x.amount) }} → {{ x.adapter }}</b>
                  <div class="secondary">{{ x.lastAt }} · {{ 'ครั้งที่' | tx }} {{ x.attempts }}@if (x.externalRef) { · {{ x.externalRef }}}@if (x.errorText) { · {{ x.errorText | tx }}}</div>
                </div>
              }
              @for (e of activity(); track e.id) {
                <div class="tl"><b>{{ e.action | tx }}</b><div class="secondary">{{ e.at }} · {{ e.by | tx }}@if (e.detail) { · {{ e.detail | tx }}}</div></div>
              }
              @if (!exports().length && !activity().length) {<p class="muted">{{ 'ยังไม่มีเหตุการณ์' | tx }}</p>}
            </div>
          </div>
        </div>

        <!-- The summary, and what the state allows -->
        <aside class="record-rail">
          <div class="panel summary">
            <div class="sum-row"><span>{{ 'ยอดก่อนส่วนลด' | tx }}</span><span class="num">{{ baht(sum.subtotal) }}</span></div>
            <div class="sum-row"><span>{{ 'ส่วนลด' | tx }}</span><span class="num">{{ sum.discounts ? '−' + baht(sum.discounts) : '—' }}</span></div>
            <div class="sum-row"><span>{{ 'ภาษี' | tx }}</span><span class="num">{{ sum.tax ? baht(sum.tax) : '—' }}</span></div>
            <div class="sum-row total"><span>{{ 'ยอดรวม' | tx }}</span><span class="num">{{ baht(sum.total) }}</span></div>
            <div class="sum-row"><span>{{ 'ชำระแล้ว' | tx }}</span><span class="num">{{ baht(sum.paid) }}</span></div>
            @if (sum.refunded) {<div class="sum-row"><span>{{ 'คืนเงินแล้ว' | tx }}</span><span class="num">−{{ baht(sum.refunded) }}</span></div>}
            <div class="sum-row total" [class.text-danger]="sum.balance > 0 && (st === 'issued' || st === 'partial')"><span>{{ 'ยอดคงเหลือ' | tx }}</span><span class="num">{{ st === 'cancelled' || st === 'draft' ? '—' : baht(sum.balance) }}</span></div>
            @for (d of i.discounts ?? []; track d.id) {
              <div class="secondary">{{ 'ส่วนลด' | tx }} {{ d.id }} · {{ baht(d.amount) }} · {{ DISCOUNT_STATUS[d.status].label | tx }} · {{ d.reason | tx }}</div>
            }
          </div>
          <div class="panel actions">
            @switch (st) {
              @case ('draft') {
                <button uiButton size="sm" type="button" (click)="actions.issueInvoice(i)">{{ 'ออกใบแจ้งหนี้' | tx }}</button>
                <button uiButton variant="secondary" size="sm" type="button" (click)="actions.requestDiscount(i)">{{ 'ส่วนลด' | tx }}</button>
                <button uiButton variant="danger" size="sm" type="button" (click)="actions.cancelInvoice(i)">{{ 'ยกเลิกฉบับร่าง' | tx }}</button>
              }
              @case ('issued') {
                <button uiButton size="sm" type="button" (click)="actions.collect(i)">{{ 'รับชำระ' | tx }}</button>
                <button uiButton variant="secondary" size="sm" type="button" (click)="actions.requestDiscount(i)">{{ 'ส่วนลด' | tx }}</button>
                <button uiButton variant="danger" size="sm" type="button" (click)="actions.cancelInvoice(i)">{{ 'ยกเลิกใบแจ้งหนี้' | tx }}</button>
              }
              @case ('partial') {
                <button uiButton size="sm" type="button" (click)="actions.collect(i)">{{ 'รับชำระส่วนที่เหลือ' | tx }}</button>
                <button uiButton variant="secondary" size="sm" type="button" (click)="actions.requestDiscount(i)">{{ 'ส่วนลด' | tx }}</button>
                <button uiButton variant="secondary" size="sm" type="button" (click)="actions.requestRefund(i)">{{ 'คืนเงิน' | tx }}</button>
              }
              @case ('paid') {
                <button uiButton variant="secondary" size="sm" type="button" (click)="actions.printReceipt(i)">{{ 'พิมพ์ใบเสร็จ' | tx }}</button>
                <button uiButton variant="secondary" size="sm" type="button" (click)="actions.requestRefund(i)">{{ 'คืนเงิน' | tx }}</button>
              }
              @default {
                <p class="secondary">{{ 'อ่านและพิมพ์ได้เท่านั้น · ค่าใช้จ่ายใหม่ต้องออกใบแจ้งหนี้ใหม่' | tx }}</p>
              }
            }
            @if (st === 'partial') {<button uiButton variant="secondary" size="sm" type="button" (click)="actions.printReceipt(i)">{{ 'พิมพ์ใบเสร็จ' | tx }}</button>}
          </div>
        </aside>
      </div>
    } @else {
      <div class="panel"><p class="empty">{{ 'ไม่พบใบแจ้งหนี้' | tx }} · <a class="link" routerLink="/backoffice/finance/invoices">{{ 'กลับไปรายการ' | tx }}</a></p></div>
    }
  `,
  host: { class: 'page' },
})
export class InvoiceDetailComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly route = inject(ActivatedRoute);
  protected readonly icons = { back: lucideArrowLeft, print: lucidePrinter };
  protected readonly STATUS = INVOICE_STATUS;
  protected readonly PAYMENT_STATUS = PAYMENT_STATUS;
  protected readonly REFUND_STATUS = REFUND_STATUS;
  protected readonly DISCOUNT_STATUS = DISCOUNT_STATUS;
  protected readonly EXPORT_STATUS = EXPORT_STATUS;
  protected readonly DOC_TYPE = DOC_TYPE;
  protected readonly baht = baht;
  protected readonly statusOf = statusOf;
  protected readonly summaryOf = summaryOf;
  protected readonly lineTotal = lineTotal;
  protected readonly refundable = refundable;

  private readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: this.route.snapshot.paramMap.get('id') ?? '' });
  protected readonly invoice = computed(() => this.store.clinic.data().invoices.find(i => i.id === this.id()) ?? null);
  protected readonly lines = computed(() => (this.invoice() ? linesOf(this.invoice()!) : []));
  protected readonly exports = computed(() => (this.invoice() ? exportsOf(this.store.data(), this.invoice()!.id) : []));
  protected readonly activity = computed(() => {
    const i = this.invoice();
    return i ? this.store.data().activity.filter(e => e.module === 'M11' && [e.target, e.ref].some(x => x === i.no || x === i.id || (i.no && x.includes(i.no)))) : [];
  });

  protected refundsOf(i: NonNullable<ReturnType<InvoiceDetailComponent['invoice']>>, paymentIndex: number) {
    return (i.refunds ?? []).filter(r => r.paymentIndex === paymentIndex);
  }

  protected unlinkedRefunds(i: NonNullable<ReturnType<InvoiceDetailComponent['invoice']>>) {
    return (i.refunds ?? []).filter(r => r.paymentIndex < 0);
  }
}
