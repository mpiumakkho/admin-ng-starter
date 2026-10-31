import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { balanceOf } from '../clinic/data/rail';
import type { Invoice } from '../clinic/data/types';
import { printInvoice, printReceipt } from '../clinic/shared/documents';
import { BackofficeUi, type DialogField } from './backoffice-ui';
import { BackofficeStore } from './backoffice.store';
import { DISCOUNT_THRESHOLD, methodOf, PAYMENT_METHODS, refundable, REFUND_THRESHOLD, statusOf } from './data/finance';
import { APPROVAL_KIND, canDecide } from './data/home';
import type { AccountingExport, Approval, BoException } from './data/types';
import { BoI18n } from './i18n/bo-i18n';

const baht = (n: number) => `฿${n.toLocaleString('en-US')}`;
const money = (v: string) => (/^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) > 0 ? null : 'ใส่จำนวนเงินเป็นตัวเลขมากกว่า 0');

/** A reason that will stand as evidence */
export const REASON_MIN = 10;
const reasonCheck = (v: string) => (v.trim().length >= REASON_MIN ? null : 'อย่างน้อย {n} ตัวอักษร — ข้อความนี้คือหลักฐานตรวจสอบ');

/** What the home pages' buttons do: each asks, changes the store, then says what happened */
@Injectable({ providedIn: 'root' })
export class BackofficeActions {
  private readonly store = inject(BackofficeStore);
  private readonly ui = inject(BackofficeUi);
  private readonly i18n = inject(BoI18n);
  private readonly router = inject(Router);
  private readonly t = (key: string, vars?: Record<string, string | number>) => this.i18n.t(key, vars);

