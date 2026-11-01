import { computed, inject, Injectable, signal } from '@angular/core';

import { ClinicStore } from '../clinic/clinic.store';
import { NOW, TODAY } from '../clinic/data/model';
import { fullName, Session } from '../user-management';
import { DISCOUNT_THRESHOLD, issue, newInvoice, outstanding, queueExport, REFUND_THRESHOLD, retryExport, settle, statusOf } from './data/finance';
import {
  addCalibration, addContract, addEquipment, CALIBRATION_RESULT, type CalibrationInput, closeDowntime, completeDecommission, completePm, type ContractInput, decideDecommission,
  DECOMMISSION_METHOD, type DecommissionInput, type DowntimeInput, type EquipmentInput, equipmentOf, moveEquipment, movePm, openDowntime, type PmInput, renewContract, requestDecommission,
  retireContract,
} from './data/assets';
import { approvalAging, severityCounts, worklist } from './data/home';
import {
  INVESTIGATION, ledgerDispense, type LedgerDispenseInput, openRecall, quarantine, RECALL_STATUS, receive, type ReceiptInput, recordCount, recordWaste, resolveInvestigation, stockItems, updateRecall,
  type WasteInput, wasteReason,
} from './data/inventory';
import { CLAIM_STATUS, type ClaimInput, decideClaim, markDocuments, MESSAGE_KIND, newClaim, type OutboxItem, reimburse, sendMessage, submitClaim } from './data/sales';
import { createBackofficeSeed } from './data/seed';
import {
  addCe, addLicense, addStaff, assignShift, attachCertificate, changePrivilege, type CeInput, decideLeave, generateOnCall, LEAVE_TYPE, LICENSE_KIND, type LeaveInput, type LicenseInput,
  PRIVILEGE, publishOnCall, publishWeek, removeShift, renewLicense, requestLeave, reviewCe, SHIFT, type ShiftInput, type StaffInput, staffOf, verifyLicense,
} from './data/workforce';
import { balanceOf } from '../clinic/data/rail';
import type { Invoice, InvoiceLine, Refund } from '../clinic/data/types';
import type {
  AccountingExport, ActivityEntry, Approval, BackofficeData, BoException, CalibrationRecord, CeRecord, Claim, CountRecord, Criticality, Decommission, Downtime, Equipment, LeaveRequest,
  LedgerDispense, License, Module, OnCallSlot, PmTask, Privilege, Recall, RecallStatus, ServiceContract, ServiceMessage, Shift, StaffMember, StockReceipt, WasteRecord,
} from './data/types';

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

  /* Sales and customer service (data/sales.ts) */

  /** A LINE message sent, when the owner's consent allows it */
  sendMessage(item: OutboxItem): ServiceMessage {
    let message!: ServiceMessage;
    this.mutate(d => {
      message = sendMessage(d, item, this.userName());
      this.log(d, 'M15', 'ส่งข้อความ LINE', message.id, `${item.ownerKey} · ${item.pet}`, `${MESSAGE_KIND[item.kind].label} · ${item.text}`);
    });
    return message;
  }

  createClaim(input: ClaimInput): Claim {
    let claim!: Claim;
    this.mutate(d => {
      claim = newClaim(this.clinic.data(), d, input, this.userName());
      this.log(d, 'M16', claim.kind === 'claim' ? 'สร้างเคลม' : 'สร้างคำขออนุมัติล่วงหน้า', claim.id, `${claim.insurer} · ${claim.pet}`, `${baht(claim.amount)} · ${claim.diagnosis}`);
    });
    return claim;
  }

  claimDocuments(c: Claim) {
    const before = c.status;
    this.mutate(d => {
      markDocuments(c, this.userName());
      this.log(d, 'M16', 'ออกเอกสารเคลม', c.id, c.insurer, undefined, CLAIM_STATUS[before].label, CLAIM_STATUS[c.status].label);
    });
  }

  submitClaim(c: Claim, via: string, ref: string) {
    this.mutate(d => {
      submitClaim(c, via, ref, this.userName());
      this.log(d, 'M16', 'บันทึกการส่งเคลม', c.id, c.insurer, `${via}${ref ? ` · ${ref}` : ''}`, CLAIM_STATUS['documents-ready'].label, CLAIM_STATUS.submitted.label);
    });
  }

  decideClaim(c: Claim, decision: 'approved' | 'partially-approved' | 'rejected', amount: number, note: string) {
    this.mutate(d => {
      decideClaim(d, c, decision, amount, note, this.userName());
      this.log(d, 'M16', 'บันทึกผลพิจารณาเคลม', c.id, c.insurer, note, CLAIM_STATUS.submitted.label, CLAIM_STATUS[decision].label);
    });
  }

  /** The insurer's money: to the hospital it is a payment on the bill (M11), to the owner it is only recorded */
  reimburse(c: Claim, amount: number, payee: 'hospital' | 'owner', ref: string) {
    const invoice = c.invoiceId ? this.clinic.data().invoices.find(i => i.id === c.invoiceId) : undefined;
    this.mutate(d => {
      reimburse(c, amount, payee, ref, this.userName());
      this.log(d, 'M16', 'บันทึกรับเงินชดเชย', c.id, c.insurer, `${baht(amount)} → ${payee === 'hospital' ? 'โรงพยาบาล' : 'เจ้าของ'}${ref ? ` · ${ref}` : ''}`, CLAIM_STATUS[c.log[c.log.length - 2][2]].label, CLAIM_STATUS.reimbursed.label);
    });
    if (payee === 'hospital' && invoice && outstanding(invoice)) {
      this.collect(invoice, Math.min(amount, balanceOf(invoice)), 'ประกัน', ref || c.id);
    }
  }

  /* Workforce (data/workforce.ts): M24's records; nothing here touches an IAM account or a payroll */

  private who(d: BackofficeData, staffId: string) {
    return staffOf(d, staffId)?.name ?? staffId;
  }

  addStaff(input: StaffInput): StaffMember {
    let member!: StaffMember;
    this.mutate(d => {
      member = addStaff(d, input);
      this.log(d, 'M24', 'เพิ่มบุคลากร', member.id, member.name, `${member.position} · ${member.department}`);
    });
    return member;
  }

  updateStaff(member: StaffMember, patch: Partial<Pick<StaffMember, 'department' | 'phone' | 'employment' | 'status'>>) {
    const before = [member.department, member.phone, member.employment, member.status].join(' · ');
    this.mutate(d => {
      Object.assign(member, patch);
      this.log(d, 'M24', 'แก้ไขข้อมูลบุคลากร', member.id, member.name, undefined, before, [member.department, member.phone, member.employment, member.status].join(' · '));
    });
  }

  addLicense(input: LicenseInput): License {
    let license!: License;
    this.mutate(d => {
      license = addLicense(d, input, this.userName());
      this.log(d, 'M24', 'บันทึกใบอนุญาต', license.number, this.who(d, license.staffId), `${LICENSE_KIND[license.kind].label} · หมดอายุ ${license.expiresAt}`, undefined, 'รอตรวจสอบ');
    });
    return license;
  }

  verifyLicense(l: License, method: string, note: string) {
    this.mutate(d => {
      verifyLicense(l, method, note, this.userName());
      this.log(d, 'M24', 'ตรวจสอบใบอนุญาต', l.number, this.who(d, l.staffId), [method, note].filter(Boolean).join(' · '), 'รอตรวจสอบ', 'ตรวจสอบแล้ว');
    });
  }

  renewLicense(l: License, expiresAt: string, number: string, evidence: string) {
    const before = l.expiresAt;
    this.mutate(d => {
      renewLicense(l, expiresAt, number, evidence, this.userName());
      this.log(d, 'M24', 'ต่ออายุใบอนุญาต', l.number, this.who(d, l.staffId), evidence, `หมดอายุ ${before}`, `หมดอายุ ${expiresAt} · รอตรวจสอบ`);
    });
  }

  addCe(input: CeInput): CeRecord {
    let record!: CeRecord;
    this.mutate(d => {
      record = addCe(d, input, this.userName());
      this.log(d, 'M24', 'บันทึก CE', record.id, this.who(d, record.staffId), `${record.course} · ${record.hours} ชม.`, undefined, record.status === 'approved' ? 'นับชั่วโมงแล้ว' : 'รอตรวจ');
    });
    return record;
  }

  reviewCe(c: CeRecord, decision: 'approved' | 'rejected', note: string) {
    this.mutate(d => {
      reviewCe(c, decision, note, this.userName());
      this.log(d, 'M24', decision === 'approved' ? 'นับชั่วโมง CE' : 'ไม่นับชั่วโมง CE', c.id, this.who(d, c.staffId), note, 'รอตรวจ', decision === 'approved' ? 'นับชั่วโมงแล้ว' : 'ไม่นับ');
    });
  }

  attachCertificate(c: CeRecord, file: string) {
    this.mutate(d => {
      attachCertificate(c, file);
      this.log(d, 'M24', 'แนบใบรับรอง CE', c.id, this.who(d, c.staffId), file);
    });
  }

  changePrivilege(staffId: string, p: Privilege, action: 'grant' | 'revoke', reason: string) {
    this.mutate(d => {
      const change = changePrivilege(d, staffId, p, action, reason, this.userName());
      this.log(d, 'M24', action === 'grant' ? 'ให้สิทธิ์วิชาชีพ' : 'ถอนสิทธิ์วิชาชีพ', change.id, `${this.who(d, staffId)} · ${PRIVILEGE[p].label}`, reason,
        action === 'grant' ? 'ไม่มีสิทธิ์' : 'มีสิทธิ์', action === 'grant' ? 'มีสิทธิ์' : 'ไม่มีสิทธิ์');
    });
  }

  /** A shift added as a draft: it counts for nothing until the week is published, and grants no role or privilege */
  assignShift(input: ShiftInput): Shift {
    let shift!: Shift;
    this.mutate(d => {
      shift = assignShift(d, input);
      this.log(d, 'M24', 'จัดเวร', shift.id, this.who(d, shift.staffId), `${shift.date} · เวร${SHIFT[shift.kind].label} · ${shift.area}`, undefined, 'ฉบับร่าง');
    });
    return shift;
  }

  removeShift(s: Shift, reason: string) {
    this.mutate(d => {
      removeShift(d, s);
      this.log(d, 'M24', 'ยกเลิกเวร', s.id, this.who(d, s.staffId), [`${s.date} · เวร${SHIFT[s.kind].label}`, reason].filter(Boolean).join(' · '), s.status === 'published' ? 'ประกาศแล้ว' : 'ฉบับร่าง', 'ยกเลิก');
    });
  }

  publishWeek(monday: string): number {
    let n = 0;
    this.mutate(d => {
      n = publishWeek(d, monday);
      this.log(d, 'M24', 'ประกาศตารางเวร', `สัปดาห์ ${monday}`, `${n} เวร`, undefined, 'ฉบับร่าง', 'ประกาศแล้ว');
    });
    return n;
  }

  requestLeave(input: LeaveInput): LeaveRequest {
    let leave!: LeaveRequest;
    this.mutate(d => {
      leave = requestLeave(d, input, this.userName());
      this.log(d, 'M24', 'ยื่นคำขอลา', leave.id, this.who(d, leave.staffId), `${LEAVE_TYPE[leave.type]} ${leave.from}–${leave.to}`, undefined, 'รออนุมัติ');
    });
    return leave;
  }

  decideLeave(l: LeaveRequest, status: 'approved' | 'rejected', note: string) {
    this.mutate(d => {
      decideLeave(l, status, note, this.userName());
      this.log(d, 'M24', status === 'approved' ? 'อนุมัติการลา' : 'ไม่อนุมัติการลา', l.id, this.who(d, l.staffId), note, 'รออนุมัติ', status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ');
    });
  }

  generateOnCall(from: string, to: string): OnCallSlot[] {
    let made: OnCallSlot[] = [];
    this.mutate(d => {
      made = generateOnCall(d, from, to);
      this.log(d, 'M24', 'สร้างตารางเวร on-call', `${from}–${to}`, `${made.length} คืน`, undefined, undefined, 'ฉบับร่าง');
    });
    return made;
  }

  setOnCall(slot: OnCallSlot, staffId: string, reason: string) {
    this.mutate(d => {
      const before = this.who(d, slot.staffId);
      slot.staffId = staffId;
      this.log(d, 'M24', 'ปรับเวร on-call', slot.date, `${before} → ${this.who(d, staffId)}`, reason || undefined);
    });
  }

  publishOnCall(from: string, to: string): number {
    let n = 0;
    this.mutate(d => {
      n = publishOnCall(d, from, to);
      this.log(d, 'M24', 'ประกาศตารางเวร on-call', `${from}–${to}`, `${n} คืน`, undefined, 'ฉบับร่าง', 'ประกาศแล้ว');
    });
    return n;
  }

  /* Assets and maintenance (data/assets.ts): each step goes into M22's audit */

  private eq(d: BackofficeData, id: string) {
    return equipmentOf(d, id)?.name ?? id;
  }

  addEquipment(input: EquipmentInput): Equipment {
    let e!: Equipment;
    this.mutate(d => {
      e = addEquipment(d, input, this.userName());
      this.log(d, 'M22', 'ขึ้นทะเบียนอุปกรณ์', e.id, e.name, `${e.serial} · ${e.location}${e.bed ? ` · ${e.bed}` : ''}`);
    });
    return e;
  }

  moveEquipment(e: Equipment, patch: { location: string; bed: string; criticality: Criticality }) {
    const before = [e.location, e.bed, e.criticality].filter(Boolean).join(' · ');
    this.mutate(d => {
      moveEquipment(e, patch, this.userName());
      this.log(d, 'M22', 'แก้ไขที่ตั้งอุปกรณ์', e.id, e.name, undefined, before, [e.location, e.bed, e.criticality].filter(Boolean).join(' · '));
    });
  }

  completePm(t: PmTask, input: PmInput): { next: PmTask; downtime?: Downtime } {
    let out!: { next: PmTask; downtime?: Downtime };
    this.mutate(d => {
      out = completePm(d, t, input, this.userName());
      this.log(d, 'M22', 'บันทึก PM', t.id, this.eq(d, t.equipmentId), [input.outcome === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน', input.findings.trim()].filter(Boolean).join(' · '), 'ค้าง', `เสร็จ · ครั้งถัดไป ${out.next.due}`);
      if (out.downtime) {
        this.log(d, 'M22', 'แจ้งขัดข้อง', out.downtime.id, this.eq(d, t.equipmentId), out.downtime.problem, 'พร้อมใช้งาน', 'ขัดข้อง');
      }
    });
    return out;
  }

  movePm(t: PmTask, due: string, reason: string) {
    const before = t.due;
    this.mutate(d => {
      movePm(d, t, due, reason, this.userName());
      this.log(d, 'M22', 'เลื่อน PM', t.id, this.eq(d, t.equipmentId), reason, before, due);
    });
  }

  addCalibration(input: CalibrationInput): { record: CalibrationRecord; downtime?: Downtime } {
    let out!: { record: CalibrationRecord; downtime?: Downtime };
    this.mutate(d => {
      out = addCalibration(d, input, this.userName());
      this.log(d, 'M22', 'บันทึกผลสอบเทียบ', out.record.id, this.eq(d, input.equipmentId), `${CALIBRATION_RESULT[out.record.result].label} · ${out.record.by}`, undefined, `ครั้งถัดไป ${out.record.nextDue}`);
      if (out.downtime) {
        this.log(d, 'M22', 'แจ้งขัดข้อง', out.downtime.id, this.eq(d, input.equipmentId), out.downtime.problem, 'พร้อมใช้งาน', 'ขัดข้อง');
      }
    });
    return out;
  }

  openDowntime(input: DowntimeInput): Downtime {
    let dt!: Downtime;
    this.mutate(d => {
      dt = openDowntime(d, input, this.userName());
      this.log(d, 'M22', dt.kind === 'failure' ? 'แจ้งขัดข้อง' : 'หยุดใช้ตามแผน', dt.id, this.eq(d, dt.equipmentId), dt.problem, 'พร้อมใช้งาน', 'ขัดข้อง');
    });
    return dt;
  }

  closeDowntime(dt: Downtime, fix: string, cost: string) {
    this.mutate(d => {
      closeDowntime(d, dt, fix, cost, this.userName());
      this.log(d, 'M22', 'ปิดรายการขัดข้อง', dt.id, this.eq(d, dt.equipmentId), dt.fix, 'ขัดข้อง', 'พร้อมใช้งาน');
    });
  }

  addContract(input: ContractInput): ServiceContract {
    let c!: ServiceContract;
    this.mutate(d => {
      c = addContract(d, input, this.userName());
      this.log(d, 'M22', 'บันทึกสัญญาบริการ', c.id, c.vendor, `${c.from} → ${c.to} · ${c.equipmentIds.length} รายการ`);
    });
    return c;
  }

  renewContract(c: ServiceContract, to: string, fee: string) {
    const before = c.to;
    this.mutate(d => {
      renewContract(c, to, fee, this.userName());
      this.log(d, 'M22', 'ต่อสัญญาบริการ', c.id, c.vendor, undefined, `สิ้นสุด ${before}`, `สิ้นสุด ${to}`);
    });
  }

  retireContract(c: ServiceContract, reason: string) {
    this.mutate(d => {
      retireContract(c, reason, this.userName());
      this.log(d, 'M22', 'ยกเลิกสัญญาบริการ', c.id, c.vendor, reason, 'มีผล', 'ยกเลิกสัญญาแล้ว');
    });
  }

  requestDecommission(input: DecommissionInput): Decommission {
    let r!: Decommission;
    this.mutate(d => {
      r = requestDecommission(d, input, this.userName());
      this.log(d, 'M22', 'ขอเลิกใช้อุปกรณ์', r.id, this.eq(d, r.equipmentId), `${DECOMMISSION_METHOD[r.method]} · ${r.reason}`, undefined, 'รออนุมัติ');
    });
    return r;
  }

  decideDecommission(r: Decommission, status: 'approved' | 'rejected', note: string) {
    this.mutate(d => {
      decideDecommission(d, r, status, note, this.userName());
      this.log(d, 'M22', status === 'approved' ? 'อนุมัติการเลิกใช้' : 'ปฏิเสธการเลิกใช้', r.id, this.eq(d, r.equipmentId), note, 'รออนุมัติ', status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ');
    });
  }

  completeDecommission(r: Decommission, evidence: string) {
    this.mutate(d => {
      completeDecommission(d, r, evidence, this.userName());
      this.log(d, 'M22', 'เลิกใช้อุปกรณ์', r.id, this.eq(d, r.equipmentId), evidence, 'อนุมัติแล้ว', 'เลิกใช้แล้ว');
    });
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
