/* The sheets the context rail leads to beyond the patient's record: one past visit, one document, and the owner's bills */
import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideChevronRight, lucideDownload, lucideFileText } from '@ng-icons/lucide';

import { UiButton } from '../../user-management/ui';
import { ClinicActions } from '../clinic-actions';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { TODAY, timeOf } from '../data/model';
import { balanceOf, baht, docDate, invoiceState, isAbnormal, openInvoices, outstanding, pastVisits, runningBill, visitRecords } from '../data/rail';
import type { LabResult } from '../data/types';
import { ClinicI18n, TxPipe } from '../i18n/clinic-i18n';
import { SheetHead } from './sheet-head';

/** The patient and the date or index in a sheet's id, "<patient id>/<key>" */
const splitId = (id: string) => {
  const at = id.indexOf('/');
  return { pid: Number(id.slice(0, at)), key: id.slice(at + 1) };
};

/** A row that opens something: a name, a line under it, and a chevron */
@Component({
  selector: 'cl-open-row',
  imports: [NgIcon],
  template: `
    <button type="button" class="row-card go" (click)="opened.emit()">
      <span class="grow"><b>{{ name() }}</b><span class="secondary">{{ detail() }}</span></span>
      <ng-content />
      <ng-icon class="go-icon" [svg]="chevron" aria-hidden="true" />
    </button>
  `,
  host: { class: 'contents' },
})
export class OpenRow {
  readonly name = input.required<string>();
  readonly detail = input('');
  readonly opened = output();
  protected readonly chevron = lucideChevronRight;
}

/** A result's date or time, and whether it still needs a look */
@Component({
  selector: 'cl-result-row',
  imports: [OpenRow, TxPipe],
  template: `
    @let res = r();
    <cl-open-row [name]="res.name | tx" [detail]="(res.status | tx) + ' · ' + when() + ' · ' + (res.by | tx)" (opened)="ui.openSheet('result', { id: res.id })">
      @if (res.flag === 'critical' && !res.ack) {
        <span class="chip danger">{{ 'Critical' | tx }}</span>
      } @else if (abnormal() && !res.ack) {
        <span class="chip warn">{{ 'ผิดปกติ' | tx }}</span>
      } @else if (res.ack) {
        <span class="chip quiet">{{ 'รับทราบแล้ว' | tx }}</span>
      }
    </cl-open-row>
  `,
  host: { class: 'contents' },
})
export class ResultRow {
  readonly r = input.required<LabResult>();
  protected readonly ui = inject(ClinicUi);
  protected readonly abnormal = computed(() => isAbnormal(this.r()));
  protected readonly when = computed(() => (this.r().time.startsWith(TODAY) ? timeOf(this.r().time) : this.r().time));
}

/** When another patient is picked while a sheet of one record of theirs is open, the sheet goes back to the list */
function followPatient(store: ClinicStore, ui: ClinicUi, pid: () => number, tab: 'visits' | 'docs') {
  effect(() => {
    const p = store.selected();
    const owner = pid();
    untracked(() => {
      if (owner !== p.id) {
        ui.openSheet('patient', { tab });
      }
    });
  });
}

const SHARED = [TxPipe, UiButton, SheetHead, OpenRow];

