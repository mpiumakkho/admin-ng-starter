/*
 * Medication inventory (M06; seph1-docs 26-backoffice-erp ux/pages/inventory/00–07): the stock of each drug as the
 * clinic's own batches have it, received and counted here; what left as dispenses and waste; the controlled-drug
 * ledger with its witnesses and investigations; and a recalled lot traced to where it went. Text is kept in its
 * source language and translated where it shows. The sample stands in for the server: what it owns there (stock
 * quantity, the low flag, discrepancies) is worked out here from the same records.
 */
import { addBatch, amount, expiryMonths, shelfOf } from '../../clinic/data/dispense';
import { FORMULARY, NOW, NURSES, TODAY, VETS } from '../../clinic/data/model';
import type { Batch, ClinicData } from '../../clinic/data/types';
import type { BackofficeData, ControlSystem, CountRecord, DrugRecord, InvestigationStatus, LedgerDispense, Recall, RecallStatus, StockReceipt, WasteReason, WasteRecord } from './types';

/* Vocabulary */

export const CONTROL_SYSTEM: Record<ControlSystem, { label: string; short: string; cls: string }> = {
  narcotic: { label: 'ยาเสพติดให้โทษ', short: 'ยาเสพติด', cls: 'danger' },
  psychotropic: { label: 'วัตถุออกฤทธิ์ต่อจิตและประสาท', short: 'วัตถุออกฤทธิ์', cls: 'warn' },
  none: { label: 'ยาทั่วไป', short: '—', cls: 'quiet' },
};

export type ExpiryBucket = 'expired' | 'd30' | 'd60' | 'd90' | 'ok';
export const EXPIRY_BUCKETS: { key: ExpiryBucket; label: string; cls: string }[] = [
  { key: 'expired', label: 'หมดอายุแล้ว', cls: 'danger' },
  { key: 'd30', label: 'ภายใน 30 วัน', cls: 'danger' },
  { key: 'd60', label: 'ภายใน 60 วัน', cls: 'warn' },
  { key: 'd90', label: 'ภายใน 90 วัน', cls: 'warn' },
  { key: 'ok', label: 'เกิน 90 วัน', cls: 'ok' },
];

export type LotState = 'active' | 'expired' | 'quarantined' | 'recalled';
export const LOT_STATE: Record<LotState, { label: string; cls: string }> = {
  active: { label: 'ใช้งาน', cls: 'ok' },
  expired: { label: 'หมดอายุ', cls: 'danger' },
  quarantined: { label: 'กันไว้', cls: 'warn' },
  recalled: { label: 'เรียกคืน', cls: 'danger' },
};

/** The seven reasons the ledger's enum has; the ones taken from the shelf lower the stock, the rest were already drawn */
export const WASTE_REASONS: { value: WasteReason; label: string; fromStock: boolean }[] = [
  { value: 'partial_dose', label: 'เหลือจากการดูดยา', fromStock: false },
  { value: 'spillage', label: 'หกหล่น', fromStock: true },
  { value: 'expired', label: 'หมดอายุ', fromStock: true },
  { value: 'refused', label: 'ผู้ป่วยปฏิเสธ', fromStock: false },
  { value: 'contaminated', label: 'ปนเปื้อน', fromStock: true },
  { value: 'count_reconcile', label: 'ปรับจากการนับ', fromStock: true },
  { value: 'other', label: 'อื่น ๆ', fromStock: false },
];
export const wasteReason = (value: WasteReason) => WASTE_REASONS.find(r => r.value === value)!;

export const INVESTIGATION: Record<InvestigationStatus, { label: string; cls: string }> = {
  none: { label: 'ตรงกัน', cls: 'ok' },
  open: { label: 'สอบสวนอยู่', cls: 'danger' },
  resolved: { label: 'สรุปผลแล้ว', cls: 'ok' },
  escalated: { label: 'ส่งต่อแล้ว', cls: 'warn' },
};

