/* Accounting delivery reconciliation: each billing event against its delivery record, totals by document type, and what is missing, failed, waiting or doubled; with no readback from PEAK the books are never called matched (INT-ACC-03, GATED) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { baht } from '../../../clinic/data/rail';
import { BackofficeStore } from '../../backoffice.store';
import { DOC_TYPE, EXPORT_STATUS } from '../../data/finance';
import { OUTCOME, type Outcome, PERIODS, RECON_FORMULA, reconcileDeliveries, reconSummary } from '../../data/integrations';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-delivery-reconciliation',
  imports: [RouterLink, TxPipe, PageHead, Drawer],
  template: `
    @let s = summary();
    <bo-page-head [heading]="'กระทบยอดการส่งบัญชี'" [source]="'INT-ACC-03 · M11 · เหตุการณ์ต้นทางเทียบกับรายการส่ง · ไม่รวมกระทบยอดธนาคาร GL หรือ e-Tax · สูตรเป็นต้นแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32 · ตัดยอด 23:00'">
      <div class="segmented" role="group" [attr.aria-label]="'ช่วงเวลา' | tx">
        @for (p of periods; track p[0]) {<button type="button" [class.active]="period() === p[0]" [attr.aria-pressed]="period() === p[0]" (click)="period.set(p[0])">{{ p[1] | tx }}</button>}
      </div>
    </bo-page-head>
    <p class="notice warn">{{ 'PEAK ไม่มี readback ตามสัญญา จึงยืนยันได้เพียงความครบของการส่ง ไม่ได้ยืนยันว่ายอดในระบบบัญชีตรงกัน · การรันและการทบทวนรอสัญญา' | tx }}</p>

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ s.events }}</span><span class="kpi-label">{{ 'เหตุการณ์ต้นทาง' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ s.counts.delivered }}</span><span class="kpi-label">{{ 'ส่งแล้ว' | tx }}</span></div>
      @for (o of strip; track o) {
        <button type="button" class="kpi" role="listitem" [class]="'kpi ' + (s.counts[o] ? OUTCOME[o].cls : '')" [class.active]="outcome() === o" (click)="outcome.set(outcome() === o ? '' : o)">
          <span class="kpi-value">{{ s.counts[o] }}</span><span class="kpi-label">{{ OUTCOME[o].label | tx }}</span>
        </button>
      }
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'ยอดตามประเภทเอกสาร' | tx }}</b><span class="secondary grow">{{ 'สกุลเงิน THB · ยอดจากเอกสารต้นทาง ไม่คำนวณใหม่' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table recon-totals">
          <thead><tr>
            <th scope="col">{{ 'ประเภทเอกสาร' | tx }}</th>
            <th scope="col" class="num">{{ 'ยอดต้นทาง' | tx }}</th>
            <th scope="col" class="num">{{ 'ยอดที่ส่ง' | tx }}</th>
            <th scope="col" class="num">{{ 'ส่วนต่าง' | tx }}</th>
            <th scope="col" class="num">{{ 'เลขอ้างอิงระบบบัญชี' | tx }}</th>
            <th scope="col">{{ 'เทียบกับระบบบัญชี' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (r of s.rows; track r.docType) {
              <tr class="static">
                <td><b>{{ DOC_TYPE[r.docType] | tx }}</b></td>
                <td class="num">{{ baht(r.sourceAmount) }}<div class="secondary">{{ '{n} รายการ' | tx: { n: r.sourceCount } }}</div></td>
                <td class="num">{{ baht(r.deliveredAmount) }}<div class="secondary">{{ '{n} รายการ' | tx: { n: r.deliveredCount } }}</div></td>
                <td class="num" [class.text-danger]="r.sourceAmount !== r.deliveredAmount">{{ baht(r.sourceAmount - r.deliveredAmount) }}@if (r.open) {<div class="secondary">{{ 'ยังไม่ครบ {n}' | tx: { n: r.open } }}</div>}</td>
                <td class="num">{{ r.refs }}</td>
                <td><span class="chip quiet">{{ 'ยังเปรียบเทียบไม่ได้' | tx }}</span></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar"><b>{{ 'ผลรายเหตุการณ์' | tx }}</b><span class="secondary grow">{{ 'รายการที่ยังไม่ครบก่อน' | tx }} · {{ '{n} รายการ' | tx: { n: rows().length } }}</span></div>
        <div class="table-wrap">
          <table class="bo-table recon-results">
            <thead><tr>
              <th scope="col">{{ 'เอกสารต้นทาง' | tx }}</th>
              <th scope="col" class="w-at">{{ 'เวลาเหตุการณ์' | tx }}</th>
              <th scope="col" class="w-amount num">{{ 'ยอดต้นทาง' | tx }}</th>
              <th scope="col" class="w-ref">{{ 'รหัสส่ง' | tx }}</th>
              <th scope="col" class="w-status">{{ 'ผล' | tx }}</th>
            </tr></thead>
            <tbody>
              @for (r of rows(); track r.key) {
                <tr [class.selected]="r.key === selectedKey()" tabindex="0" (click)="pick(r.key)" (keydown.enter)="pick(r.key)" [attr.aria-selected]="r.key === selectedKey()">
                  <td><b>{{ r.document }}</b><div class="secondary">{{ DOC_TYPE[r.docType] | tx }}</div></td>
                  <td class="num">{{ r.at }}</td>
                  <td class="num">{{ r.event ? baht(r.event.amount) : '—' }}</td>
                  <td>{{ r.delivery?.id ?? '—' }}</td>
                  <td><span class="chip" [class]="'chip ' + OUTCOME[r.outcome].cls">{{ OUTCOME[r.outcome].label | tx }}</span></td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีเหตุการณ์ในช่วงนี้' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (selected(); as r) {
        <bo-drawer [heading]="r.document" [sub]="DOC_TYPE[r.docType]" (closed)="selectedKey.set(null)">
          <p><span class="chip" [class]="'chip ' + OUTCOME[r.outcome].cls">{{ OUTCOME[r.outcome].label | tx }}</span></p>
          <h3>{{ 'สูตร' | tx }}</h3>
          <p class="secondary">{{ formula | tx }}</p>
          <h3>{{ 'ต้นทาง' | tx }}</h3>
          @if (r.event; as e) {
            <dl class="data-grid"><dt>{{ 'เวลาเหตุการณ์' | tx }}</dt><dd>{{ e.at }}</dd><dt>{{ 'ยอดต้นทาง' | tx }}</dt><dd>{{ baht(e.amount) }}</dd></dl>
          } @else {<p class="secondary">{{ 'ไม่พบเหตุการณ์ต้นทางของรายการส่งนี้' | tx }}</p>}
          <h3>{{ 'รายการส่ง' | tx }}</h3>
          @if (r.delivery; as x) {
            <dl class="data-grid">
              <dt>{{ 'รหัสส่ง' | tx }}</dt><dd>{{ x.id }}</dd>
              <dt>{{ 'สถานะการส่ง' | tx }}</dt><dd>{{ EXPORT_STATUS[x.status].label | tx }} · {{ 'ครั้งที่' | tx }} {{ x.attempts }}</dd>
              <dt>{{ 'ยอดที่ส่ง' | tx }}</dt><dd>{{ baht(x.amount) }}</dd>
              <dt>{{ 'เลขอ้างอิงระบบบัญชี' | tx }}</dt><dd>{{ x.externalRef ?? '—' }}</dd>
            </dl>
          } @else {<p class="secondary">{{ 'ไม่พบรายการส่งหลังเวลาตัดยอด' | tx }}</p>}
          <ng-container foot>
            <a class="link" [routerLink]="['/backoffice/finance/invoices', r.invoiceId]">{{ 'เปิดเอกสารในการเงิน' | tx }}</a>
            <span class="grow"></span>
            @if (r.delivery) {<a class="link" routerLink="/backoffice/integrations/accounting/queue" [queryParams]="{ q: r.delivery.id }">{{ 'เปิดคิวส่งข้อมูล' | tx }}</a>}
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class DeliveryReconciliationComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly baht = baht;
  protected readonly DOC_TYPE = DOC_TYPE;
  protected readonly EXPORT_STATUS = EXPORT_STATUS;
  protected readonly OUTCOME = OUTCOME;
  protected readonly periods = PERIODS;
  protected readonly formula = RECON_FORMULA;
  protected readonly strip: Outcome[] = ['awaiting', 'failed', 'missing', 'duplicate', 'variance'];
  protected readonly period = signal('month');
  protected readonly outcome = signal<Outcome | ''>('');
  protected readonly selectedKey = signal<string | null>(null);

  protected readonly results = computed(() => reconcileDeliveries(this.store.clinic.data(), this.store.data(), this.period()));
  protected readonly summary = computed(() => reconSummary(this.results()));
  protected readonly rows = computed(() => {
    const rank = (o: Outcome) => (o === 'delivered' ? 1 : 0);
    return this.results().filter(r => !this.outcome() || r.outcome === this.outcome()).sort((a, b) => rank(a.outcome) - rank(b.outcome) || b.at.localeCompare(a.at));
  });
  protected readonly selected = computed(() => this.results().find(r => r.key === this.selectedKey()));

  protected pick(key: string) {
    this.selectedKey.set(this.selectedKey() === key ? null : key);
  }
}
