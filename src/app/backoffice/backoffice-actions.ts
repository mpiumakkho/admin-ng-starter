import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { balanceOf } from '../clinic/data/rail';
import type { Invoice } from '../clinic/data/types';
import { printInvoice, printReceipt } from '../clinic/shared/documents';
import { BackofficeUi, type DialogField } from './backoffice-ui';
import { BackofficeStore } from './backoffice.store';
import { DISCOUNT_THRESHOLD, methodOf, PAYMENT_METHODS, refundable, REFUND_THRESHOLD, statusOf } from './data/finance';
import { APPROVAL_KIND, canDecide } from './data/home';
import { canResolve, INVESTIGATION, type LedgerDispenseInput, RECALL_NEXT, RECALL_SEVERITY, RECALL_STATUS, type ReceiptInput, type WasteInput, wasteReason } from './data/inventory';
import type { AccountingExport, Approval, BoException, CountRecord, Recall, RecallStatus, StockReceipt } from './data/types';
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

  openItem(drugId: string) {
    this.router.navigate(['/backoffice/inventory/items', drugId]);
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
