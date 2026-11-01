/*
 * Assets and maintenance (seph1-docs 26-backoffice-erp ux/menus/06-assets-and-maintenance.md,
 * domains/asset-and-maintenance.md; M22 P2, TAHSA-11): the equipment registry and its bed link (M10), preventive
 * maintenance with the 30-day alert, calibration against its frequency, downtime with MTBF/MTTR, service contracts,
 * the critical-equipment board and the decommission workflow. Its costs are operational figures, not the fixed-asset
 * ledger; work orders, spare parts and depreciation are out of scope. Text is kept in its source language and
 * translated where it shows.
 */
import { NOW, TODAY } from '../../clinic/data/model';
import { WARDS } from '../../clinic/data/ward';
import { daysUntil } from './home';
import { nextSeq } from './sales';
import type {
  CalibrationRecord, ContractKind, Criticality, Decommission, Downtime, Equipment, EquipmentClass, PmTask, ServiceContract, BackofficeData,
} from './types';

const at = () => `${TODAY} ${NOW}`;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isAmount = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());
/** A note that will stand as evidence */
const NOTE_MIN = 10;

export function addMonths(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
const ms = (s: string) => new Date(`${s.slice(0, 10)}T${s.slice(11, 16) || '00:00'}:00Z`).getTime();
export const hoursBetween = (a: string, b: string) => (ms(b) - ms(a)) / 3_600_000;

/* ---- The registry ---- */

export const EQUIPMENT_CLASS: Record<EquipmentClass, { label: string; code: string }> = {
  anaesthesia: { label: 'เครื่องดมยาสลบ', code: 'ANES' },
  monitor: { label: 'เครื่องติดตามสัญญาณชีพ', code: 'MON' },
  infusion: { label: 'เครื่องให้สารน้ำ', code: 'INF' },
  oxygen: { label: 'เครื่องผลิตออกซิเจน', code: 'O2' },
  defibrillator: { label: 'เครื่องกระตุกหัวใจ', code: 'DEF' },
  imaging: { label: 'เครื่องภาพวินิจฉัย', code: 'IMG' },
  lab: { label: 'เครื่องตรวจวิเคราะห์', code: 'LAB' },
  sterilisation: { label: 'เครื่องนึ่งฆ่าเชื้อ', code: 'STR' },
  dental: { label: 'เครื่องทันตกรรม', code: 'DEN' },
};
export const CLASSES = Object.keys(EQUIPMENT_CLASS) as EquipmentClass[];
export const CRITICALITY: Record<Criticality, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'danger' },
  high: { label: 'สำคัญ', cls: 'warn' },
  standard: { label: 'ทั่วไป', cls: 'quiet' },
};
export const EQUIPMENT_STATUS: Record<Equipment['status'], { label: string; cls: string }> = {
  'in-service': { label: 'พร้อมใช้งาน', cls: 'ok' },
  down: { label: 'ขัดข้อง', cls: 'danger' },
  decommissioned: { label: 'เลิกใช้แล้ว', cls: 'quiet' },
};
/** Where equipment stands, and the code its number carries */
export const LOCATIONS: Record<string, string> = {
  'ห้องผ่าตัด 1': 'OR1', 'ห้องผ่าตัด 2': 'OR2', ICU: 'ICU', 'Dog ward': 'DW', 'Cat ward': 'CW', Isolation: 'ISO', 'ห้องปฏิบัติการ': 'LAB', 'ห้องเอกซเรย์': 'XR', OPD: 'OPD',
  'ห้องฆ่าเชื้อ': 'CSSD', 'ห้องทันตกรรม': 'DEN',
};
/** The beds a location has, from the ward map (M10) */
export const bedsAt = (location: string) => WARDS.find(w => w.name === location)?.beds ?? [];

export const equipmentOf = (bo: BackofficeData, id: string) => bo.equipment.find(e => e.id === id);
export const active = (bo: BackofficeData) => bo.equipment.filter(e => e.status !== 'decommissioned');

export interface EquipmentInput {
  name: string;
  cls: EquipmentClass;
  maker: string;
  model: string;
  serial: string;
  location: string;
  bed: string;
  criticality: Criticality;
  purchasedAt: string;
  purchaseCost: string;
  pmMonths: string;
  calibrationMonths: string;
}

