/*
 * The pharmacy's part of a prescription: verify it, prepare it from a batch, then counsel the owner and hand it over
 * (seph1-fe screens/IPDPharmacy.tsx ScreenPharmacy, FrontDesk.tsx ScreenControlledWitness). Text is kept in its
 * source language and translated where it shows.
 */
import { FORMULARY, NURSES, TODAY, VETS } from './model';
import type { Batch, ClinicData, Patient, Prescription } from './types';

/** The steps of a prescription on the dispense board, and what moves it on */
export const RX_STEPS = ['Verify', 'Prepare', 'Counsel', 'Dispensed'] as const;
export const RX_ACTION: Record<string, string | undefined> = {
  Verify: 'ตรวจสอบใบสั่งยา',
  Prepare: 'จัดยา',
  Counsel: 'ให้คำแนะนำและส่งมอบ',
};
/** An inpatient prescription skips the counter: the pharmacy prepares it and sends it to the ward (clinic.store prepareRx) */

/** What the pharmacist confirms before a prescription goes to be prepared: the five rights and the allergy history */
export const VERIFY_CHECKS = [
  { name: 'patient', label: 'ผู้ป่วยถูกตัว — ชื่อ HN และเจ้าของตรงกับใบสั่งยา' },
  { name: 'drug', label: 'ยาและความแรงถูกต้อง' },
  { name: 'dose', label: 'ขนาดยาเหมาะกับชนิดและน้ำหนักของสัตว์' },
  { name: 'route', label: 'วิธีให้ ความถี่ และระยะเวลาถูกต้อง' },
  { name: 'allergy', label: 'ทบทวนประวัติแพ้ยาและข้อควรระวังแล้ว' },
];

/** Drugs under the narcotics law (opioids): preparing one needs a second person as witness */
export function isControlled(drug: string): boolean {
  return FORMULARY.some(d => d.cls === 'opioid' && d.name === drug) || /^tramadol\b/i.test(drug);
}

/** Who can witness a controlled drug: the clinicians on duty, not the person preparing it */
export const witnessesFor = (preparer: string) => [...VETS, ...NURSES].filter(name => name !== preparer);

/** "10 เม็ด" → 10 and "เม็ด"; null when it does not start with a number */
export function amount(text: string): { n: number; unit: string } | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(.*)$/.exec(text);
  return m ? { n: Number(m[1]), unit: m[2].trim() } : null;
}

/** A batch's expiry "06/2027" as a month count; batches without one sort last */
export const expiryMonths = (exp: string) => {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(exp.trim());
  return m ? Number(m[2]) * 12 + Number(m[1]) : Number.MAX_SAFE_INTEGER;
};
const THIS_MONTH = Number(TODAY.slice(0, 4)) * 12 + Number(TODAY.slice(5, 7));

/** Expired: its month has passed */
export const isExpired = (batch: Batch) => expiryMonths(batch[1]) < THIS_MONTH;

/** Why a batch cannot fill this prescription, or null when it can; `holds` are the lots a recall keeps back (ClinicData.holds) */
export function batchProblem(rx: Prescription, batch: Batch, holds?: Record<string, string>): string | null {
  if (holds?.[batch[0]]) {
    return 'lot นี้ถูกกันไว้ — ห้ามจ่าย';
  }
  if (isExpired(batch)) {
    return 'batch นี้หมดอายุแล้ว — ห้ามจ่าย';
  }
  const need = amount(rx.qty);
  const have = amount(batch[2]);
  if (need && have && need.unit === have.unit && have.n < need.n) {
    return 'batch นี้เหลือไม่พอสำหรับจำนวนที่สั่ง';
  }
  return null;
}

/** First expiry, first out: the batch to take unless the pharmacist picks another */
export function fefo(rx: Prescription, holds?: Record<string, string>): Batch | undefined {
  return rx.stock.filter(b => !batchProblem(rx, b, holds)).sort((a, b) => expiryMonths(a[1]) - expiryMonths(b[1]))[0];
}

/** Takes the prescription's quantity out of a batch, when both count in the same unit */
export function takeFrom(batch: Batch, qty: string) {
  const need = amount(qty);
  const have = amount(batch[2]);
  if (need && have && need.unit === have.unit) {
    batch[2] = `${Math.max(0, have.n - need.n)} ${have.unit}`;
  }
}

/**
 * The shelf a new prescription is filled from: the batches another prescription of the same drug already shows (the
 * same batches, so taking from one shows on both), or one batch of the formulary's shelf when there is none
 */
export function stockFor(data: ClinicData, drug: string): Batch[] {
  const known = shelfOf(data, drug);
  if (known.length) {
    return known;
  }
  const shelf = FORMULARY.find(d => d.name === drug)?.stock ?? '—';
  return [[`${drug.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-2508-01`, '08/2027', '—', shelf]];
}

/**
 * The batches of a drug on the shelf, the very arrays the prescriptions and the shelf hold, so what one takes the
 * others see: a prescription's batches when one shows them, else the pharmacy's own shelf, else none
 */
export function shelfOf(data: ClinicData, drug: string): Batch[] {
  return data.prescriptions.find(rx => rx.drug === drug && rx.stock.length)?.stock ?? data.shelf?.[drug] ?? [];
}

/** A batch received into the shelf of a drug: onto the batches it already shows, or as the first on its own shelf */
export function addBatch(data: ClinicData, drug: string, batch: Batch) {
  const known = shelfOf(data, drug);
  if (known.length) {
    known.push(batch);
  } else {
    (data.shelf ??= {})[drug] = [batch];
  }
}

/** The prescriptions of a pet the pharmacy still has to hand over (not verbal orders waiting for a co-signature) */
export const openPrescriptions = (data: ClinicData, p: Patient) =>
  data.prescriptions.filter(rx => rx.pet === p.pet && rx.owner === data.owners[p.ownerKey]?.name && !rx.verbal && rx.col !== 'Dispensed');

/** The dispense step of the pet's hand-off: done once everything prescribed today is handed over */
export function syncDispense(data: ClinicData, p: Patient, at: string) {
  const open = openPrescriptions(data, p);
  const any = data.prescriptions.some(rx => rx.pet === p.pet && !rx.verbal);
  if (!any) {
    return;
  }
  p.handoff.dispense = open.length
    ? { state: 'active', note: open.some(rx => rx.col === 'Verify') ? 'รอตรวจสอบใบสั่งยา' : 'กำลังจัดยา' }
    : { state: 'done', note: `จ่ายยาแล้ว ${at}` };
}
