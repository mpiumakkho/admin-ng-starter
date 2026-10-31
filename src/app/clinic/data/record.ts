/*
 * Keeping the record right after the fact: how far each step of the note is filled in, vital signs over time,
 * vaccinations with their next due date, and what an addendum, an edited problem or a withdrawn alert leaves behind
 * (seph1-fe Chart.tsx LiveVitalsTrend, LiveProblems, LiveAllergies; Specialty.tsx ScreenVaccineTimeline).
 */
import { addDays, NOW, TODAY } from './model';
import type { ClinicData, EncounterNote, Patient, VitalSigns } from './types';

const has = (...values: string[]) => values.some(v => !!v?.trim());
const all = (...values: string[]) => values.every(v => !!v?.trim());

/** How far a step of the note is filled in: nothing yet, some of it, or what it needs */
export type StepFill = 'empty' | 'partial' | 'done';
export function stepFill(data: ClinicData, p: Patient, n: EncounterNote, step: number): StepFill {
  const grade = (some: boolean, enough: boolean): StepFill => (enough ? 'done' : some ? 'partial' : 'empty');
  switch (step) {
    case 0: return grade(has(n.reason, n.ownerObs), all(n.reason));
    case 1: return grade(has(n.weight, n.temp, n.hr, n.rr, n.mm), all(n.weight, n.temp, n.hr, n.rr));
    case 2: return grade(has(n.chief, n.hpi, n.general, n.msk, n.cardio, n.remark), all(n.chief, n.hpi) && has(n.general, n.msk, n.cardio, n.remark));
    case 3: return grade(has(n.ddx, n.dx, n.plan), all(n.dx, n.plan));
    case 4: {
      const any = data.orders.some(o => o.pet === p.pet && o.time.startsWith(TODAY) && o.col !== 'Cancelled');
      const sent = data.orders.some(o => o.pet === p.pet && o.time.startsWith(TODAY) && !['Cancelled', 'Draft'].includes(o.col));
      return grade(any, sent);
    }
    case 5: return grade(p.meds.length > 0, data.prescriptions.some(rx => rx.pet === p.pet && !rx.verbal));
    default: return grade(has(n.summary, n.home, n.warning, n.restrict), all(n.summary, n.home));
  }
}
export const STEP_FILL_TEXT: Record<StepFill, string> = { empty: 'Not started', partial: 'บันทึกบางส่วน', done: 'Complete' };

/* ---- Vital signs over time ---- */

