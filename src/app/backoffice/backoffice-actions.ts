import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { balanceOf } from '../clinic/data/rail';
import type { Invoice } from '../clinic/data/types';
import { printClaim, printInvoice, printReceipt } from '../clinic/shared/documents';
import { BackofficeUi, type DialogField } from './backoffice-ui';
import { BackofficeStore } from './backoffice.store';
import { DISCOUNT_THRESHOLD, methodOf, PAYMENT_METHODS, refundable, REFUND_THRESHOLD, statusOf } from './data/finance';
import { APPROVAL_KIND, canDecide } from './data/home';
import { canResolve, INVESTIGATION, type LedgerDispenseInput, RECALL_NEXT, RECALL_SEVERITY, RECALL_STATUS, type ReceiptInput, type WasteInput, wasteReason } from './data/inventory';
import { CLAIM_KIND, CLAIM_STATUS, type ClaimInput, linkOf, MESSAGE_KIND, type OutboxItem, policyOf, PURPOSE_LABEL } from './data/sales';
import type {
  AccountingExport, Approval, BoException, CeRecord, Claim, CountRecord, LeaveRequest, License, OnCallSlot, Privilege, Recall, RecallStatus, Shift, StaffMember, StockReceipt,
} from './data/types';
import {
  canVerify, catalogCourse, CE_STATUS, type CeInput, ceReviewBlock, coverage, daysOf, DEPARTMENTS, EMPLOYMENT, fairness, gaps, LEAVE_STATUS, LEAVE_TYPE, leaveBlock, leaveDays, leaveImpact,
  type LeaveInput, LICENSE_KIND, type LicenseInput, onCallEligible, previewShift, PRIVILEGE, privilegeBlock, publishBlock, renewProblems, ROLE, SHIFT, type ShiftInput, slotProblem,
  STAFF_STATUS, type StaffInput, staffOf, weekday,
} from './data/workforce';
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

  /* Medication inventory (data/inventory.ts): the forms live on the pages; here is what confirms and records them */

  /** The receipt reviewed once more, then posted; the shelf shows it at once */
  receive(input: ReceiptInput, onDone?: (receipt: StockReceipt) => void) {
    const unit = this.store.data().drugs.find(d => d.name === input.drug)?.unit ?? '';
    this.ui.ask({
      title: `บันทึกการรับเข้า · ${input.drug}`,
      facts: [['Lot', input.lot], ['วันหมดอายุ', input.expiry], ['จำนวนรับ', `${input.qty} ${unit}`], ['ตำแหน่งจัดเก็บ', input.location], ...(input.sourceRef ? [['อ้างอิงที่มา', input.sourceRef] as [string, string]] : [])],
      intro: ['ตรวจทานรายการยา lot วันหมดอายุ และจำนวนกับของจริงก่อนบันทึก · ยอดคงเหลือใหม่เป็นผลจากระบบ ไม่ใช่ตัวเลขประมาณการ · receipt ที่บันทึกแล้วแก้ไขไม่ได้'],
      confirmLabel: 'บันทึกการรับเข้า',
      onConfirm: () => {
        const receipt = this.store.receive(input);
        this.ui.toast('รับเข้า {id} แล้ว · {drug} lot {lot} {qty}', { id: receipt.id, drug: receipt.drug, lot: receipt.lot, qty: `${receipt.qty} ${receipt.unit}` });
        onDone?.(receipt);
      },
    });
  }

  /** A controlled drug drawn: patient, drug, quantity and witness confirmed together, never in one click */
  ledgerDispense(input: LedgerDispenseInput, onDone?: () => void) {
    const unit = this.store.data().drugs.find(d => d.name === input.drug)?.unit ?? '';
    this.ui.ask({
      title: `เบิก-จ่ายยาควบคุม · ${input.drug}`,
      tone: 'danger',
      facts: [['ผู้ป่วย', input.patient], ['Visit / คำสั่ง', `${input.encounter || '—'} / ${input.order || '—'}`], ['จำนวน', `${input.qty} ${unit}`], ['พยาน', input.witness || '—'], ['ผู้ทำรายการ', this.store.userName()]],
      intro: ['รายการเบิกเป็น append-only: บันทึกแล้วแก้หรือลบไม่ได้ · ส่วนที่ดูดแล้วไม่ได้ให้ต้องบันทึกเป็นยาเสียพร้อมพยาน'],
      confirmLabel: 'ยืนยันการเบิก',
      onConfirm: () => {
        const record = this.store.ledgerDispense(input);
        this.ui.toast('เบิก {id} แล้ว · {qty} จาก lot {lot}', { id: record.id, qty: `${record.qty} ${record.unit}`, lot: record.lot ?? '—' });
        onDone?.();
      },
    });
  }

  recordWaste(input: WasteInput, onDone?: () => void) {
    const unit = this.store.data().drugs.find(d => d.name === input.drug)?.unit ?? '';
    this.ui.ask({
      title: `บันทึกยาเสีย · ${input.drug}`,
      tone: 'danger',
      facts: [['จำนวน', `${input.qty} ${unit}`], ['เหตุผล', wasteReason(input.reason).label], ['รายละเอียด', input.detail], ['พยาน', input.witness], ['ผู้ทำรายการ', this.store.userName()]],
      intro: [wasteReason(input.reason).fromStock ? 'เหตุผลนี้ตัดจากคงเหลือในคลัง' : 'เหตุผลนี้เป็นยาที่เบิกออกไปแล้ว คงเหลือในคลังไม่เปลี่ยน'],
      confirmLabel: 'บันทึกยาเสีย',
      onConfirm: () => {
        const record = this.store.recordWaste(input);
        this.ui.toast('บันทึกยาเสีย {id} แล้ว', { id: record.id });
        onDone?.();
      },
    });
  }

  /** Only what was found is given; the expected figure and the difference are the system's */
  recordCount(drug: string, actual: number, onDone?: () => void) {
    const unit = this.store.data().drugs.find(d => d.name === drug)?.unit ?? '';
    this.ui.ask({
      title: `นับสต็อก · ${drug}`,
      facts: [['จำนวนที่นับได้', `${actual} ${unit}`], ['ผู้นับ', this.store.userName()]],
      intro: ['ระบบเทียบกับคงเหลือเองหลังบันทึก · ถ้าต่างกันจะเปิดการสอบสวนทันที และผู้นับสรุปผลเองไม่ได้ · นับซ้ำเป็นรายการใหม่ ไม่แก้ของเดิม'],
      confirmLabel: 'บันทึกการนับ',
      onConfirm: () => {
        const record = this.store.recordCount(drug, actual);
        this.ui.toast(record.investigation === 'open' ? 'นับได้ {actual} · คาด {expected} · ส่วนต่าง {diff} — เปิดการสอบสวน {id}' : 'นับได้ {actual} ตรงกับคงเหลือ · {id}',
          { id: record.id, actual: `${record.actual} ${unit}`, expected: `${record.expected} ${unit}`, diff: String(record.discrepancy) }, record.investigation === 'open' ? 'info' : 'success');
        onDone?.();
      },
    });
  }

  /** An investigation closed one way, by someone other than the counter, with notes that stand as evidence */
  resolveInvestigation(c: CountRecord, status: 'resolved' | 'escalated') {
    if (!canResolve(c, this.store.userName())) {
      this.ui.toast(c.investigation !== 'open' ? 'การสอบสวนนี้สรุปผลไปแล้ว — นับใหม่เพื่อเปิดรอบใหม่' : 'ผู้นับสรุปผลการสอบสวนของตัวเองไม่ได้ (การแยกหน้าที่)', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: `${status === 'resolved' ? 'สรุปผลสอบสวน' : 'ส่งต่อระดับสูง'} · ${c.id}`,
      tone: status === 'resolved' ? 'primary' : 'danger',
      facts: [['รายการยา', c.drug], ['นับได้ / คาด', `${c.actual} / ${c.expected} ${c.unit}`], ['ส่วนต่าง', `${c.discrepancy} ${c.unit}`], ['ผู้นับ', `${c.by} · ${c.at}`]],
      intro: ['สถานะเดินทางเดียว: เปิด → สรุปผล/ส่งต่อ แล้วแก้ไม่ได้อีก · ผู้อำนวยการหรือผู้ดูแลระบบเป็นผู้ตัดสิน'],
      fields: [{ name: 'notes', label: this.t('บันทึกผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', placeholder: 'เช่น ตรวจพบรายการยาเสียที่ยังไม่ลงบัญชี ลงบันทึกแล้ว', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null) }],
      confirmLabel: status === 'resolved' ? 'สรุปผลสอบสวน' : 'ส่งต่อระดับสูง',
      onConfirm: v => {
        this.store.resolveInvestigation(c, status, v['notes'].trim());
        this.ui.toast('{id} → {status}', { id: c.id, status: this.t(INVESTIGATION[status].label) });
      },
    });
  }

  /** A recall opened on a lot, from the notice that asks for it */
  openRecall(drug: string, lot: string) {
    this.ui.ask({
      title: `เริ่มการเรียกคืน · ${drug}`,
      tone: 'danger',
      facts: [['Lot', lot], ['ผู้รับผิดชอบ', this.store.userName()]],
      intro: ['การเรียกคืนเปลี่ยนสถานะของ lot และบันทึกหลักฐาน ไม่แก้หรือลบรายการจ่ายยา · กันของคงคลังแยกต่างหากหลังเปิด'],
      fields: [
        { name: 'severity', label: 'ระดับตามประกาศ', type: 'select', value: '', options: [{ value: '', label: 'ยังไม่ระบุ' }, ...Object.entries(RECALL_SEVERITY).map(([value, label]) => ({ value, label }))], optional: true },
        { name: 'reason', label: this.t('เหตุผลและที่มา (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', placeholder: 'เช่น ประกาศผู้ผลิต 2026-09-22: ปริมาณตัวยาต่ำกว่าเกณฑ์', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null) },
      ],
      confirmLabel: 'เริ่มการเรียกคืน',
      onConfirm: v => {
        const recall = this.store.openRecall(drug, lot, v['reason'].trim(), (v['severity'] || undefined) as Recall['severity']);
        this.ui.toast('เปิดการเรียกคืน {id} · lot {lot}', { id: recall.id, lot });
      },
    });
  }

  updateRecall(recall: Recall) {
    const next = RECALL_NEXT[recall.status];
    if (!next.length) {
      this.ui.toast('การเรียกคืนนี้ปิดแล้ว', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: `อัปเดตการเรียกคืน · ${recall.id}`,
      facts: [['รายการยา', `${recall.drug} · lot ${recall.lot}`], ['สถานะปัจจุบัน', RECALL_STATUS[recall.status].label]],
      intro: ['สถานะเดินไปข้างหน้าเท่านั้น: เปิด → กำลังดำเนินการ → ควบคุมได้แล้ว → ปิดแล้ว'],
      fields: [
        { name: 'status', label: 'สถานะใหม่', type: 'select', value: next[0], options: next.map(s => ({ value: s, label: RECALL_STATUS[s].label })) },
        { name: 'note', label: this.t('สิ่งที่ทำ (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', placeholder: 'เช่น กันของในคลังแล้ว แจ้งเจ้าของ 2 รายที่ได้รับยา', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null) },
      ],
      confirmLabel: 'บันทึกการอัปเดต',
      onConfirm: v => {
        this.store.updateRecall(recall, v['status'] as RecallStatus, v['note'].trim());
        this.ui.toast('{id} → {status}', { id: recall.id, status: this.t(RECALL_STATUS[recall.status].label) });
      },
    });
  }

  /** The lot held back on the shelf: nothing is taken away, the clinic simply cannot dispense from it */
  quarantine(lot: string, recall: Recall) {
    if (this.store.clinic.data().holds?.[lot]) {
      this.ui.toast('lot นี้ถูกกันไว้แล้ว', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: `กันของคงคลัง · lot ${lot}`,
      tone: 'danger',
      facts: [['รายการยา', recall.drug], ['การเรียกคืน', recall.id]],
      intro: ['ของยังอยู่ในคลังตามจำนวนเดิม แต่ห้องยาจะจ่ายจาก lot นี้ไม่ได้จนกว่าจะปลด · ไม่ปรับจำนวนโดยไม่มี movement'],
      confirmLabel: 'กันของคงคลัง',
      onConfirm: () => {
        this.store.quarantine(lot, `${recall.id} · ${recall.reason}`);
        this.ui.toast('กัน lot {lot} แล้ว · ห้องยาจ่ายจาก lot นี้ไม่ได้', { lot });
      },
    });
  }

  /* Sales and customer service (data/sales.ts) */

  /** One LINE message, previewed with the consent it rests on */
  sendMessage(item: OutboxItem) {
    const link = linkOf(this.store.data(), item.ownerKey);
    if (item.block || !link) {
      this.ui.toast(item.block ?? 'ไม่ได้เชื่อม LINE กับโรงพยาบาล', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: `ส่งข้อความ LINE · ${MESSAGE_KIND[item.kind].label}`,
      facts: [['ถึง', `${item.ownerKey} · LINE ${link.displayName}`], ['สัตว์', item.pet], ['ข้อความ', item.text], ['ความยินยอม', `${PURPOSE_LABEL[MESSAGE_KIND[item.kind].purpose]} · ${link.consent.version} · ${link.consent.at}`]],
      intro: [item.retry ? `ครั้งก่อนส่งไม่สำเร็จ (${item.retry.at} · ${item.retry.error ?? ''}) — ส่งใหม่เป็นข้อความใหม่` : 'ข้อความบริการส่งผ่าน LINE Official Account ของโรงพยาบาล ไม่มีข้อมูลการรักษาในข้อความ'],
      confirmLabel: 'ส่งข้อความ',
      onConfirm: () => {
        const message = this.store.sendMessage(item);
        this.ui.toast('ส่ง {id} ถึง {owner} แล้ว', { id: message.id, owner: item.ownerKey });
      },
    });
  }

  /** Every message that may go, in one confirmation; the blocked ones stay */
  sendAll(items: OutboxItem[]) {
    const ready = items.filter(i => !i.block);
    if (!ready.length) {
      this.ui.toast('ไม่มีข้อความที่ส่งได้', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: this.t('ส่งข้อความที่ส่งได้ {n} รายการ', { n: ready.length }),
      facts: ready.map(i => [this.t(MESSAGE_KIND[i.kind].label), `${i.ownerKey} · ${i.text}`] as [string, string]),
      intro: [this.t('{n} รายการที่ไม่มีความยินยอมหรือไม่ได้เชื่อม LINE จะไม่ถูกส่ง', { n: items.length - ready.length })],
      confirmLabel: 'ส่งทั้งหมด',
      onConfirm: () => {
        ready.forEach(i => this.store.sendMessage(i));
        this.ui.toast('ส่งข้อความ LINE {n} รายการแล้ว', { n: ready.length });
      },
    });
  }

  /** A claim or pre-authorisation written from the form on the page */
  createClaim(input: ClaimInput, onDone?: (claim: Claim) => void) {
    const policy = policyOf(this.store.data(), input.policyId)!;
    const invoice = this.store.clinic.data().invoices.find(i => i.id === input.invoiceId);
    this.ui.ask({
      title: `${CLAIM_KIND[input.kind]} · ${policy.insurer}`,
      facts: [['กรมธรรม์', `${policy.policyNo} · ${policy.ownerKey} · ${policy.pet}`], ...(invoice ? [['ใบแจ้งหนี้', `${invoice.no} · ${baht(invoice.total)}`] as [string, string]] : []), ['การวินิจฉัย', input.diagnosis], ['จำนวนเงิน', baht(input.amount)]],
      intro: ['ยอดที่เคลมเป็นค่าประมาณตามเงื่อนไขกรมธรรม์ — บริษัทประกันเป็นผู้พิจารณา · การส่งผ่าน API ของบริษัทประกันเป็น P4 ตอนนี้ส่งเองแล้วบันทึกสถานะ'],
      confirmLabel: 'สร้างฉบับร่าง',
      onConfirm: () => {
        const claim = this.store.createClaim(input);
        this.ui.toast('สร้าง {id} แล้ว', { id: claim.id });
        onDone?.(claim);
      },
    });
  }

  /** The insurer's form printed; a draft becomes ready to send */
  printClaim(c: Claim) {
    const d = this.store.data();
    const policy = policyOf(d, c.policyId)!;
    const invoice = this.store.clinic.data().invoices.find(i => i.id === c.invoiceId);
    printClaim({ ...c, policyNo: policy.policyNo, deductible: policy.deductible, copay: policy.copay, remaining: policy.remaining }, invoice, this.store.clinic.data().owners[c.ownerKey], this.t, this.i18n.lang());
    if (c.status === 'draft') {
      this.store.claimDocuments(c);
      this.ui.toast('ออกเอกสาร {id} แล้ว · พร้อมส่ง', { id: c.id });
    }
  }

  submitClaim(c: Claim) {
    this.ui.ask({
      title: `บันทึกการส่งเคลม · ${c.id}`,
      facts: [['บริษัทประกัน', c.insurer], ['จำนวนเงิน', baht(c.amount)]],
      intro: ['บันทึกว่าส่งเอกสารไปทางใดและเลขรับเรื่องที่บริษัทประกันให้ · สถานะต่อจากนี้บันทึกตามที่บริษัทประกันแจ้ง'],
      fields: [
        { name: 'via', label: 'ช่องทางที่ส่ง', type: 'select', value: `อีเมลฝ่ายสินไหม ${c.insurer}`, options: [`อีเมลฝ่ายสินไหม ${c.insurer}`, `พอร์ทัล ${c.insurer}`, 'ไปรษณีย์', 'เจ้าของส่งเอง'].map(v => ({ value: v, label: v })) },
        { name: 'ref', label: 'เลขรับเรื่องของบริษัทประกัน', type: 'input', optional: true, placeholder: 'เช่น FAL-CL-551300' },
      ],
      confirmLabel: 'บันทึกการส่ง',
      onConfirm: v => {
        this.store.submitClaim(c, v['via'], v['ref']);
        this.ui.toast('{id} → {status}', { id: c.id, status: this.t(CLAIM_STATUS.submitted.label) });
      },
    });
  }

  /** The insurer's answer, as it came */
  decideClaim(c: Claim) {
    this.ui.ask({
      title: `บันทึกผลพิจารณา · ${c.id}`,
      facts: [['บริษัทประกัน', `${c.insurer} · ${c.insurerRef ?? '—'}`], ['ยอดที่เคลม', baht(c.amount)]],
      intro: ['บันทึกตามหนังสือแจ้งผลของบริษัทประกัน · ผลที่อนุมัติใช้วงเงินของกรมธรรม์'],
      fields: [
        { name: 'decision', label: 'ผลพิจารณา', type: 'select', value: 'approved', options: (['approved', 'partially-approved', 'rejected'] as const).map(s => ({ value: s, label: CLAIM_STATUS[s].label })) },
        { name: 'amount', label: 'ยอดอนุมัติ (บาท) — เฉพาะอนุมัติบางส่วน', type: 'input', optional: true,
          validate: (v, all) => (all['decision'] === 'partially-approved' && !(Number(v) > 0 && Number(v) < c.amount) ? 'ยอดอนุมัติบางส่วนต้องมากกว่า 0 และน้อยกว่ายอดที่เคลม' : null) },
        { name: 'note', label: this.t('เหตุผลหรือรายละเอียด (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', placeholder: 'เช่น อนุมัติค่าผ่าตัด ไม่รวมค่าห้องวันที่ 3', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null) },
      ],
      confirmLabel: 'บันทึกผล',
      onConfirm: v => {
        const decision = v['decision'] as 'approved' | 'partially-approved' | 'rejected';
        this.store.decideClaim(c, decision, Number(v['amount']) || 0, v['note'].trim());
        this.ui.toast('{id} → {status}', { id: c.id, status: this.t(CLAIM_STATUS[decision].label) });
      },
    });
  }

  /** The money from the insurer: paid to the hospital it settles the bill; paid to the owner it is only recorded */
  reimburse(c: Claim) {
    const invoice = this.store.clinic.data().invoices.find(i => i.id === c.invoiceId);
    const owed = invoice ? balanceOf(invoice) : 0;
    this.ui.ask({
      title: `บันทึกรับเงินชดเชย · ${c.id}`,
      facts: [['ยอดอนุมัติ', baht(c.approvedAmount ?? 0)], ...(invoice ? [['ใบแจ้งหนี้', `${invoice.no} · ${this.t('คงค้าง')} ${baht(owed)}`] as [string, string]] : [])],
      intro: ['ยอดที่ได้รับจริงต่างจากยอดอนุมัติได้ (EOB) — ส่วนต่างจะถูกบันทึกไว้ · ถ้าจ่ายให้โรงพยาบาลและใบแจ้งหนี้ยังค้าง จะบันทึกเป็นการรับชำระช่องทาง "ประกัน"'],
      fields: [
        { name: 'amount', label: 'ยอดที่ได้รับ (บาท)', type: 'input', value: String(c.approvedAmount ?? ''), validate: v => money(v) },
        { name: 'payee', label: 'จ่ายให้', type: 'select', value: owed > 0 ? 'hospital' : 'owner', options: [{ value: 'hospital', label: 'โรงพยาบาล' }, { value: 'owner', label: 'เจ้าของโดยตรง' }] },
        { name: 'ref', label: 'เลขอ้างอิงการโอน / EOB', type: 'input', optional: true },
      ],
      confirmLabel: 'บันทึกรับเงิน',
      onConfirm: v => {
        this.store.reimburse(c, Number(v['amount']), v['payee'] as 'hospital' | 'owner', v['ref'].trim());
        this.ui.toast('{id} → {status}', { id: c.id, status: this.t(CLAIM_STATUS.reimbursed.label) });
      },
    });
  }

  openItem(drugId: string) {
    this.router.navigate(['/backoffice/inventory/items', drugId]);
  }

  /* Workforce (data/workforce.ts) */

  openStaff(id: string) {
    this.router.navigate(['/backoffice/workforce/staff', id]);
  }

  addStaff(input: StaffInput, onDone?: (member: StaffMember) => void) {
    this.ui.ask({
      title: `เพิ่มบุคลากร · ${input.name.trim()}`,
      facts: [['ตำแหน่งงาน', `${this.t(ROLE[input.role].label)} · ${input.position}`], ['แผนก', input.department], ['การจ้าง', this.t(EMPLOYMENT[input.employment])], ['เริ่มงาน', input.startedAt]],
      intro: ['ทะเบียนบุคลากรไม่ใช่บัญชีผู้ใช้ — การเข้าระบบและบทบาทสร้างแยกที่ IAM (M14) · ใบอนุญาตและสิทธิ์วิชาชีพบันทึกต่อจากนี้'],
      confirmLabel: 'เพิ่มบุคลากร',
      onConfirm: () => {
        const member = this.store.addStaff(input);
        this.ui.toast('เพิ่ม {name} แล้ว · {id}', { name: this.t(member.name), id: member.id });
        onDone?.(member);
      },
    });
  }

  editStaff(member: StaffMember) {
    this.ui.ask({
      title: `แก้ไขข้อมูล · ${member.name}`,
      intro: ['แก้ได้เฉพาะข้อมูลการปฏิบัติงาน · ค่าตอบแทนและสัญญาจ้างไม่อยู่ในขอบเขต'],
      fields: [
        { name: 'department', label: 'แผนก', type: 'select', value: member.department, options: DEPARTMENTS.map(v => ({ value: v, label: this.t(v) })) },
        { name: 'phone', label: 'โทรศัพท์', type: 'input', value: member.phone },
        { name: 'employment', label: 'การจ้าง', type: 'select', value: member.employment, options: (Object.keys(EMPLOYMENT) as StaffMember['employment'][]).map(k => ({ value: k, label: this.t(EMPLOYMENT[k]) })) },
        { name: 'status', label: 'สถานะ', type: 'select', value: member.status, options: (Object.keys(STAFF_STATUS) as StaffMember['status'][]).map(k => ({ value: k, label: this.t(STAFF_STATUS[k].label) })) },
      ],
      confirmLabel: 'บันทึกข้อมูล',
      onConfirm: v => {
        this.store.updateStaff(member, { department: v['department'], phone: v['phone'].trim(), employment: v['employment'] as StaffMember['employment'], status: v['status'] as StaffMember['status'] });
        this.ui.toast('บันทึกข้อมูล {name} แล้ว', { name: this.t(member.name) });
      },
    });
  }

  addLicense(input: LicenseInput, onDone?: (license: License) => void) {
    const member = staffOf(this.store.data(), input.staffId)!;
    this.ui.ask({
      title: `บันทึกใบอนุญาต · ${member.name}`,
      facts: [['ชนิด', this.t(LICENSE_KIND[input.kind].label)], ['เลขที่', input.number], ['ผู้ออก', input.issuer || LICENSE_KIND[input.kind].issuer], ['ใช้ได้', `${input.issuedAt} → ${input.expiresAt}`]],
      intro: ['ใบอนุญาตที่บันทึกใหม่จะรอตรวจสอบกับผู้ออก — ระหว่างนั้นยังใช้เป็นฐานของสิทธิ์วิชาชีพหรือเวรตรวจไม่ได้'],
      confirmLabel: 'บันทึกใบอนุญาต',
      onConfirm: () => {
        const license = this.store.addLicense(input);
        this.ui.toast('บันทึก {no} แล้ว · รอตรวจสอบ', { no: license.number });
        onDone?.(license);
      },
    });
  }

  /** Checked with the issuer, by someone other than the holder */
  verifyLicense(l: License) {
    const d = this.store.data();
    if (!canVerify(d, l, this.store.userName())) {
      this.ui.toast('ผู้ถือใบอนุญาตตรวจสอบใบอนุญาตของตัวเองไม่ได้ (การแยกหน้าที่)', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: `ตรวจสอบใบอนุญาต · ${l.number}`,
      facts: [['ผู้ถือ', staffOf(d, l.staffId)?.name ?? '—'], ['ชนิด', this.t(LICENSE_KIND[l.kind].label)], ['ผู้ออก', l.issuer], ['หมดอายุ', l.expiresAt]],
      intro: ['ยืนยันว่าเลขที่และวันหมดอายุตรงกับผู้ออก · ชื่อผู้ตรวจและเวลาบันทึกเป็นหลักฐาน'],
      fields: [
        { name: 'method', label: 'วิธีตรวจ', type: 'select', value: `ตรวจกับเว็บไซต์${l.issuer}`, options: [`ตรวจกับเว็บไซต์${l.issuer}`, 'ตรวจเอกสารตัวจริง', 'โทรยืนยันกับผู้ออก'].map(v => ({ value: v, label: this.t(v) })) },
        { name: 'note', label: 'หมายเหตุ', type: 'input', optional: true },
      ],
      confirmLabel: 'ยืนยันการตรวจสอบ',
      onConfirm: v => {
        this.store.verifyLicense(l, v['method'], v['note'].trim());
        this.ui.toast('{no} ตรวจสอบแล้ว', { no: l.number });
      },
    });
  }

  /** A renewal: the new date, checked again before it counts */
  renewLicense(l: License) {
    this.ui.ask({
      title: `ต่ออายุใบอนุญาต · ${l.number}`,
      facts: [['ผู้ถือ', staffOf(this.store.data(), l.staffId)?.name ?? '—'], ['หมดอายุเดิม', l.expiresAt]],
      intro: ['เมื่อบันทึกการต่ออายุ ใบอนุญาตจะกลับไปรอตรวจสอบกับผู้ออกอีกครั้ง'],
      fields: [
        { name: 'expiresAt', label: 'วันหมดอายุใหม่ (YYYY-MM-DD)', type: 'input', placeholder: 'เช่น 2031-10-15', validate: v => renewProblems(l, v.trim()) },
        { name: 'number', label: 'เลขที่ใหม่ (ถ้าเปลี่ยน)', type: 'input', optional: true },
        { name: 'evidence', label: 'หลักฐาน (ใบเสร็จ / เลขคำขอ)', type: 'input', optional: true, placeholder: 'เช่น ใบเสร็จสัตวแพทยสภา R-55120' },
      ],
      confirmLabel: 'บันทึกการต่ออายุ',
      onConfirm: v => {
        this.store.renewLicense(l, v['expiresAt'].trim(), v['number'], v['evidence'].trim());
        this.ui.toast('{no} ต่ออายุถึง {date} · รอตรวจสอบ', { no: l.number, date: l.expiresAt });
      },
    });
  }

  addCe(input: CeInput, onDone?: (record: CeRecord) => void) {
    const member = staffOf(this.store.data(), input.staffId)!;
    const listed = catalogCourse(input.course.trim());
    this.ui.ask({
      title: `บันทึก CE · ${member.name}`,
      facts: [['หลักสูตร', input.course], ['วันที่', input.date], ['ชั่วโมง', String(listed?.hours ?? input.hours)], ['ใบรับรอง', input.certificate || '—']],
      intro: [listed ? 'หลักสูตรในรายการที่โรงพยาบาลรับรอง — นับชั่วโมงทันที' : 'หลักสูตรนอกรายการ — รอผู้ตรวจที่ไม่ใช่ผู้เข้าอบรม และต้องมีใบรับรอง'],
      confirmLabel: 'บันทึก CE',
      onConfirm: () => {
        const record = this.store.addCe(input);
        this.ui.toast(record.status === 'approved' ? 'บันทึก {id} แล้ว · นับ {h} ชม.' : 'บันทึก {id} แล้ว · รอตรวจ', { id: record.id, h: record.hours });
        onDone?.(record);
      },
    });
  }

  reviewCe(c: CeRecord, decision: 'approved' | 'rejected') {
    const block = ceReviewBlock(this.store.data(), c, this.store.userName(), decision);
    if (block) {
      this.ui.toast(block, undefined, 'info');
      return;
    }
    const approve = decision === 'approved';
    this.ui.ask({
      title: `${approve ? 'นับชั่วโมง' : 'ไม่นับชั่วโมง'} · ${c.id}`,
      tone: approve ? 'primary' : 'danger',
      facts: [['ผู้เข้าอบรม', staffOf(this.store.data(), c.staffId)?.name ?? '—'], ['หลักสูตร', `${c.course} · ${c.provider}`], ['ชั่วโมง', String(c.hours)], ['ใบรับรอง', c.certificate ?? '—']],
      fields: [{ name: 'note', label: this.t('เหตุผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
        placeholder: approve ? 'เช่น ตรวจใบรับรองและชั่วโมงกับผู้จัดแล้ว' : 'เช่น เนื้อหาไม่เกี่ยวกับงานคลินิก' }],
      confirmLabel: approve ? 'นับชั่วโมง' : 'ไม่นับชั่วโมง',
      onConfirm: v => {
        this.store.reviewCe(c, decision, v['note'].trim());
        this.ui.toast('{id} → {status}', { id: c.id, status: this.t(CE_STATUS[decision].label) });
      },
    });
  }

  attachCertificate(c: CeRecord, file: string) {
    this.store.attachCertificate(c, file);
    this.ui.toast('แนบใบรับรอง {file} กับ {id} แล้ว', { file, id: c.id });
  }

  /** Granted or taken back, by someone else, with why; a grant needs the licenses it rests on */
  changePrivilege(staffId: string, p: Privilege) {
    const d = this.store.data();
    const member = staffOf(d, staffId)!;
    const action = (d.privileges[staffId] ?? []).includes(p) ? 'revoke' : 'grant';
    const block = privilegeBlock(d, staffId, p, action, this.store.userName());
    if (block) {
      this.ui.toast(block, undefined, 'info');
      return;
    }
    const grant = action === 'grant';
    this.ui.ask({
      title: `${grant ? 'ให้สิทธิ์' : 'ถอนสิทธิ์'} · ${this.t(PRIVILEGE[p].label)}`,
      tone: grant ? 'primary' : 'danger',
      facts: [['ชื่อบุคลากร', `${member.name} · ${this.t(member.position)}`], ['ฐานของสิทธิ์', PRIVILEGE[p].needs.length ? PRIVILEGE[p].needs.map(k => this.t(LICENSE_KIND[k].label)).join(', ') : this.t('ตามขอบเขตที่โรงพยาบาลกำหนด')]],
      intro: ['การเปลี่ยนสิทธิ์วิชาชีพบันทึกผู้มีอำนาจ เวลา และเหตุผลไว้เป็นหลักฐาน · ไม่เปลี่ยนบทบาทหรือสิทธิ์ในระบบ (IAM)'],
      fields: [{ name: 'reason', label: this.t('เหตุผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
        placeholder: grant ? 'เช่น ผ่านการประเมินครบตามเกณฑ์ของโรงพยาบาล' : 'เช่น ยังไม่ผ่านการอบรมรอบใหม่' }],
      confirmLabel: grant ? 'ให้สิทธิ์' : 'ถอนสิทธิ์',
      onConfirm: v => {
        this.store.changePrivilege(staffId, p, action, v['reason'].trim());
        this.ui.toast(grant ? 'ให้สิทธิ์ {p} แก่ {name} แล้ว' : 'ถอนสิทธิ์ {p} ของ {name} แล้ว', { p: this.t(PRIVILEGE[p].label), name: this.t(member.name) });
      },
    });
  }

  /** A draft shift, refused when it clashes; it can be taken off again before the week goes out */
  assignShift(input: ShiftInput): boolean {
    const hard = previewShift(this.store.data(), input).filter(c => c.hard);
    if (hard.length) {
      this.ui.toast(hard[0].text, undefined, 'info');
      return false;
    }
    const shift = this.store.assignShift(input);
    this.ui.toast('จัดเวร{kind} {date} ให้ {name} แล้ว · ฉบับร่าง', { kind: this.t(SHIFT[shift.kind].label), date: shift.date, name: this.t(staffOf(this.store.data(), shift.staffId)?.name ?? '') });
    return true;
  }

  removeShift(s: Shift) {
    const name = staffOf(this.store.data(), s.staffId)?.name ?? '';
    const published = s.status === 'published';
    this.ui.ask({
      title: `ยกเลิกเวร · ${name}`,
      tone: 'danger',
      facts: [['วันที่', `${s.date} · ${this.t(weekday(s.date))}`], ['เวร', `${this.t(SHIFT[s.kind].label)} ${SHIFT[s.kind].time}`], ['จุดงาน', s.area]],
      intro: [published ? 'เวรนี้ประกาศแล้ว — การยกเลิกต้องมีเหตุผล และควรแจ้งผู้เกี่ยวข้อง' : 'เวรฉบับร่างยังไม่ได้ประกาศ ยกเลิกได้'],
      fields: published ? [{ name: 'reason', label: this.t('เหตุผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null) }] : [],
      confirmLabel: 'ยกเลิกเวร',
      onConfirm: v => {
        this.store.removeShift(s, (v['reason'] ?? '').trim());
        this.ui.toast('ยกเลิกเวร{kind} {date} ของ {name} แล้ว', { kind: this.t(SHIFT[s.kind].label), date: s.date, name: this.t(name) });
      },
    });
  }

  publishWeek(monday: string) {
    const d = this.store.data();
    const block = publishBlock(d, monday);
    if (block) {
      this.ui.toast(block, undefined, 'info');
      return;
    }
    const days = daysOf(monday);
    const drafts = d.shifts.filter(s => days.includes(s.date) && s.status === 'draft').length;
    const short = gaps(coverage(d, monday)).length;
    this.ui.ask({
      title: `ประกาศตารางเวร · ${days[0]} – ${days[6]}`,
      facts: [['เวรฉบับร่าง', String(drafts)], ['เวรที่คนไม่ครบ', String(short)]],
      intro: ['เมื่อประกาศแล้ว บุคลากรเห็นเวรของตัวเอง · การเปลี่ยนหลังประกาศต้องมีเหตุผล · ตารางเวรไม่ให้บทบาทหรือสิทธิ์วิชาชีพใด ๆ'],
      warning: short ? this.t('ยังมี {n} เวรที่คนไม่ครบขั้นต่ำ — ประกาศได้ แต่ต้องหาคนแทน', { n: short }) : undefined,
      confirmLabel: 'ประกาศตารางเวร',
      onConfirm: () => {
        const n = this.store.publishWeek(monday);
        this.ui.toast('ประกาศ {n} เวรแล้ว', { n });
      },
    });
  }

  requestLeave(input: LeaveInput, onDone?: (leave: LeaveRequest) => void) {
    const d = this.store.data();
    const member = staffOf(d, input.staffId)!;
    const impact = leaveImpact(d, input);
    this.ui.ask({
      title: `ยื่นคำขอลา · ${member.name}`,
      facts: [['ประเภท', this.t(LEAVE_TYPE[input.type])], ['ช่วง', `${input.from} – ${input.to} · ${this.t('{n} วัน', { n: leaveDays(input) })}`], ['เวรที่กระทบ', String(impact.shifts.length)]],
      intro: ['คำขอรอหัวหน้าที่ไม่ใช่ผู้ขออนุมัติ · การอนุมัติไม่ลบเวร — ตารางเวรจะแสดงเวรที่ต้องหาคนแทน'],
      confirmLabel: 'ยื่นคำขอ',
      onConfirm: () => {
        const leave = this.store.requestLeave(input);
        this.ui.toast('ยื่น {id} แล้ว · รออนุมัติ', { id: leave.id });
        onDone?.(leave);
      },
    });
  }

  decideLeave(l: LeaveRequest, status: 'approved' | 'rejected') {
    const d = this.store.data();
    const block = leaveBlock(d, l, this.store.userName());
    if (block) {
      this.ui.toast(block, undefined, 'info');
      return;
    }
    const impact = leaveImpact(d, l);
    const approve = status === 'approved';
    this.ui.ask({
      title: `${approve ? 'อนุมัติการลา' : 'ไม่อนุมัติการลา'} · ${l.id}`,
      tone: approve ? 'primary' : 'danger',
      facts: [['ผู้ขอ', staffOf(d, l.staffId)?.name ?? '—'], ['ประเภท', this.t(LEAVE_TYPE[l.type])], ['ช่วง', `${l.from} – ${l.to}`], ['เวรที่กระทบ', String(impact.shifts.length)]],
      warning: approve && impact.gaps.length ? this.t('{n} เวรจะมีคนไม่ครบขั้นต่ำ — ต้องจัดคนแทนในตารางเวร', { n: impact.gaps.length }) : undefined,
      fields: [{ name: 'note', label: this.t('เหตุผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea', validate: v => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
        placeholder: approve ? 'เช่น อนุมัติ จะจัดคนแทนเวรที่กระทบ' : 'เช่น ช่วงนี้คนไม่พอ ขอให้เลื่อน' }],
      confirmLabel: approve ? 'อนุมัติ' : 'ปฏิเสธการลา',
      onConfirm: v => {
        this.store.decideLeave(l, status, v['note'].trim());
        this.ui.toast('{id} → {status}', { id: l.id, status: this.t(LEAVE_STATUS[status].label) });
      },
    });
  }

  generateOnCall(from: string, to: string) {
    const drafts = this.store.data().onCall.filter(s => from <= s.date && s.date <= to && s.status === 'draft').length;
    this.ui.ask({
      title: `สร้างตารางเวร on-call · ${from} – ${to}`,
      intro: ['จัดคืนที่ยังว่างให้สัตวแพทย์ที่รับเวรได้ (ใบอนุญาตตรวจสอบแล้ว ไม่ได้ลา) คนที่มีคืนน้อยที่สุดก่อน วันหยุดนับแยก และเลี่ยงสองคืนติดกัน · คืนที่ประกาศแล้วคงเดิม'],
      warning: drafts ? this.t('ฉบับร่างเดิม {n} คืนจะถูกสร้างใหม่', { n: drafts }) : undefined,
      confirmLabel: 'สร้างตาราง',
      onConfirm: () => {
        const made = this.store.generateOnCall(from, to);
        this.ui.toast('จัด {n} คืนแล้ว · ฉบับร่าง', { n: made.length });
      },
    });
  }

  adjustOnCall(slot: OnCallSlot) {
    const d = this.store.data();
    const eligible = onCallEligible(d, slot.date);
    const published = slot.status === 'published';
    this.ui.ask({
      title: `ปรับเวร on-call · ${slot.date} ${this.t(weekday(slot.date))}`,
      facts: [['ตอนนี้', staffOf(d, slot.staffId)?.name ?? '—']],
      fields: [
        { name: 'staffId', label: 'ผู้รับเวร', type: 'select', value: eligible.some(e => e.id === slot.staffId) ? slot.staffId : eligible[0]?.id ?? '', options: eligible.map(e => ({ value: e.id, label: e.name })) },
        ...(published ? [{ name: 'reason', label: this.t('เหตุผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea' as const, validate: (v: string) => (reasonCheck(v) ? this.t(reasonCheck(v)!, { n: REASON_MIN }) : null) }] : []),
      ],
      intro: [published ? 'คืนนี้ประกาศแล้ว — การเปลี่ยนต้องมีเหตุผล' : 'เลือกได้เฉพาะสัตวแพทย์ที่รับเวรได้คืนนั้น'],
      confirmLabel: 'บันทึกการปรับ',
      onConfirm: v => {
        this.store.setOnCall(slot, v['staffId'], (v['reason'] ?? '').trim());
        this.ui.toast('เวร on-call {date} → {name}', { date: slot.date, name: this.t(staffOf(d, v['staffId'])?.name ?? '') });
      },
    });
  }

  publishOnCall(from: string, to: string) {
    const d = this.store.data();
    const slots = d.onCall.filter(s => from <= s.date && s.date <= to && s.status === 'draft');
    const bad = slots.find(s => slotProblem(d, s));
    if (bad) {
      this.ui.toast('{date}: {why}', { date: bad.date, why: this.t(slotProblem(d, bad)!) }, 'info');
      return;
    }
    const f = fairness(d, from, to);
    this.ui.ask({
      title: `ประกาศตารางเวร on-call · ${from} – ${to}`,
      facts: [['คืนฉบับร่าง', String(slots.length)], ['ส่วนต่างจำนวนคืน', this.t('{n} คืน', { n: f.spread })]],
      warning: f.fair ? undefined : this.t('การกระจายยังไม่สมดุล — มีคนรับเวรมากกว่าคนอื่นเกิน 1 คืน'),
      confirmLabel: 'ประกาศตาราง',
      onConfirm: () => {
        const n = this.store.publishOnCall(from, to);
        this.ui.toast('ประกาศเวร on-call {n} คืนแล้ว', { n });
      },
    });
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