export const RECALL_STATUS: Record<RecallStatus, { label: string; cls: string }> = {
  open: { label: 'เปิด', cls: 'danger' },
  'in-progress': { label: 'กำลังดำเนินการ', cls: 'warn' },
  contained: { label: 'ควบคุมได้แล้ว', cls: 'info' },
  closed: { label: 'ปิดแล้ว', cls: 'quiet' },
};
export const RECALL_SEVERITY: Record<NonNullable<Recall['severity']>, string> = {
  'class-1': 'Class I · อาจเป็นอันตรายร้ายแรง',
  'class-2': 'Class II · อาจทำให้เกิดผลไม่พึงประสงค์ชั่วคราว',
  'class-3': 'Class III · ไม่น่าเป็นอันตราย',
};
/** The next state a recall can go to; closed is the end */
export const RECALL_NEXT: Record<RecallStatus, RecallStatus[]> = {
  open: ['in-progress', 'contained', 'closed'],
  'in-progress': ['contained', 'closed'],
  contained: ['closed'],
  closed: [],
};

/** A note that will stand as evidence */
export const NOTE_MIN = 10;
/** Who can witness: the clinicians on duty, never the person acting */
export const witnessesFor = (actor: string) => [...VETS, ...NURSES].filter(name => name !== actor);

/* Dates: a batch's expiry is a month ("06/2027"); it is good to the month's last day */

export function expiryDate(exp: string): string | null {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(exp.trim());
  if (!m) {
    return null;
  }
  const last = new Date(Date.UTC(Number(m[2]), Number(m[1]), 0));
  return last.toISOString().slice(0, 10);
}

export function daysLeft(exp: string, today = TODAY): number | null {
  const date = expiryDate(exp);
  return date ? Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000) : null;
}

export function expiryBucket(days: number | null): ExpiryBucket {
  if (days === null) {
    return 'ok';
  }
  return days < 0 ? 'expired' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'ok';
}

/** "2027-06" from a month input → "06/2027" */
export const monthToExpiry = (month: string) => (/^\d{4}-\d{2}$/.test(month) ? `${month.slice(5, 7)}/${month.slice(0, 4)}` : month);

/* Stock: each drug of the registry with the clinic's batches of it */

export interface LotRow {
  drug: string;
  lot: string;
  expiry: string;
  days: number | null;
  bucket: ExpiryBucket;
  qty: number | null;
  unit: string;
  location: string;
  state: LotState;
  /** The recall that names the lot, when one does */
  recall?: Recall;
  batch: Batch;
}

export interface StockItem {
  drug: DrugRecord;
  lots: LotRow[];
  /** What is on hand across the lots; null when the sample does not know it */
  onHand: number | null;
  isLow: boolean;
  /** Where the formulary keeps it */
  location: string;
  nearest: LotRow | null;
  controlled: boolean;
}

export function lotRow(clinic: ClinicData, bo: BackofficeData, drug: string, batch: Batch, unit: string): LotRow {
  const days = daysLeft(batch[1]);
  const qty = amount(batch[2]);
  const recall = bo.recalls.find(r => r.lot === batch[0] && r.status !== 'closed');
  const state: LotState = recall ? 'recalled' : clinic.holds?.[batch[0]] ? 'quarantined' : days !== null && days < 0 ? 'expired' : 'active';
  return { drug, lot: batch[0], expiry: batch[1], days, bucket: expiryBucket(days), qty: qty?.n ?? null, unit: qty?.unit || unit, location: batch[3], state, recall, batch };
}

export function stockItems(clinic: ClinicData, bo: BackofficeData): StockItem[] {
  return bo.drugs.map(drug => {
    const lots = shelfOf(clinic, drug.name).map(b => lotRow(clinic, bo, drug.name, b, drug.unit));
    const known = lots.filter(l => l.qty !== null);
    const onHand = known.length ? Math.round(known.reduce((s, l) => s + (l.qty ?? 0), 0) * 100) / 100 : null;
    const nearest = lots.filter(l => l.days !== null && (l.qty ?? 0) > 0).sort((a, b) => a.days! - b.days!)[0] ?? null;
    return {
      drug, lots, onHand, isLow: onHand !== null && onHand <= drug.reorderThreshold,
      location: FORMULARY.find(d => d.name === drug.name)?.stock ?? lots[0]?.location ?? '—', nearest, controlled: drug.classSystem !== 'none',
    };
  });
}