export function equipmentProblems(bo: BackofficeData, input: EquipmentInput): string[] {
  const out: string[] = [];
  if (input.name.trim().length < 3) {
    out.push('ใส่ชื่ออุปกรณ์');
  }
  if (!input.serial.trim()) {
    out.push('ใส่หมายเลขเครื่อง');
  } else if (bo.equipment.some(e => e.serial === input.serial.trim())) {
    out.push('มีหมายเลขเครื่องนี้ในทะเบียนแล้ว');
  }
  if (!isDate(input.purchasedAt) || input.purchasedAt > TODAY) {
    out.push('ใส่วันที่ซื้อ (ไม่เกินวันนี้)');
  }
  if (!isAmount(input.purchaseCost)) {
    out.push('ใส่ราคาซื้อเป็นตัวเลข');
  }
  const pm = Number(input.pmMonths);
  if (!Number.isInteger(pm) || pm < 1 || pm > 24) {
    out.push('รอบ PM ต้องเป็น 1–24 เดือน');
  }
  if (input.calibrationMonths && !(Number.isInteger(Number(input.calibrationMonths)) && Number(input.calibrationMonths) >= 1 && Number(input.calibrationMonths) <= 36)) {
    out.push('รอบสอบเทียบต้องเป็น 1–36 เดือน');
  }
  if (input.bed) {
    if (!bedsAt(input.location).includes(input.bed)) {
      out.push('เตียงต้องอยู่ในจุดที่ตั้งเดียวกัน');
    } else if (bo.equipment.some(e => e.status !== 'decommissioned' && e.bed === input.bed && e.cls === input.cls)) {
      out.push('เตียงนี้มีอุปกรณ์ชนิดเดียวกันผูกอยู่แล้ว');
    }
  }
  return out;
}

/** A device entered: its number from where it stands and what it is, its first PM planned a cycle from now */
export function addEquipment(bo: BackofficeData, input: EquipmentInput, by: string): Equipment {
  const prefix = `EQ-${LOCATIONS[input.location] ?? 'GEN'}-${EQUIPMENT_CLASS[input.cls].code}-`;
  const n = Math.max(0, ...bo.equipment.filter(e => e.id.startsWith(prefix)).map(e => Number(e.id.slice(prefix.length)) || 0)) + 1;
  const e: Equipment = {
    id: prefix + String(n).padStart(2, '0'), name: input.name.trim(), cls: input.cls, maker: input.maker.trim(), model: input.model.trim(), serial: input.serial.trim(),
    location: input.location, bed: input.bed || undefined, criticality: input.criticality, status: 'in-service', purchasedAt: input.purchasedAt, purchaseCost: Number(input.purchaseCost),
    pmMonths: Number(input.pmMonths), calibrationMonths: input.calibrationMonths ? Number(input.calibrationMonths) : undefined, costs: [],
    history: [[at(), by, 'ขึ้นทะเบียน', `${input.serial.trim()} · ${input.location}${input.bed ? ` · ${input.bed}` : ''}`]],
  };
  bo.equipment.push(e);
  bo.pm.push({ id: nextSeq(bo.pm.map(t => t.id), 'PM-'), equipmentId: e.id, due: addMonths(TODAY, e.pmMonths), status: 'open' });
  return e;
}

export function moveEquipment(e: Equipment, patch: { location: string; bed: string; criticality: Criticality }, by: string) {
  const before = [e.location, e.bed, e.criticality].filter(Boolean).join(' · ');
  e.location = patch.location;
  e.bed = patch.bed || undefined;
  e.criticality = patch.criticality;
  e.history.push([at(), by, 'แก้ไขที่ตั้ง', `${before} → ${[e.location, e.bed, e.criticality].filter(Boolean).join(' · ')}`]);
}

/** What it has cost to keep: the purchase and each service since (an operational figure, not the asset ledger) */
export function costOf(e: Equipment) {
  const upkeep = e.costs.reduce((n, c) => n + c[2], 0);
  return { purchase: e.purchaseCost, upkeep, total: e.purchaseCost + upkeep };
}

/* ---- Preventive maintenance ---- */

/** Where a due date stands: past it, within the 30-day alert, or later */
export type DueState = 'overdue' | 'due30' | 'scheduled';
export const DUE_STATE: Record<DueState, { label: string; cls: string }> = {
  overdue: { label: 'เกินกำหนด', cls: 'danger' },
  due30: { label: 'ภายใน 30 วัน', cls: 'warn' },
  scheduled: { label: 'ตามแผน', cls: 'ok' },
};
export const dueState = (due: string, today = TODAY): DueState => (daysUntil(due, today) < 0 ? 'overdue' : daysUntil(due, today) <= 30 ? 'due30' : 'scheduled');

export const openPm = (bo: BackofficeData, equipmentId: string) => bo.pm.find(t => t.equipmentId === equipmentId && t.status === 'open');
export function pmState(bo: BackofficeData, e: Equipment): DueState | null {
  const t = e.status === 'decommissioned' ? undefined : openPm(bo, e.id);
  return t ? dueState(t.due) : null;
}

