import { computed, inject, Injectable, signal } from '@angular/core';

import { ClinicStore } from '../clinic/clinic.store';
import { NOW, TODAY } from '../clinic/data/model';
import { fullName, Session } from '../user-management';
import { DISCOUNT_THRESHOLD, issue, newInvoice, queueExport, REFUND_THRESHOLD, retryExport, settle, statusOf } from './data/finance';
import { approvalAging, severityCounts, worklist } from './data/home';
import {
  INVESTIGATION, ledgerDispense, type LedgerDispenseInput, openRecall, quarantine, RECALL_STATUS, receive, type ReceiptInput, recordCount, recordWaste, resolveInvestigation, stockItems, updateRecall,
  type WasteInput, wasteReason,
} from './data/inventory';
import { createBackofficeSeed } from './data/seed';
import type { Invoice, InvoiceLine, Refund } from '../clinic/data/types';
import type { AccountingExport, ActivityEntry, Approval, BackofficeData, BoException, CountRecord, LedgerDispense, Module, Recall, RecallStatus, StockReceipt, WasteRecord } from './data/types';

/** Who works in the back office when nobody is signed in, as in tests: the finance manager the sample is drawn for */
const SAMPLE_USER = 'วรรณา (ผู้จัดการการเงิน)';
/** The next reference after the ones taken: RF-2609-004 */
const nextRef = (taken: string[], prefix: string) => `${prefix}${String(Math.max(0, ...taken.filter(x => x.startsWith(prefix)).map(x => Number(x.slice(prefix.length)) || 0)) + 1).padStart(3, '0')}`;
const baht = (n: number) => `฿${n.toLocaleString('en-US')}`;

/**
 * The back office's sample data and what its pages do with it. The clinic's records (bills, stock) are read from the
 * clinic's own store, so what is done there shows here at once; the back office's own records (approvals, exceptions,
 * its audit) change in place, as the clinic's do, and `data` tells everyone on every change.
 */
@Injectable({ providedIn: 'root' })
export class BackofficeStore {
  private readonly session = inject(Session);
  readonly clinic = inject(ClinicStore);
  readonly userName = computed(() => {
    const me = this.session.user();
    return me ? fullName(me) : SAMPLE_USER;
  });
  readonly data = signal<BackofficeData>(createBackofficeSeed(), { equal: () => false });

  /** Everything that waits, across the modules */
  readonly worklist = computed(() => worklist(this.data(), this.clinic.data()));
  readonly pendingApprovals = computed(() => this.data().approvals.filter(a => a.status === 'pending'));
  readonly openExceptions = computed(() => this.data().exceptions.filter(x => !x.acknowledgedAt));
  /** Counts for the menu and the bell */
  readonly counts = computed(() => ({
    overview: this.worklist().length,
    approvals: approvalAging(this.data().approvals).pending,
    alerts: this.openExceptions().length,
    critical: severityCounts(this.data().exceptions).critical,
  }));

  mutate(change: (data: BackofficeData) => void) {
    change(this.data());
    this.data.set(this.data());
  }

  reset() {
    this.data.set(createBackofficeSeed());
  }

  /** A decision on a request, with why; it goes into the back office's audit, and a refund or discount it was about takes effect */
  decide(a: Approval, status: 'approved' | 'rejected', decision: string) {
    this.mutate(d => {
      a.status = status;
      a.decidedBy = this.userName();
      a.decidedAt = `${TODAY} ${NOW}`;
      a.decision = decision;
      this.log(d, a.module, status === 'approved' ? 'อนุมัติคำขอ' : 'ปฏิเสธคำขอ', a.ref, a.title, decision, 'รออนุมัติ', status === 'approved' ? 'อนุมัติแล้ว' : 'ปฏิเสธ');
      if (a.kind === 'refund' || a.kind === 'discount') {
        this.clinic.mutate(c => {
          for (const i of c.invoices) {
            const refund = i.refunds?.find(r => r.approvalId === a.id);
            if (refund) {
              refund.decidedBy = this.userName();
              refund.decidedAt = `${TODAY} ${NOW}`;
              refund.status = status === 'approved' ? 'done' : 'rejected';
              if (status === 'approved') {
                this.applyRefund(d, i, refund.paymentIndex, refund.amount);
              }
            }
            const discount = i.discounts?.find(x => x.approvalId === a.id);
            if (discount) {
              discount.status = status === 'approved' ? 'applied' : 'rejected';
              if (status === 'approved') {
                this.applyDiscount(i, discount.amount);
              }
            }
          }
        });
      }
    });
  }