export const itemOf = (clinic: ClinicData, bo: BackofficeData, id: string) => stockItems(clinic, bo).find(i => i.drug.id === id || i.drug.name === id);

export function stockList(items: StockItem[], f: { q?: string; lowOnly?: boolean; location?: string; controlledOnly?: boolean }): StockItem[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return items.filter(i => (!f.lowOnly || i.isLow) && (!f.location || i.location === f.location) && (!f.controlledOnly || i.controlled)
    && (!q || `${i.drug.id} ${i.drug.name}`.toLowerCase().includes(q)));
}

export const locationsOf = (items: StockItem[]) => [...new Set(items.map(i => i.location))].sort();

/** Every lot on every shelf, the soonest to expire first */
export function allLots(items: StockItem[], f: { bucket?: ExpiryBucket | ''; q?: string; withStock?: boolean } = {}): LotRow[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return items.flatMap(i => i.lots)
    .filter(l => (!f.bucket || l.bucket === f.bucket) && (!f.withStock || (l.qty ?? 0) > 0) && (!q || `${l.drug} ${l.lot}`.toLowerCase().includes(q)))
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || a.drug.localeCompare(b.drug));
}

export function expiryCounts(items: StockItem[]): Record<ExpiryBucket, number> {
  const counts: Record<ExpiryBucket, number> = { expired: 0, d30: 0, d60: 0, d90: 0, ok: 0 };
  allLots(items, { withStock: true }).forEach(l => counts[l.bucket]++);
  return counts;
}

/* Receipts: a lot into a drug's shelf; the clinic sees it at once */

export interface ReceiptInput { drug: string; lot: string; expiry: string; qty: number; location: string; sourceRef?: string; note?: string }

/** What is wrong with a receipt, by field; empty when it can be posted */
export function receiptProblems(clinic: ClinicData, bo: BackofficeData, input: ReceiptInput): Partial<Record<keyof ReceiptInput, string>> {
  const problems: Partial<Record<keyof ReceiptInput, string>> = {};
  if (!bo.drugs.some(d => d.name === input.drug)) {
    problems.drug = 'เลือกรายการยาจากทะเบียน';
  }
  if (!input.lot.trim()) {
    problems.lot = 'ต้องระบุ Lot';
  } else if (shelfOf(clinic, input.drug).some(b => b[0] === input.lot.trim())) {
    problems.lot = 'Lot นี้มีอยู่ในคลังแล้ว — รับซ้ำไม่ได้';
  }
  const days = daysLeft(input.expiry);
  if (!expiryDate(input.expiry)) {
    problems.expiry = 'ต้องระบุวันหมดอายุ';
  } else if (days !== null && days < 0) {
    problems.expiry = 'วันหมดอายุต้องไม่ใช่อดีต';
  }
  if (!(input.qty > 0)) {
    problems.qty = 'จำนวนรับต้องมากกว่า 0';
  }
  if (!input.location.trim()) {
    problems.location = 'ต้องระบุตำแหน่งจัดเก็บ';
  }
  return problems;
}

export const nextSeq = (taken: string[], prefix: string) =>
  `${prefix}${String(Math.max(0, ...taken.filter(x => x.startsWith(prefix)).map(x => Number(x.slice(prefix.length)) || 0)) + 1).padStart(3, '0')}`;

export function receive(clinic: ClinicData, bo: BackofficeData, input: ReceiptInput, by: string, at = `${TODAY} ${NOW}`): StockReceipt {
  const drug = bo.drugs.find(d => d.name === input.drug)!;
  const batch: Batch = [input.lot.trim(), input.expiry, `${input.qty} ${drug.unit}`, input.location.trim()];
  addBatch(clinic, drug.name, batch);
  const receipt: StockReceipt = {
    id: nextSeq(bo.receipts.map(r => r.id), 'RC-2609-'), drug: drug.name, lot: batch[0], expiry: batch[1], qty: input.qty, unit: drug.unit, location: batch[3],
    sourceRef: input.sourceRef?.trim() || undefined, note: input.note?.trim() || undefined, by, at,
  };
  bo.receipts.unshift(receipt);
  return receipt;
}


