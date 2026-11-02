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
import {
  assessBreach, type BreachInput, BREACH_SEVERITY, BREACH_STATUS, closeBreach, closeDsar, collect, CONSENT_PURPOSE, CONSENT_STATUS, decideExport, DSAR_RIGHT, DSAR_STATUS, type DsarInput,
  emit, type ExportInput, fulfil, generateRopa, intakeDsar, notify, NOTIFY_TO, performExport, recordConsent, recordFinding, reportBreach, requestExport, SHAPE, verifyIdentity, withdraw,
} from './data/governance';
import { approvalAging, severityCounts, worklist } from './data/home';
import { testConnection } from './data/integrations';
import {
  addRcaAction, addWhy, ANONYMOUS, CHANNEL, closeIncident, closeSurvey, COMPLAINT_SEVERITY, completeAction, type ComplaintInput, decideRca, escalate, escalateNearMiss, HARM,
  type IncidentInput, logContact, type MmInput, type NearMissInput, openRca, preventNearMiss, recordFindings, recordMm, recordNearMiss, recordSatisfaction, REMEDY, receiveComplaint,
  reportIncident, resolveComplaint, respond, scheduleMm, sendBack, setRootCause, setTarget, signOff, submitRca, triageComplaint, triageIncident, type TriageInput,
} from './data/quality';
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
  AccountingExport, ActivityEntry, Approval, AuditExport, ConnectionTest, BackofficeData, Breach, ConsentGrant, DsarRequest, IntegrityPeriod, RopaExport, BoException, CalibrationRecord, CeRecord, Claim, Complaint, ComplaintChannel, ComplaintSeverity, CountRecord, Criticality,
  Decommission, Downtime, Equipment, HarmLevel, Incident, KpiDefinition, LeaveRequest, LedgerDispense, License, MmReview, Module, NearMiss, OnCallSlot, PmTask, Privilege, Rca, RcaAction,
  Recall, RecallStatus, Remedy, SafetySurvey, ServiceContract, ServiceMessage, Shift, StaffMember, StockReceipt, WasteRecord,
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
      const x = a.kind === 'audit-export' ? d.auditExports.find(e => e.id === a.ref && e.status === 'pending') : undefined;
      if (x) {
        Object.assign(x, { status, decidedBy: this.userName(), decidedAt: `${TODAY} ${NOW}`, decision });
      }
      const complaint = a.kind === 'complaint' && status === 'approved' ? d.complaints.find(c => c.id === a.ref) : undefined;
      if (complaint && !complaint.links.some(l => l.startsWith('RCA-'))) {
        const r = openRca(d, complaint.id, complaint.subject, [complaint.handler ?? 'ผู้จัดการ OPD', 'ภก. ธนพร'], this.userName());
        this.log(d, 'M12', 'เปิด RCA แล้ว', r.id, complaint.id, r.title);
      }
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
      this.log(d, 'M11', 'ยกเลิกใบแจ้งหนี้', i.no || i.id, i.ownerKey, reason, before === 'draft' ? 'ฉบับร่าง' : 'ออกแล้ว', 'ยกเลิกแล้ว');
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

  /** The adapter's connection tested, as an audited action: it says the connection works, nothing about mapping or posting */
  testAdapter(): ConnectionTest {
    let t!: ConnectionTest;
    this.mutate(d => {
      t = testConnection(d, this.userName());
      this.log(d, 'M11', 'ทดสอบการเชื่อมต่อ adapter', t.id, 'PEAK', t.result === 'passed' ? 'ผ่าน' : t.code);
    });
    return t;
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
      this.log(d, 'M24', 'ยกเลิกเวร', s.id, this.who(d, s.staffId), [`${s.date} · เวร${SHIFT[s.kind].label}`, reason].filter(Boolean).join(' · '), s.status === 'published' ? 'ประกาศแล้ว' : 'ฉบับร่าง', 'ยกเลิกแล้ว');
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

  /* Quality and patient safety (data/quality.ts): each step goes into M12's audit; an anonymous report names no one there either */

  private anonymous(d: BackofficeData) {
    d.activity[0].by = ANONYMOUS;
  }

  reportIncident(input: IncidentInput): Incident {
    let i!: Incident;
    this.mutate(d => {
      i = reportIncident(d, input, this.userName());
      this.log(d, 'M12', 'รับแจ้งอุบัติการณ์', i.id, HARM[i.harm].label, i.description);
      if (input.anonymous) {
        this.anonymous(d);
      }
    });
    return i;
  }

  triageIncident(i: Incident, input: TriageInput) {
    const before = HARM[i.harm].label;
    this.mutate(d => {
      triageIncident(i, input, this.userName());
      this.log(d, 'M12', 'คัดกรองอุบัติการณ์', i.id, i.owner!, input.note.trim(), before, HARM[i.harm].label);
    });
  }

  closeIncident(i: Incident, outcome: string) {
    this.mutate(d => {
      closeIncident(i, outcome, this.userName());
      this.log(d, 'M12', 'ปิดอุบัติการณ์แล้ว', i.id, HARM[i.harm].label, outcome.trim(), 'กำลังดำเนินการ', 'ปิดแล้ว');
    });
  }

  recordNearMiss(input: NearMissInput): NearMiss {
    let n!: NearMiss;
    this.mutate(d => {
      n = recordNearMiss(d, input, this.userName());
      this.log(d, 'M12', 'รับแจ้งเหตุเกือบพลาด', n.id, n.caughtBy, n.description);
      if (input.anonymous) {
        this.anonymous(d);
      }
    });
    return n;
  }

  preventNearMiss(n: NearMiss, prevention: string) {
    this.mutate(d => {
      preventNearMiss(n, prevention, this.userName());
      this.log(d, 'M12', 'บันทึกมาตรการป้องกันแล้ว', n.id, n.caughtBy, n.prevention, 'รอมาตรการป้องกัน', 'มีมาตรการแล้ว');
    });
  }

  escalateNearMiss(n: NearMiss, harm: HarmLevel, reason: string): Incident {
    let i!: Incident;
    this.mutate(d => {
      i = escalateNearMiss(d, n, harm, reason, this.userName());
      this.log(d, 'M12', 'ยกระดับเป็นอุบัติการณ์', n.id, i.id, reason.trim());
    });
    return i;
  }

  openRca(source: string, title: string, team: string[]): Rca {
    let r!: Rca;
    this.mutate(d => {
      r = openRca(d, source, title, team, this.userName());
      this.log(d, 'M12', 'เปิด RCA แล้ว', r.id, source, `${r.title} · ${team.join(', ')}`);
    });
    return r;
  }

  addWhy(r: Rca, text: string) {
    this.mutate(d => {
      addWhy(r, text, this.userName());
      this.log(d, 'M12', 'บันทึกคำถามทำไม', r.id, r.title, text.trim(), undefined, `${r.whys.length} ทำไม`);
    });
  }

  setRootCause(r: Rca, text: string) {
    this.mutate(d => {
      setRootCause(r, text, this.userName());
      this.log(d, 'M12', 'สรุปสาเหตุราก', r.id, r.title, r.rootCause);
    });
  }

  addRcaAction(r: Rca, a: { text: string; owner: string; due: string }) {
    this.mutate(d => {
      addRcaAction(r, a, this.userName());
      this.log(d, 'M12', 'เพิ่มมาตรการแล้ว', r.id, a.owner.trim(), `${a.text.trim()} · ${a.due}`);
    });
  }

  submitRca(r: Rca) {
    this.mutate(d => {
      submitRca(r, this.userName());
      this.log(d, 'M12', 'ส่ง RCA อนุมัติ', r.id, r.title, undefined, 'กำลังวิเคราะห์', 'รออนุมัติ');
    });
  }

  decideRca(r: Rca, approve: boolean, note: string) {
    this.mutate(d => {
      decideRca(r, approve, note, this.userName());
      this.log(d, 'M12', approve ? 'อนุมัติ RCA แล้ว' : 'ส่ง RCA กลับให้ทีม', r.id, r.title, note.trim(), 'รออนุมัติ', approve ? 'อนุมัติแล้ว' : 'กำลังวิเคราะห์');
    });
  }

  completeRcaAction(r: Rca, a: RcaAction) {
    this.mutate(d => {
      completeAction(r, a, this.userName());
      this.log(d, 'M12', 'มาตรการเสร็จ', r.id, a.owner, a.text);
    });
  }

  setKpiTarget(k: KpiDefinition, target: number, reason: string) {
    const before = k.target;
    this.mutate(d => {
      setTarget(k, target, reason, this.userName());
      this.log(d, 'M12', 'เปลี่ยนเป้าหมายตัวชี้วัด', k.id, k.name, reason.trim(), String(before), String(target));
    });
  }

  closeSurvey(s: SafetySurvey) {
    this.mutate(d => {
      closeSurvey(s, this.userName());
      this.log(d, 'M12', 'ปิดรอบสำรวจวัฒนธรรมความปลอดภัย', s.id, `${s.responded}/${s.invited}`, undefined, 'เปิดรับคำตอบ', 'ปิดแล้ว');
    });
  }

  scheduleMm(input: MmInput): MmReview {
    let m!: MmReview;
    this.mutate(d => {
      m = scheduleMm(d, input);
      this.log(d, 'M12', 'นัดทบทวน M&M', m.id, m.pet, `${m.reviewDate} · ${m.presenter}`);
    });
    return m;
  }

  recordMm(m: MmReview, learning: string, attendees: number) {
    this.mutate(d => {
      recordMm(m, learning, attendees);
      this.log(d, 'M12', 'บันทึกผลทบทวน M&M', m.id, m.pet, learning.trim(), 'นัดแล้ว', 'ทบทวนแล้ว');
    });
  }

  /* Complaints (data/quality.ts): each step goes into M28's audit, the investigation's trail with it */

  receiveComplaint(input: ComplaintInput): Complaint {
    let c!: Complaint;
    this.mutate(d => {
      c = receiveComplaint(d, input, this.userName());
      this.log(d, 'M28', 'รับเรื่องร้องเรียน', c.id, c.ownerKey ?? ANONYMOUS, `${CHANNEL[c.channel]} · ${c.subject}`);
    });
    return c;
  }

  triageComplaint(c: Complaint, severity: ComplaintSeverity, handler: string) {
    this.mutate(d => {
      triageComplaint(c, severity, handler, this.userName());
      this.log(d, 'M28', 'คัดกรองข้อร้องเรียน', c.id, handler, `${COMPLAINT_SEVERITY[severity].label} · ตอบภายใน ${COMPLAINT_SEVERITY[severity].hours} ชม.`, 'รอคัดกรอง', 'มอบหมายแล้ว');
    });
  }

  logContact(c: Complaint, direction: 'in' | 'out', channel: ComplaintChannel, text: string) {
    this.mutate(d => {
      logContact(c, direction, channel, text, this.userName());
      this.log(d, 'M28', direction === 'in' ? 'บันทึกการติดต่อเข้า' : 'บันทึกการติดต่อออก', c.id, CHANNEL[channel], text.trim());
    });
  }

  recordFindings(c: Complaint, findings: string, links: string[]) {
    this.mutate(d => {
      recordFindings(c, findings, links, this.userName());
      this.log(d, 'M28', 'บันทึกผลสอบสวนแล้ว', c.id, links.join(', ') || c.subject, findings.trim());
    });
  }

  respond(c: Complaint, text: string) {
    this.mutate(d => {
      respond(c, text, this.userName());
      const sent = !!c.response?.sentAt;
      this.log(d, 'M28', sent ? 'ส่งคำตอบแล้ว' : 'ร่างคำตอบแล้ว', c.id, c.ownerKey ?? ANONYMOUS, text.trim(), undefined, sent ? 'ตอบกลับแล้ว' : 'รอผู้อำนวยการลงนาม');
    });
  }

  signOff(c: Complaint, approve: boolean, note: string) {
    this.mutate(d => {
      if (approve) {
        signOff(c, note, this.userName());
      } else {
        sendBack(c, note, this.userName());
      }
      this.log(d, 'M28', approve ? 'ลงนามและส่งคำตอบ' : 'ส่งคำตอบกลับไปแก้แล้ว', c.id, c.ownerKey ?? ANONYMOUS, note.trim(), 'รอผู้อำนวยการลงนาม', approve ? 'ตอบกลับแล้ว' : 'กำลังสอบสวน');
    });
  }

  resolveComplaint(c: Complaint, outcome: string, remedy: Remedy) {
    this.mutate(d => {
      resolveComplaint(c, outcome, remedy, this.userName());
      this.log(d, 'M28', 'ปิดข้อร้องเรียน', c.id, REMEDY[remedy], outcome.trim(), 'ตอบกลับแล้ว', 'แก้ไขแล้ว');
    });
  }

  recordSatisfaction(c: Complaint, score: number, note: string) {
    this.mutate(d => {
      recordSatisfaction(c, score, note, this.userName());
      this.log(d, 'M28', 'บันทึกความพึงพอใจ', c.id, c.ownerKey ?? ANONYMOUS, `${score}/5${note.trim() ? ` · ${note.trim()}` : ''}`);
    });
  }

  escalateComplaint(c: Complaint, body: string, reason: string) {
    this.mutate(d => {
      escalate(c, body, reason, this.userName());
      this.log(d, 'M28', 'แจ้งหน่วยงานกำกับแล้ว', c.id, body, reason.trim());
    });
  }
  /* PDPA (data/governance.ts): each step goes into M31's audit */

  intakeDsar(input: DsarInput): DsarRequest {
    let r!: DsarRequest;
    this.mutate(d => {
      r = intakeDsar(d, input, this.userName());
      this.log(d, 'M31', 'รับคำขอ DSAR', r.id, r.requester, `${DSAR_RIGHT[r.right]} · ครบกำหนด ${r.statutoryDue}`);
    });
    return r;
  }

  verifyIdentity(r: DsarRequest, method: string) {
    this.mutate(d => {
      verifyIdentity(r, method, this.userName());
      this.log(d, 'M31', 'ยืนยันตัวตนผู้ขอ', r.id, r.requester, method.trim(), 'รอยืนยันตัวตน', 'ยืนยันตัวตนแล้ว');
    });
  }

  collectDsar(r: DsarRequest, source: string) {
    this.mutate(d => {
      collect(d, r, source, this.userName());
      this.log(d, 'M31', 'รวบรวมข้อมูลแล้ว', r.id, r.requester, source);
    });
  }

  fulfilDsar(r: DsarRequest, method: string) {
    this.mutate(d => {
      fulfil(r, method, this.userName());
      this.log(d, 'M31', 'ส่งมอบข้อมูลแล้ว', r.id, r.requester, `${method.trim()} · หมดอายุ ${r.delivery!.expires}`, 'กำลังรวบรวมข้อมูล', 'ส่งมอบแล้ว');
    });
  }

  closeDsar(r: DsarRequest, outcome: string, rejected: boolean) {
    const before = DSAR_STATUS[r.status].label;
    this.mutate(d => {
      closeDsar(r, outcome, rejected, this.userName());
      this.log(d, 'M31', rejected ? 'ปฏิเสธคำขอ' : 'ปิดคำขอแล้ว', r.id, r.requester, outcome.trim(), before, DSAR_STATUS[r.status].label);
    });
  }

  withdrawConsent(g: ConsentGrant) {
    this.mutate(d => {
      withdraw(d, g);
      this.log(d, 'M31', 'ถอนความยินยอมแล้ว', g.ownerKey, CONSENT_PURPOSE[g.purpose].label, `เวอร์ชัน ${g.version}`, 'ยินยอม', 'ถอนแล้ว');
    });
  }

  recordConsent(ownerKey: string, purpose: 'insurance' | 'case-study', granted: boolean, channel: string): ConsentGrant {
    let g!: ConsentGrant;
    this.mutate(d => {
      g = recordConsent(d, ownerKey, purpose, granted, channel);
      this.log(d, 'M31', 'บันทึกความยินยอมแล้ว', g.id, ownerKey, `${CONSENT_PURPOSE[purpose].label} · ${CONSENT_STATUS[g.status].label} · เวอร์ชัน ${g.version}`);
    });
    return g;
  }

  reportBreach(input: BreachInput): Breach {
    let b!: Breach;
    this.mutate(d => {
      b = reportBreach(d, input, this.userName());
      this.log(d, 'M31', 'บันทึกเหตุละเมิด', b.id, b.title, `แจ้งภายใน ${b.statutoryDue}`);
    });
    return b;
  }

  assessBreach(b: Breach, severity: NonNullable<Breach['severity']>, dpia: string) {
    this.mutate(d => {
      assessBreach(b, severity, dpia, this.userName());
      this.log(d, 'M31', 'ประเมินความรุนแรงแล้ว', b.id, b.title, `${BREACH_SEVERITY[severity].label} · ${dpia.trim()}`, 'รอประเมิน', 'ประเมินแล้ว');
    });
  }

  notifyBreach(b: Breach, to: 'pdpc' | 'subjects', ref: string) {
    this.mutate(d => {
      notify(b, to, ref, this.userName());
      this.log(d, 'M31', 'แจ้งเหตุแล้ว', b.id, NOTIFY_TO[to], ref.trim());
    });
  }

  closeBreach(b: Breach, outcome: string) {
    this.mutate(d => {
      closeBreach(b, outcome, this.userName());
      this.log(d, 'M31', b.signOff ? 'ผู้อำนวยการลงนามปิดเหตุ' : 'ปิดเหตุแล้ว', b.id, b.title, outcome.trim(), BREACH_STATUS.notified.label, BREACH_STATUS.closed.label);
    });
  }

  generateRopa(): RopaExport {
    let e!: RopaExport;
    this.mutate(d => {
      e = generateRopa(d, this.userName());
      this.log(d, 'M31', 'สร้าง RoPA แล้ว', e.id, e.artifact, `${e.records} กิจกรรม · ${e.seconds} วินาที`);
    });
    return e;
  }

  /* Audit (data/governance.ts): a patient query, an export and its decision are themselves audited */

  queryPatient(hn: string) {
    this.mutate(d => {
      emit(d, { actor: this.userName(), actorRole: 'DPOCompliance', action: 'audit.query.patient', entityType: 'patient', entityId: hn.trim(), patientId: hn.trim(), riskLevel: 'medium' });
    });
  }

  requestExport(input: ExportInput): AuditExport {
    let x!: AuditExport;
    this.mutate(d => {
      x = requestExport(d, input, this.userName());
      emit(d, { actor: this.userName(), actorRole: 'DPOCompliance', action: 'audit.export.request', entityType: 'audit_export', entityId: x.id, riskLevel: 'medium' });
      this.log(d, 'M13', 'ขอส่งออกบันทึกตรวจสอบ', x.id, `${x.purpose} · ${x.reference}`, `${SHAPE[x.shape]}${x.value ? ` ${x.value}` : ''} · ${x.from} → ${x.to}`, undefined, 'รออนุมัติ');
    });
    return x;
  }

  decideExport(x: AuditExport, approve: boolean, note: string) {
    this.mutate(d => {
      decideExport(d, x, approve, note, this.userName());
      this.log(d, 'M13', approve ? 'อนุมัติการส่งออกแล้ว' : 'ปฏิเสธการส่งออกแล้ว', x.id, `${x.purpose} · ${x.reference}`, note.trim(), 'รออนุมัติ', approve ? 'อนุมัติแล้ว' : 'ปฏิเสธ');
    });
  }

  performExport(x: AuditExport) {
    this.mutate(d => {
      performExport(d, x, this.userName());
      this.log(d, 'M13', 'ส่งออกบันทึกตรวจสอบแล้ว', x.id, x.artifact!, `${x.rows} รายการ · หมดอายุ ${x.expires}`, 'อนุมัติแล้ว', 'พร้อมดาวน์โหลด');
    });
  }

  recordFinding(p: IntegrityPeriod, note: string) {
    this.mutate(d => {
      recordFinding(p, note, this.userName());
      this.log(d, 'M13', 'เปิด finding ความถูกต้อง', p.period, 'hash ไม่ตรง', note.trim());
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
