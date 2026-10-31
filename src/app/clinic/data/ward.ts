/*
 * The pets kept in hospital: the beds they lie in, the treatment sheet the nurses work from (each dose of each drug
 * against its time, the drips that run at a rate, the observations due), the orders a vet gives by word of mouth, and
 * leaving the ward (seph1-fe screens/WardMARQueue.tsx ScreenWardBedMap, ScreenMAR, LiveMARBoard, LiveInfusionPanel;
 * VerbalOrders.tsx; seph1-docs M09 MAR). Text is kept in its source language and translated where it shows.
 */
import { advanceStage, NOW, nextSeq, TODAY, toMin } from './model';
import type { Admission, ClinicData, DoseOutcome, Infusion, MarDose, Patient, Prescription, VitalSigns } from './types';

/* ---- Beds ---- */

/** The wards and their beds; a bed costs so much a day */
export const WARDS: { name: string; beds: string[]; rate: number }[] = [
  { name: 'ICU', beds: ['I-01', 'I-02', 'I-03', 'I-04'], rate: 1500 },
  { name: 'Dog ward', beds: ['D-01', 'D-02', 'D-03', 'D-04', 'D-05', 'D-06'], rate: 600 },
  { name: 'Cat ward', beds: ['C-01', 'C-02', 'C-03', 'C-04'], rate: 600 },
  { name: 'Isolation', beds: ['ISO-01', 'ISO-02'], rate: 900 },
];
export const wardOf = (bed: string) => WARDS.find(w => w.beds.includes(bed));

/** The pets in a bed now */
export const inpatients = (data: ClinicData): Patient[] => data.patients.filter(p => p.admission && !p.admission.out);
export const inWard = (p: Patient): boolean => !!p.admission && !p.admission.out;

export type BedState = { bed: string; state: 'free' } | { bed: string; state: 'cleaning' } | { bed: string; state: 'taken'; patient: Patient };
/** Every bed of a ward: who is in it, or that it waits to be cleaned, or that it is free */
export function bedsOf(data: ClinicData, ward: (typeof WARDS)[number]): BedState[] {
  const taken = new Map(inpatients(data).map(p => [p.admission!.bed, p]));
  return ward.beds.map(bed => {
    const patient = taken.get(bed);
    return patient ? { bed, state: 'taken', patient } : data.cleaning?.includes(bed) ? { bed, state: 'cleaning' } : { bed, state: 'free' };
  });
}
export const freeBeds = (data: ClinicData): string[] => WARDS.flatMap(w => bedsOf(data, w).filter(b => b.state === 'free').map(b => b.bed));

/** The day of the stay the pet is on: the day it came in is day 1 */
export function stayDay(a: Admission): number {
  const from = new Date(a.at.slice(0, 10) + 'T00:00:00').getTime();
  const to = new Date(TODAY + 'T00:00:00').getTime();
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}
/** What the bed has cost so far */
export const bedCharge = (a: Admission): [name: string, amount: number] => {
  const days = stayDay(a);
  return [`ค่าห้องพัก ${wardOf(a.bed)?.name ?? a.bed} ${a.bed} × ${days} วัน`, (wardOf(a.bed)?.rate ?? 0) * days];
};

/** How often the nurses take the obs, in hours */
export const OBS_EVERY = [1, 2, 4, 6, 8, 12];

/** Takes the pet into a bed, under its vet; it moves to treatment, at the bed */
export function admit(p: Patient, bed: string, vet: string, reason: string, obsEvery: number, by: string): Admission {
  p.admission = { bed, at: `${TODAY} ${NOW}`, by, vet, reason, obsEvery, lines: [] };
  advanceStage(p, 'treatment', `${wardOf(bed)?.name ?? 'Ward'} · ${bed}`, by);
  return p.admission;
}

/* ---- The treatment sheet: doses against their times ---- */

/** When a drug given so often is due, over the day */
const SCHEDULE: Record<string, string[]> = {
  'วันละ 1 ครั้ง': ['08:00'], 'วันละ 2 ครั้ง': ['08:00', '20:00'], 'วันละ 3 ครั้ง': ['08:00', '14:00', '20:00'],
  'ทุก 8 ชม.': ['06:00', '14:00', '22:00'], 'ทุก 12 ชม.': ['08:00', '20:00'], 'วันเว้นวัน': ['08:00'],
};
/** The times of a drug on the sheet from when it was ordered: the rest of the day's times, or the first dose now */
export function marTimes(freq: string, from = NOW): string[] {
  const times = (SCHEDULE[freq] ?? []).filter(t => toMin(t) >= toMin(from));
  return times.length ? times : [from];
}