/* Dispenses: what the pharmacy prepared for prescriptions, and what the ledger drew for controlled drugs */

export interface DispenseRow {
  id: string;
  at: string;
  drug: string;
  /** What was drawn, as written */
  qty: string;
  /** What reached the patient so far, for a ward prescription given dose by dose */
  administered?: string;
  by: string;
  witness?: string;
  patient: string;
  pet: string;
  owner: string;
  order?: string;
  encounter?: string;
  lot?: string;
  source: 'pharmacy' | 'ward' | 'ledger';
  /** The waste recorded against it */
  waste?: WasteRecord;
}

const dateOf = (date: string, time?: string) => (time ? (time.length > 5 ? time : `${date} ${time}`) : date);

export function dispenseRows(clinic: ClinicData, bo: BackofficeData): DispenseRow[] {
  const fromRx: DispenseRow[] = clinic.prescriptions.filter(rx => rx.preparedAt).map(rx => {
    const given = (rx.doses ?? []).filter(d => d.outcome === 'given').length;
    const dose = amount(rx.dose);
    return {
      id: rx.id, at: dateOf(rx.history[rx.history.length - 1]?.[0]?.slice(0, 10) || TODAY, rx.preparedAt), drug: rx.drug, qty: rx.qty,
      administered: rx.inpatient ? (dose ? `${Math.round(given * dose.n * 100) / 100} ${dose.unit}` : `${given} โดส`) : undefined,
      by: rx.preparedBy ?? '—', witness: rx.witness, patient: `${rx.pet} · ${rx.owner}`, pet: rx.pet, owner: rx.owner, order: rx.code, lot: rx.batch,
      source: rx.inpatient ? 'ward' : 'pharmacy',
    };
  });
  const fromLedger: DispenseRow[] = bo.ledgerDispenses.map(d => ({
    id: d.id, at: d.at, drug: d.drug, qty: `${d.qty} ${d.unit}`, by: d.by, witness: d.witness, patient: d.patient, pet: d.patient.split(' · ')[0], owner: d.patient.split(' · ')[1] ?? '',
    order: d.order, encounter: d.encounter, lot: d.lot, source: 'ledger', waste: bo.wastes.find(w => w.dispenseId === d.id),
  }));
  return [...fromRx, ...fromLedger].sort((a, b) => b.at.localeCompare(a.at));
}

/** The pets and the drugs a dispense history can be asked for; it is never asked for everything */
export function dispenseScopes(clinic: ClinicData, bo: BackofficeData): { patients: string[]; drugs: string[] } {
  const rows = dispenseRows(clinic, bo);
  return { patients: [...new Set(rows.map(r => r.patient))].sort(), drugs: [...new Set(rows.map(r => r.drug))].sort() };
}

export function dispenseHistory(clinic: ClinicData, bo: BackofficeData, scope: { patient?: string; drug?: string; from?: string; to?: string }): DispenseRow[] {
  if (!scope.patient && !scope.drug) {
    return [];
  }
  return dispenseRows(clinic, bo).filter(r => (!scope.patient || r.patient === scope.patient) && (!scope.drug || r.drug === scope.drug)
    && (!scope.from || r.at.slice(0, 10) >= scope.from) && (!scope.to || r.at.slice(0, 10) <= scope.to));
}

/* Movements of one drug: in by receipt, out by dispense and waste, checked by count */

