/*
 * Finance and revenue (seph1-docs 26-backoffice-erp ux/pages/finance, M11): the bills the clinic issues, seen as the
 * back office sees them, with their lines, payments, refunds, discounts and the accounting delivery of each; what is
 * owed and for how long; and the day's reconciliation. The clinic's records stay the record; this module only reads
 * them and writes what M11 lets it. Text is kept in its source language and translated where it shows.
 */
import { CONSULTATION } from '../../clinic/data/estimate';
import { addDays, FORMULARY, nextSeq, NOW, ORDER_CATALOG, TODAY } from '../../clinic/data/model';
import { balanceOf, collectible, priceOf } from '../../clinic/data/rail';
import type { ClinicData, Invoice, InvoiceLine, InvoiceStatus, Refund } from '../../clinic/data/types';
import { daysUntil } from './home';
import type { AccountingExport, BackofficeData, BoException } from './types';

/* ---- Vocabulary (finance/00 shared i18n) ---- */

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: 'ฉบับร่าง', cls: 'quiet' },
  issued: { label: 'ออกแล้ว', cls: 'info' },
  partial: { label: 'ชำระบางส่วน', cls: 'warn' },
  paid: { label: 'ชำระครบ', cls: 'ok' },
  cancelled: { label: 'ยกเลิก', cls: 'danger' },
  refunded: { label: 'คืนเงินครบ', cls: 'quiet' },
};
export const PAYMENT_STATUS = {
  completed: { label: 'รับชำระแล้ว', cls: 'ok' },
  reversed: { label: 'กลับรายการแล้ว', cls: 'quiet' },
} as const;
export const REFUND_STATUS: Record<Refund['status'], { label: string; cls: string }> = {
  requested: { label: 'รออนุมัติ', cls: 'warn' },
  done: { label: 'คืนเงินแล้ว', cls: 'ok' },
  rejected: { label: 'ปฏิเสธ', cls: 'danger' },
};
export const DISCOUNT_STATUS = {
  requested: { label: 'รออนุมัติ', cls: 'warn' },
  applied: { label: 'ใช้แล้ว', cls: 'ok' },
  rejected: { label: 'ปฏิเสธ', cls: 'danger' },
} as const;

/** How the owner pays, and whether a reference goes with it (finance/03 method capability matrix); the PromptPay QR itself is not made here */
export const PAYMENT_METHODS: { value: string; label: string; reference: 'none' | 'optional' | 'required'; note?: string }[] = [
  { value: 'เงินสด', label: 'เงินสด', reference: 'none' },
  { value: 'บัตรเครดิต', label: 'บัตรเครดิต / เดบิต', reference: 'required', note: 'บันทึกเฉพาะเลขอนุมัติ ไม่เก็บข้อมูลบัตร' },
  { value: 'QR PromptPay', label: 'QR PromptPay', reference: 'optional', note: 'ยังไม่สร้าง QR จากระบบ — ใช้ QR ของธนาคารและบันทึกเลขอ้างอิง' },
  { value: 'โอนเงิน', label: 'โอนเงิน', reference: 'required' },
  { value: 'ประกัน', label: 'ประกัน', reference: 'optional', note: 'บันทึกยอดที่ประกันจ่ายเท่านั้น ไม่สรุปผลเคลม' },
  { value: 'Wallet', label: 'Wallet', reference: 'optional' },
  { value: 'บัตรกำนัล', label: 'บัตรกำนัล', reference: 'required' },
  { value: 'อื่น ๆ', label: 'อื่น ๆ', reference: 'optional' },
];
export const methodOf = (value: string) => PAYMENT_METHODS.find(m => m.value === value) ?? PAYMENT_METHODS[PAYMENT_METHODS.length - 1];

/** A refund above this needs the finance manager's approval (M11: above a configured threshold) */
export const REFUND_THRESHOLD = 500;
/** A discount above this share of the bill needs approval */
export const DISCOUNT_THRESHOLD = 0.1;

/* ---- One invoice ---- */

/** The state the bill is in: as kept, or as its amounts say for one the clinic issued before the back office kept states */
export const statusOf = (i: Invoice): InvoiceStatus => i.status ?? (i.paid >= i.total ? 'paid' : i.paid > 0 ? 'partial' : 'issued');

