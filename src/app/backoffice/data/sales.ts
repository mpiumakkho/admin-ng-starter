/*
 * Sales and customer service (seph1-docs 26-backoffice-erp ux/menus/04-sales.md, domains/sales-and-revenue.md): a
 * composition of the revenue modules, not a sales module of its own. M15 LINE CRM sends the owner's service messages
 * only with the consent M31 keeps; M16 Insurance tracks claims by hand until the insurers' APIs (P4); the revenue
 * overview reads M11's own figures. Text is kept in its source language and translated where it shows.
 */
import { NOW, TODAY } from '../../clinic/data/model';
import { balanceOf } from '../../clinic/data/rail';
import type { ClinicData, Invoice } from '../../clinic/data/types';
import { ledger, outstanding, receivables, statusOf } from './finance';
import { ageDays, daysUntil } from './home';
import type { BackofficeData, Claim, ClaimStatus, Insurer, LineLink, MessageKind, Policy, ServiceMessage } from './types';

const baht = (n: number) => `฿${n.toLocaleString('en-US')}`;
export const nextSeq = (taken: string[], prefix: string) =>
  `${prefix}${String(Math.max(0, ...taken.filter(x => x.startsWith(prefix)).map(x => Number(x.slice(prefix.length)) || 0)) + 1).padStart(3, '0')}`;

/* ---- LINE CRM (M15) ---- */

/** What each message is for, and the consent purpose it needs: a service message rides on the link itself, a reminder needs its own */
export const MESSAGE_KIND: Record<MessageKind, { label: string; purpose: 'service' | 'reminder'; cls: string }> = {
  'appointment-reminder': { label: 'แจ้งเตือนนัด', purpose: 'reminder', cls: 'info' },
  'vaccine-reminder': { label: 'แจ้งเตือนวัคซีน', purpose: 'reminder', cls: 'info' },
  'bill-link': { label: 'ลิงก์ชำระเงิน', purpose: 'service', cls: 'warn' },
  'visit-status': { label: 'สถานะการรักษา', purpose: 'service', cls: 'quiet' },
  'booking-confirm': { label: 'ยืนยันการจอง', purpose: 'service', cls: 'quiet' },
  'follow-up': { label: 'ติดตามอาการ', purpose: 'service', cls: 'quiet' },
};
export const MESSAGE_STATUS: Record<ServiceMessage['status'], { label: string; cls: string }> = {
  delivered: { label: 'ส่งถึงแล้ว', cls: 'info' },
  read: { label: 'อ่านแล้ว', cls: 'ok' },
  failed: { label: 'ส่งไม่สำเร็จ', cls: 'danger' },
};
export const PURPOSE_LABEL: Record<'service' | 'reminder' | 'marketing', string> = { service: 'ข้อความบริการ', reminder: 'การแจ้งเตือน', marketing: 'การตลาด' };

export const linkOf = (bo: BackofficeData, ownerKey: string): LineLink | undefined => bo.lineLinks.find(l => l.ownerKey === ownerKey);

/** Why a message of this kind cannot go to this owner, or null when it can */
export function blockOf(bo: BackofficeData, ownerKey: string, kind: MessageKind): string | null {
  const link = linkOf(bo, ownerKey);
  if (!link) {
    return 'ไม่ได้เชื่อม LINE กับโรงพยาบาล';
  }
  const purpose = MESSAGE_KIND[kind].purpose;
  if (!link.consent[purpose]) {
    return link.withdrawn?.purpose === purpose ? `ถอนความยินยอม${PURPOSE_LABEL[purpose]}เมื่อ ${link.withdrawn.at}` : `ไม่ได้ให้ความยินยอม${PURPOSE_LABEL[purpose]}`;
  }
  return null;
}

/** A message waiting to go: what, to whom, about which record, and why it cannot go when it cannot */
export interface OutboxItem {
  key: string;
  ownerKey: string;
  pet: string;
  kind: MessageKind;
  text: string;
  ref: string;
  /** When it is for: the appointment, the vaccine's due date, the bill's due date */
  due: string;
  block: string | null;
  /** An earlier attempt that failed */
  retry?: ServiceMessage;
}

const sentOk = (bo: BackofficeData, kind: MessageKind, ref: string) => bo.messages.some(m => m.kind === kind && m.ref === ref && m.status !== 'failed');
const lastFailed = (bo: BackofficeData, kind: MessageKind, ref: string) => bo.messages.find(m => m.kind === kind && m.ref === ref && m.status === 'failed');