export interface Movement {
  at: string;
  kind: 'receipt' | 'dispense' | 'waste' | 'count';
  lot?: string;
  /** Signed quantity; a count carries its discrepancy */
  qty: number | null;
  unit: string;
  location?: string;
  ref: string;
  by: string;
  link?: string;
}
export const MOVEMENT_KIND: Record<Movement['kind'], { label: string; cls: string }> = {
  receipt: { label: 'รับเข้า', cls: 'ok' },
  dispense: { label: 'จ่ายยา', cls: 'info' },
  waste: { label: 'ยาเสีย', cls: 'warn' },
  count: { label: 'นับสต็อก', cls: 'quiet' },
};

export function movementsOf(clinic: ClinicData, bo: BackofficeData, drug: string): Movement[] {
  const unit = bo.drugs.find(d => d.name === drug)?.unit ?? '';
  const receipts: Movement[] = bo.receipts.filter(r => r.drug === drug).map(r => ({ at: r.at, kind: 'receipt', lot: r.lot, qty: r.qty, unit: r.unit, location: r.location, ref: `${r.id}${r.sourceRef ? ` · ${r.sourceRef}` : ''}`, by: r.by, link: '/backoffice/inventory/receipts' }));
  const dispenses: Movement[] = dispenseRows(clinic, bo).filter(r => r.drug === drug).map(r => {
    const q = amount(r.qty);
    return { at: r.at, kind: 'dispense', lot: r.lot, qty: q ? -q.n : null, unit: q?.unit ?? unit, ref: `${r.order ?? r.id} · ${r.patient}`, by: r.by, link: `/backoffice/inventory/dispenses?drug=${encodeURIComponent(drug)}` };
  });
  const wastes: Movement[] = bo.wastes.filter(w => w.drug === drug).map(w => ({ at: w.at, kind: 'waste', lot: w.lot, qty: wasteReason(w.reason).fromStock ? -w.qty : null, unit: w.unit, ref: `${w.id} · ${wasteReason(w.reason).label}${wasteReason(w.reason).fromStock ? '' : ` · ${w.qty} ${w.unit} ไม่ตัดจากคลัง`}`, by: w.by, link: '/backoffice/inventory/controlled' }));
  const counts: Movement[] = bo.counts.filter(c => c.drug === drug).map(c => ({ at: c.at, kind: 'count', qty: c.discrepancy, unit: c.unit, ref: `${c.id} · ${INVESTIGATION[c.investigation].label}`, by: c.by, link: '/backoffice/inventory/controlled' }));
  return [...receipts, ...dispenses, ...wastes, ...counts].sort((a, b) => b.at.localeCompare(a.at));
}

/* The controlled-drug ledger: dispense, waste and count, each append-only, with the witness the rule asks for */

export const controlledItems = (items: StockItem[]) => items.filter(i => i.controlled);

export interface LedgerDispenseInput { drug: string; patient: string; encounter?: string; order?: string; qty: number; witness?: string }

export function ledgerProblems(bo: BackofficeData, input: LedgerDispenseInput, actor: string, onHand: number | null): Partial<Record<keyof LedgerDispenseInput, string>> {
  const problems: Partial<Record<keyof LedgerDispenseInput, string>> = {};
  const drug = bo.drugs.find(d => d.name === input.drug);
  if (!drug) {
    problems.drug = 'เลือกรายการยา';
  }
  if (!input.patient.trim()) {
    problems.patient = 'ต้องระบุผู้ป่วย';
  }
  if (!(input.qty > 0)) {
    problems.qty = 'จำนวนต้องมากกว่า 0';
  } else if (onHand !== null && input.qty > onHand) {
    problems.qty = 'เกินจำนวนคงเหลือ';
  }
  if (drug?.requiresWitnessDispense && !input.witness) {
    problems.witness = 'ยานี้ต้องมีพยานตอนเบิก';
  } else if (input.witness && input.witness === actor) {
    problems.witness = 'พยานต้องไม่ใช่ผู้ทำรายการ';
  }
  return problems;
}

