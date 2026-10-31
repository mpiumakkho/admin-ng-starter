/* Customer revenue overview: M11's money by source, M16's claims and M15's messages side by side, each from its owner, and what needs attention (sales.overview, COMPOSED) */
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { baht } from '../../../clinic/data/rail';
import { BackofficeStore } from '../../backoffice.store';
import { revenueOverview } from '../../data/sales';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-revenue-overview',
  imports: [RouterLink, TxPipe, PageHead],
  template: `
    @let o = overview();
    <bo-page-head [heading]="'ภาพรวมรายได้จากลูกค้า'" [source]="'รวมจาก M11 M15 M16 ตามสิทธิ์ · ไม่ใช่การรับรู้รายได้ทางบัญชี · Retail (M18) และ Wellness (M32) เป็น P4 ยังไม่มีข้อมูล'" [freshness]="'ตัดยอด ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <a class="kpi" role="listitem" routerLink="/backoffice/finance/payments">
        <span class="kpi-value">{{ baht(o.collectedToday) }}</span><span class="kpi-label">{{ 'รับชำระวันนี้ · 30 วันสุทธิ {amount}' | tx: { amount: baht(o.collectedMonth) } }}</span>
      </a>
      <a class="kpi" [class.warn]="o.outstanding.count" role="listitem" routerLink="/backoffice/finance/receivables">
        <span class="kpi-value">{{ baht(o.outstanding.amount) }}</span><span class="kpi-label">{{ 'ยอดค้างชำระ · {n} ใบ' | tx: { n: o.outstanding.count } }}</span>
      </a>
      <a class="kpi" [class.warn]="o.claims.waiting.count" role="listitem" routerLink="/backoffice/sales/claims" [queryParams]="{ status: 'submitted' }">
        <span class="kpi-value">{{ baht(o.claims.waiting.amount) }}</span><span class="kpi-label">{{ 'เคลมรอผล · {n} รายการ' | tx: { n: o.claims.waiting.count } }}</span>
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/sales/claims" [queryParams]="{ status: 'approved' }">
        <span class="kpi-value">{{ baht(o.claims.approved.amount) }}</span><span class="kpi-label">{{ 'อนุมัติแล้ว รอรับเงิน · {n}' | tx: { n: o.claims.approved.count } }}</span>
      </a>
      <a class="kpi" [class.info]="o.outbox.ready" role="listitem" routerLink="/backoffice/sales/line">
        <span class="kpi-value">{{ o.outbox.ready }}</span><span class="kpi-label">{{ 'ข้อความ LINE รอส่ง · ติดความยินยอม {n}' | tx: { n: o.outbox.blocked } }}</span>
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/sales/line">
        <span class="kpi-value">{{ o.line.linked }}/{{ o.line.owners }}</span><span class="kpi-label">{{ 'เจ้าของที่เชื่อม LINE · อ่านแล้ว {n}%' | tx: { n: o.line.readRate } }}</span>
      </a>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'รายได้ตามที่มา' | tx }}</b><span class="secondary grow">{{ 'รับชำระตามช่องทางจาก M11 · วันนี้ / 7 วัน / 30 วันถึงวันนี้ · คืนเงินหักแล้ว' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead>
            <tr>
              <th scope="col">{{ 'ที่มา' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'โมดูล' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'วันนี้' | tx }}</th>
              <th scope="col" class="w-amount num">{{ '7 วัน' | tx }}</th>
              <th scope="col" class="w-amount num">{{ '30 วัน' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (s of o.sources; track s.source) {
              <tr class="static">
                <td>{{ s.source | tx }}@if (s.note) {<div class="secondary">{{ s.note | tx }}</div>}</td>
                <td><span class="module-tag"><b>{{ s.module }}</b></span></td>
                <td class="num" [class.text-danger]="s.today < 0">{{ money(s.today) }}</td>
                <td class="num" [class.text-danger]="s.week < 0">{{ money(s.week) }}</td>
                <td class="num" [class.text-danger]="s.month < 0">{{ money(s.month) }}</td>
              </tr>
            }
            <tr class="static">
              <td>{{ 'Retail POS · Wellness plans' | tx }}<div class="secondary">{{ 'M18 / M32 เป็น P4 — ยังไม่มีข้อมูล' | tx }}</div></td>
              <td><span class="module-tag"><b>M18/M32</b></span></td>
              <td class="num muted">—</td><td class="num muted">—</td><td class="num muted">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'ต้องติดตาม' | tx }}</b><span class="secondary grow">{{ '{n} รายการ · แก้ที่โมดูลเจ้าของ' | tx: { n: o.exceptions.length } }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead>
            <tr>
              <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'โมดูล' | tx }}</th>
              <th scope="col" class="w-ref">{{ 'อ้างอิง' | tx }}</th>
              <th scope="col">{{ 'รายละเอียด' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'จำนวนเงิน' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (x of o.exceptions; track x.ref) {
              <tr tabindex="0" (click)="go(x.link)" (keydown.enter)="go(x.link)">
                <td>{{ x.kind | tx }}</td>
                <td><span class="module-tag"><b>{{ x.module }}</b></span></td>
                <td><b>{{ x.ref }}</b></td>
                <td>{{ x.detail | tx }}</td>
                <td class="num">{{ x.amount ? baht(x.amount) : '—' }}</td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีรายการที่ต้องติดตาม' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  host: { class: 'page' },
})
export class RevenueOverviewComponent {
  private readonly store = inject(BackofficeStore);
  private readonly router = inject(Router);
  protected readonly baht = baht;
  protected readonly overview = computed(() => revenueOverview(this.store.clinic.data(), this.store.data()));
  protected go(link: string) {
    this.router.navigateByUrl(link);
  }

  protected money(n: number) {
    return n === 0 ? '—' : n < 0 ? `−${baht(-n)}` : baht(n);
  }
}