  /** Approve or reject, with why; never one's own request */
  decide(a: Approval, status: 'approved' | 'rejected') {
    if (!canDecide(a, this.store.userName())) {
      this.ui.toast('ผู้ขอตัดสินคำขอของตัวเองไม่ได้ (การแยกหน้าที่)', undefined, 'info');
      return;
    }
    const approve = status === 'approved';
    this.ui.ask({
      title: `${approve ? 'อนุมัติ' : 'ปฏิเสธ'} · ${a.ref}`,
      tone: approve ? 'primary' : 'danger',
      facts: [['ประเภท', APPROVAL_KIND[a.kind]], ['คำขอ', a.title], ['ขอโดย', `${a.requestedBy} · ${a.requestedAt}`], ...(a.amount ? [['จำนวนเงิน', `฿${a.amount.toLocaleString('en-US')}`] as [string, string]] : [])],
      intro: [approve ? 'การอนุมัติจะส่งผลไปยังโมดูลเจ้าของ และบันทึกชื่อผู้อนุมัติ เวลา และเหตุผลไว้ในบันทึกตรวจสอบ' : 'คำขอที่ปฏิเสธจะกลับไปยังผู้ขอพร้อมเหตุผล และบันทึกไว้ในบันทึกตรวจสอบ'],
      fields: [{
        name: 'decision', label: this.i18n.t('เหตุผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea',
        placeholder: approve ? 'เช่น ตรวจหลักฐานการชำระและการยกเลิกรายการแล้ว' : 'เช่น หลักฐานไม่ครบ ขอเอกสารเพิ่ม',
        validate: v => (reasonCheck(v) ? this.i18n.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
      }],
      confirmLabel: approve ? 'อนุมัติ' : 'ปฏิเสธ',
      onConfirm: v => {
        this.store.decide(a, status, v['decision'].trim());
        this.ui.toast(approve ? 'อนุมัติ {ref} แล้ว · ส่งต่อให้โมดูลเจ้าของดำเนินการ' : 'ปฏิเสธ {ref} แล้ว · แจ้งผู้ขอ', { ref: a.ref }, approve ? 'success' : 'info');
      },
    });
  }

  /* Finance (data/finance.ts) */

  /** The draft becomes a bill: it gets its number and goes to the accounting system */
  issueInvoice(i: Invoice) {
    this.ui.ask({
      title: `ออกใบแจ้งหนี้ · ${i.id}`,
      facts: [['เจ้าของ', i.ownerKey], ['สัตว์', i.pet], ['รายการ', i.title], ['ยอดรวม', baht(i.total)]],
      intro: ['เมื่อออกแล้ว ใบแจ้งหนี้จะได้เลขที่ กำหนดชำระใน 15 วัน แก้ไขรายการไม่ได้อีก และเข้าคิวส่งระบบบัญชี'],
      confirmLabel: 'ออกใบแจ้งหนี้',
      onConfirm: () => {
        this.store.issueInvoice(i);
        this.ui.toast('ออกใบแจ้งหนี้ {no} แล้ว · ครบกำหนด {due}', { no: i.no, due: i.dueAt ?? '' });
      },
    });
  }

  /** Cancelled, with why; only before anything was paid */
  cancelInvoice(i: Invoice) {
    if (i.paid > 0) {
      this.ui.toast('ใบแจ้งหนี้ที่รับชำระแล้วยกเลิกไม่ได้ — ใช้การคืนเงินแทน', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: `ยกเลิกใบแจ้งหนี้ · ${i.no || i.id}`,
      tone: 'danger',
      facts: [['เจ้าของ', i.ownerKey], ['ยอดรวม', baht(i.total)], ['สถานะ', statusOf(i)]],
      intro: [i.no ? 'ใบแจ้งหนี้ที่ออกแล้วจะคงอยู่เป็นหลักฐานในสถานะยกเลิก และส่งใบลดหนี้ไปยังระบบบัญชี' : 'ฉบับร่างที่ยกเลิกจะคงอยู่เป็นหลักฐาน'],
      fields: [{
        name: 'reason', label: this.t('เหตุผลที่ยกเลิก (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', placeholder: 'เช่น ออกซ้ำกับใบแจ้งหนี้อีกฉบับ',
        validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
      }],
      confirmLabel: 'ยกเลิกใบแจ้งหนี้',
      onConfirm: v => {
        this.store.cancelInvoice(i, v['reason'].trim());
        this.ui.toast('ยกเลิก {no} แล้ว', { no: i.no || i.id }, 'info');
      },
    });
  }

  /** A payment on the bill: how much, how, and the reference the method needs; the receipt can be printed at once */
  collect(i: Invoice) {
    const due = balanceOf(i);
    if (!['issued', 'partial'].includes(statusOf(i)) || due <= 0) {
      this.ui.toast('ใบแจ้งหนี้นี้รับชำระไม่ได้ในสถานะปัจจุบัน', undefined, 'info');
      return;
    }
    const fields: DialogField[] = [
      { name: 'amount', label: 'จำนวนเงิน (บาท)', type: 'input', value: String(Math.round(due * 100) / 100), validate: v => money(v) ?? (Number(v) > due + 0.005 ? 'จำนวนเงินเกินยอดที่รับชำระได้' : null) },
      { name: 'method', label: 'ช่องทางรับชำระ', type: 'select', value: PAYMENT_METHODS[0].value, options: PAYMENT_METHODS.map(m => ({ value: m.value, label: m.label })) },
      {
        name: 'reference', label: 'เลขอ้างอิง', type: 'input', optional: true, placeholder: 'เช่น เลขอนุมัติบัตร หรือเลขที่รายการโอน',
        validate: (v, all) => (methodOf(all['method']).reference === 'required' && !v.trim() ? 'ช่องทางนี้ต้องมีเลขอ้างอิง' : null),
      },
      { name: 'review', label: 'ตรวจทานใบแจ้งหนี้ จำนวนเงิน และช่องทางกับผู้ชำระแล้ว', type: 'checkbox', validate: v => (v === 'yes' ? null : 'ต้องยืนยันข้อนี้') },
      { name: 'receipt', label: 'พิมพ์ใบเสร็จ', type: 'checkbox', value: 'yes', optional: true },
    ];
    this.ui.ask({
      title: `รับชำระ · ${i.no}`,
      facts: [['เจ้าของ', i.ownerKey], ['สัตว์', i.pet], ['ยอดรวม', baht(i.total)], ['ชำระแล้ว', baht(i.paid)], ['ยอดคงเหลือ', baht(due)]],
      intro: ['ยอดหลังรับชำระเป็นค่าประมาณจนระบบยืนยัน · ไม่เก็บข้อมูลบัตรหรือรหัสใด ๆ'],
      fields,
      after: 'QR PromptPay ยังไม่สร้างจากระบบ — ใช้ QR ของธนาคารแล้วบันทึกเลขอ้างอิง',
      confirmLabel: 'บันทึกรับชำระ',
      onConfirm: v => {
        this.store.collect(i, Number(v['amount']), v['method'], v['reference'].trim());
        if (v['receipt'] === 'yes') {
          this.printReceipt(i);
        }
        this.ui.toast('รับชำระ {amount} · {no} → {status}', { amount: baht(Number(v['amount'])), no: i.no, status: this.t(statusOf(i) === 'paid' ? 'ชำระครบ' : 'ชำระบางส่วน') });
      },
    });
  }

  /** Money back against one of the bill's payments; above the threshold it waits for the finance manager */
  requestRefund(i: Invoice) {
    const payments = (i.payments ?? []).map((p, index) => ({ index, p, left: refundable(i, index) })).filter(x => x.left > 0);
    if (!payments.length) {
      this.ui.toast('ไม่มีการชำระที่คืนเงินได้บนใบแจ้งหนี้นี้', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: `คืนเงิน · ${i.no}`,
      facts: [['เจ้าของ', i.ownerKey], ['ยอดรวม', baht(i.total)], ['ชำระแล้ว', baht(i.paid)]],
      intro: [this.t('คืนเงินไม่เกิน {0} ทำได้ทันที เกินนั้นต้องให้ผู้จัดการการเงินอนุมัติในรายการอนุมัติ', { 0: baht(REFUND_THRESHOLD) })],
      fields: [
        { name: 'payment', label: 'การชำระที่คืน', type: 'select', value: String(payments[0].index), options: payments.map(x => ({ value: String(x.index), label: `${x.p[0]} · ${x.p[2]} · ${baht(x.p[1])} · คืนได้ ${baht(x.left)}` })) },
        { name: 'amount', label: 'จำนวนเงินที่คืน (บาท)', type: 'input', value: String(payments[0].left), validate: (v, all) => money(v) ?? (Number(v) > (payments.find(x => String(x.index) === all['payment'])?.left ?? 0) ? 'เกินยอดที่คืนได้ของการชำระนี้' : null) },
        { name: 'reason', label: this.t('เหตุผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', placeholder: 'เช่น รายการถูกยกเลิกหลังเจ้าของชำระแล้ว', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null) },
      ],
      confirmLabel: 'คืนเงิน',
      onConfirm: v => {
        const { refund, approval } = this.store.requestRefund(i, Number(v['payment']), Number(v['amount']), v['reason'].trim());
        this.ui.toast(approval ? 'ส่งคำขอคืนเงิน {id} {amount} ให้ผู้จัดการการเงินอนุมัติ' : 'คืนเงิน {amount} · {id} แล้ว', { id: refund.id, amount: baht(refund.amount) }, approval ? 'info' : 'success');
      },
    });
  }

  /** A discount on a bill not yet paid; above a tenth of it, it waits for the finance manager */
  requestDiscount(i: Invoice) {
    if (!['draft', 'issued', 'partial'].includes(statusOf(i))) {
      this.ui.toast('ให้ส่วนลดได้เฉพาะใบแจ้งหนี้ที่ยังชำระไม่ครบ', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: `ส่วนลด · ${i.no || i.id}`,
      facts: [['เจ้าของ', i.ownerKey], ['ยอดรวม', baht(i.total)], ['ชำระแล้ว', baht(i.paid)]],
      intro: [this.t('ส่วนลดไม่เกิน {0}% ของยอดรวมให้ได้ทันที เกินนั้นต้องให้ผู้จัดการการเงินอนุมัติ', { 0: DISCOUNT_THRESHOLD * 100 })],
      fields: [
        { name: 'amount', label: 'จำนวนเงินส่วนลด (บาท)', type: 'input', placeholder: 'เช่น 200', validate: v => money(v) ?? (Number(v) > balanceOf(i) ? 'ส่วนลดเกินยอดคงเหลือ' : null) },
        { name: 'reason', label: this.t('เหตุผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', placeholder: 'เช่น ลูกค้าประกันตามเงื่อนไขกรมธรรม์', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null) },
      ],
      confirmLabel: 'ให้ส่วนลด',
      onConfirm: v => {
        const approval = this.store.requestDiscount(i, Number(v['amount']), v['reason'].trim());
        this.ui.toast(approval ? 'ส่งคำขอส่วนลด {amount} ให้ผู้จัดการการเงินอนุมัติ' : 'ให้ส่วนลด {amount} · ยอดรวมใหม่ {total}', { amount: baht(Number(v['amount'])), total: baht(i.total) }, approval ? 'info' : 'success');
      },
    });
  }

  retryExport(x: AccountingExport) {
    this.ui.ask({
      title: `ส่งข้อมูลบัญชีใหม่ · ${x.id}`,
      facts: [['เอกสาร', `${x.document} · ${x.docType}`], ['จำนวนเงิน', baht(x.amount)], ['ส่งแล้ว', `${x.attempts} ครั้ง`], ['ข้อผิดพลาดล่าสุด', x.errorText ?? '—']],
      intro: ['การส่งใหม่ใช้ idempotency key เดิม ระบบบัญชีจะไม่บันทึกซ้ำ · สถานะ "ส่งแล้ว" หมายถึงระบบบัญชีรับข้อมูล ไม่ใช่ e-Tax'],
      confirmLabel: 'ส่งใหม่',
      onConfirm: () => {
        this.store.retryExport(x);
        this.ui.toast('ส่ง {id} แล้ว · อ้างอิง {ref}', { id: x.id, ref: x.externalRef ?? '' });
      },
    });
  }

  /** The day signed off: what was found, and what was done about it */
  saveReconciliation(date: string, variances: number) {
    this.ui.ask({
      title: `บันทึกผลกระทบยอด · ${date}`,
      facts: [['รายการต่างที่พบ', String(variances)]],
      intro: ['ผลที่บันทึกเป็นหลักฐานของวันนั้น พร้อมผู้บันทึกและเวลา · รายการต่างแต่ละรายการแก้ที่โมดูลเจ้าของ'],
      fields: [{ name: 'note', label: 'สิ่งที่ตรวจพบและการจัดการ', type: 'textarea', placeholder: 'เช่น รายการต่าง 2 รายการ: QR timeout รอธนาคารยืนยัน, token PEAK ต่ออายุแล้วส่งใหม่สำเร็จ', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null) }],
      confirmLabel: 'บันทึกผล',
      onConfirm: v => {
        this.store.saveReconciliation(date, variances, v['note'].trim());
        this.ui.toast('บันทึกผลกระทบยอดวันที่ {date} แล้ว', { date });
      },
    });
  }

  printInvoice(i: Invoice) {
    printInvoice(i, this.store.clinic.data().owners[i.ownerKey], this.t, this.i18n.lang());
  }

  printReceipt(i: Invoice) {
    printReceipt(i, this.store.clinic.data().owners[i.ownerKey], this.t, this.i18n.lang());
  }

  openInvoice(i: Invoice) {
    this.router.navigate(['/backoffice/finance/invoices', i.id]);
  }

  /** Seen: who saw it and what they did about it; it is settled in the owning workflow, not here */
  acknowledge(x: BoException) {
    this.ui.ask({
      title: `รับทราบ · ${x.ref}`,
      facts: [['ข้อยกเว้น', x.title], ['เกิดเมื่อ', x.at], ['จัดการใน', x.source]],
      intro: ['การรับทราบบันทึกว่าใครเห็นแล้วและทำอะไร แต่ไม่ปิดข้อยกเว้น — ต้องไปแก้ที่ workflow ของโมดูลเจ้าของ'],
      fields: [{ name: 'note', label: 'สิ่งที่ทำหรือส่งต่อ', type: 'textarea', optional: true, placeholder: 'เช่น โทรแจ้งธนาคารแล้ว รอผลภายใน 1 ชม.' }],
      confirmLabel: 'รับทราบ',
      onConfirm: v => {
        this.store.acknowledge(x, v['note'].trim());
        this.ui.toast('รับทราบ {ref} แล้ว', { ref: x.ref });
      },
    });
  }
}