/** Tomorrow's appointments, vaccines due within 30 days and bills still owed, each not yet told */
export function outbox(clinic: ClinicData, bo: BackofficeData, today = TODAY): OutboxItem[] {
  const items: OutboxItem[] = [];
  for (const a of clinic.appointments.filter(x => daysUntil(x.date, today) === 1 && !sentOk(bo, 'appointment-reminder', x.id))) {
    items.push({ key: `appt:${a.id}`, ownerKey: a.owner, pet: a.pet, kind: 'appointment-reminder', text: `แจ้งเตือนนัด ${a.pet} ${a.date} ${a.time} · ${a.type}`, ref: a.id, due: `${a.date} ${a.time}`, block: blockOf(bo, a.owner, 'appointment-reminder') });
  }
  for (const v of bo.vaccinesDue.filter(x => daysUntil(x.due, today) >= 0 && daysUntil(x.due, today) <= 30)) {
    const ref = `${v.pet}:${v.vaccine}`;
    if (!sentOk(bo, 'vaccine-reminder', ref)) {
      items.push({ key: `vac:${ref}`, ownerKey: v.ownerKey, pet: v.pet, kind: 'vaccine-reminder', text: `${v.pet} ถึงกำหนดวัคซีน ${v.vaccine} ${v.due} · จองนัดได้ในแชท`, ref, due: v.due, block: blockOf(bo, v.ownerKey, 'vaccine-reminder') });
    }
  }
  for (const i of clinic.invoices.filter(outstanding)) {
    if (!sentOk(bo, 'bill-link', i.id)) {
      items.push({ key: `bill:${i.id}`, ownerKey: i.ownerKey, pet: i.pet, kind: 'bill-link', text: `ลิงก์ชำระ ${i.no} · ${baht(balanceOf(i))} (PromptPay)`, ref: i.id, due: i.dueAt ?? i.date,
        block: blockOf(bo, i.ownerKey, 'bill-link'), retry: lastFailed(bo, 'bill-link', i.id) });
    }
  }
  return items.sort((a, b) => Number(!!a.block) - Number(!!b.block) || a.due.localeCompare(b.due));
}

/** Sent: the sample's channel answers at once */
export function sendMessage(bo: BackofficeData, item: OutboxItem, by: string, at = `${TODAY} ${NOW}`): ServiceMessage {
  const block = blockOf(bo, item.ownerKey, item.kind);
  if (block) {
    throw new Error(block);
  }
  const message: ServiceMessage = { id: nextSeq(bo.messages.map(m => m.id), 'MSG-2609-'), ownerKey: item.ownerKey, pet: item.pet, kind: item.kind, text: item.text, ref: item.ref, at, by, status: 'delivered' };
  bo.messages.unshift(message);
  return message;
}

/** The journey at a glance: who is on LINE, what they agreed to, and how the messages fared */
export function lineSummary(clinic: ClinicData, bo: BackofficeData, today = TODAY) {
  const owners = Object.keys(clinic.owners).length;
  const sent = bo.messages;
  const delivered = sent.filter(m => m.status !== 'failed');
  return {
    owners, linked: bo.lineLinks.length,
    reminder: bo.lineLinks.filter(l => l.consent.reminder).length,
    marketing: bo.lineLinks.filter(l => l.consent.marketing).length,
    today: sent.filter(m => m.at.startsWith(today)).length,
    failed: sent.filter(m => m.status === 'failed').length,
    readRate: delivered.length ? Math.round((delivered.filter(m => m.status === 'read').length / delivered.length) * 100) : 0,
  };
}

/** Every owner with their LINE state, for the consent rail */
export function owners(clinic: ClinicData, bo: BackofficeData) {
  return Object.values(clinic.owners).map(o => ({ owner: o, link: linkOf(bo, o.name), messages: bo.messages.filter(m => m.ownerKey === o.name).length }));
}

/* ---- Insurance claims (M16) ---- */

