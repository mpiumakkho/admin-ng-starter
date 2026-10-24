/*
 * What the context rail counts and what its sheets look up about the selected patient: results to look at, the
 * owner's bills and consent, the patient's past visits and documents. Plain functions of the records, so the React and
 * Angular apps share them as they are.
 */
import { TODAY } from './model';
import type { Appointment, ClinicData, Invoice, LabResult, Owner, Patient } from './types';

/* ---- Results ---- */

/** A result with a value out of range, or a critical one */
export const isAbnormal = (r: LabResult): boolean => r.flag === 'critical' || r.values.some(v => v[3] !== 0);

/** The patient's results, newest first, from every visit */
export function resultsNewestFirst(data: ClinicData, p: Patient): LabResult[] {
  return data.results.filter(r => r.pet === p.pet).sort((a, b) => b.time.localeCompare(a.time));
}

/** Results a clinician still has to look at: not acknowledged, and abnormal or critical */
export function resultsToReview(data: ClinicData, p: Patient): LabResult[] {
  return resultsNewestFirst(data, p).filter(r => !r.ack && isAbnormal(r));
}

/* ---- Billing ---- */

export const balanceOf = (i: Invoice): number => Math.max(0, i.total - i.paid);

/** The owner's bills not fully paid, oldest first */
export function openInvoices(data: ClinicData, ownerKey: string): Invoice[] {
  return data.invoices.filter(i => i.ownerKey === ownerKey && balanceOf(i) > 0).sort((a, b) => a.date.localeCompare(b.date));
}

/** What the owner still owes, in baht */
export function outstanding(data: ClinicData, ownerKey: string): number {
  return openInvoices(data, ownerKey).reduce((sum, i) => sum + balanceOf(i), 0);
}

/** Paid, part paid or not paid: the key of its status text */
export function invoiceState(i: Invoice): 'ชำระแล้ว' | 'ชำระบางส่วน' | 'ค้างชำระ' {
  return balanceOf(i) === 0 ? 'ชำระแล้ว' : i.paid > 0 ? 'ชำระบางส่วน' : 'ค้างชำระ';
}

/** The lower bound of a catalog price such as "฿900–1,200", in baht */
export const priceOf = (price: string): number => Number((price.replace(/[^\d,–-]/g, '').split(/[–-]/)[0] || '0').replace(/,/g, '')) || 0;

/** Today's charges so far, not billed yet: the pet's orders today that are not cancelled */
export function runningBill(data: ClinicData, p: Patient): { lines: [name: string, amount: number, ranged: boolean][]; total: number } | null {
  const lines = data.orders
    .filter(o => o.pet === p.pet && o.time.startsWith(TODAY) && o.col !== 'Cancelled' && priceOf(o.price) > 0)
    .map(o => [o.name, priceOf(o.price), /[–-]/.test(o.price)] as [string, number, boolean]);
  return lines.length ? { lines, total: lines.reduce((sum, l) => sum + l[1], 0) } : null;
}

/** Baht, as the workspace writes it: ฿1,450 */
export const baht = (n: number): string => '฿' + n.toLocaleString('en-US');

/* ---- Consent ---- */

export type ConsentState = 'valid' | 'pending' | 'missing' | 'withdrawn' | 'expired';

/** The owner's treatment consent, from what the record says */
export function consentState(o: Owner): ConsentState {
  const text = (o.consent || '').trim();
  if (!text || text === '—') {
    return 'missing';
  }
  if (text.includes('ถอน')) {
    return 'withdrawn';
  }
  if (text.includes('หมดอายุ')) {
    return 'expired';
  }
  if (text.startsWith('รอ')) {
    return 'pending';
  }
  return 'valid';
}

/** The key of the consent state's text */
export const CONSENT_TEXT: Record<ConsentState, string> = {
  valid: 'ใบยินยอมครบถ้วน', pending: 'รอลงนามใบยินยอม', missing: 'ยังไม่มีใบยินยอม', withdrawn: 'ถอนความยินยอมแล้ว', expired: 'ใบยินยอมหมดอายุ',
};

/* ---- Visits and documents ---- */

export interface PastVisit { date: string; title: string; vet: string }

/** The patient's visits before today, newest first: "Wellness exam · น.สพ. นรินทร์" */
export function pastVisits(p: Patient): PastVisit[] {
  return p.visits
    .map(([date, text]) => {
      const [title, ...rest] = text.split(' · ');
      return { date, title, vet: rest.join(' · ') };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The date in a document's name, such as "Renal panel 2026-08-02" */
export const docDate = (name: string): string => /\d{4}-\d{2}-\d{2}/.exec(name)?.[0] ?? '';

/** What happened on one past visit: its documents, results and bill */
export function visitRecords(data: ClinicData, p: Patient, date: string) {
  return {
    docs: p.docs.map((doc, index) => ({ doc, index })).filter(d => docDate(d.doc[0]) === date),
    results: resultsNewestFirst(data, p).filter(r => r.time.startsWith(date)),
    invoice: data.invoices.find(i => i.pet === p.pet && i.ownerKey === p.ownerKey && i.date === date),
    status: data.owners[p.ownerKey]?.appts.find(a => a[0] === date)?.[2] ?? 'Completed',
  };
}

/** The patient's next booked appointment after today */
export function nextAppointment(data: ClinicData, p: Patient): Appointment | undefined {
  return data.appointments
    .filter(a => a.pet === p.pet && a.owner === p.ownerKey && a.date > TODAY && a.state !== 'Completed')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
}

/* ---- The rail's badges ---- */

export type RailBadgeKey = 'alerts' | 'problems' | 'meds' | 'vaccines' | 'docs' | 'results' | 'billing' | 'consent';
export interface RailBadge { count: number; text: string; tone: 'primary' | 'danger' | 'neutral' }

/**
 * The number on each of the rail's buttons for one patient; a button with nothing to count has none. Consent shows
 * "!" when the owner's treatment consent is missing, waiting to be signed, withdrawn or expired.
 */
export function railBadges(data: ClinicData, p: Patient): Partial<Record<RailBadgeKey, RailBadge>> {
  const owner = data.owners[p.ownerKey];
  const review = resultsToReview(data, p);
  const counts: [RailBadgeKey, number, RailBadge['tone']][] = [
    ['alerts', p.alerts.length, 'danger'],
    ['problems', p.problems.filter(x => x[2] !== 'ok').length, 'primary'],
    ['meds', p.meds.length, 'primary'],
    ['vaccines', p.vaccines.filter(v => v[2] !== 'ok').length, 'primary'],
    ['docs', p.docs.length, 'neutral'],
    ['results', review.length, review.some(r => r.flag === 'critical') ? 'danger' : 'primary'],
    ['billing', openInvoices(data, p.ownerKey).length, 'primary'],
  ];
  const badges: Partial<Record<RailBadgeKey, RailBadge>> = {};
  for (const [key, count, tone] of counts) {
    if (count > 0) {
      badges[key] = { count, text: String(count), tone };
    }
  }
  if (owner && consentState(owner) !== 'valid') {
    badges.consent = { count: 1, text: '!', tone: 'danger' };
  }
  return badges;
}