/** A dose is due an hour before its time, and late an hour after it */
export const DUE_WINDOW = 60;
export type SlotState = 'done' | 'held' | 'refused' | 'missed' | 'late' | 'due' | 'upcoming';
export function slotState(rx: Prescription, slot: string, now = NOW): SlotState {
  const dose = rx.doses?.find(d => d.slot === slot);
  if (dose) {
    return dose.outcome === 'given' ? 'done' : dose.outcome;
  }
  const diff = toMin(now) - toMin(slot);
  return diff > DUE_WINDOW ? 'late' : diff >= -DUE_WINDOW ? 'due' : 'upcoming';
}

/** The orders on a pet's treatment sheet: written for the ward, in force (co-signed) and not stopped */
export const marOrders = (data: ClinicData, p: Patient): Prescription[] =>
  data.prescriptions.filter(rx => rx.pet === p.pet && rx.owner === data.owners[p.ownerKey]?.name && rx.inpatient && !rx.stoppedAt && !(rx.verbal && !rx.cosignedBy));

/** A dose may be given once the pharmacy has verified the order */
export const canGive = (rx: Prescription): boolean => rx.col !== 'Verify' && rx.col !== 'Draft';

/** The time columns of a sheet: every time any of its orders is due, in order */
export const sheetTimes = (orders: Prescription[]): string[] =>
  [...new Set(orders.flatMap(rx => rx.marTimes ?? []))].sort((a, b) => toMin(a) - toMin(b));

/** The doses a pet's sheet is waiting on: due or late */
export function dosesWaiting(data: ClinicData, p: Patient, now = NOW): { rx: Prescription; slot: string; state: 'due' | 'late' }[] {
  const out: { rx: Prescription; slot: string; state: 'due' | 'late' }[] = [];
  for (const rx of marOrders(data, p)) {
    for (const slot of rx.marTimes ?? []) {
      const state = slotState(rx, slot, now);
      if (state === 'due' || state === 'late') {
        out.push({ rx, slot, state });
      }
    }
  }
  return out;
}

/** Across the wards: how many doses are due, and how many of them late */
export function wardLoad(data: ClinicData, now = NOW): { due: number; late: number } {
  let due = 0;
  let late = 0;
  for (const p of inpatients(data)) {
    for (const x of dosesWaiting(data, p, now)) {
      if (x.state === 'late') { late++; } else { due++; }
    }
  }
  return { due, late };
}

export const DOSE_OUTCOMES: { value: DoseOutcome; label: string; tone: 'ok' | 'warn' | 'danger' }[] = [
  { value: 'given', label: 'ให้แล้ว', tone: 'ok' },
  { value: 'held', label: 'เลื่อน (held)', tone: 'warn' },
  { value: 'refused', label: 'ปฏิเสธ / อาเจียน', tone: 'danger' },
  { value: 'missed', label: 'พลาด (missed)', tone: 'danger' },
];
export const HOLD_REASONS = ['NPO ก่อนทำหัตถการ', 'อาเจียนหลังให้ยา', 'ไม่ยอมกิน', 'สัตวแพทย์สั่งพักยา', 'อื่น ๆ (ระบุ)'];

/** What the nurse confirms at the cage before a dose: the five rights */
export const FIVE_RIGHTS = [
  { name: 'patient', label: 'ถูกตัว — ป้ายกรงและ HN ตรงกับใบสั่ง' },
  { name: 'drug', label: 'ถูกยา — ชื่อและความแรงตรงกับใบสั่ง' },
  { name: 'dose', label: 'ถูกขนาด' },
  { name: 'route', label: 'ถูกวิธีให้' },
  { name: 'time', label: 'ถูกเวลา — ภายใน ±60 นาทีของเวลาที่กำหนด' },
];