export const INSURERS: Insurer[] = ['Falcon', 'MSIG', 'Roojai'];
export const CLAIM_STATUS: Record<ClaimStatus, { label: string; cls: string }> = {
  draft: { label: 'ฉบับร่าง', cls: 'quiet' },
  'documents-ready': { label: 'เอกสารพร้อม', cls: 'info' },
  submitted: { label: 'ส่งแล้ว รอผล', cls: 'warn' },
  approved: { label: 'อนุมัติ', cls: 'ok' },
  'partially-approved': { label: 'อนุมัติบางส่วน', cls: 'ok' },
  rejected: { label: 'ปฏิเสธ', cls: 'danger' },
  reimbursed: { label: 'ได้รับเงินแล้ว', cls: 'ok' },
};
export const CLAIM_KIND: Record<Claim['kind'], string> = { claim: 'เคลม', 'pre-auth': 'ขออนุมัติล่วงหน้า' };
/** A submitted claim the insurer has not answered after this many days is followed up */
export const CLAIM_FOLLOW_UP_DAYS = 14;

export const policyOf = (bo: BackofficeData, id: string) => bo.policies.find(p => p.id === id);
export const claimInvoice = (clinic: ClinicData, c: Claim): Invoice | undefined => clinic.invoices.find(i => i.id === c.invoiceId);
export const submittedAt = (c: Claim) => c.log.find(l => l[2] === 'submitted')?.[0];
export const isOverdue = (c: Claim, today = TODAY) => c.status === 'submitted' && ageDays(submittedAt(c) ?? c.createdAt, today) > CLAIM_FOLLOW_UP_DAYS;

/** What the policy is likely to pay: after the deductible and the owner's share, within what is left of the limit; the insurer decides */
export function claimEstimate(policy: Policy, total: number): number {
  return Math.max(0, Math.min(policy.remaining, Math.round((total - policy.deductible) * (1 - policy.copay))));
}

/** The pet's bills a claim can still be made on: issued, not cancelled, and not already claimed (a rejected claim does not count) */
export function claimableInvoices(clinic: ClinicData, bo: BackofficeData, policy: Policy): Invoice[] {
  return clinic.invoices.filter(i => i.ownerKey === policy.ownerKey && i.pet === policy.pet && !['draft', 'cancelled', 'refunded'].includes(statusOf(i))
    && !bo.claims.some(c => c.invoiceId === i.id && c.status !== 'rejected'));
}

export interface ClaimInput { policyId: string; kind: Claim['kind']; invoiceId?: string; diagnosis: string; amount: number }

export function claimProblems(clinic: ClinicData, bo: BackofficeData, input: ClaimInput): Partial<Record<keyof ClaimInput, string>> {
  const problems: Partial<Record<keyof ClaimInput, string>> = {};
  const policy = policyOf(bo, input.policyId);
  if (!policy) {
    problems.policyId = 'เลือกกรมธรรม์';
  } else if (daysUntil(policy.validTo) < 0) {
    problems.policyId = 'กรมธรรม์หมดอายุแล้ว';
  }
  if (input.kind === 'claim') {
    if (!input.invoiceId) {
      problems.invoiceId = 'การเคลมต้องอ้างอิงใบแจ้งหนี้';
    } else if (policy && !claimableInvoices(clinic, bo, policy).some(i => i.id === input.invoiceId)) {
      problems.invoiceId = 'ใบแจ้งหนี้นี้เคลมแล้วหรือเคลมไม่ได้';
    }
  }
  if (input.diagnosis.trim().length < 5) {
    problems.diagnosis = 'ต้องระบุการวินิจฉัย';
  }
  if (!(input.amount > 0)) {
    problems.amount = 'จำนวนเงินต้องมากกว่า 0';
  } else if (policy && input.amount > policy.remaining) {
    problems.amount = 'เกินวงเงินคงเหลือของกรมธรรม์';
  }
  return problems;
}

export function newClaim(clinic: ClinicData, bo: BackofficeData, input: ClaimInput, by: string, at = `${TODAY} ${NOW}`): Claim {
  const policy = policyOf(bo, input.policyId)!;
  const invoice = clinic.invoices.find(i => i.id === input.invoiceId);
  const claim: Claim = {
    id: nextSeq(bo.claims.map(c => c.id), 'CLM-2609-'), kind: input.kind, policyId: policy.id, invoiceId: invoice?.id, ownerKey: policy.ownerKey, pet: policy.pet, insurer: policy.insurer,
    diagnosis: input.diagnosis.trim(), amount: input.amount, createdAt: at, createdBy: by, status: 'draft',
    log: [[at, by, 'draft', invoice ? `สร้างจาก ${invoice.no}` : `${CLAIM_KIND[input.kind]} ${baht(input.amount)}`]],
  };
  bo.claims.unshift(claim);
  return claim;
}

