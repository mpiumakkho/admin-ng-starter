/* The day's reconciliation: bills, payments, refunds and accounting deliveries side by side, and where they differ (FIN-BILL-05) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { TODAY } from '../../../clinic/data/model';
import { baht } from '../../../clinic/data/rail';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { reconcile, type Variance } from '../../data/finance';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-reconciliation',
  imports: [RouterLink, TxPipe, UiButton, PageHead, Drawer],
  template: `
    @let day = result();
    <bo-page-head [heading]="'กระทบยอดประจำวัน'" [source]="'M11 · ใบแจ้งหนี้ การรับชำระ การคืนเงิน และการส่งบัญชีของวันทำการ · ไม่ใช่การกระทบยอดธนาคารหรือปิดงวด'" [freshness]="'ตัดยอดสิ้นวันทำการ'">
      <label class="date-field"><span class="visually-hidden">{{ 'วันทำการ' | tx }}</span><input class="ui-input" type="date" [value]="date()" (change)="date.set($any($event.target).value)" /></label>
      <button uiButton size="sm" type="button" (click)="actions.saveReconciliation(date(), day.variances.length)">{{ (day.result ? 'บันทึกผลอีกครั้ง' : 'บันทึกผล') | tx }}</button>
    </bo-page-head>

    @if (day.result; as saved) {
      <div class="notice ok">{{ 'บันทึกผลแล้ว · {by} · {at} · พบ {n} รายการต่าง' | tx: { by: (saved.by | tx), at: saved.at, n: saved.variances } }} — {{ saved.note | tx }}</div>
    }

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(day.totals.issued.amount) }}</span><span class="kpi-label">{{ 'ออกใบแจ้งหนี้ · {n} ใบ' | tx: { n: day.totals.issued.count } }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(day.totals.collected.amount) }}</span><span class="kpi-label">{{ 'รับชำระ · {n} รายการ' | tx: { n: day.totals.collected.count } }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(day.totals.refunded.amount) }}</span><span class="kpi-label">{{ 'คืนเงิน · {n} รายการ' | tx: { n: day.totals.refunded.count } }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(day.totals.net) }}</span><span class="kpi-label">{{ 'รับสุทธิ' | tx }}</span></div>
      <div class="kpi" [class.danger]="day.totals.exports.delivered < day.totals.exports.total" role="listitem"><span class="kpi-value">{{ day.totals.exports.delivered }}/{{ day.totals.exports.total }}</span><span class="kpi-label">{{ 'ส่งบัญชีครบ' | tx }}</span></div>
      <div class="kpi" [class.warn]="day.variances.length" role="listitem"><span class="kpi-value">{{ day.variances.length }}</span><span class="kpi-label">{{ 'รายการต่าง' | tx }}</span></div>
    </div>

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <select class="ui-input" [attr.aria-label]="'ประเภทความต่าง' | tx" (change)="kind.set($any($event.target).value)">
            <option value="" [selected]="!kind()">{{ 'ทุกประเภท' | tx }}</option>
            @for (k of kinds(); track k) {<option [value]="k" [selected]="k === kind()">{{ k | tx }}</option>}
          </select>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead>
              <tr>
                <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
                <th scope="col" class="w-ref">{{ 'อ้างอิง' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ต้นทาง' | tx }}</th>
                <th scope="col" class="w-amount">{{ 'เทียบกับ' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ต่าง' | tx }}</th>
                <th scope="col">{{ 'เหตุผล' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'ผู้รับผิดชอบ' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (v of rows(); track v.kind + v.reference) {
                <tr [class.selected]="v === selected()" tabindex="0" (click)="pick(v)" (keydown.enter)="pick(v)" [attr.aria-selected]="v === selected()">
                  <td>{{ v.kind | tx }}</td>
                  <td><b>{{ v.reference }}</b>@if (v.invoice) {<div class="secondary">{{ v.invoice.ownerKey }}</div>}</td>
                  <td class="num">{{ money(v.source) }}</td>
                  <td>{{ money(v.compared) | tx }}</td>
                  <td class="num text-danger">{{ money(v.difference) }}</td>
                  <td>{{ v.reason | tx }}</td>
                  <td>{{ v.owner | tx }}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="7" class="empty">{{ 'ยอดของวันนี้ตรงกันทุกรายการ' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (selected(); as v) {
        <bo-drawer [heading]="v.kind" [sub]="v.reference" (closed)="selected.set(null)">
          <dl class="data-grid">
            @if (v.invoice) {<dt>{{ 'ใบแจ้งหนี้' | tx }}</dt><dd>{{ v.invoice.no || v.invoice.id }} · {{ v.invoice.ownerKey }} · {{ v.invoice.pet }}</dd>}
            <dt>{{ 'ต้นทาง' | tx }}</dt><dd>{{ money(v.source) }}</dd>
            <dt>{{ 'เทียบกับ' | tx }}</dt><dd>{{ money(v.compared) | tx }}</dd>
            <dt>{{ 'ต่าง' | tx }}</dt><dd>{{ money(v.difference) }}</dd>
            <dt>{{ 'เหตุผล' | tx }}</dt><dd>{{ v.reason | tx }}</dd>
            <dt>{{ 'ผู้รับผิดชอบ' | tx }}</dt><dd>{{ v.owner | tx }}</dd>
          </dl>
          <p class="secondary">{{ 'รายการต่างแก้ที่โมดูลเจ้าของ · หน้านี้บันทึกเฉพาะผลการตรวจของวัน' | tx }}</p>
          <ng-container foot>
            @if (v.link) {<a uiButton size="sm" [routerLink]="v.link">{{ 'เปิดรายการต้นทาง' | tx }}</a>}
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class ReconciliationComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly baht = baht;
  protected readonly date = signal(TODAY);
  protected readonly kind = signal('');
  protected readonly selected = signal<Variance | null>(null);
  protected readonly result = computed(() => reconcile(this.store.clinic.data(), this.store.data(), this.date()));
  protected readonly kinds = computed(() => [...new Set(this.result().variances.map(v => v.kind))]);
  protected readonly rows = computed(() => this.result().variances.filter(v => !this.kind() || v.kind === this.kind()));

  protected pick(v: Variance) {
    this.selected.set(this.selected() === v ? null : v);
  }

  protected money(v: number | string) {
    return typeof v === 'number' ? baht(v) : v;
  }
}