/** Records what became of a dose at its time; a dose not given carries why, a controlled drug its witness */
export function recordDose(rx: Prescription, slot: string, outcome: DoseOutcome, by: string, reason?: string, witness?: string, at = NOW): MarDose {
  const dose: MarDose = { slot, outcome, at, by, reason: reason || undefined, witness: witness || undefined };
  (rx.doses ??= []).push(dose);
  const label = DOSE_OUTCOMES.find(o => o.value === outcome)!.label;
  rx.history.unshift([`${TODAY} ${at}`, `${label} · ${slot} · ${by}${reason ? ` — ${reason}` : ''}${witness ? ` — พยาน ${witness}` : ''}`]);
  return dose;
}

/** Every dose recorded on a pet's sheet, newest first */
export function doseLog(data: ClinicData, p: Patient): { rx: Prescription; dose: MarDose }[] {
  const owner = data.owners[p.ownerKey]?.name;
  return data.prescriptions
    .filter(rx => rx.pet === p.pet && rx.owner === owner && rx.inpatient)
    .flatMap(rx => (rx.doses ?? []).map(dose => ({ rx, dose })))
    .sort((a, b) => toMin(b.dose.at) - toMin(a.dose.at));
}

/** The vet stops an order: it leaves the sheet, and stays in the record with when and why */
export function stopOrder(rx: Prescription, reason: string, by: string) {
  rx.stoppedAt = `${TODAY} ${NOW}`;
  rx.stoppedBy = by;
  rx.history.unshift([`${TODAY} ${NOW}`, `หยุดยา · ${reason} · ${by}`]);
}

/* ---- Drips ---- */

export const FLUIDS = ['LRS', 'NaCl 0.9%', 'Dextrose 5% in water', 'LRS + KCl 20 mEq/L', 'Hetastarch 6%'];

/** Maintenance: 50 mL/kg a day, spread over the day */
export const maintenanceRate = (kg: number): number => Math.max(1, Math.round((50 * kg) / 24));

export function startInfusion(a: Admission, fluid: string, rate: number, by: string, at = NOW): Infusion {
  const line: Infusion = { id: nextSeq(a.lines.map(l => l.id), 'L'), fluid, route: 'IV', rate, status: 'running', events: [[at, 'start', rate, by]] };
  a.lines.push(line);
  return line;
}

/** A change to a line: the rate, a pause, going on again, or the end */
export function infusionEvent(line: Infusion, kind: 'rate' | 'pause' | 'resume' | 'stop', by: string, rate?: number, at = NOW) {
  if (line.status === 'stopped') {
    return;
  }
  const next = kind === 'pause' || kind === 'stop' ? 0 : rate ?? line.rate;
  line.events.push([at, kind, next, by]);
  if (kind !== 'pause' && kind !== 'stop') {
    line.rate = next;
  }
  line.status = kind === 'pause' ? 'paused' : kind === 'stop' ? 'stopped' : 'running';
}

/** How much a line has given: each rate for as long as it ran, up to now */
export function infusedTotal(line: Infusion, now = NOW): number {
  let total = 0;
  line.events.forEach((e, i) => {
    const until = line.events[i + 1]?.[0] ?? now;
    total += (e[2] * Math.max(0, toMin(until) - toMin(e[0]))) / 60;
  });
  return Math.round(total);
}

export const INFUSION_STATUS: Record<Infusion['status'], { label: string; cls: string }> = {
  running: { label: 'กำลังให้', cls: 'ok' },
  paused: { label: 'พักอยู่', cls: 'warn' },
  stopped: { label: 'หยุดแล้ว', cls: 'neutral' },
};
export const liveLines = (a: Admission): Infusion[] => a.lines.filter(l => l.status !== 'stopped');

/* ---- Observations ---- */

/** When the next obs are due, from the last set taken since the pet came in: late when that time has passed */
export function nextObs(p: Patient, now = NOW): { at: string; late: boolean } | null {
  const a = p.admission;
  if (!a || a.out) {
    return null;
  }
  const last = p.vitals?.filter(v => v.at >= a.at).pop()?.at ?? a.at;
  const lastMin = toMin(last.slice(-5)) + (last.startsWith(TODAY) ? 0 : -24 * 60);
  const due = lastMin + a.obsEvery * 60;
  const h = ((Math.floor(due / 60) % 24) + 24) % 24;
  return { at: `${String(h).padStart(2, '0')}:${String(((due % 60) + 60) % 60).padStart(2, '0')}`, late: due < toMin(now) };
}