/** The lines as the back office shows them: the detailed ones when kept, else one per item */
export const linesOf = (i: Invoice): InvoiceLine[] => i.lines ?? i.items.map(([name, amount]) => ({ source: '—', name, qty: 1, unitPrice: amount, discount: 0, taxRate: 0 }));
export const lineTotal = (l: InvoiceLine) => Math.round((l.qty * l.unitPrice - l.discount) * (1 + l.taxRate / 100) * 100) / 100;

/** What the summary rail shows: the lines added up, discounts and tax, and the total the record keeps */
export function summaryOf(i: Invoice) {
  const lines = linesOf(i);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const lineDiscounts = lines.reduce((s, l) => s + l.discount, 0);
  const invoiceDiscounts = (i.discounts ?? []).filter(d => d.status === 'applied').reduce((s, d) => s + d.amount, 0);
  const tax = lines.reduce((s, l) => s + (l.qty * l.unitPrice - l.discount) * (l.taxRate / 100), 0);
  return { subtotal, discounts: lineDiscounts + invoiceDiscounts, tax: Math.round(tax * 100) / 100, total: i.total, paid: i.paid, refunded: refundedOf(i), balance: balanceOf(i) };
}

export const refundedOf = (i: Invoice) => (i.refunds ?? []).filter(r => r.status === 'done').reduce((s, r) => s + r.amount, 0);
/** How much of one payment can still be given back */
export function refundable(i: Invoice, paymentIndex: number): number {
  const payment = i.payments?.[paymentIndex];
  if (!payment || payment[5] === 'reversed') {
    return 0;
  }
  return payment[1] - (i.refunds ?? []).filter(r => r.paymentIndex === paymentIndex && r.status !== 'rejected').reduce((s, r) => s + r.amount, 0);
}

/** A bill that still waits to be collected: issued or part paid */
export const outstanding = (i: Invoice) => collectible(i) && statusOf(i) !== 'draft' && balanceOf(i) > 0;

/* ---- New bills ---- */

/** What a line can be made from: the visit's consultation, the catalog, the formulary and the shop */
export interface ChargeItem { source: string; name: string; unitPrice: number; taxRate: number }
export const CHARGE_ITEMS: ChargeItem[] = [
  { source: 'ADT', name: CONSULTATION[0], unitPrice: CONSULTATION[2], taxRate: 0 },
  ...ORDER_CATALOG.map(c => ({ source: 'CPOE', name: c.name, unitPrice: priceOf(c.price), taxRate: 0 })),
  ...FORMULARY.map(d => ({ source: 'MMU', name: d.name, unitPrice: d.price, taxRate: 0 })),
  { source: 'Retail', name: 'Renal diet dry food 2 kg', unitPrice: 890, taxRate: 7 },
  { source: 'Retail', name: 'Joint supplement 30 caps', unitPrice: 320, taxRate: 7 },
  { source: 'Retail', name: 'Flea and tick collar', unitPrice: 650, taxRate: 7 },
  { source: 'Grooming', name: 'Grooming · full package', unitPrice: 1200, taxRate: 0 },
  { source: 'Boarding', name: 'Boarding · 1 night', unitPrice: 500, taxRate: 0 },
];