/** Takes the quantity from the lots first to expire, as the pharmacy does; returns the lot it came from */
function takeFromShelf(clinic: ClinicData, drug: string, qty: number): string | undefined {
  const lots = shelfOf(clinic, drug).filter(b => !clinic.holds?.[b[0]] && (amount(b[2])?.n ?? 0) > 0).sort((a, b) => expiryMonths(a[1]) - expiryMonths(b[1]));
  let left = qty;
  let first: string | undefined;
  for (const b of lots) {
    if (left <= 0) {
      break;
    }
    const have = amount(b[2])!;
    const take = Math.min(have.n, left);
    b[2] = `${Math.round((have.n - take) * 100) / 100} ${have.unit}`;
    left -= take;
    first ??= b[0];
  }
  return first;
}

export function ledgerDispense(clinic: ClinicData, bo: BackofficeData, input: LedgerDispenseInput, by: string, at = `${TODAY} ${NOW}`): LedgerDispense {
  const drug = bo.drugs.find(d => d.name === input.drug)!;
  const lot = takeFromShelf(clinic, drug.name, input.qty);
  const record: LedgerDispense = {
    id: nextSeq(bo.ledgerDispenses.map(d => d.id), 'LD-2609-'), drug: drug.name, lot, qty: input.qty, unit: drug.unit, patient: input.patient.trim(),
    encounter: input.encounter?.trim() || undefined, order: input.order?.trim() || undefined, by, witness: input.witness || undefined, at,
  };
  bo.ledgerDispenses.unshift(record);
  return record;
}

export interface WasteInput { drug: string; qty: number; reason: WasteReason; detail: string; witness: string; dispenseId?: string }

export function wasteProblems(input: WasteInput, actor: string): Partial<Record<keyof WasteInput, string>> {
  const problems: Partial<Record<keyof WasteInput, string>> = {};
  if (!input.drug) {
    problems.drug = 'เลือกรายการยา';
  }
  if (!(input.qty > 0)) {
    problems.qty = 'จำนวนต้องมากกว่า 0';
  }
  if (!WASTE_REASONS.some(r => r.value === input.reason)) {
    problems.reason = 'เลือกเหตุผลจากรายการ';
  }
  if (input.detail.trim().length < NOTE_MIN) {
    problems.detail = 'ต้องระบุคำอธิบายอย่างน้อย 10 ตัวอักษร';
  }
  if (!input.witness) {
    problems.witness = 'ยาเสียต้องมีพยานเสมอ';
  } else if (input.witness === actor) {
    problems.witness = 'พยานต้องไม่ใช่ผู้ทำรายการ';
  }
  return problems;
}

export function recordWaste(clinic: ClinicData, bo: BackofficeData, input: WasteInput, by: string, at = `${TODAY} ${NOW}`): WasteRecord {
  const drug = bo.drugs.find(d => d.name === input.drug)!;
  const lot = wasteReason(input.reason).fromStock ? takeFromShelf(clinic, drug.name, input.qty) : bo.ledgerDispenses.find(d => d.id === input.dispenseId)?.lot;
  const record: WasteRecord = {
    id: nextSeq(bo.wastes.map(w => w.id), 'WS-2609-'), drug: drug.name, lot, qty: input.qty, unit: drug.unit, reason: input.reason, detail: input.detail.trim(), witness: input.witness, by, at,
    dispenseId: input.dispenseId || undefined,
  };
  bo.wastes.unshift(record);
  return record;
}

/** A count: only what was found is given; the expected figure is the stock's own, and a difference opens an investigation */
export function recordCount(clinic: ClinicData, bo: BackofficeData, drugName: string, actual: number, by: string, at = `${TODAY} ${NOW}`): CountRecord {
  const drug = bo.drugs.find(d => d.name === drugName)!;
  const expected = stockItems(clinic, bo).find(i => i.drug.name === drugName)?.onHand ?? 0;
  const discrepancy = Math.round((actual - expected) * 100) / 100;
  const record: CountRecord = {
    id: nextSeq(bo.counts.map(c => c.id), 'CT-2609-'), drug: drug.name, expected, actual, discrepancy, unit: drug.unit, by, at, investigation: discrepancy === 0 ? 'none' : 'open',
  };
  bo.counts.unshift(record);
  drug.lastCountAt = at;
  drug.lastCountBy = by;
  return record;
}

