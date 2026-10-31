/* Invoices: the queue to collect and the history to search, and a new bill written from the charge items (FIN-BILL-01) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus, lucideTrash2 } from '@ng-icons/lucide';

import { UiButton } from '../../../user-management/ui';
import { baht } from '../../../clinic/data/rail';
import type { Invoice, InvoiceLine, InvoiceStatus } from '../../../clinic/data/types';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { CHARGE_ITEMS, EXPORT_STATUS, exportsOf, INVOICE_STATUS, invoiceList, lineTotal, statusOf } from '../../data/finance';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-invoices',
  imports: [NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'ใบแจ้งหนี้'" [source]="'M11 · คิวรอเก็บเงินและประวัติใบแจ้งหนี้ของเจ้าของ สัตว์ และ visit'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="creating.set(!creating())"><ng-icon [svg]="icons.plus" aria-hidden="true" />{{ 'สร้างใบแจ้งหนี้' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ rows().length }}</span><span class="kpi-label">{{ 'ใบแจ้งหนี้ตามตัวกรอง' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(sum().total) }}</span><span class="kpi-label">{{ 'ยอดรวม' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ baht(sum().paid) }}</span><span class="kpi-label">{{ 'ชำระแล้ว' | tx }}</span></div>
      <div class="kpi" [class.warn]="sum().balance" role="listitem"><span class="kpi-value">{{ baht(sum().balance) }}</span><span class="kpi-label">{{ 'ยอดคงเหลือ' | tx }}</span></div>
    </div>

    <div class="split" [class.with-drawer]="creating()">
      <div class="panel">
        <div class="filter-bar">
          <input class="ui-input search" type="search" [placeholder]="'ค้นหาใบแจ้งหนี้ เจ้าของ สัตว์ หรือ visit' | tx" [attr.aria-label]="'ค้นหาใบแจ้งหนี้' | tx" [value]="q()" (input)="q.set($any($event.target).value)" />
          <select class="ui-input" [attr.aria-label]="'สถานะ' | tx" (change)="status.set($any($event.target).value)">
            <option value="" [selected]="!status()">{{ 'ทุกสถานะ' | tx }}</option>
            @for (s of statusKeys; track s) {<option [value]="s" [selected]="s === status()">{{ STATUS[s].label | tx }}</option>}
          </select>
          <label class="date-field"><span class="visually-hidden">{{ 'ตั้งแต่' | tx }}</span><input class="ui-input" type="date" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
          <span class="secondary">–</span>
          <label class="date-field"><span class="visually-hidden">{{ 'ถึง' | tx }}</span><input class="ui-input" type="date" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
          <label class="check"><input type="checkbox" [checked]="outstandingOnly()" (change)="outstandingOnly.set($any($event.target).checked)" />{{ 'เฉพาะยอดค้าง' | tx }}</label>
          <button type="button" class="link" (click)="clear()">{{ 'ล้างตัวกรอง' | tx }}</button>
        </div>
        <div class="table-wrap">
          <table class="bo-table invoices">
            <thead>
              <tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col">{{ 'เจ้าของ / สัตว์' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ยอดรวม' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ชำระแล้ว' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ยอดคงเหลือ' | tx }}</th>
                <th scope="col" class="w-due">{{ 'ออกเมื่อ' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'ส่งบัญชี' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (i of rows(); track i.id) {
                @let st = statusOf(i);
                <tr tabindex="0" (click)="actions.openInvoice(i)" (keydown.enter)="actions.openInvoice(i)">
                  <td><b>{{ i.no || (('ฉบับร่าง' | tx) + ' ' + i.id) }}</b>@if (i.encounter) {<div class="secondary">{{ i.encounter }}</div>}</td>
                  <td>{{ i.ownerKey }}<div class="secondary">{{ i.pet }} · {{ i.title | tx }}</div></td>
                  <td><span class="chip" [class]="'chip ' + STATUS[st].cls">{{ STATUS[st].label | tx }}</span></td>
                  <td class="num">{{ baht(i.total) }}</td>
                  <td class="num">{{ baht(i.paid) }}</td>
                  <td class="num" [class.text-danger]="st !== 'draft' && st !== 'cancelled' && st !== 'refunded' && i.total - i.paid > 0">{{ st === 'draft' || st === 'cancelled' ? '—' : baht(i.total - i.paid) }}</td>
                  <td class="num">{{ i.issuedAt ?? '—' }}</td>
                  <td>
                    @if (delivery(i); as x) {<span class="chip" [class]="'chip ' + EXPORT_STATUS[x.status].cls">{{ EXPORT_STATUS[x.status].label | tx }}</span>} @else {<span class="muted">—</span>}
                  </td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="8" class="empty">{{ (filtered() ? 'ไม่มีใบแจ้งหนี้ที่ตรงกับตัวกรอง' : 'ยังไม่มีใบแจ้งหนี้') | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- A new bill: for whom, for what, from the charge items; a draft until it is issued -->
      @if (creating()) {
        <bo-drawer [heading]="'สร้างใบแจ้งหนี้'" [sub]="'ฉบับร่าง · ออกเมื่อรายการครบ'" (closed)="creating.set(false)">
          <div class="form-grid">
            <label>{{ 'เจ้าของ' | tx }}
              <select class="ui-input" (change)="pickOwner($any($event.target).value)">
                @for (o of owners(); track o.name) {<option [value]="o.name" [selected]="o.name === ownerKey()">{{ o.name }}</option>}
              </select>
            </label>
            <label>{{ 'สัตว์' | tx }}
              <select class="ui-input" (change)="pet.set($any($event.target).value)">
                @for (p of pets(); track p) {<option [value]="p" [selected]="p === pet()">{{ p }}</option>}
              </select>
            </label>
            <label class="full">{{ 'รายการ' | tx }}<input class="ui-input" [value]="title()" (input)="title.set($any($event.target).value)" [placeholder]="'เช่น Retail · อาหารและของใช้' | tx" /></label>
            <label class="full">{{ 'เพิ่มรายการ' | tx }}
              <select class="ui-input" (change)="addLine($any($event.target).value); $any($event.target).value = ''">
                <option value="">{{ '— เลือกจากรายการค่าบริการ —' | tx }}</option>
                @for (c of charges; track c.source + c.name) {<option [value]="c.source + '|' + c.name">{{ c.source }} · {{ c.name | tx }} · {{ baht(c.unitPrice) }}</option>}
              </select>
            </label>
          </div>
          <table class="mini-lines">
            <thead><tr><th>{{ 'รายการ' | tx }}</th><th class="num">{{ 'จำนวน' | tx }}</th><th class="num">{{ 'รวม' | tx }}</th><th></th></tr></thead>
            <tbody>
              @for (l of lines(); track $index) {
                <tr>
                  <td>{{ l.name | tx }}<div class="secondary">{{ l.source }} · {{ baht(l.unitPrice) }}@if (l.taxRate) { · VAT {{ l.taxRate }}%}</div></td>
                  <td class="num"><input class="ui-input qty" type="number" min="1" [value]="l.qty" (change)="setQty($index, $any($event.target).value)" [attr.aria-label]="'จำนวน' | tx" /></td>
                  <td class="num">{{ baht(lineTotal(l)) }}</td>
                  <td><button type="button" class="link" [attr.aria-label]="'ลบรายการ' | tx" (click)="removeLine($index)"><ng-icon [svg]="icons.trash" aria-hidden="true" /></button></td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="muted">{{ 'ยังไม่มีรายการ' | tx }}</td></tr>
              }
            </tbody>
            <tfoot><tr><th colspan="2">{{ 'ยอดรวม' | tx }}</th><th class="num">{{ baht(draftTotal()) }}</th><th></th></tr></tfoot>
          </table>
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="creating.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="!lines().length || !title().trim() || !pet()" (click)="create()">{{ 'สร้างฉบับร่าง' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class InvoicesComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly route = inject(ActivatedRoute);
  protected readonly icons = { plus: lucidePlus, trash: lucideTrash2 };
  protected readonly STATUS = INVOICE_STATUS;
  protected readonly EXPORT_STATUS = EXPORT_STATUS;
  protected readonly statusKeys = Object.keys(INVOICE_STATUS) as InvoiceStatus[];
  protected readonly charges = CHARGE_ITEMS;
  protected readonly baht = baht;
  protected readonly statusOf = statusOf;
  protected readonly lineTotal = lineTotal;

  protected readonly q = signal('');
  protected readonly status = signal<InvoiceStatus | ''>((this.route.snapshot.queryParamMap.get('status') as InvoiceStatus | null) ?? '');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly outstandingOnly = signal(false);
  protected readonly filtered = computed(() => !!(this.q() || this.status() || this.from() || this.to() || this.outstandingOnly()));
  protected readonly rows = computed(() => invoiceList(this.store.clinic.data(), { q: this.q(), status: this.status(), from: this.from(), to: this.to(), outstandingOnly: this.outstandingOnly() }));
  protected readonly sum = computed(() => {
    const live = this.rows().filter(i => !['draft', 'cancelled'].includes(statusOf(i)));
    return { total: live.reduce((s, i) => s + i.total, 0), paid: live.reduce((s, i) => s + i.paid, 0), balance: live.filter(i => ['issued', 'partial'].includes(statusOf(i))).reduce((s, i) => s + i.total - i.paid, 0) };
  });

  /* The new bill */
  protected readonly creating = signal(false);
  protected readonly owners = computed(() => Object.values(this.store.clinic.data().owners));
  protected readonly ownerKey = signal(Object.keys(this.store.clinic.data().owners)[0]);
  protected readonly pets = computed(() => (this.store.clinic.data().owners[this.ownerKey()]?.pets ?? []).map(p => p.split(' · ')[0]));
  protected readonly pet = signal(this.pets()[0] ?? '');
  protected readonly title = signal('');
  protected readonly lines = signal<InvoiceLine[]>([]);
  protected readonly draftTotal = computed(() => Math.round(this.lines().reduce((s, l) => s + lineTotal(l), 0) * 100) / 100);

  protected delivery(i: Invoice) {
    return exportsOf(this.store.data(), i.id)[0];
  }

  protected clear() {
    this.q.set(''); this.status.set(''); this.from.set(''); this.to.set(''); this.outstandingOnly.set(false);
  }

  protected pickOwner(name: string) {
    this.ownerKey.set(name);
    this.pet.set(this.pets()[0] ?? '');
  }

  protected addLine(key: string) {
    const [source, name] = key.split('|');
    const item = CHARGE_ITEMS.find(c => c.source === source && c.name === name);
    if (item) {
      this.lines.update(lines => [...lines, { source: item.source, name: item.name, qty: 1, unitPrice: item.unitPrice, discount: 0, taxRate: item.taxRate }]);
    }
  }

  protected setQty(index: number, value: string) {
    const qty = Math.max(1, Math.floor(Number(value) || 1));
    this.lines.update(lines => lines.map((l, i) => (i === index ? { ...l, qty } : l)));
  }

  protected removeLine(index: number) {
    this.lines.update(lines => lines.filter((_, i) => i !== index));
  }

  protected create() {
    const invoice = this.store.createInvoice(this.ownerKey(), this.pet(), this.title().trim(), this.lines());
    this.creating.set(false);
    this.lines.set([]);
    this.title.set('');
    this.actions.openInvoice(invoice);
  }
}