/** A set of obs taken on the ward */
export function takeObs(p: Patient, obs: Pick<VitalSigns, 'temp' | 'hr' | 'rr' | 'pain'>, by: string): VitalSigns {
  const v: VitalSigns = { at: `${TODAY} ${NOW}`, weight: p.weight.replace(/\s*kg$/, ''), ...obs, by };
  (p.vitals ??= []).push(v);
  return v;
}

/* ---- Verbal orders ---- */

export interface VerbalOrderInput { drug: string; dose: string; route: string; freq: string; days: string; vet: string; readBack: boolean }

/**
 * An order a vet gave by word of mouth, written down by the nurse who took it: a draft that does nothing until the vet
 * co-signs it. For a pet in a bed it goes on the treatment sheet; it takes the drug's batches as a prescription does.
 */
export function verbalOrder(data: ClinicData, p: Patient, input: VerbalOrderInput, nurse: string, stock: Prescription['stock']): Prescription {
  const rx: Prescription = {
    id: nextSeq(data.prescriptions.map(x => x.id), 'X'), col: 'Draft', state: 'Draft', verbal: true, orderedAt: NOW, orderedBy: input.vet,
    code: nextSeq(data.prescriptions.map(x => x.code), 'RX-260924-'), pet: p.pet, owner: data.owners[p.ownerKey].name, by: nurse,
    drug: input.drug, dose: input.dose, route: input.route, freq: input.freq, days: input.days, qty: '—', advice: '',
    stock, history: [[`${TODAY} ${NOW}`, `คำสั่งวาจาจาก ${input.vet} · รับไว้โดย ${nurse}${input.readBack ? ' · ทวนคำสั่งแล้ว' : ''}`]],
    inpatient: inWard(p) || undefined, marTimes: inWard(p) ? marTimes(input.freq) : undefined,
  };
  data.prescriptions.push(rx);
  return rx;
}

/** A verbal order has to be co-signed within the day; past two hours it is called out */
export const COSIGN_LONG_WAIT = 120;

/* ---- Leaving the ward ---- */

export interface WardCheck { label: string; ok: boolean }
/** What has to be settled before a pet leaves its bed */
export function wardChecks(data: ClinicData, p: Patient): WardCheck[] {
  const a = p.admission!;
  const waiting = dosesWaiting(data, p);
  const lines = liveLines(a).length;
  return [
    { label: lines ? `สายน้ำเกลือยังให้อยู่ ${lines} สาย — หยุดก่อน` : 'หยุดสายน้ำเกลือครบแล้ว', ok: !lines },
    { label: waiting.length ? `ยาที่ถึงเวลาให้แต่ยังไม่บันทึก ${waiting.length} ครั้ง` : 'บันทึกยาที่ถึงเวลาครบแล้ว', ok: !waiting.length },
    { label: 'ไม่มีคำสั่งวาจาที่รอเซ็นกำกับ', ok: !data.prescriptions.some(rx => rx.pet === p.pet && rx.verbal && !rx.cosignedBy) },
  ];
}

/** The pet leaves its bed for the discharge desk; the ward's orders end, and the bed waits to be cleaned */
export function leaveWard(data: ClinicData, p: Patient, by: string) {
  const a = p.admission!;
  a.out = { at: `${TODAY} ${NOW}`, by };
  for (const rx of marOrders(data, p)) {
    rx.stoppedAt = `${TODAY} ${NOW}`;
    rx.stoppedBy = by;
    rx.history.unshift([`${TODAY} ${NOW}`, `สิ้นสุดเมื่อออกจากวอร์ด · ${by}`]);
  }
  (data.cleaning ??= []).push(a.bed);
  advanceStage(p, 'discharge', 'Discharge desk', by);
}

export function bedCleaned(data: ClinicData, bed: string) {
  data.cleaning = (data.cleaning ?? []).filter(b => b !== bed);
}

/** The pet's stay, in a line: "ICU · I-02 · วันที่ 1 · สพ.ญ. ลลิตา" */
export const stayLine = (a: Admission) => `${wardOf(a.bed)?.name ?? ''} · ${a.bed} · วันที่ ${stayDay(a)} · ${a.vet}`;