/** Only an open investigation, and never by the person who counted */
export const canResolve = (c: CountRecord, user: string) => c.investigation === 'open' && !c.by.startsWith(user) && !user.startsWith(c.by);

export function resolveInvestigation(c: CountRecord, status: 'resolved' | 'escalated', notes: string, by: string, at = `${TODAY} ${NOW}`) {
  if (c.investigation !== 'open') {
    throw new Error('การสอบสวนนี้สรุปผลไปแล้ว — นับใหม่เพื่อเปิดรอบใหม่');
  }
  c.investigation = status;
  c.resolvedBy = by;
  c.resolvedAt = at;
  c.resolutionNotes = notes.trim();
}

export const openInvestigations = (bo: BackofficeData) => bo.counts.filter(c => c.investigation === 'open');

/* Recall: a lot traced to the shelf and to the patients it reached */

export interface RecallTrace {
  onHand: LotRow[];
  dispensed: DispenseRow[];
  /** The clinic's own dispenses before the ledger kept lots are not traceable: the trace says so instead of claiming it is whole */
  untraced: number;
}

export function traceLot(clinic: ClinicData, bo: BackofficeData, lot: string): RecallTrace {
  const items = stockItems(clinic, bo);
  const onHand = items.flatMap(i => i.lots).filter(l => l.lot === lot);
  const drug = onHand[0]?.drug ?? bo.recalls.find(r => r.lot === lot)?.drug;
  const rows = dispenseRows(clinic, bo).filter(r => r.drug === drug);
  return { onHand, dispensed: rows.filter(r => r.lot === lot), untraced: rows.filter(r => !r.lot).length };
}

export function openRecall(bo: BackofficeData, drug: string, lot: string, reason: string, severity: Recall['severity'], by: string, at = `${TODAY} ${NOW}`): Recall {
  if (bo.recalls.some(r => r.lot === lot && r.status !== 'closed')) {
    throw new Error('lot นี้มีการเรียกคืนที่ยังเปิดอยู่แล้ว');
  }
  const recall: Recall = { id: nextSeq(bo.recalls.map(r => r.id), 'RCL-2609-'), drug, lot, reason: reason.trim(), severity, status: 'open', openedBy: by, openedAt: at, updates: [[at, by, 'open', reason.trim()]] };
  bo.recalls.unshift(recall);
  return recall;
}

export function updateRecall(recall: Recall, status: RecallStatus, note: string, by: string, at = `${TODAY} ${NOW}`) {
  if (!RECALL_NEXT[recall.status].includes(status)) {
    throw new Error('เปลี่ยนสถานะย้อนกลับไม่ได้');
  }
  recall.status = status;
  recall.updates.push([at, by, status, note.trim()]);
}

/** The lot held back on every shelf: the clinic will not dispense from it; nothing is taken away */
export function quarantine(clinic: ClinicData, lot: string, reason: string) {
  (clinic.holds ??= {})[lot] = reason;
}

/* The overview: the risks across the stock, each counted from the same rows its page shows */

export function inventoryOverview(clinic: ClinicData, bo: BackofficeData) {
  const items = stockItems(clinic, bo);
  const expiry = expiryCounts(items);
  const today = dispenseRows(clinic, bo).filter(r => r.at.startsWith(TODAY));
  return {
    items: items.length, low: items.filter(i => i.isLow).length, expiry, expiring: expiry.d30 + expiry.d60 + expiry.d90,
    investigations: openInvestigations(bo).length, recalls: bo.recalls.filter(r => r.status !== 'closed').length,
    dispensedToday: today.length, receiptsToday: bo.receipts.filter(r => r.at.startsWith(TODAY)).length,
    lowItems: items.filter(i => i.isLow).sort((a, b) => (a.onHand ?? 0) / a.drug.reorderThreshold - (b.onHand ?? 0) / b.drug.reorderThreshold),
    expiringLots: allLots(items, { withStock: true }).filter(l => l.bucket !== 'ok'),
  };
}
