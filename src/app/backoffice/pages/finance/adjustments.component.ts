/* Discounts and refunds: every adjustment with its reason, who made it and the approval it rested on (FIN-BILL-04) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { baht } from '../../../clinic/data/rail';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { adjustments, REFUND_STATUS } from '../../data/finance';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-adjustments',
  imports: [PagerFoot, RouterLink, TxPipe, PageHead],
  template: `
    <bo-page-head [heading]="'ส่วนลดและคืนเงิน'" [source]="'M11 · ขอได้จากใบแจ้งหนี้ · คืนเงินเกิน ฿500 และส่วนลดเกิน 10% ต้องให้ผู้จัดการการเงินอนุมัติ'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <div class="kpi" [class.warn]="counts().requested" role="listitem"><span class="kpi-value">{{ counts().requested }}</span><span class="kpi-label">{{ 'รออนุมัติ' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(counts().refunded) }}</span><span class="kpi-label">{{ 'คืนเงินแล้ว' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(counts().discounted) }}</span><span class="kpi-label">{{ 'ส่วนลดที่ใช้แล้ว' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ counts().rejected }}</span><span class="kpi-label">{{ 'ปฏิเสธ' | tx }}</span></div>
    </div>

    <div class="panel">
      <div class="filter-bar">
        <div class="segmented" role="group" [attr.aria-label]="'ประเภท' | tx">
          <button type="button" [class.active]="kind() === ''" [attr.aria-pressed]="kind() === ''" (click)="kind.set('')">{{ 'ทั้งหมด' | tx }}</button>
          <button type="button" [class.active]="kind() === 'refund'" [attr.aria-pressed]="kind() === 'refund'" (click)="kind.set('refund')">{{ 'คืนเงิน' | tx }}</button>
          <button type="button" [class.active]="kind() === 'discount'" [attr.aria-pressed]="kind() === 'discount'" (click)="kind.set('discount')">{{ 'ส่วนลด' | tx }}</button>
        </div>
        <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
      </div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead>
            <tr>
              <th scope="col" class="w-at">{{ 'เมื่อ' | tx }}</th>
              <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
              <th scope="col" class="w-ref">{{ 'ใบแจ้งหนี้' | tx }}</th>
              <th scope="col">{{ 'เหตุผล' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'จำนวนเงิน' | tx }}</th>
              <th scope="col" class="w-owner">{{ 'ขอโดย' | tx }}</th>
              <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of pager.rows(); track r.id) {
              <tr tabindex="0" (click)="actions.openInvoice(r.invoice)" (keydown.enter)="actions.openInvoice(r.invoice)">
                <td class="num">{{ r.at }}</td>
                <td><b>{{ r.id }}</b><div class="secondary">{{ (r.kind === 'refund' ? 'คืนเงิน' : 'ส่วนลด') | tx }}</div></td>
                <td>{{ r.invoice.no || r.invoice.id }}<div class="secondary">{{ r.invoice.ownerKey }} · {{ r.invoice.pet }}</div></td>
                <td>{{ r.reason | tx }}@if (r.approvalId) {<div class="secondary"><a class="link" routerLink="/backoffice/home/approvals" (click)="$event.stopPropagation()">{{ 'รายการอนุมัติ' | tx }} {{ r.approvalId }}</a></div>}</td>
                <td class="num">{{ baht(r.amount) }}</td>
                <td>{{ r.by | tx }}</td>
                <td><span class="chip" [class]="'chip ' + statusCls(r.status)">{{ statusLabel(r.status, r.kind) | tx }}</span></td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="7" class="empty">{{ 'ยังไม่มีรายการ' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <bo-pager [pager]="pager" />
    </div>
  `,
  host: { class: 'page' },
})
export class AdjustmentsComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly baht = baht;
  protected readonly kind = signal<'' | 'refund' | 'discount'>('');
  protected readonly all = computed(() => adjustments(this.store.clinic.data()));
  protected readonly rows = computed(() => this.all().filter(r => !this.kind() || r.kind === this.kind()));
  protected readonly counts = computed(() => ({
    requested: this.all().filter(r => r.status === 'requested').length,
    rejected: this.all().filter(r => r.status === 'rejected').length,
    refunded: this.all().filter(r => r.kind === 'refund' && r.status === 'done').reduce((s, r) => s + r.amount, 0),
    discounted: this.all().filter(r => r.kind === 'discount' && r.status === 'applied').reduce((s, r) => s + r.amount, 0),
  }));

  protected statusCls(status: string) {
    return status === 'requested' ? 'warn' : status === 'rejected' ? 'danger' : 'ok';
  }

  protected statusLabel(status: string, kind: 'refund' | 'discount') {
    return kind === 'refund' ? REFUND_STATUS[status as keyof typeof REFUND_STATUS].label : status === 'applied' ? 'ใช้แล้ว' : REFUND_STATUS[status as 'requested' | 'rejected'].label;
  }
}