/** A draft bill for an owner: no number until it is issued */
export function newInvoice(data: ClinicData, ownerKey: string, pet: string, title: string, lines: InvoiceLine[]): Invoice {
  const total = Math.round(lines.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;
  return {
    id: nextSeq(data.invoices.map(i => i.id), 'I'), no: '', ownerKey, pet, date: TODAY, title, items: lines.map(l => [l.name, lineTotal(l)]),
    total, paid: 0, status: 'draft', lines, payments: [], refunds: [], discounts: [],
  };
}

/** Issued: it gets its number, and fifteen days to be paid */
export function issue(data: ClinicData, i: Invoice) {
  const month = TODAY.slice(2, 4) + TODAY.slice(5, 7);
  i.no = nextSeq(data.invoices.map(x => x.no).filter(Boolean), `INV-${month}-0`);
  i.status = 'issued';
  i.issuedAt = `${TODAY} ${NOW}`;
  i.dueAt = addDays(TODAY, 15);
}

/** The state after a payment or a refund, from the amounts (finance/03 and /04 state transitions) */
export function settle(i: Invoice) {
  if (i.status === 'cancelled' || i.status === 'draft') {
    return;
  }
  const paid = i.paid - refundedOf(i);
  const anyPayment = (i.payments ?? []).length > 0;
  i.status = paid >= i.total ? 'paid' : paid > 0 ? 'partial' : anyPayment && refundedOf(i) > 0 ? 'refunded' : 'issued';
}

/* ---- Lists ---- */

export interface InvoiceFilter { q?: string; status?: InvoiceStatus | ''; from?: string; to?: string; outstandingOnly?: boolean }
export function invoiceList(data: ClinicData, f: InvoiceFilter): Invoice[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return data.invoices.filter(i => (!f.status || statusOf(i) === f.status) && (!f.outstandingOnly || outstanding(i))
    && (!f.from || i.date >= f.from) && (!f.to || i.date <= f.to)
    && (!q || `${i.no} ${i.id} ${i.ownerKey} ${i.pet} ${i.title} ${i.encounter ?? ''}`.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/** One row of the payment ledger: a payment, or a refund against one, across every bill */
export interface LedgerRow {
  kind: 'payment' | 'refund'; id: string; at: string; invoice: Invoice; method: string; amount: number; reference: string;
  status: string; by: string; paymentIndex: number;
}
export function ledger(data: ClinicData): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const i of data.invoices) {
    (i.payments ?? []).forEach((p, index) => rows.push({ kind: 'payment', id: `${i.id}-P${index + 1}`, at: p[0], invoice: i, method: p[2], amount: p[1], reference: p[4] ?? '', status: p[5] ?? 'completed', by: p[3], paymentIndex: index }));
    for (const r of i.refunds ?? []) {
      if (r.status === 'done') {
        rows.push({ kind: 'refund', id: r.id, at: r.decidedAt ?? r.at, invoice: i, method: i.payments?.[r.paymentIndex]?.[2] ?? '—', amount: -r.amount, reference: r.id, status: 'done', by: r.decidedBy ?? r.by, paymentIndex: r.paymentIndex });
      }
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** Every refund and discount, newest first, with the bill it is on */
export function adjustments(data: ClinicData): { kind: 'refund' | 'discount'; id: string; at: string; invoice: Invoice; amount: number; reason: string; by: string; status: string; approvalId?: string }[] {
  const rows = [];
  for (const i of data.invoices) {
    for (const r of i.refunds ?? []) {
      rows.push({ kind: 'refund' as const, id: r.id, at: r.at, invoice: i, amount: r.amount, reason: r.reason, by: r.by, status: r.status, approvalId: r.approvalId });
    }
    for (const d of i.discounts ?? []) {
      rows.push({ kind: 'discount' as const, id: d.id, at: d.at, invoice: i, amount: d.amount, reason: d.reason, by: d.by, status: d.status, approvalId: d.approvalId });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/* ---- Receivables ---- */

export type AgingKey = 'current' | 'd30' | 'd60' | 'd90' | 'over' | 'none';
export const AGING: { key: AgingKey; label: string; cls: string }[] = [
  { key: 'current', label: 'ยังไม่ถึงกำหนด', cls: 'ok' },
  { key: 'd30', label: 'เกิน 1–30 วัน', cls: 'info' },
  { key: 'd60', label: 'เกิน 31–60 วัน', cls: 'warn' },
  { key: 'd90', label: 'เกิน 61–90 วัน', cls: 'warn' },
  { key: 'over', label: 'เกิน 90 วัน', cls: 'danger' },
  { key: 'none', label: 'ไม่มีวันครบกำหนด', cls: 'quiet' },
];
/** Days past the due date; the bucket a bill without a due date falls in is its own, as the spec asks */
export function overdueDays(i: Invoice, today = TODAY): number | null {
  return i.dueAt ? Math.max(0, -daysUntil(i.dueAt, today)) : null;
}
export function agingOf(i: Invoice, today = TODAY): AgingKey {
  const d = overdueDays(i, today);
  return d === null ? 'none' : d === 0 ? 'current' : d <= 30 ? 'd30' : d <= 60 ? 'd60' : d <= 90 ? 'd90' : 'over';
}
export function receivables(data: ClinicData, today = TODAY) {
  const rows = data.invoices.filter(outstanding).map(i => ({ invoice: i, balance: balanceOf(i), overdue: overdueDays(i, today), bucket: agingOf(i, today) }))
    .sort((a, b) => (b.overdue ?? -1) - (a.overdue ?? -1));
  const buckets = AGING.map(b => ({ ...b, count: 0, amount: 0 }));
  for (const r of rows) {
    const b = buckets.find(x => x.key === r.bucket)!;
    b.count++;
    b.amount += r.balance;
  }
  return { rows, buckets, total: rows.reduce((s, r) => s + r.balance, 0) };
}

/* ---- The overview ---- */

/** The figures of the day, each with where it comes from and up to when (finance/06 metric readiness) */
export function financeOverview(data: ClinicData, bo: BackofficeData, today = TODAY) {
  const ar = receivables(data, today);
  const rows = ledger(data);
  const collected = rows.filter(r => r.kind === 'payment' && r.at.startsWith(today));
  const refunded = rows.filter(r => r.kind === 'refund' && r.at.startsWith(today));
  const exports = bo.accountingExports;
  return {
    outstanding: { amount: ar.total, count: ar.rows.length, overdue: ar.rows.filter(r => (r.overdue ?? 0) > 0).length },
    collected: { amount: collected.reduce((s, r) => s + r.amount, 0), count: collected.length },
    refunded: { amount: -refunded.reduce((s, r) => s + r.amount, 0), count: refunded.length },
    pendingRefunds: data.invoices.flatMap(i => i.refunds ?? []).filter(r => r.status === 'requested').length,
    exports: { total: exports.length, delivered: exports.filter(x => x.status === 'delivered').length, failed: exports.filter(x => x.status === 'failed').length, queued: exports.filter(x => x.status === 'queued').length },
    drafts: data.invoices.filter(i => statusOf(i) === 'draft').length,
  };
}

/* ---- Accounting delivery ---- */

export const EXPORT_STATUS: Record<AccountingExport['status'], { label: string; cls: string }> = {
  queued: { label: 'รอส่ง', cls: 'info' },
  delivered: { label: 'ส่งแล้ว', cls: 'ok' },
  failed: { label: 'ส่งไม่สำเร็จ', cls: 'danger' },
};
export const DOC_TYPE: Record<AccountingExport['docType'], string> = { invoice: 'ใบแจ้งหนี้', receipt: 'ใบเสร็จ', 'credit-note': 'ใบลดหนี้' };

/** The delivery records of one bill, newest first */
export const exportsOf = (bo: BackofficeData, invoiceId: string) => bo.accountingExports.filter(x => x.invoiceId === invoiceId).sort((a, b) => b.lastAt.localeCompare(a.lastAt));

/** A record queued for the adapter when a bill is issued or paid; delivered on the next run, as the sample's adapter does */
export function queueExport(bo: BackofficeData, i: Invoice, docType: AccountingExport['docType'], amount: number, at = `${TODAY} ${NOW}`): AccountingExport {
  const record: AccountingExport = {
    id: nextSeq(bo.accountingExports.map(x => x.id), 'XP-'), invoiceId: i.id, document: i.no || i.id, docType, amount, businessDate: at.slice(0, 10), adapter: 'PEAK',
    status: 'queued', attempts: 0, firstAt: at, lastAt: at, retryable: true, idempotencyKey: `${i.id}:${docType}:${bo.accountingExports.filter(x => x.invoiceId === i.id && x.docType === docType).length + 1}`,
  };
  bo.accountingExports.push(record);
  return record;
}

/** Another try: the sample's adapter answers at once */
export function retryExport(x: AccountingExport, at = `${TODAY} ${NOW}`) {
  x.attempts++;
  x.lastAt = at;
  x.status = 'delivered';
  x.deliveredAt = at;
  x.externalRef = `PEAK-${x.document.replace(/[^0-9]/g, '').slice(-6)}-${x.attempts}`;
  x.errorCode = undefined;
  x.errorText = undefined;
}

/* ---- The day's reconciliation (finance/05) ---- */

export interface Variance { kind: string; reference: string; invoice?: Invoice; source: number | string; compared: number | string; difference: number | string; reason: string; owner: string; link?: string }

/** The day's bills, payments, refunds and deliveries side by side, and where they do not agree */
export function reconcile(data: ClinicData, bo: BackofficeData, date: string) {
  const issued = data.invoices.filter(i => i.issuedAt?.startsWith(date));
  const rows = ledger(data).filter(r => r.at.startsWith(date));
  const payments = rows.filter(r => r.kind === 'payment' && r.status === 'completed');
  const refunds = rows.filter(r => r.kind === 'refund');
  const exports = bo.accountingExports.filter(x => x.businessDate === date);
  const variances: Variance[] = [];
  for (const x of bo.exceptions.filter(e => e.kind === 'payment-failure' && e.at.startsWith(date))) {
    variances.push(varianceOfException(x, data));
  }
  for (const x of exports.filter(e => e.status !== 'delivered')) {
    variances.push({ kind: 'การส่งบัญชีไม่ครบ', reference: x.id, invoice: data.invoices.find(i => i.id === x.invoiceId), source: x.amount, compared: EXPORT_STATUS[x.status].label, difference: x.amount, reason: x.errorText ?? 'รอส่ง', owner: 'Integration', link: '/backoffice/finance/exports' });
  }
  for (const i of issued.filter(x => !bo.accountingExports.some(e => e.invoiceId === x.id && e.docType === 'invoice'))) {
    variances.push({ kind: 'ใบแจ้งหนี้ไม่มีรายการส่งบัญชี', reference: i.no, invoice: i, source: i.total, compared: '—', difference: i.total, reason: 'ไม่ได้เข้าคิวส่ง', owner: 'การเงิน', link: `/backoffice/finance/invoices/${i.id}` });
  }
  for (const i of data.invoices) {
    for (const r of (i.refunds ?? []).filter(x => x.status === 'requested' && x.at.startsWith(date))) {
      variances.push({ kind: 'คืนเงินรออนุมัติ', reference: r.id, invoice: i, source: r.amount, compared: 'รออนุมัติ', difference: r.amount, reason: r.reason, owner: 'ผู้จัดการการเงิน', link: '/backoffice/home/approvals' });
    }
  }
  for (const i of data.invoices.filter(x => statusOf(x) === 'draft' && x.date < date)) {
    variances.push({ kind: 'ฉบับร่างค้าง', reference: i.id, invoice: i, source: i.total, compared: 'ฉบับร่าง', difference: i.total, reason: 'ยังไม่ออกใบแจ้งหนี้', owner: 'แคชเชียร์', link: `/backoffice/finance/invoices/${i.id}` });
  }
  const collected = payments.reduce((s, r) => s + r.amount, 0);
  const returned = -refunds.reduce((s, r) => s + r.amount, 0);
  return {
    date,
    totals: {
      issued: { count: issued.length, amount: issued.reduce((s, i) => s + i.total, 0) },
      collected: { count: payments.length, amount: collected },
      refunded: { count: refunds.length, amount: returned },
      net: collected - returned,
      exports: { total: exports.length, delivered: exports.filter(x => x.status === 'delivered').length },
    },
    variances,
    result: bo.reconciliations.find(r => r.date === date),
  };
}

function varianceOfException(x: BoException, data: ClinicData): Variance {
  const invoice = data.invoices.find(i => x.detail.includes(i.no));
  const amount = Number((/฿([\d,]+)/.exec(x.title)?.[1] ?? '0').replace(/,/g, ''));
  return { kind: 'รับชำระไม่สำเร็จ', reference: x.ref, invoice, source: amount, compared: x.acknowledgedAt ? 'รับทราบแล้ว' : 'ยังไม่ยืนยัน', difference: amount, reason: x.detail, owner: x.source, link: '/backoffice/home/alerts' };
}
