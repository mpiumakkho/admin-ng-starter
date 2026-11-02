/* The finance overview: the day's figures, each from its source page, and what does not add up (FIN-OVW-01) */
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TODAY } from '../../../clinic/data/model';
import { baht } from '../../../clinic/data/rail';
import { BackofficeStore } from '../../backoffice.store';
import { financeOverview, receivables, reconcile } from '../../data/finance';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-finance-overview',
  imports: [PagerFoot, RouterLink, TxPipe, PageHead],
  template: `
    @let o = overview();
    <bo-page-head [heading]="'ภาพรวมการเงิน'" [source]="'รวมจาก M11 ตามสิทธิ์ · ทุกตัวเลขมีที่มาและเปิดไปหน้าต้นทางได้ · ไม่แก้ไขที่หน้านี้'" [freshness]="'ตัดยอด ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <a class="kpi" role="listitem" routerLink="/backoffice/finance/receivables">
        <span class="kpi-value">{{ baht(o.outstanding.amount) }}</span>
        <span class="kpi-label">{{ 'ยอดค้างชำระ · {n} ใบ · เกินกำหนด {m}' | tx: { n: o.outstanding.count, m: o.outstanding.overdue } }}</span>
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/finance/payments">
        <span class="kpi-value">{{ baht(o.collected.amount) }}</span>
        <span class="kpi-label">{{ 'รับชำระวันนี้ · {n} รายการ' | tx: { n: o.collected.count } }}</span>
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/finance/adjustments">
        <span class="kpi-value">{{ baht(o.refunded.amount) }}</span>
        <span class="kpi-label">{{ 'คืนเงินวันนี้ · {n} รายการ' | tx: { n: o.refunded.count } }}</span>
      </a>
      <a class="kpi" [class.warn]="o.pendingRefunds" role="listitem" routerLink="/backoffice/home/approvals">
        <span class="kpi-value">{{ o.pendingRefunds }}</span>
        <span class="kpi-label">{{ 'คืนเงินรออนุมัติ' | tx }}</span>
      </a>
      <a class="kpi" [class.danger]="o.exports.failed" role="listitem" routerLink="/backoffice/finance/exports">
        <span class="kpi-value">{{ o.exports.delivered }}/{{ o.exports.total }}</span>
        <span class="kpi-label">{{ 'ส่งบัญชีแล้ว · ไม่สำเร็จ {n}' | tx: { n: o.exports.failed } }}</span>
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/finance/invoices" [queryParams]="{ status: 'draft' }">
        <span class="kpi-value">{{ o.drafts }}</span>
        <span class="kpi-label">{{ 'ฉบับร่างค้าง' | tx }}</span>
      </a>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'ข้อยกเว้นของวันนี้' | tx }}</b><span class="secondary grow">{{ '{n} รายการ · เปิดรายการต้นทางเพื่อแก้ไข' | tx: { n: rows().length } }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead>
            <tr>
              <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
              <th scope="col" class="w-ref">{{ 'อ้างอิง' | tx }}</th>
              <th scope="col">{{ 'รายละเอียด' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'จำนวนเงิน' | tx }}</th>
              <th scope="col" class="w-owner">{{ 'ผู้รับผิดชอบ' | tx }}</th>
              <th scope="col" class="w-status"><span class="visually-hidden">{{ 'การทำงาน' | tx }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (v of pager.rows(); track v.reference + v.kind) {
              <tr class="static">
                <td>{{ v.kind | tx }}</td>
                <td><b>{{ v.reference }}</b>@if (v.invoice) {<div class="secondary">{{ v.invoice.ownerKey }} · {{ v.invoice.pet }}</div>}</td>
                <td>{{ v.reason | tx }}</td>
                <td class="num">{{ typeof v.difference === 'number' ? baht(v.difference) : v.difference }}</td>
                <td>{{ v.owner | tx }}</td>
                <td class="row-actions">@if (v.link) {<a class="link" [routerLink]="v.link">{{ 'เปิด' | tx }}</a>}</td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="6" class="empty">{{ 'วันนี้ไม่มีข้อยกเว้นทางการเงิน' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <bo-pager [pager]="pager" />
    </div>
  `,
  host: { class: 'page' },
})
export class FinanceOverviewComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  protected readonly store = inject(BackofficeStore);
  protected readonly baht = baht;
  protected readonly overview = computed(() => financeOverview(this.store.clinic.data(), this.store.data()));
  /** The day's variances, and the bills past their due date */
  protected readonly rows = computed(() => {
    const day = reconcile(this.store.clinic.data(), this.store.data(), TODAY);
    const overdue = receivables(this.store.clinic.data()).rows.filter(r => (r.overdue ?? 0) > 0).map(r => ({
      kind: 'ลูกหนี้เกินกำหนด', reference: r.invoice.no, invoice: r.invoice, difference: r.balance, reason: `เกินกำหนด ${r.overdue} วัน`, owner: 'การเงิน', link: `/backoffice/finance/invoices/${r.invoice.id}`,
    }));
    return [...day.variances, ...overdue];
  });
}