/** A measurement's number, or null: "108 bpm" → 108 */
export const reading = (value: string | undefined): number | null => {
  const n = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** The vitals taken so far, oldest first, with what the note holds now when it differs from the last */
export function vitalsSeries(p: Patient, n: EncounterNote): VitalSigns[] {
  const log = [...(p.vitals ?? [])];
  const now: VitalSigns = { at: `${TODAY} ${NOW}`, weight: n.weight, temp: n.temp, hr: n.hr, rr: n.rr, pain: n.pain, by: '' };
  const last = log[log.length - 1];
  const differs = !last || (['weight', 'temp', 'hr', 'rr', 'pain'] as const).some(k => reading(last[k]) !== reading(now[k]));
  return differs && has(n.weight, n.temp, n.hr, n.rr) ? [...log, now] : log;
}

/** Normal ranges at rest, by species (dog / cat), to mark a reading out of range */
export const VITAL_RANGE: Record<'temp' | 'hr' | 'rr', Partial<Record<Patient['kind'], [number, number]>>> = {
  temp: { dog: [37.5, 39.2], cat: [37.8, 39.4] },
  hr: { dog: [60, 140], cat: [140, 220] },
  rr: { dog: [10, 30], cat: [20, 30] },
};
export function outOfRange(p: Patient, key: 'temp' | 'hr' | 'rr', value: string): boolean {
  const range = VITAL_RANGE[key][p.kind];
  const v = reading(value);
  return !!range && v !== null && (v < range[0] || v > range[1]);
}

/** A change of weight worth a look: more than 10% from the reading before */
export function weightChange(series: VitalSigns[]): number | null {
  const weights = series.map(v => reading(v.weight)).filter((v): v is number => v !== null);
  if (weights.length < 2) {
    return null;
  }
  const [before, now] = weights.slice(-2);
  return before ? (now - before) / before : null;
}

/* ---- Vaccinations ---- */

export interface VaccineItem { name: string; kinds: Patient['kind'][] }
export const VACCINES: VaccineItem[] = [
  { name: 'DHPP', kinds: ['dog'] }, { name: 'Rabies', kinds: ['dog', 'cat'] }, { name: 'Leptospirosis', kinds: ['dog'] },
  { name: 'Bordetella', kinds: ['dog'] }, { name: 'FVRCP', kinds: ['cat'] }, { name: 'FeLV', kinds: ['cat'] },
];
/** When the next dose falls: a puppy or kitten series, a yearly booster, or a three-year one */
export const BOOSTERS: [label: string, days: number][] = [['3–4 สัปดาห์ (เข็มชุดแรก)', 25], ['1 ปี', 365], ['3 ปี', 1095]];

/** A dose given today: the vaccine's line shows it is current, and when the next one is due */
export function vaccinate(p: Patient, name: string, lot: string, boosterDays: number, by: string) {
  const next = addDays(TODAY, boosterDays);
  const line: Patient['vaccines'][number] = [name, `ฉีดแล้ว ${TODAY} · Lot ${lot} · ครั้งถัดไป ${next}`, 'ok'];
  const i = p.vaccines.findIndex(v => v[0] === name);
  if (i >= 0) {
    p.vaccines[i] = line;
  } else {
    p.vaccines.push(line);
  }
  (p.vaccineLog ??= []).unshift([TODAY, name, lot, next, by]);
}

/* ---- What a change to the record leaves behind ---- */

/** A withdrawn alert is kept, with why and by whom, below the ones in force */
export function withdrawAlert(p: Patient, index: number, reason: string, by: string) {
  const [alert] = p.alerts.splice(index, 1);
  if (alert) {
    (p.withdrawnAlerts ??= []).unshift({ ...alert, withdrawnAt: `${TODAY} ${NOW}`, withdrawnBy: by, withdrawnReason: reason });
  }
}

/** A problem's status as its tone: active, critical or resolved */
export const PROBLEM_STATUS: [label: string, tone: 'warn' | 'danger' | 'ok'][] = [['Active', 'warn'], ['Critical', 'danger'], ['Resolved', 'ok']];

/** The points of a small line of readings, left to right, in a box of w × h with room for the end marker; null for fewer than two */
export function sparkline(values: (number | null)[], w = 64, h = 20, pad = 3): [x: number, y: number, index: number][] | null {
  const known = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== null);
  if (known.length < 2) {
    return null;
  }
  const lo = Math.min(...known.map(k => k[0]));
  const hi = Math.max(...known.map(k => k[0]));
  const span = hi - lo || 1;
  const step = (w - pad * 2) / Math.max(1, values.length - 1);
  return known.map(([v, i]) => [Math.round((pad + i * step) * 10) / 10, Math.round((h - pad - ((v - lo) / span) * (h - pad * 2)) * 10) / 10, i]);
}

/** The columns of the vitals trend, and the ranges that mark a reading */
export const VITAL_COLUMNS: { key: 'weight' | 'temp' | 'hr' | 'rr' | 'pain'; label: string; ranged: boolean }[] = [
  { key: 'weight', label: 'น้ำหนัก (kg)', ranged: false }, { key: 'temp', label: 'อุณหภูมิ (°C)', ranged: true },
  { key: 'hr', label: 'ชีพจร', ranged: true }, { key: 'rr', label: 'การหายใจ', ranged: true }, { key: 'pain', label: 'Pain', ranged: false },
];