  /* Finance (data/finance.ts) */

  /** A draft bill for an owner, to be issued once its lines are right */
  createInvoice(ownerKey: string, pet: string, title: string, lines: InvoiceLine[]): Invoice {
    let invoice!: Invoice;
    this.clinic.mutate(c => {
      invoice = newInvoice(c, ownerKey, pet, title, lines);
      c.invoices.push(invoice);
    });
    this.mutate(d => this.log(d, 'M11', 'สร้างใบแจ้งหนี้ (ฉบับร่าง)', invoice.id, `${ownerKey} · ${pet}`, title));
    return invoice;
  }

  /** Issued: numbered, due in fifteen days, and queued for the accounting system */
  issueInvoice(i: Invoice) {
    this.clinic.mutate(c => issue(c, i));
    this.mutate(d => {
      queueExport(d, i, 'invoice', i.total);
      this.log(d, 'M11', 'ออกใบแจ้งหนี้', i.no, i.ownerKey, baht(i.total), 'ฉบับร่าง', 'ออกแล้ว');
    });
  }

  /** Cancelled, with why; nothing was paid on it */
  cancelInvoice(i: Invoice, reason: string) {
    const before = statusOf(i);
    this.clinic.mutate(() => {
      i.status = 'cancelled';
      i.cancelledAt = `${TODAY} ${NOW}`;
      i.cancelReason = reason;
    });
    this.mutate(d => {
      if (i.no) {
        queueExport(d, i, 'credit-note', i.total);
      }
      this.log(d, 'M11', 'ยกเลิกใบแจ้งหนี้', i.no || i.id, i.ownerKey, reason, before === 'draft' ? 'ฉบับร่าง' : 'ออกแล้ว', 'ยกเลิก');
    });
  }

  /** A payment on a bill, with its reference; the receipt goes to the accounting system */
  collect(i: Invoice, amount: number, method: string, reference: string) {
    const before = statusOf(i);
    this.clinic.pay(i, amount, method);
    this.clinic.mutate(() => {
      const last = i.payments![i.payments!.length - 1];
      last[4] = reference;
      last[5] = 'completed';
      settle(i);
    });
    this.mutate(d => {
      queueExport(d, i, 'receipt', amount);
      this.log(d, 'M11', 'รับชำระ', i.no, i.ownerKey, `${baht(amount)} · ${method}${reference ? ` · ${reference}` : ''}`, before, statusOf(i));
    });
  }

  /** Money back against one payment: at once below the threshold, else as a request the finance manager decides */
  requestRefund(i: Invoice, paymentIndex: number, amount: number, reason: string): { refund: Refund; approval?: Approval } {
    const needsApproval = amount > REFUND_THRESHOLD;
    const id = nextRef(this.clinic.data().invoices.flatMap(x => x.refunds ?? []).map(r => r.id), 'RF-2609-');
    const refund: Refund = { id, paymentIndex, amount, reason, by: this.userName(), at: `${TODAY} ${NOW}`, status: needsApproval ? 'requested' : 'done' };
    let approval: Approval | undefined;
    this.clinic.mutate(() => { (i.refunds ??= []).push(refund); });
    this.mutate(d => {
      if (needsApproval) {
        const payment = i.payments![paymentIndex];
        approval = {
          id: 'AP' + (d.approvals.length + 1), module: 'M11', kind: 'refund', title: `คืนเงิน ${baht(amount)} · ${i.title}`, detail: `${i.pet} · ใบแจ้งหนี้ ${i.no} · ${i.ownerKey}`,
          amount, requestedBy: this.userName(), requestedAt: `${TODAY} ${NOW}`, reason,
          evidence: [['ใบแจ้งหนี้', `${i.no} · ${baht(i.total)}`], ['การชำระเดิม', `${payment[0]} · ${payment[2]} · ${baht(payment[1])}`], ['เกณฑ์', `คืนเงินเกิน ${baht(REFUND_THRESHOLD)} ต้องให้ผู้จัดการการเงินอนุมัติ`]],
          approver: 'ผู้จัดการการเงิน', status: 'pending', ref: id,
        };
        refund.approvalId = approval.id;
        d.approvals.unshift(approval);
        this.log(d, 'M11', 'ขอคืนเงิน', id, i.no, `${baht(amount)} · ${reason}`);
      } else {
        refund.decidedBy = this.userName();
        refund.decidedAt = `${TODAY} ${NOW}`;
        this.clinic.mutate(() => this.applyRefund(d, i, paymentIndex, amount));
        this.log(d, 'M11', 'คืนเงิน', id, i.no, `${baht(amount)} · ${reason}`);
      }
    });
    return { refund, approval };
  }

