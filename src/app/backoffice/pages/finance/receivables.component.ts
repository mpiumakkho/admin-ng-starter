/* Accounts receivable: the bills still owed, aged by their due date (FIN-AR-01) */
import { Component, computed, inject, signal } from '@angular/core';

import { baht } from '../../../clinic/data/rail';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { AGING, type AgingKey, INVOICE_STATUS, receivables, statusOf } from '../../data/finance';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-receivables',
  imports: [PagerFoot, TxPipe, PageHead],
  template: `
    <bo-page-head [heading]="'ลูกหนี้คงค้าง'" [source]="'M11 · ใบแจ้งหนี้ที่ออกแล้วและยังชำระไม่ครบ · อายุหนี้นับจากวันครบกำหนดของแต่ละใบ'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(ar().total) }}</span><span class="kpi-label">{{ 'ค้างชำระทั้งหมด · {n} ใบ' | tx: { n: ar().rows.length } }}</span></div>
      @for (b of ar().buckets; track b.key) {
        @if (b.count || b.key !== 'none') {
          <button type="button" class="kpi" [class]="'kpi ' + (b.count ? b.cls : '')" [class.active]="bucket() === b.key" role="listitem" (click)="bucket.set(bucket() === b.key ? '' : b.key)">
            <span class="kpi-value">{{ baht(b.amount) }}</span><span class="kpi-label">{{ b.label | tx }} · {{ b.count }}</span>
          </button>
        }
      }
    </div>

    <div class="panel">
      <div class="filter-bar"><span class="secondary grow">{{ '{n} ใบ · เปิดใบแจ้งหนี้เพื่อติดตามหรือรับชำระ' | tx: { n: rows().length } }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead>
            <tr>
              <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
              <th scope="col">{{ 'เจ้าของ / สัตว์' | tx }}</th>
              <th scope="col" class="w-due">{{ 'ออกเมื่อ' | tx }}</th>
              <th scope="col" class="w-due">{{ 'ครบกำหนด' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'อายุหนี้' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'ยอดรวม' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'ชำระแล้ว' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'ยอดคงเหลือ' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of pager.rows(); track r.invoice.id) {
              <tr tabindex="0" (click)="actions.openInvoice(r.invoice)" (keydown.enter)="actions.openInvoice(r.invoice)">
                <td><b>{{ r.invoice.no }}</b><div class="secondary">{{ STATUS[statusOf(r.invoice)].label | tx }}</div></td>
                <td>{{ r.invoice.ownerKey }}<div class="secondary">{{ r.invoice.pet }} · {{ r.invoice.title | tx }}</div></td>
                <td class="num">{{ r.invoice.issuedAt?.slice(0, 10) ?? r.invoice.date }}</td>
                <td class="num">{{ r.invoice.dueAt ?? '—' }}</td>
                <td><span class="chip" [class]="'chip ' + aging(r.bucket).cls">{{ r.overdue ? (('เกิน {n} วัน' | tx: { n: r.overdue })) : (aging(r.bucket).label | tx) }}</span></td>
                <td class="num">{{ baht(r.invoice.total) }}</td>
                <td class="num">{{ baht(r.invoice.paid) }}</td>
                <td class="num text-danger">{{ baht(r.balance) }}</td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="8" class="empty">{{ 'ไม่มีลูกหนี้คงค้าง' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <bo-pager [pager]="pager" />
    </div>
  `,
  host: { class: 'page' },
})
export class ReceivablesComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly baht = baht;
  protected readonly STATUS = INVOICE_STATUS;
  protected readonly statusOf = statusOf;
  protected readonly bucket = signal<AgingKey | ''>('');
  protected readonly ar = computed(() => receivables(this.store.clinic.data()));
  protected readonly rows = computed(() => this.ar().rows.filter(r => !this.bucket() || r.bucket === this.bucket()));

  protected aging(key: AgingKey) {
    return AGING.find(b => b.key === key)!;
  }
}