/* ---- One past visit: what it was, its results, documents and bill ---- */
@Component({
  selector: 'cl-past-visit-sheet',
  imports: [...SHARED, ResultRow],
  template: `
    @let p = store.selected();
    @let v = visit();
    @let rec = records();
    <cl-sheet-head [heading]="('การมารักษา' | tx) + ' · ' + date()" [sub]="v ? (v.title | tx) + ' · ' + (v.vet | tx) + ' · ' + p.pet : p.pet" />
    <div class="sheet-body">
      <div class="section">
        <div class="section-title"><h3>{{ 'สรุปการมารักษา' | tx }}</h3></div>
        <dl class="data-grid">
          <dt>{{ 'วันที่' | tx }}</dt><dd>{{ date() }}</dd>
          <dt>{{ 'เรื่อง' | tx }}</dt><dd>{{ (v?.title ?? '—') | tx }}</dd>
          <dt>{{ 'สัตวแพทย์' | tx }}</dt><dd>{{ (v?.vet || '—') | tx }}</dd>
          <dt>{{ 'สถานะ' | tx }}</dt><dd><span class="chip quiet">{{ rec.status | tx }}</span></dd>
          <dt>{{ 'ใบแจ้งหนี้' | tx }}</dt>
          <dd>
            @if (rec.invoice; as i) {
              {{ i.no }} · {{ baht(i.total) }}
              <span class="chip" [class]="'chip ' + (balanceOf(i) ? 'warn' : 'ok')">{{ invoiceState(i) | tx }}</span>
            } @else {
              {{ 'ไม่มีในข้อมูลตัวอย่าง' | tx }}
            }
          </dd>
        </dl>
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'ผลตรวจ' | tx }}</h3></div>
        <div class="kv-list">
          @for (r of rec.results; track r.id) {
            <cl-result-row [r]="r" />
          } @empty {
            <p class="muted">{{ 'ไม่มีผลตรวจใน visit นี้' | tx }}</p>
          }
        </div>
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'Documents' | tx }}</h3></div>
        <div class="kv-list">
          @for (d of rec.docs; track d.index) {
            <cl-open-row [name]="d.doc[0] | tx" [detail]="d.doc[1] | tx" (opened)="ui.openSheet('document', { id: p.id + '/' + d.index })" />
          } @empty {
            <p class="muted">{{ 'ไม่มีเอกสารใน visit นี้' | tx }}</p>
          }
        </div>
      </div>
      <p class="muted">{{ 'บันทึกการรักษาฉบับเต็มของ visit ย้อนหลังไม่อยู่ในข้อมูลตัวอย่าง' | tx }}</p>
    </div>
    <div class="sheet-foot">
      <button uiButton variant="secondary" size="sm" type="button" (click)="ui.openSheet('patient', { tab: 'visits' })">{{ 'กลับไปประวัติการรักษา' | tx }}</button>
      <span class="grow"></span>
      @if (rec.invoice && balanceOf(rec.invoice) > 0) {
        <button uiButton size="sm" type="button" (click)="ui.openSheet('billing')">{{ 'ดูยอดค้างชำระ' | tx }}</button>
      }
    </div>
  `,
  host: { class: 'contents' },
})
export class PastVisitSheet {
  readonly id = input('');
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly baht = baht;
  protected readonly balanceOf = balanceOf;
  protected readonly invoiceState = invoiceState;
  protected readonly date = computed(() => splitId(this.id()).key);
  protected readonly visit = computed(() => pastVisits(this.store.selected()).find(v => v.date === this.date()));
  protected readonly records = computed(() => visitRecords(this.store.data(), this.store.selected(), this.date()));

  constructor() {
    followPatient(this.store, this.ui, () => splitId(this.id()).pid, 'visits');
  }
}