  /** The refund done: the payment gives it up, the bill's state follows, and a credit note goes to the accounting system */
  private applyRefund(d: BackofficeData, i: Invoice, paymentIndex: number, amount: number) {
    i.paid = Math.max(0, i.paid - amount);
    const payment = i.payments?.[paymentIndex];
    if (payment && (i.refunds ?? []).filter(r => r.paymentIndex === paymentIndex && r.status === 'done').reduce((s, r) => s + r.amount, 0) >= payment[1]) {
      payment[5] = 'reversed';
    }
    settle(i);
    queueExport(d, i, 'credit-note', amount);
  }

  /** A discount on a bill not yet paid: at once when small, else as a request */
  requestDiscount(i: Invoice, amount: number, reason: string): Approval | undefined {
    const needsApproval = amount > i.total * DISCOUNT_THRESHOLD;
    const id = nextRef(this.clinic.data().invoices.flatMap(x => x.discounts ?? []).map(dsc => dsc.id), 'DC-2609-');
    const discount = { id, amount, reason, by: this.userName(), at: `${TODAY} ${NOW}`, status: needsApproval ? 'requested' as const : 'applied' as const, approvalId: undefined as string | undefined };
    let approval: Approval | undefined;
    this.clinic.mutate(() => {
      (i.discounts ??= []).push(discount);
      if (!needsApproval) {
        this.applyDiscount(i, amount);
      }
    });
    this.mutate(d => {
      if (needsApproval) {
        approval = {
          id: 'AP' + (d.approvals.length + 1), module: 'M11', kind: 'discount', title: `ส่วนลด ${baht(amount)} · ${i.title}`, detail: `${i.pet} · ใบแจ้งหนี้ ${i.no || i.id} · ${i.ownerKey}`,
          amount, requestedBy: this.userName(), requestedAt: `${TODAY} ${NOW}`, reason,
          evidence: [['ใบแจ้งหนี้', `${i.no || i.id} · ${baht(i.total)}`], ['เกณฑ์', 'ส่วนลดเกิน 10% ต้องให้ผู้จัดการอนุมัติ']],
          approver: 'ผู้จัดการการเงิน', status: 'pending', ref: id,
        };
        discount.approvalId = approval.id;
        d.approvals.unshift(approval);
      }
      this.log(d, 'M11', needsApproval ? 'ขอส่วนลด' : 'ให้ส่วนลด', id, i.no || i.id, `${baht(amount)} · ${reason}`);
    });
    return approval;
  }

  private applyDiscount(i: Invoice, amount: number) {
    i.total = Math.max(0, i.total - amount);
    settle(i);
  }

  /** Another try at the accounting system */
  retryExport(x: AccountingExport) {
    this.mutate(d => {
      retryExport(x);
      this.log(d, 'M11', 'ส่งข้อมูลบัญชีใหม่', x.id, x.document, x.externalRef, 'ส่งไม่สำเร็จ', 'ส่งแล้ว');
    });
  }

  /** The day signed off, with what was found */
  saveReconciliation(date: string, variances: number, note: string) {
    this.mutate(d => {
      d.reconciliations = [...d.reconciliations.filter(r => r.date !== date), { date, by: this.userName(), at: `${TODAY} ${NOW}`, variances, note }];
      this.log(d, 'M11', 'บันทึกผลกระทบยอดประจำวัน', date, `${variances} รายการต่าง`, note);
    });
  }

  /* Medication inventory (data/inventory.ts) */

  /** The stock of every drug as the clinic's batches have it now */
  readonly stock = computed(() => stockItems(this.clinic.data(), this.data()));