const move = (c: Claim, status: ClaimStatus, note: string, by: string, at: string) => {
  c.status = status;
  c.log.push([at, by, status, note]);
};

/** The insurer's form printed: the claim is ready to send */
export function markDocuments(c: Claim, by: string, at = `${TODAY} ${NOW}`) {
  if (c.status !== 'draft' && c.status !== 'documents-ready') {
    throw new Error('ออกเอกสารได้เฉพาะเคลมที่ยังไม่ส่ง');
  }
  c.documentsAt = at;
  if (c.status === 'draft') {
    move(c, 'documents-ready', `ออกแบบฟอร์ม${CLAIM_KIND[c.kind]} ${c.insurer}`, by, at);
  }
}

/** Sent by hand (e-mail, the insurer's portal), with the insurer's reference when it gave one */
export function submitClaim(c: Claim, via: string, ref: string, by: string, at = `${TODAY} ${NOW}`) {
  if (c.status !== 'documents-ready') {
    throw new Error('ต้องออกเอกสารก่อนส่ง');
  }
  c.submittedVia = via.trim();
  c.insurerRef = ref.trim() || undefined;
  move(c, 'submitted', `ส่งทาง ${c.submittedVia}${c.insurerRef ? ` · เลขรับเรื่อง ${c.insurerRef}` : ''}`, by, at);
}

/** The insurer's answer as it came: approved in full or in part, or rejected with why; an approved claim uses the policy's limit */
export function decideClaim(bo: BackofficeData, c: Claim, decision: 'approved' | 'partially-approved' | 'rejected', amount: number, note: string, by: string, at = `${TODAY} ${NOW}`) {
  if (c.status !== 'submitted') {
    throw new Error('บันทึกผลได้เฉพาะเคลมที่ส่งแล้ว');
  }
  if (decision === 'partially-approved' && !(amount > 0 && amount < c.amount)) {
    throw new Error('ยอดอนุมัติบางส่วนต้องมากกว่า 0 และน้อยกว่ายอดที่เคลม');
  }
  c.approvedAmount = decision === 'rejected' ? 0 : decision === 'approved' ? c.amount : amount;
  c.decisionNote = note.trim();
  if (c.kind === 'claim' && c.approvedAmount) {
    const policy = policyOf(bo, c.policyId);
    if (policy) {
      policy.remaining = Math.max(0, policy.remaining - c.approvedAmount);
    }
  }
  move(c, decision, `${note.trim()}${c.approvedAmount ? ` · ${baht(c.approvedAmount)}` : ''}`, by, at);
}

/** The money as it arrived (EOB), to the hospital or to the owner; a difference from what was approved stays on record */
export function reimburse(c: Claim, amount: number, payee: 'hospital' | 'owner', ref: string, by: string, at = `${TODAY} ${NOW}`) {
  if (c.status !== 'approved' && c.status !== 'partially-approved') {
    throw new Error('บันทึกรับเงินได้เฉพาะเคลมที่อนุมัติแล้ว');
  }
  c.reimbursed = { amount, payee, ref: ref.trim(), at };
  const diff = amount - (c.approvedAmount ?? 0);
  move(c, 'reimbursed', `${baht(amount)} → ${payee === 'hospital' ? 'โรงพยาบาล' : 'เจ้าของ'}${ref.trim() ? ` · ${ref.trim()}` : ''}${diff ? ` · ต่างจากที่อนุมัติ ${baht(diff)}` : ''}`, by, at);
}

/** What changes hands between approved and paid (EOB reconciliation) */
export const eobVariance = (c: Claim) => (c.reimbursed ? c.reimbursed.amount - (c.approvedAmount ?? 0) : null);

export function claimSummary(bo: BackofficeData, today = TODAY) {
  const by = (s: ClaimStatus[]) => bo.claims.filter(c => s.includes(c.status));
  return {
    drafts: by(['draft', 'documents-ready']).length,
    waiting: { count: by(['submitted']).length, amount: by(['submitted']).reduce((s, c) => s + c.amount, 0) },
    approved: { count: by(['approved', 'partially-approved']).length, amount: by(['approved', 'partially-approved']).reduce((s, c) => s + (c.approvedAmount ?? 0), 0) },
    reimbursed: by(['reimbursed']).reduce((s, c) => s + (c.reimbursed?.amount ?? 0), 0),
    rejected: by(['rejected']).length,
    overdue: bo.claims.filter(c => isOverdue(c, today)).length,
  };
}