export function pmCounts(bo: BackofficeData) {
  const out = { overdue: 0, due30: 0, scheduled: 0, criticalOverdue: 0 };
  for (const e of active(bo)) {
    const s = pmState(bo, e);
    if (s) {
      out[s]++;
      out.criticalOverdue += s === 'overdue' && e.criticality === 'critical' ? 1 : 0;
    }
  }
  return out;
}

export interface PmInput { doneAt: string; outcome: 'pass' | 'fail'; findings: string; cost: string }

export function pmProblems(t: PmTask, input: PmInput): string[] {
  const out: string[] = [];
  if (!isDate(input.doneAt) || input.doneAt > TODAY) {
    out.push('ใส่วันที่ทำ (ไม่เกินวันนี้)');
  }
  if (input.outcome === 'fail' && input.findings.trim().length < NOTE_MIN) {
    out.push('PM ไม่ผ่านต้องบันทึกสิ่งที่พบอย่างน้อย 10 ตัวอักษร');
  }
  if (input.cost && !isAmount(input.cost)) {
    out.push('ค่าใช้จ่ายต้องเป็นตัวเลข');
  }
  if (t.status !== 'open') {
    out.push('งาน PM นี้ปิดแล้ว');
  }
  return out;
}

/** Done: the next one planned a cycle from the day it was done; a failed PM takes the device out of service */
export function completePm(bo: BackofficeData, t: PmTask, input: PmInput, by: string): { next: PmTask; downtime?: Downtime } {
  const e = equipmentOf(bo, t.equipmentId)!;
  const cost = input.cost ? Number(input.cost) : 0;
  Object.assign(t, { status: 'done', doneAt: input.doneAt, doneBy: by, outcome: input.outcome, findings: input.findings.trim() || undefined, cost: cost || undefined });
  if (cost) {
    e.costs.push([input.doneAt, 'PM', cost, t.id]);
  }
  e.history.push([at(), by, 'บำรุงรักษาตามแผน', [t.id, input.outcome === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน', input.findings.trim()].filter(Boolean).join(' · ')]);
  const next: PmTask = { id: nextSeq(bo.pm.map(p => p.id), 'PM-'), equipmentId: e.id, due: addMonths(input.doneAt, e.pmMonths), status: 'open' };
  bo.pm.push(next);
  const downtime = input.outcome === 'fail' && e.status === 'in-service'
    ? openDowntime(bo, { equipmentId: e.id, kind: 'failure', problem: `PM ${t.id} ไม่ผ่าน · ${input.findings.trim()}`, impact: '' }, by)
    : undefined;
  return { next, downtime };
}

/** A PM moved, with why: a critical device's no further than 14 days from the date it was first due, any other's 30 */
export function moveProblems(bo: BackofficeData, t: PmTask, due: string): string | null {
  const e = equipmentOf(bo, t.equipmentId)!;
  const limit = e.criticality === 'critical' ? 14 : 30;
  if (!isDate(due)) {
    return 'ใส่วันที่ใหม่';
  }
  if (due === t.due) {
    return 'วันที่ใหม่ต้องไม่ใช่วันเดิม';
  }
  if (due < TODAY) {
    return 'วันที่ใหม่ต้องไม่ก่อนวันนี้';
  }
  return daysUntil(due, t.movedFrom ?? t.due) > limit ? (limit === 14 ? 'อุปกรณ์ critical เลื่อน PM ได้ไม่เกิน 14 วันจากกำหนดเดิม' : 'เลื่อน PM ได้ไม่เกิน 30 วันจากกำหนดเดิม') : null;
}

export function movePm(bo: BackofficeData, t: PmTask, due: string, reason: string, by: string) {
  const before = t.due;
  t.movedFrom = t.movedFrom ?? t.due;
  t.due = due;
  t.moveReason = reason;
  equipmentOf(bo, t.equipmentId)!.history.push([at(), by, 'เลื่อน PM', `${t.id} · ${before} → ${due} · ${reason}`]);
}

/* ---- Calibration ---- */

export type CalibrationState = DueState | 'failed';
export const CALIBRATION_STATE: Record<CalibrationState, { label: string; cls: string }> = {
  overdue: { label: 'เกินกำหนด', cls: 'danger' },
  failed: { label: 'ไม่ผ่าน', cls: 'danger' },
  due30: { label: 'ภายใน 30 วัน', cls: 'warn' },
  scheduled: { label: 'ในกำหนด', cls: 'ok' },
};
export const CALIBRATION_RESULT: Record<CalibrationRecord['result'], { label: string; cls: string }> = {
  pass: { label: 'ผ่าน', cls: 'ok' },
  adjusted: { label: 'ปรับตั้งแล้วผ่าน', cls: 'info' },
  fail: { label: 'ไม่ผ่าน', cls: 'danger' },
};

export const calibrationsOf = (bo: BackofficeData, equipmentId: string) => bo.calibrations.filter(c => c.equipmentId === equipmentId).sort((a, b) => a.date.localeCompare(b.date));
export const latestCalibration = (bo: BackofficeData, equipmentId: string) => calibrationsOf(bo, equipmentId).at(-1);

/** A device that needs calibrating and has never been, or whose last one failed, cannot be relied on */
export function calibrationState(bo: BackofficeData, e: Equipment): CalibrationState | null {
  if (!e.calibrationMonths || e.status === 'decommissioned') {
    return null;
  }
  const last = latestCalibration(bo, e.id);
  return !last ? 'overdue' : last.result === 'fail' ? 'failed' : dueState(last.nextDue);
}

/** The times the log fell behind its frequency: from the date one was due to the date it was done (or today) */
export function calibrationLapses(bo: BackofficeData, e: Equipment): [from: string, to: string, days: number][] {
  const log = calibrationsOf(bo, e.id);
  const out: [string, string, number][] = [];
  log.forEach((c, i) => {
    const next = log[i + 1];
    const end = next ? next.date : TODAY;
    if (end > c.nextDue) {
      out.push([c.nextDue, next ? next.date : TODAY, daysUntil(end, c.nextDue)]);
    }
  });
  return out;
}

/** Each device that needs calibrating: in date and never behind in its log, or not */
export function calibrationCompliance(bo: BackofficeData) {
  const required = active(bo).filter(e => e.calibrationMonths);
  const rows = required.map(e => ({ equipment: e, state: calibrationState(bo, e)!, last: latestCalibration(bo, e.id), lapses: calibrationLapses(bo, e) }));
  const inDate = rows.filter(r => r.state === 'scheduled' || r.state === 'due30');
  return {
    rows, required: rows.length, inDate: inDate.length, percent: rows.length ? Math.round((inDate.length / rows.length) * 100) : 100,
    due30: rows.filter(r => r.state === 'due30').length, overdue: rows.filter(r => r.state === 'overdue').length, failed: rows.filter(r => r.state === 'failed').length,
    lapsed: rows.filter(r => r.lapses.length).length,
  };
}

export interface CalibrationInput { equipmentId: string; date: string; by: string; result: CalibrationRecord['result']; certificate: string; reading: string; nextDue: string }

export function calibrationProblems(bo: BackofficeData, input: CalibrationInput): string[] {
  const out: string[] = [];
  const e = equipmentOf(bo, input.equipmentId);
  if (!e?.calibrationMonths) {
    out.push('เลือกอุปกรณ์ที่ต้องสอบเทียบ');
    return out;
  }
  if (!isDate(input.date) || input.date > TODAY) {
    out.push('ใส่วันที่สอบเทียบ (ไม่เกินวันนี้)');
  }
  if (!input.by.trim()) {
    out.push('ใส่ผู้สอบเทียบ');
  }
  if (input.result !== 'fail' && !input.certificate.trim()) {
    out.push('ผลที่ผ่านต้องแนบใบรับรองการสอบเทียบ');
  }
  if (!isDate(input.nextDue) || input.nextDue <= input.date) {
    out.push('ใส่วันครบกำหนดครั้งถัดไป (หลังวันที่สอบเทียบ)');
  } else if (isDate(input.date) && input.nextDue > addMonths(input.date, e.calibrationMonths)) {
    out.push('ครั้งถัดไปต้องไม่เกินความถี่ที่กำหนด');
  }
  return out;
}

/** A calibration logged; a failed one takes the device out of service until it is fixed */
export function addCalibration(bo: BackofficeData, input: CalibrationInput, by: string): { record: CalibrationRecord; downtime?: Downtime } {
  const e = equipmentOf(bo, input.equipmentId)!;
  const record: CalibrationRecord = {
    id: nextSeq(bo.calibrations.map(c => c.id), `CAL-${TODAY.slice(2, 4)}-`), equipmentId: e.id, date: input.date, by: input.by.trim(), result: input.result,
    certificate: input.certificate.trim() || undefined, reading: input.reading.trim() || undefined, nextDue: input.nextDue, enteredBy: by,
  };
  bo.calibrations.push(record);
  e.history.push([at(), by, 'บันทึกผลสอบเทียบ', [record.id, CALIBRATION_RESULT[record.result].label, record.by].join(' · ')]);
  const downtime = record.result === 'fail' && e.status === 'in-service'
    ? openDowntime(bo, { equipmentId: e.id, kind: 'failure', problem: `สอบเทียบไม่ผ่าน ${record.id}${record.reading ? ` · ${record.reading}` : ''}`, impact: '' }, by)
    : undefined;
  return { record, downtime };
}

/* ---- Downtime ---- */

export const DOWNTIME_KIND: Record<Downtime['kind'], string> = { failure: 'เครื่องเสีย', planned: 'หยุดตามแผน' };
export const openDowntimeOf = (bo: BackofficeData, equipmentId: string) => bo.downtime.find(d => d.equipmentId === equipmentId && !d.to);
export const downtimeHours = (d: Downtime) => hoursBetween(d.from, d.to ?? at());

export interface DowntimeInput { equipmentId: string; kind: Downtime['kind']; problem: string; impact: string }

export function downtimeProblems(bo: BackofficeData, input: DowntimeInput): string[] {
  const out: string[] = [];
  const e = equipmentOf(bo, input.equipmentId);
  if (!e || e.status === 'decommissioned') {
    out.push('เลือกอุปกรณ์');
  } else if (openDowntimeOf(bo, e.id)) {
    out.push('อุปกรณ์นี้มีรายการขัดข้องที่ยังเปิดอยู่');
  }
  if (input.problem.trim().length < NOTE_MIN) {
    out.push('อธิบายอาการอย่างน้อย 10 ตัวอักษร');
  }
  return out;
}

/** The device is out of service from now until the downtime is closed */
export function openDowntime(bo: BackofficeData, input: DowntimeInput, by: string): Downtime {
  const e = equipmentOf(bo, input.equipmentId)!;
  const d: Downtime = {
    id: nextSeq(bo.downtime.map(x => x.id), `DT-${TODAY.slice(2, 4)}${TODAY.slice(5, 7)}-`), equipmentId: e.id, kind: input.kind, from: at(), reportedBy: by,
    problem: input.problem.trim(), impact: input.impact.trim(),
  };
  bo.downtime.push(d);
  e.status = 'down';
  e.history.push([at(), by, input.kind === 'failure' ? 'แจ้งขัดข้อง' : 'หยุดใช้ตามแผน', `${d.id} · ${d.problem}`]);
  return d;
}

/** Back in service only once it was tested, with what was done; the repair's cost goes on the device */
export const fixProblem = (fix: string) => (fix.trim().length < NOTE_MIN ? 'บันทึกสิ่งที่แก้ไขอย่างน้อย 10 ตัวอักษร' : null);
export const testedProblem = (tested: boolean) => (tested ? null : 'ต้องทดสอบการทำงานก่อนกลับมาใช้');
export const costProblem = (cost: string) => (cost && !isAmount(cost) ? 'ค่าใช้จ่ายต้องเป็นตัวเลข' : null);
export const closeProblems = (fix: string, tested: boolean, cost: string) =>
  [fixProblem(fix), testedProblem(tested), costProblem(cost)].filter((p): p is string => !!p);

export function closeDowntime(bo: BackofficeData, d: Downtime, fix: string, cost: string, by: string) {
  const e = equipmentOf(bo, d.equipmentId)!;
  d.to = at();
  d.fix = fix.trim();
  d.closedBy = by;
  if (cost && Number(cost)) {
    e.costs.push([TODAY, 'ซ่อม', Number(cost), d.id]);
  }
  if (e.status === 'down') {
    e.status = 'in-service';
  }
  e.history.push([at(), by, 'กลับมาใช้งาน', `${d.id} · ${hours(downtimeHours(d))} ชม. · ${d.fix}`]);
}
const hours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export interface Reliability { failures: number; downHours: number; mtbf: number | null; mttr: number | null; availability: number }

/**
 * Over the last 365 days (or since it was bought): MTBF the hours it ran between failures, MTTR the hours a failure
 * took to fix, availability the share of the time it was not down for any reason
 */
export function reliability(bo: BackofficeData, ids: string[]): Reliability {
  const now = at();
  let window = 0;
  let down = 0;
  let failures = 0;
  const repairs: number[] = [];
  for (const id of ids) {
    const e = equipmentOf(bo, id)!;
    const since = [e.purchasedAt, addMonths(TODAY, -12)].sort().at(-1)!;
    window += hoursBetween(since, now);
    for (const d of bo.downtime.filter(x => x.equipmentId === id && (x.to ?? now) > since)) {
      const h = hoursBetween(d.from > since ? d.from : since, d.to ?? now);
      down += h;
      if (d.kind === 'failure') {
        failures++;
        if (d.to) {
          repairs.push(hoursBetween(d.from, d.to));
        }
      }
    }
  }
  return {
    failures, downHours: down, mtbf: failures ? (window - down) / failures : null, mttr: repairs.length ? repairs.reduce((a, b) => a + b, 0) / repairs.length : null,
    availability: window ? 1 - down / window : 1,
  };
}

/* ---- Service contracts ---- */

export const CONTRACT_KIND: Record<ContractKind, { label: string; covers: ('pm' | 'calibration' | 'repair')[] }> = {
  full: { label: 'บริการครบ (PM ซ่อม สอบเทียบ)', covers: ['pm', 'calibration', 'repair'] },
  pm: { label: 'PM ตามแผน', covers: ['pm'] },
  calibration: { label: 'สอบเทียบ', covers: ['calibration'] },
  repair: { label: 'ซ่อมตามเรียก', covers: ['repair'] },
};
export type ContractState = 'expired' | 'd30' | 'd60' | 'd90' | 'active' | 'retired';
export const CONTRACT_STATE: Record<ContractState, { label: string; cls: string }> = {
  expired: { label: 'หมดอายุแล้ว', cls: 'danger' },
  d30: { label: 'หมดใน 30 วัน', cls: 'danger' },
  d60: { label: 'หมดใน 60 วัน', cls: 'warn' },
  d90: { label: 'หมดใน 90 วัน', cls: 'info' },
  active: { label: 'มีผล', cls: 'ok' },
  retired: { label: 'ยกเลิกสัญญาแล้ว', cls: 'quiet' },
};
export function contractState(c: ServiceContract, today = TODAY): ContractState {
  if (c.status === 'retired') {
    return 'retired';
  }
  const days = daysUntil(c.to, today);
  return days < 0 ? 'expired' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'active';
}
const inForce = (c: ServiceContract) => c.status === 'active' && c.from <= TODAY && daysUntil(c.to) >= 0;
export const contractsOf = (bo: BackofficeData, equipmentId: string) => bo.contracts.filter(c => c.equipmentIds.includes(equipmentId) && c.status === 'active');
/** Whether a contract in force covers this kind of work on the device */
export const covered = (bo: BackofficeData, equipmentId: string, work: 'pm' | 'calibration' | 'repair') =>
  contractsOf(bo, equipmentId).some(c => inForce(c) && CONTRACT_KIND[c.kind].covers.includes(work));

export interface ContractInput { vendor: string; contact: string; kind: ContractKind; from: string; to: string; annualFee: string; responseHours: string; equipmentIds: string[] }

export function contractProblems(bo: BackofficeData, input: ContractInput): string[] {
  const out: string[] = [];
  if (input.vendor.trim().length < 3) {
    out.push('ใส่ชื่อผู้ให้บริการ');
  }
  if (!isDate(input.from) || !isDate(input.to)) {
    out.push('ใส่วันเริ่มและวันสิ้นสุด');
  } else if (input.to <= input.from) {
    out.push('วันสิ้นสุดต้องหลังวันเริ่ม');
  }
  if (!isAmount(input.annualFee)) {
    out.push('ใส่ค่าบริการต่อปีเป็นตัวเลข');
  }
  if (!/^\d+$/.test(input.responseHours) || Number(input.responseHours) < 1) {
    out.push('ใส่เวลาตอบสนองเป็นชั่วโมง');
  }
  if (!input.equipmentIds.length) {
    out.push('เลือกอุปกรณ์ในสัญญาอย่างน้อย 1 รายการ');
  }
  return out;
}

export function addContract(bo: BackofficeData, input: ContractInput, by: string): ServiceContract {
  const c: ServiceContract = {
    id: nextSeq(bo.contracts.map(x => x.id), 'SC-'), vendor: input.vendor.trim(), contact: input.contact.trim(), kind: input.kind, from: input.from, to: input.to,
    annualFee: Number(input.annualFee), responseHours: Number(input.responseHours), equipmentIds: [...input.equipmentIds], status: 'active',
    history: [[at(), by, 'บันทึกสัญญา', `${input.from} → ${input.to} · ${input.equipmentIds.length} รายการ`]],
  };
  bo.contracts.push(c);
  return c;
}

export const renewDateProblem = (c: ServiceContract, to: string) => (!isDate(to) ? 'ใส่วันสิ้นสุดใหม่' : to <= c.to ? 'วันสิ้นสุดใหม่ต้องหลังวันเดิม' : null);
export const feeProblem = (fee: string) => (isAmount(fee) ? null : 'ใส่ค่าบริการต่อปีเป็นตัวเลข');

export function renewContract(c: ServiceContract, to: string, fee: string, by: string) {
  const before = c.to;
  c.to = to;
  c.annualFee = Number(fee);
  c.history.push([at(), by, 'ต่อสัญญา', `${before} → ${to} · ฿${Number(fee).toLocaleString('en-US')}/ปี`]);
}

/** What retiring the contract leaves behind: the devices in service that would have no repair cover */
export function retireImpact(bo: BackofficeData, c: ServiceContract): Equipment[] {
  return c.equipmentIds.map(id => equipmentOf(bo, id)!).filter(e => e.status !== 'decommissioned' && CONTRACT_KIND[c.kind].covers.includes('repair')
    && !contractsOf(bo, e.id).some(o => o.id !== c.id && inForce(o) && CONTRACT_KIND[o.kind].covers.includes('repair')));
}

export function retireContract(c: ServiceContract, reason: string, by: string) {
  c.status = 'retired';
  c.history.push([at(), by, 'ยกเลิกสัญญา', reason]);
}

/* ---- Decommission ---- */

export const DECOMMISSION_STATUS: Record<Decommission['status'], { label: string; cls: string }> = {
  requested: { label: 'รออนุมัติ', cls: 'warn' },
  approved: { label: 'อนุมัติแล้ว · รอดำเนินการ', cls: 'info' },
  rejected: { label: 'ไม่อนุมัติ', cls: 'quiet' },
  completed: { label: 'เลิกใช้แล้ว', cls: 'quiet' },
};
export const DECOMMISSION_METHOD: Record<Decommission['method'], string> = { sell: 'ขายต่อ', donate: 'บริจาค', scrap: 'ทำลาย / ขายซาก', return: 'คืนผู้ให้เช่า' };

export const openDecommission = (bo: BackofficeData, equipmentId: string) =>
  bo.decommissions.find(r => r.equipmentId === equipmentId && (r.status === 'requested' || r.status === 'approved'));

/** The units of the same kind still working, apart from this one: the cover if it goes */
export const backups = (bo: BackofficeData, e: Equipment) => bo.equipment.filter(o => o.id !== e.id && o.cls === e.cls && o.status === 'in-service' && !openDecommission(bo, o.id));

/** What taking the device out of the registry changes, and whether it leaves a critical kind with nothing */
export function decommissionImpact(bo: BackofficeData, e: Equipment): { text: string; severe: boolean }[] {
  const out: { text: string; severe: boolean }[] = [];
  if (e.criticality === 'critical' && !backups(bo, e).length) {
    out.push({ text: `ไม่มี${EQUIPMENT_CLASS[e.cls].label}เครื่องอื่นที่พร้อมใช้งาน`, severe: true });
  }
  if (e.bed) {
    out.push({ text: `ยกเลิกการผูกกับเตียง ${e.bed} (M10)`, severe: false });
  }
  const pm = openPm(bo, e.id);
  if (pm) {
    out.push({ text: `ยกเลิก PM ${pm.id} ที่ค้างอยู่`, severe: false });
  }
  for (const c of contractsOf(bo, e.id)) {
    out.push({ text: `ถอดออกจากสัญญา ${c.id} · ${c.vendor}`, severe: false });
  }
  const open = openDowntimeOf(bo, e.id);
  if (open) {
    out.push({ text: `ปิดรายการขัดข้อง ${open.id}`, severe: false });
  }
  return out;
}

export interface DecommissionInput { equipmentId: string; reason: string; method: Decommission['method']; replacement: string }

export function requestProblems(bo: BackofficeData, input: DecommissionInput): string[] {
  const out: string[] = [];
  const e = equipmentOf(bo, input.equipmentId);
  if (!e || e.status === 'decommissioned') {
    out.push('เลือกอุปกรณ์');
  } else if (openDecommission(bo, e.id)) {
    out.push('อุปกรณ์นี้มีคำขอเลิกใช้ที่ยังไม่ปิด');
  }
  if (input.reason.trim().length < NOTE_MIN) {
    out.push('ใส่เหตุผลอย่างน้อย 10 ตัวอักษร');
  }
  return out;
}

export function requestDecommission(bo: BackofficeData, input: DecommissionInput, by: string): Decommission {
  const r: Decommission = {
    id: nextSeq(bo.decommissions.map(x => x.id), `DEC-${TODAY.slice(2, 4)}${TODAY.slice(5, 7)}-`), equipmentId: input.equipmentId, reason: input.reason.trim(), method: input.method,
    replacement: input.replacement.trim() || undefined, status: 'requested', requestedBy: by, requestedAt: at(),
  };
  bo.decommissions.push(r);
  equipmentOf(bo, r.equipmentId)!.history.push([at(), by, 'ขอเลิกใช้งาน', `${r.id} · ${r.reason}`]);
  return r;
}

/** Someone other than the requester decides */
export function decideBlock(r: Decommission, user: string): string | null {
  if (r.requestedBy === user) {
    return 'ผู้ขอตัดสินคำขอเลิกใช้ของตัวเองไม่ได้ (การแยกหน้าที่)';
  }
  return r.status === 'requested' ? null : 'คำขอนี้ตัดสินแล้ว';
}

export function decideDecommission(bo: BackofficeData, r: Decommission, status: 'approved' | 'rejected', note: string, by: string) {
  r.status = status;
  r.decidedBy = by;
  r.decidedAt = at();
  r.decisionNote = note;
  equipmentOf(bo, r.equipmentId)!.history.push([at(), by, status === 'approved' ? 'อนุมัติการเลิกใช้' : 'ปฏิเสธการเลิกใช้', `${r.id} · ${note}`]);
}

/**
 * Done, with the disposal evidence: the device leaves service, its bed link and open PM go, it comes off its
 * contracts, an open downtime is closed; its record and history stay
 */
export function completeDecommission(bo: BackofficeData, r: Decommission, evidence: string, by: string) {
  const e = equipmentOf(bo, r.equipmentId)!;
  const impact = decommissionImpact(bo, e).filter(i => !i.severe).map(i => i.text);
  const open = openDowntimeOf(bo, e.id);
  if (open) {
    Object.assign(open, { to: at(), fix: 'เลิกใช้งาน', closedBy: by });
  }
  const pm = openPm(bo, e.id);
  if (pm) {
    pm.status = 'cancelled';
  }
  for (const c of contractsOf(bo, e.id)) {
    c.equipmentIds = c.equipmentIds.filter(id => id !== e.id);
    c.history.push([at(), by, 'ถอดอุปกรณ์ออก', `${e.id} · ${r.id}`]);
  }
  e.bed = undefined;
  e.status = 'decommissioned';
  Object.assign(r, { status: 'completed', completedBy: by, completedAt: at(), evidence: evidence.trim() });
  e.history.push([at(), by, 'เลิกใช้งานแล้ว', [r.id, DECOMMISSION_METHOD[r.method], evidence.trim(), ...impact].join(' · ')]);
}

/* ---- Critical equipment ---- */

export type Readiness = 'down' | 'attention' | 'due' | 'ready';
export const READINESS: Record<Readiness, { label: string; cls: string; rank: number }> = {
  down: { label: 'ขัดข้อง', cls: 'danger', rank: 0 },
  attention: { label: 'ต้องดำเนินการ', cls: 'warn', rank: 1 },
  due: { label: 'ใกล้ครบกำหนด', cls: 'info', rank: 2 },
  ready: { label: 'พร้อมใช้งาน', cls: 'ok', rank: 3 },
};

/** Whether a device can be relied on now, and every reason it cannot */
export function readiness(bo: BackofficeData, e: Equipment): { state: Readiness; reasons: string[] } {
  const hard: string[] = [];
  const soft: string[] = [];
  const open = openDowntimeOf(bo, e.id);
  if (open) {
    hard.push(`${open.id} · ${open.problem}`);
  }
  const pm = openPm(bo, e.id);
  const pmS = pmState(bo, e);
  if (pm && pmS === 'overdue') {
    hard.push(`PM เกินกำหนด ${-daysUntil(pm.due)} วัน`);
  } else if (pm && pmS === 'due30') {
    soft.push(`PM ครบกำหนด ${pm.due}`);
  }
  const cal = calibrationState(bo, e);
  if (cal === 'overdue' || cal === 'failed') {
    hard.push(cal === 'failed' ? 'สอบเทียบไม่ผ่าน' : 'สอบเทียบเกินกำหนด');
  } else if (cal === 'due30') {
    soft.push(`สอบเทียบครบกำหนด ${latestCalibration(bo, e.id)!.nextDue}`);
  }
  if (e.criticality === 'critical' && !covered(bo, e.id, 'repair')) {
    hard.push('ไม่มีสัญญาซ่อมที่มีผล');
  }
  for (const c of contractsOf(bo, e.id).filter(c => contractState(c) === 'd30')) {
    soft.push(`สัญญา ${c.id} หมด ${c.to}`);
  }
  const state: Readiness = open ? 'down' : hard.length ? 'attention' : soft.length ? 'due' : 'ready';
  return { state, reasons: [...hard, ...soft] };
}

/** The critical devices, worst first */
export function criticalBoard(bo: BackofficeData) {
  return active(bo).filter(e => e.criticality === 'critical').map(e => ({ equipment: e, ...readiness(bo, e), backups: backups(bo, e).filter(b => readiness(bo, b).state !== 'down') }))
    .sort((a, b) => READINESS[a.state].rank - READINESS[b.state].rank || a.equipment.id.localeCompare(b.equipment.id));
}