  /** A lot received: the clinic's shelf has it at once */
  receive(input: ReceiptInput): StockReceipt {
    let receipt!: StockReceipt;
    this.clinic.mutate(c => this.mutate(d => {
      receipt = receive(c, d, input, this.userName());
      this.log(d, 'M06', 'รับยาเข้าคลัง', receipt.id, receipt.drug, `lot ${receipt.lot} · ${receipt.qty} ${receipt.unit} · ${receipt.location}`);
    }));
    return receipt;
  }

  /** A controlled drug drawn for a patient, with its witness */
  ledgerDispense(input: LedgerDispenseInput): LedgerDispense {
    let record!: LedgerDispense;
    this.clinic.mutate(c => this.mutate(d => {
      record = ledgerDispense(c, d, input, this.userName());
      this.log(d, 'M06', 'เบิกยาควบคุม', record.id, record.drug, `${record.qty} ${record.unit} · ${record.patient}${record.witness ? ` — พยาน ${record.witness}` : ''}`);
    }));
    return record;
  }

  recordWaste(input: WasteInput): WasteRecord {
    let record!: WasteRecord;
    this.clinic.mutate(c => this.mutate(d => {
      record = recordWaste(c, d, input, this.userName());
      this.log(d, 'M06', 'บันทึกยาเสีย', record.id, record.drug, `${record.qty} ${record.unit} · ${wasteReason(record.reason).label} — พยาน ${record.witness}`);
    }));
    return record;
  }

  /** What was counted; the difference, if any, opens an investigation */
  recordCount(drug: string, actual: number): CountRecord {
    let record!: CountRecord;
    this.clinic.mutate(c => this.mutate(d => {
      record = recordCount(c, d, drug, actual, this.userName());
      this.log(d, 'M06', 'นับยาควบคุม', record.id, record.drug, `นับได้ ${record.actual} ${record.unit} · คาด ${record.expected} · ส่วนต่าง ${record.discrepancy}`, undefined, record.investigation === 'open' ? 'เปิดการสอบสวน' : undefined);
    }));
    return record;
  }

  resolveInvestigation(c: CountRecord, status: 'resolved' | 'escalated', notes: string) {
    this.mutate(d => {
      resolveInvestigation(c, status, notes, this.userName());
      this.log(d, 'M06', status === 'resolved' ? 'สรุปผลสอบสวน' : 'ส่งต่อการสอบสวน', c.id, c.drug, notes, 'สอบสวนอยู่', INVESTIGATION[status].label);
    });
  }

  openRecall(drug: string, lot: string, reason: string, severity: Recall['severity']): Recall {
    let recall!: Recall;
    this.mutate(d => {
      recall = openRecall(d, drug, lot, reason, severity, this.userName());
      this.log(d, 'M06', 'เปิดการเรียกคืนยา', recall.id, `${drug} · lot ${lot}`, reason);
    });
    return recall;
  }

  updateRecall(recall: Recall, status: RecallStatus, note: string) {
    const before = recall.status;
    this.mutate(d => {
      updateRecall(recall, status, note, this.userName());
      this.log(d, 'M06', 'อัปเดตการเรียกคืนยา', recall.id, `${recall.drug} · lot ${recall.lot}`, note, RECALL_STATUS[before].label, RECALL_STATUS[status].label);
    });
  }

  /** The lot held on every shelf; the clinic will not dispense from it */
  quarantine(lot: string, reason: string) {
    this.clinic.mutate(c => quarantine(c, lot, reason));
    this.mutate(d => this.log(d, 'M06', 'กันของคงคลัง', lot, reason));
  }

  /** Seen, and what was done about it or where it went; the exception is settled in its own workflow */
  acknowledge(x: BoException, note: string) {
    this.mutate(d => {
      x.acknowledgedBy = this.userName();
      x.acknowledgedAt = `${TODAY} ${NOW}`;
      x.note = note || undefined;
      this.log(d, x.module, 'รับทราบข้อยกเว้น', x.ref, x.title, note);
    });
  }

  private log(d: BackofficeData, module: Module, action: string, target: string, ref: string, detail?: string, before?: string, after?: string) {
    const entry: ActivityEntry = {
      id: 'A' + (d.activity.length + 1), at: `${TODAY} ${NOW}`, by: this.userName(), module, action, target, ref, detail: detail || undefined, before, after,
    };
    d.activity.unshift(entry);
  }
}