/** Saves a text file, as a download from the browser */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ---- One document: the sample has no files, so its details and a page that says so ---- */
@Component({
  selector: 'cl-document-sheet',
  imports: [...SHARED, NgIcon],
  template: `
    @let p = store.selected();
    @let o = store.owner(p);
    @let d = doc();
    @let v = visit();
    <cl-sheet-head [heading]="d ? d[0] : 'Documents'" [sub]="d ? (d[1] | tx) + ' · ' + p.pet + ' · ' + p.hn : p.pet" />
    <div class="sheet-body">
      @if (d) {
        <div class="section">
          <div class="doc-preview" role="img" [attr.aria-label]="('ตัวอย่างเอกสาร' | tx) + ' · ' + (d[0] | tx)">
            <ng-icon [svg]="icons.file" aria-hidden="true" />
            <b>{{ d[0] | tx }}</b>
            <span class="secondary">{{ p.pet }} · {{ p.hn }} · {{ o.name }}</span>
            <span class="muted">{{ 'ข้อมูลตัวอย่างไม่มีไฟล์จริง — แสดงรายละเอียดของเอกสารแทน' | tx }}</span>
          </div>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'รายละเอียด' | tx }}</h3></div>
          <dl class="data-grid">
            <dt>{{ 'ชนิดไฟล์' | tx }}</dt><dd>{{ d[1] | tx }}</dd>
            <dt>{{ 'วันที่' | tx }}</dt><dd>{{ date() || '—' }}</dd>
            <dt>{{ 'การมารักษา' | tx }}</dt>
            <dd>
              @if (v) {
                <button type="button" class="link" (click)="ui.openSheet('pastVisit', { id: p.id + '/' + v.date })">{{ v.date }} · {{ v.title | tx }}</button>
              } @else {
                —
              }
            </dd>
            <dt>{{ 'ผู้ป่วย' | tx }}</dt><dd>{{ p.pet }} · {{ p.hn }}</dd>
            <dt>{{ 'เจ้าของ' | tx }}</dt><dd>{{ o.name }}</dd>
          </dl>
        </div>
      } @else {
        <p class="muted">{{ 'ไม่พบเอกสารนี้' | tx }}</p>
      }
    </div>
    <div class="sheet-foot">
      <button uiButton variant="secondary" size="sm" type="button" (click)="ui.openSheet('patient', { tab: 'docs' })">{{ 'กลับไปเอกสาร' | tx }}</button>
      <span class="grow"></span>
      <button uiButton size="sm" type="button" [disabled]="!d" (click)="save()"><ng-icon [svg]="icons.download" aria-hidden="true" />{{ 'ดาวน์โหลดรายละเอียด' | tx }}</button>
    </div>
  `,
  host: { class: 'contents' },
})
export class DocumentSheet {
  readonly id = input('');
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  private readonly i18n = inject(ClinicI18n);
  protected readonly icons = { file: lucideFileText, download: lucideDownload };
  protected readonly doc = computed(() => this.store.selected().docs[Number(splitId(this.id()).key)]);
  protected readonly date = computed(() => (this.doc() ? docDate(this.doc()[0]) : ''));
  protected readonly visit = computed(() => pastVisits(this.store.selected()).find(v => v.date === this.date()));

  constructor() {
    followPatient(this.store, this.ui, () => splitId(this.id()).pid, 'docs');
  }