/* ---- The customer revenue overview: M11's money, M16's claims and M15's messages side by side, each from its owner ---- */

export interface RevenueSourceRow { source: string; module: string; today: number; week: number; month: number; note?: string }
export interface RevenueException { kind: string; module: string; ref: string; detail: string; amount?: number; link: string }

export function revenueOverview(clinic: ClinicData, bo: BackofficeData, today = TODAY) {
  const rows = ledger(clinic).filter(r => r.kind === 'payment' && r.status !== 'reversed' || r.kind === 'refund');
  const within = (at: string, days: number) => { const d = daysUntil(at, today); return d <= 0 && d > -days; };
  const methods = [...new Set(rows.filter(r => r.kind === 'payment').map(r => r.method))];
  const sum = (list: typeof rows, days: number) => list.filter(r => within(r.at, days)).reduce((s, r) => s + r.amount, 0);
  const sources: RevenueSourceRow[] = methods.map(m => {
    const list = rows.filter(r => r.kind === 'payment' && r.method === m);
    return { source: m, module: 'M11', today: sum(list, 1), week: sum(list, 7), month: sum(list, 30), note: m === 'ประกัน' ? 'ยอดที่ประกันจ่ายโรงพยาบาล' : undefined };
  }).sort((a, b) => b.month - a.month);
  const refunds = rows.filter(r => r.kind === 'refund');
  sources.push({ source: 'คืนเงิน', module: 'M11', today: sum(refunds, 1), week: sum(refunds, 7), month: sum(refunds, 30) });
  const toOwner = bo.claims.filter(c => c.reimbursed?.payee === 'owner');
  sources.push({ source: 'ประกันจ่ายเจ้าของโดยตรง', module: 'M16', today: toOwner.filter(c => within(c.reimbursed!.at, 1)).reduce((s, c) => s + c.reimbursed!.amount, 0),
    week: toOwner.filter(c => within(c.reimbursed!.at, 7)).reduce((s, c) => s + c.reimbursed!.amount, 0), month: toOwner.filter(c => within(c.reimbursed!.at, 30)).reduce((s, c) => s + c.reimbursed!.amount, 0),
    note: 'ไม่เข้าบัญชีโรงพยาบาล · แสดงเพื่อติดตามเท่านั้น' });

  const exceptions: RevenueException[] = [
    ...bo.exceptions.filter(x => x.kind === 'payment-failure' && !x.acknowledgedAt).map(x => ({ kind: 'รับชำระไม่สำเร็จ', module: 'M11', ref: x.ref, detail: x.title, link: '/backoffice/home/alerts' })),
    ...bo.messages.filter(m => m.status === 'failed').map(m => ({ kind: 'ส่ง LINE ไม่สำเร็จ', module: 'M15', ref: m.id, detail: `${m.ownerKey} · ${m.text} — ${m.error ?? ''}`, link: '/backoffice/sales/line' })),
    ...bo.claims.filter(c => isOverdue(c, today)).map(c => ({ kind: 'เคลมรอผลเกินกำหนด', module: 'M16', ref: c.id, detail: `${c.insurer} · ${c.pet} · ส่งเมื่อ ${submittedAt(c)}`, amount: c.amount, link: '/backoffice/sales/claims' })),
    ...bo.claims.filter(c => c.status === 'approved' || c.status === 'partially-approved').map(c => ({ kind: 'อนุมัติแล้ว รอรับเงิน', module: 'M16', ref: c.id, detail: `${c.insurer} · ${c.pet} · ${c.decisionNote ?? ''}`, amount: c.approvedAmount, link: '/backoffice/sales/claims' })),
  ];
  const ar = receivables(clinic, today);
  const claims = claimSummary(bo, today);
  const line = lineSummary(clinic, bo, today);
  const box = outbox(clinic, bo, today);
  return {
    collectedToday: sources.filter(s => s.module === 'M11' && s.source !== 'คืนเงิน').reduce((s, r) => s + r.today, 0),
    collectedMonth: sources.filter(s => s.module === 'M11').reduce((s, r) => s + r.month, 0),
    outstanding: { amount: ar.total, count: ar.rows.length },
    claims, line, outbox: { ready: box.filter(i => !i.block).length, blocked: box.filter(i => i.block).length },
    sources, exceptions,
  };
}