  protected save() {
    const doc = this.doc();
    if (!doc) {
      return;
    }
    const t = (key: string) => this.i18n.t(key);
    const p = this.store.selected();
    const visit = this.visit();
    const lines = [doc[0], `${t('ชนิดไฟล์')}: ${t(doc[1])}`, `${t('วันที่')}: ${this.date() || '—'}`, `${t('ผู้ป่วย')}: ${p.pet} · ${p.hn} · ${p.code}`,
      `${t('เจ้าของ')}: ${this.store.owner(p).name}`, visit ? `${t('การมารักษา')}: ${visit.date} · ${t(visit.title)} · ${t(visit.vet)}` : '', '',
      t('ข้อมูลตัวอย่างไม่มีไฟล์จริง — ไฟล์นี้คือรายละเอียดของเอกสาร')];
    download(`${p.hn} ${doc[0]}.txt`.replace(/[\\/:*?"<>|]/g, '-'), lines.join('\n'));
    this.ui.toast('ดาวน์โหลดรายละเอียดเอกสารแล้ว');
  }
}

/* ---- The owner's bills: what is owed, credit, the open invoices and today's running bill ---- */
@Component({
  selector: 'cl-billing-sheet',
  imports: [...SHARED],
  template: `
    @let p = store.selected();
    @let o = store.owner(p);
    @let open = invoices();
    @let owed = owing();
    @let bill = running();
    <cl-sheet-head [heading]="('ค่าใช้จ่าย' | tx) + ' · ' + o.name" [status]="owed ? { text: 'ค้างชำระ', cls: 'late' } : { text: 'ไม่มียอดค้าง', cls: 'done' }"
      [sub]="'{0} ใบแจ้งหนี้ค้างชำระ · {1}' | tx: { '0': open.length, '1': o.phone }" />
    <div class="sheet-body">
      <div class="section">
        <div class="section-title"><h3>{{ 'ยอดคงค้าง' | tx }}</h3></div>
        <dl class="data-grid">
          <dt>{{ 'ยอดค้างชำระ' | tx }}</dt><dd><b [class.text-danger]="owed > 0">{{ baht(owed) }}</b></dd>
          <dt>{{ 'เครดิต / มัดจำ' | tx }}</dt><dd>{{ o.credit ? baht(o.credit) : '—' }}</dd>
        </dl>
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'ใบแจ้งหนี้ค้างชำระ' | tx }}</h3></div>
        <div class="kv-list">
          @for (i of open; track i.id) {
            <details class="row-card invoice">
              <summary>
                <span class="grow">
                  <b>{{ i.no }} · {{ i.pet }}</b>
                  <span class="secondary">{{ i.date }} · {{ i.title | tx }} · {{ 'ยอด' | tx }} {{ baht(i.total) }} · {{ 'ชำระแล้ว' | tx }} {{ baht(i.paid) }}</span>
                </span>
                <span class="chip" [class]="'chip ' + (i.paid ? 'warn' : 'danger')">{{ invoiceState(i) | tx }}</span>
                <b class="amount">{{ baht(balanceOf(i)) }}</b>
              </summary>
              <table class="mini-table">
                <tbody>
                  @for (item of i.items; track $index) {
                    <tr><td>{{ item[0] | tx }}</td><td class="num">{{ baht(item[1]) }}</td></tr>
                  }
                </tbody>
              </table>
            </details>
          } @empty {
            <p class="muted">{{ 'ไม่มีใบแจ้งหนี้ค้างชำระ' | tx }}</p>
          }
        </div>
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'ค่าใช้จ่าย visit วันนี้ · {pet}' | tx: { pet: p.pet } }}</h3></div>
        @if (bill) {
          <table class="mini-table">
            <tbody>
              @for (line of bill.lines; track $index) {
                <tr><td>{{ line[0] | tx }}</td><td class="num">{{ line[2] ? ('ตั้งแต่' | tx) + ' ' : '' }}{{ baht(line[1]) }}</td></tr>
              }
            </tbody>
          </table>
          <div class="summary-line total"><span>{{ 'รวมโดยประมาณ' | tx }}</span><span>{{ baht(bill.total) }}</span></div>
          <p class="muted">{{ 'ยังไม่ออกใบแจ้งหนี้ · คิดจากคำสั่งตรวจวันนี้ ช่วงราคาคิดที่ราคาต่ำสุด' | tx }}</p>
        } @else {
          <p class="muted">{{ 'ยังไม่มีค่าใช้จ่ายใน visit วันนี้' | tx }}</p>
        }
      </div>
    </div>
    <div class="sheet-foot">
      <button uiButton variant="secondary" size="sm" type="button" (click)="ui.openSheet('estimate')">{{ 'ใบประเมินค่าใช้จ่าย' | tx }}</button>
      <span class="grow"></span>
      <button uiButton size="sm" type="button" [disabled]="!owed" (click)="remind()">{{ 'ส่งยอดค้างชำระให้เจ้าของ' | tx }}</button>
    </div>
  `,
  host: { class: 'contents' },
})
export class BillingSheet {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  private readonly actions = inject(ClinicActions);
  protected readonly baht = baht;
  protected readonly balanceOf = balanceOf;
  protected readonly invoiceState = invoiceState;
  protected readonly invoices = computed(() => openInvoices(this.store.data(), this.store.selected().ownerKey));
  protected readonly owing = computed(() => outstanding(this.store.data(), this.store.selected().ownerKey));
  protected readonly running = computed(() => runningBill(this.store.data(), this.store.selected()));

  protected remind() {
    const p = this.store.selected();
    const o = this.store.owner(p);
    const list = this.invoices().map(i => `${i.no} · ${i.date} · ${i.pet} · ${baht(balanceOf(i))}`).join('\n');
    this.actions.sendMessage(p, 'ยอดค้างชำระ', `เรียนคุณ ${o.name}\nยอดค้างชำระกับโรงพยาบาล ${baht(this.owing())}\n${list}\nชำระได้ที่เคาน์เตอร์การเงินหรือโอนผ่าน PromptPay`);
  }
}
