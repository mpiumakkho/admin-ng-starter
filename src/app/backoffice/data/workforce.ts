/*
 * Workforce (seph1-docs 26-backoffice-erp ux/menus/05-workforce.md, domains/hr-and-workforce.md; M24 P2): the staff
 * registry, licenses and their renewals at 30/60/90 days, CE hours, the hospital's own scope and privileges, shifts
 * with conflict and coverage checks, leave and its effect on coverage, a fair on-call rotation, and the overtime the
 * schedule implies. A staff record is not an IAM account (M14), a shift grants nothing, and overtime here is an
 * operational figure, not payroll. Text is kept in its source language and translated where it shows.
 */
import { NOW, TODAY } from '../../clinic/data/model';
import { daysUntil } from './home';
import { nextSeq } from './sales';
import type {
  Area, BackofficeData, CeCategory, CeRecord, LeaveRequest, LeaveType, License, LicenseKind, OnCallSlot, Privilege, PrivilegeChange, Shift, ShiftKind, StaffMember, StaffRole,
} from './types';

const at = () => `${TODAY} ${NOW}`;
/** A note that will stand as evidence */
export const NOTE_MIN = 10;

/* ---- The registry ---- */

export const ROLE: Record<StaffRole, { label: string; cls: string }> = {
  vet: { label: 'สัตวแพทย์', cls: 'info' },
  nurse: { label: 'พยาบาลสัตว์', cls: 'ok' },
  pharmacist: { label: 'เภสัชกร', cls: 'warn' },
  groomer: { label: 'ช่างอาบน้ำตัดขน', cls: 'quiet' },
  cashier: { label: 'แคชเชียร์', cls: 'quiet' },
  manager: { label: 'ผู้บริหาร / สำนักงาน', cls: 'quiet' },
};
export const EMPLOYMENT: Record<StaffMember['employment'], string> = { 'full-time': 'เต็มเวลา', 'part-time': 'พาร์ตไทม์', locum: 'สัตวแพทย์ชั่วคราว (locum)' };
export const STAFF_STATUS: Record<StaffMember['status'], { label: string; cls: string }> = {
  active: { label: 'ปฏิบัติงาน', cls: 'ok' },
  'on-leave': { label: 'ลา', cls: 'warn' },
  inactive: { label: 'พ้นสภาพ', cls: 'quiet' },
};
export const DEPARTMENTS = ['OPD', 'Ward', 'OR', 'Pharmacy', 'Grooming', 'การเงิน', 'สำนักงาน'];
/** The roles a schedule has: the office works office hours */
export const SCHEDULED_ROLES: StaffRole[] = ['vet', 'nurse', 'pharmacist', 'groomer'];

export const staffOf = (bo: BackofficeData, id: string) => bo.staff.find(s => s.id === id);
export const staffByName = (bo: BackofficeData, name: string) => bo.staff.find(s => s.name === name);

export interface StaffInput {
  name: string;
  role: StaffRole;
  position: string;
  department: string;
  employment: StaffMember['employment'];
  phone: string;
  startedAt: string;
}

export function staffProblems(bo: BackofficeData, input: StaffInput): string[] {
  const out: string[] = [];
  if (input.name.trim().length < 3) {
    out.push('ใส่ชื่อ-นามสกุลหรือชื่อที่ใช้ในโรงพยาบาล');
  } else if (bo.staff.some(s => s.name === input.name.trim())) {
    out.push('มีบุคลากรชื่อนี้แล้ว');
  }
  if (!input.position.trim()) {
    out.push('ใส่ตำแหน่ง');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startedAt)) {
    out.push('ใส่วันเริ่มงาน');
  }
  return out;
}

export function addStaff(bo: BackofficeData, input: StaffInput): StaffMember {
  const id = 'S' + String(Math.max(0, ...bo.staff.map(s => Number(s.id.slice(1)) || 0)) + 1).padStart(2, '0');
  const member: StaffMember = {
    id, name: input.name.trim(), role: input.role, position: input.position.trim(), department: input.department, employment: input.employment, status: 'active',
    startedAt: input.startedAt, phone: input.phone.trim(), weeklyHours: input.employment === 'full-time' ? 40 : 24,
    ceTarget: input.role === 'vet' ? 20 : input.role === 'nurse' ? 12 : input.role === 'pharmacist' ? 15 : undefined,
  };
  bo.staff.push(member);
  bo.privileges[id] = [];
  return member;
}

/* ---- Licenses and credentials ---- */

export const LICENSE_KIND: Record<LicenseKind, { label: string; issuer: string; roles: StaffRole[] }> = {
  'vet-license': { label: 'ใบอนุญาตประกอบวิชาชีพการสัตวแพทย์', issuer: 'สัตวแพทยสภา', roles: ['vet'] },
  'controlled-license': { label: 'ใบอนุญาตสั่งใช้ยาควบคุม', issuer: 'อย.', roles: ['vet'] },
  'rvn-certificate': { label: 'หนังสือรับรองขอบเขตพยาบาลสัตว์ (โรงพยาบาลกำหนด)', issuer: 'โรงพยาบาล', roles: ['nurse'] },
  'pharmacist-license': { label: 'ใบอนุญาตประกอบวิชาชีพเภสัชกรรม', issuer: 'สภาเภสัชกรรม', roles: ['pharmacist'] },
  'groomer-certificate': { label: 'ประกาศนียบัตรช่างตัดขน', issuer: 'สมาคมผู้ประกอบการสัตว์เลี้ยง', roles: ['groomer'] },
};

/** Where a license stands: verified and in date, near its end, past it, or not yet checked */
export type LicenseState = 'expired' | 'd30' | 'd60' | 'd90' | 'pending' | 'valid';
export const LICENSE_STATE: Record<LicenseState, { label: string; cls: string; rank: number }> = {
  expired: { label: 'หมดอายุแล้ว', cls: 'danger', rank: 0 },
  pending: { label: 'รอตรวจสอบ', cls: 'warn', rank: 1 },
  d30: { label: 'หมดใน 30 วัน', cls: 'danger', rank: 2 },
  d60: { label: 'หมดใน 60 วัน', cls: 'warn', rank: 3 },
  d90: { label: 'หมดใน 90 วัน', cls: 'info', rank: 4 },
  valid: { label: 'ใช้ได้', cls: 'ok', rank: 5 },
};

export function licenseState(l: License, today = TODAY): LicenseState {
  const days = daysUntil(l.expiresAt, today);
  if (days < 0) {
    return 'expired';
  }
  if (l.verification === 'pending') {
    return 'pending';
  }
  return days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'valid';
}
/** Verified and not past its date: the only license a privilege or a clinical shift can rest on */
export const isUsable = (l: License | undefined, date = TODAY) => !!l && l.verification === 'verified' && daysUntil(l.expiresAt, date) >= 0;

export const licensesOf = (bo: BackofficeData, staffId: string) => bo.licenses.filter(l => l.staffId === staffId);
export const licenseOf = (bo: BackofficeData, staffId: string, kind: LicenseKind) => bo.licenses.find(l => l.staffId === staffId && l.kind === kind);

/** The worst state of a person's licenses, for the directory */
export function credentialState(bo: BackofficeData, staffId: string): LicenseState | null {
  const states = licensesOf(bo, staffId).map(l => licenseState(l));
  return states.length ? states.sort((a, b) => LICENSE_STATE[a].rank - LICENSE_STATE[b].rank)[0] : null;
}

export function expiryCounts(bo: BackofficeData): Record<LicenseState, number> {
  const out = { expired: 0, d30: 0, d60: 0, d90: 0, pending: 0, valid: 0 };
  for (const l of bo.licenses) {
    out[licenseState(l)]++;
  }
  return out;
}

export interface LicenseInput { staffId: string; kind: LicenseKind; number: string; issuer: string; issuedAt: string; expiresAt: string }

export function licenseProblems(bo: BackofficeData, input: LicenseInput): string[] {
  const out: string[] = [];
  const member = staffOf(bo, input.staffId);
  if (!member) {
    out.push('เลือกบุคลากร');
  } else if (!LICENSE_KIND[input.kind].roles.includes(member.role)) {
    out.push('ใบอนุญาตชนิดนี้ไม่ใช่ของตำแหน่งนี้');
  }
  if (!input.number.trim()) {
    out.push('ใส่เลขที่ใบอนุญาต');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) {
    out.push('ใส่วันออกและวันหมดอายุ');
  } else if (input.expiresAt <= input.issuedAt) {
    out.push('วันหมดอายุต้องหลังวันออก');
  }
  if (member && licenseOf(bo, member.id, input.kind)) {
    out.push('มีใบอนุญาตชนิดนี้แล้ว — ใช้การต่ออายุแทน');
  }
  return out;
}

/** A license entered: it waits for someone else to check it with the issuer */
export function addLicense(bo: BackofficeData, input: LicenseInput, by: string): License {
  const license: License = {
    id: 'L' + String(Math.max(0, ...bo.licenses.map(l => Number(l.id.slice(1)) || 0)) + 1).padStart(2, '0'),
    ...input, number: input.number.trim(), issuer: input.issuer.trim() || LICENSE_KIND[input.kind].issuer, verification: 'pending',
    history: [[at(), by, 'บันทึกใบอนุญาต', `${input.number.trim()} · หมดอายุ ${input.expiresAt}`]],
  };
  bo.licenses.push(license);
  return license;
}

/** Only someone else checks a license, never its holder */
export const canVerify = (bo: BackofficeData, l: License, user: string) => staffOf(bo, l.staffId)?.name !== user;

export function verifyLicense(l: License, method: string, note: string, by: string) {
  l.verification = 'verified';
  l.verifiedBy = by;
  l.verifiedAt = at();
  l.history.push([at(), by, 'ตรวจสอบแล้ว', [method, note].filter(Boolean).join(' · ')]);
}

/** A renewal: the new date (and number, when it changed); it is checked again before it counts */
export function renewProblems(l: License, expiresAt: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    return 'ใส่วันหมดอายุใหม่';
  }
  return expiresAt <= l.expiresAt ? 'วันหมดอายุใหม่ต้องหลังวันเดิม' : null;
}

export function renewLicense(l: License, expiresAt: string, number: string, evidence: string, by: string) {
  const before = l.expiresAt;
  l.expiresAt = expiresAt;
  if (number.trim()) {
    l.number = number.trim();
  }
  l.issuedAt = TODAY;
  l.verification = 'pending';
  l.verifiedBy = undefined;
  l.verifiedAt = undefined;
  l.history.push([at(), by, 'ต่ออายุ', `${before} → ${expiresAt}${evidence ? ` · ${evidence}` : ''} · รอตรวจสอบ`]);
}

/* ---- Continuing education ---- */

export const CE_CATEGORY: Record<CeCategory, string> = { clinical: 'คลินิก', pharmacology: 'เภสัชวิทยา', safety: 'ความปลอดภัย', other: 'อื่น ๆ' };
export const CE_STATUS: Record<CeRecord['status'], { label: string; cls: string }> = {
  approved: { label: 'นับชั่วโมงแล้ว', cls: 'ok' },
  pending: { label: 'รอตรวจ', cls: 'warn' },
  rejected: { label: 'ไม่นับ', cls: 'danger' },
};
/** The courses the hospital approved: a record of one counts at once, with the course's hours */
export const APPROVED_COURSES: { course: string; provider: string; hours: number; category: CeCategory }[] = [
  { course: 'VPAT Annual Conference 2026', provider: 'VPAT', hours: 12, category: 'clinical' },
  { course: 'Feline CKD update', provider: 'คณะสัตวแพทยศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย', hours: 4, category: 'clinical' },
  { course: 'Anesthesia monitoring workshop', provider: 'สมาคมวิสัญญีสัตวแพทย์', hours: 6, category: 'clinical' },
  { course: 'CPR (RECOVER) BLS', provider: 'RECOVER Initiative', hours: 4, category: 'clinical' },
  { course: 'Controlled drug handling', provider: 'อย.', hours: 3, category: 'pharmacology' },
  { course: 'Fire and chemical safety', provider: 'โรงพยาบาล', hours: 2, category: 'safety' },
];
export const catalogCourse = (course: string) => APPROVED_COURSES.find(c => c.course === course);

export interface CeSummary { staff: StaffMember; approved: number; pending: number; target: number; percent: number; behind: boolean }

/** Hours this year against the hospital's target, for each person who has one */
export function ceSummary(bo: BackofficeData, year = TODAY.slice(0, 4)): CeSummary[] {
  // How much of the year has gone, so a person is behind only when short for this point of it; someone who started
  // less than three months ago is not behind yet
  const yearShare = (daysUntil(TODAY, `${year}-01-01`) + 1) / 365;
  return bo.staff.filter(s => s.ceTarget && s.status !== 'inactive').map(s => {
    const fresh = daysUntil(TODAY, s.startedAt) < 90;
    const mine = bo.ce.filter(c => c.staffId === s.id && c.date.startsWith(year));
    const approved = mine.filter(c => c.status === 'approved').reduce((n, c) => n + c.hours, 0);
    const pending = mine.filter(c => c.status === 'pending').reduce((n, c) => n + c.hours, 0);
    const target = s.ceTarget!;
    return { staff: s, approved, pending, target, percent: Math.min(100, Math.round((approved / target) * 100)), behind: !fresh && approved < target * yearShare * 0.75 };
  });
}

export interface CeInput { staffId: string; course: string; provider: string; date: string; hours: number; category: CeCategory; certificate?: string }

export function ceProblems(bo: BackofficeData, input: CeInput): string[] {
  const out: string[] = [];
  if (!staffOf(bo, input.staffId)) {
    out.push('เลือกบุคลากร');
  }
  if (!input.course.trim()) {
    out.push('ใส่ชื่อหลักสูตร');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > TODAY) {
    out.push('ใส่วันที่อบรม (ไม่เกินวันนี้)');
  }
  if (!(input.hours > 0 && input.hours <= 40)) {
    out.push('ชั่วโมงต้องมากกว่า 0 และไม่เกิน 40');
  }
  if (bo.ce.some(c => c.staffId === input.staffId && c.course === input.course.trim() && c.date === input.date)) {
    out.push('บันทึกหลักสูตรนี้ในวันนี้ไว้แล้ว');
  }
  return out;
}

/** A course attended: from the approved list it counts at once; any other waits for a reviewer and its certificate */
export function addCe(bo: BackofficeData, input: CeInput, by: string): CeRecord {
  const listed = catalogCourse(input.course.trim());
  const record: CeRecord = {
    id: nextSeq(bo.ce.map(c => c.id), 'CE-26-'), staffId: input.staffId, course: input.course.trim(), provider: listed?.provider ?? input.provider.trim(), date: input.date,
    hours: listed?.hours ?? input.hours, category: listed?.category ?? input.category, status: listed ? 'approved' : 'pending', certificate: input.certificate || undefined,
    enteredBy: by, enteredAt: at(), ...(listed ? { reviewedBy: 'ระบบ', reviewedAt: at(), note: 'หลักสูตรในรายการที่โรงพยาบาลรับรอง' } : {}),
  };
  bo.ce.unshift(record);
  return record;
}

/** Why a record cannot be counted yet: a reviewer is never the attendee, and an unlisted course needs its certificate */
export function ceReviewBlock(bo: BackofficeData, c: CeRecord, user: string, decision: 'approved' | 'rejected' = 'approved'): string | null {
  if (staffOf(bo, c.staffId)?.name === user) {
    return 'ผู้เข้าอบรมตรวจบันทึกของตัวเองไม่ได้ (การแยกหน้าที่)';
  }
  return decision === 'approved' && !c.certificate ? 'ต้องแนบใบรับรองก่อนนับชั่วโมง' : null;
}

/** The certificate's file, attached later */
export function attachCertificate(c: CeRecord, file: string) {
  c.certificate = file;
}

export function reviewCe(c: CeRecord, decision: 'approved' | 'rejected', note: string, by: string) {
  c.status = decision;
  c.reviewedBy = by;
  c.reviewedAt = at();
  c.note = note;
}

/* ---- Scope and privileges ---- */

/** What each privilege rests on: the roles it is for and the licenses it needs, verified and in date */
export const PRIVILEGE: Record<Privilege, { label: string; roles: StaffRole[]; needs: LicenseKind[] }> = {
  prescribe: { label: 'สั่งยา', roles: ['vet'], needs: ['vet-license'] },
  'prescribe-controlled': { label: 'สั่งยาควบคุม', roles: ['vet'], needs: ['vet-license', 'controlled-license'] },
  anesthesia: { label: 'วางยาสลบ', roles: ['vet'], needs: ['vet-license'] },
  surgery: { label: 'ผ่าตัด', roles: ['vet'], needs: ['vet-license'] },
  dispense: { label: 'จ่ายยา', roles: ['pharmacist'], needs: ['pharmacist-license'] },
  'witness-controlled': { label: 'พยานยาควบคุม', roles: ['vet', 'nurse', 'pharmacist'], needs: [] },
  imaging: { label: 'ถ่ายภาพรังสี', roles: ['vet', 'nurse'], needs: [] },
  discharge: { label: 'จำหน่ายผู้ป่วย', roles: ['vet', 'nurse'], needs: [] },
};
export const PRIVILEGES = Object.keys(PRIVILEGE) as Privilege[];

/** A cell of the matrix: granted or not, and whether what it rests on still holds */
export type PrivilegeCell = 'granted' | 'at-risk' | 'lapsed' | 'none' | 'n/a';
export const PRIVILEGE_CELL: Record<PrivilegeCell, { label: string; cls: string; mark: string }> = {
  granted: { label: 'มีสิทธิ์', cls: 'ok', mark: '✓' },
  'at-risk': { label: 'มีสิทธิ์ · ใบอนุญาตใกล้หมด', cls: 'warn', mark: '!' },
  lapsed: { label: 'ระงับโดยผล · ใบอนุญาตใช้ไม่ได้', cls: 'danger', mark: '✕' },
  none: { label: 'ไม่มีสิทธิ์', cls: 'quiet', mark: '—' },
  'n/a': { label: 'ไม่ใช่ของตำแหน่งนี้', cls: 'quiet', mark: '' },
};

/** What a privilege lacks for this person: a role it is not for, or a license not verified or past its date */
export function privilegeGaps(bo: BackofficeData, staffId: string, p: Privilege): string[] {
  const member = staffOf(bo, staffId);
  if (!member || !PRIVILEGE[p].roles.includes(member.role)) {
    return ['ไม่ใช่ของตำแหน่งนี้'];
  }
  return PRIVILEGE[p].needs.filter(k => !isUsable(licenseOf(bo, staffId, k))).map(k => `ต้องมี${LICENSE_KIND[k].label}ที่ตรวจสอบแล้วและยังไม่หมดอายุ`);
}

export function privilegeCell(bo: BackofficeData, staffId: string, p: Privilege): PrivilegeCell {
  const member = staffOf(bo, staffId);
  if (!member || !PRIVILEGE[p].roles.includes(member.role)) {
    return 'n/a';
  }
  if (!(bo.privileges[staffId] ?? []).includes(p)) {
    return 'none';
  }
  if (privilegeGaps(bo, staffId, p).length) {
    return 'lapsed';
  }
  const soon = PRIVILEGE[p].needs.some(k => daysUntil(licenseOf(bo, staffId, k)!.expiresAt) <= 30);
  return soon ? 'at-risk' : 'granted';
}

/** Why this change cannot be made by this person: never one's own privileges, and a grant needs what it rests on */
export function privilegeBlock(bo: BackofficeData, staffId: string, p: Privilege, action: 'grant' | 'revoke', user: string): string | null {
  if (staffOf(bo, staffId)?.name === user) {
    return 'เปลี่ยนสิทธิ์ของตัวเองไม่ได้ (การแยกหน้าที่)';
  }
  if (action === 'grant') {
    return privilegeGaps(bo, staffId, p)[0] ?? null;
  }
  return null;
}

export function changePrivilege(bo: BackofficeData, staffId: string, p: Privilege, action: 'grant' | 'revoke', reason: string, by: string): PrivilegeChange {
  const list = (bo.privileges[staffId] ??= []);
  bo.privileges[staffId] = action === 'grant' ? [...new Set([...list, p])] : list.filter(x => x !== p);
  const change: PrivilegeChange = { id: nextSeq(bo.privilegeLog.map(c => c.id), 'PV-'), staffId, privilege: p, action, reason, by, at: at() };
  bo.privilegeLog.unshift(change);
  return change;
}

/* ---- Shifts, conflicts and coverage ---- */

/** When each shift is: hours from the start of its day; the night runs into the next morning */
export const SHIFT: Record<ShiftKind, { label: string; short: string; time: string; start: number; end: number }> = {
  morning: { label: 'เช้า', short: 'ช', time: '08:00–16:00', start: 8, end: 16 },
  afternoon: { label: 'บ่าย', short: 'บ', time: '12:00–20:00', start: 12, end: 20 },
  night: { label: 'ดึก', short: 'ด', time: '20:00–08:00', start: 20, end: 32 },
};
export const SHIFT_KINDS = Object.keys(SHIFT) as ShiftKind[];
export const AREAS: Area[] = ['OPD', 'Ward', 'OR', 'Pharmacy', 'Grooming'];
export const shiftHours = (k: ShiftKind) => SHIFT[k].end - SHIFT[k].start;

/** The hospital's minimum on each shift, by role: weekdays and weekends (vets cover the nights on call) */
export function coverageRule(date: string, kind: ShiftKind): Partial<Record<StaffRole, number>> {
  const weekend = [0, 6].includes(new Date(date + 'T00:00:00').getDay());
  if (kind === 'morning') {
    return weekend ? { vet: 1, nurse: 1 } : { vet: 2, nurse: 2, pharmacist: 1 };
  }
  if (kind === 'afternoon') {
    return weekend ? { nurse: 1 } : { vet: 1, nurse: 1 };
  }
  return { nurse: 1 };
}

const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export { addDays };
/** The Monday of a date's week */
export function weekOf(date: string): string {
  const day = new Date(date + 'T00:00:00Z').getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export const daysOf = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
export const WEEKDAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const weekday = (date: string) => WEEKDAY[new Date(date + 'T00:00:00Z').getUTCDay()];

/** A shift's span in hours from a fixed origin, so shifts on different days compare */
const span = (s: Shift) => {
  const base = daysUntil(s.date, '2026-01-01') * 24;
  return [base + SHIFT[s.kind].start, base + SHIFT[s.kind].end] as const;
};

export const onLeave = (bo: BackofficeData, staffId: string, date: string, statuses: LeaveRequest['status'][] = ['approved']) =>
  bo.leaves.find(l => l.staffId === staffId && statuses.includes(l.status) && l.from <= date && date <= l.to);

/** What is wrong with a shift: hard ones keep the week from being published, soft ones are shown */
export interface Conflict { shiftId: string; staffId: string; date: string; hard: boolean; text: string }

export function shiftConflicts(bo: BackofficeData, s: Shift, all = bo.shifts): Conflict[] {
  const out: Conflict[] = [];
  const add = (hard: boolean, text: string) => out.push({ shiftId: s.id, staffId: s.staffId, date: s.date, hard, text });
  const member = staffOf(bo, s.staffId);
  const [start, end] = span(s);
  for (const o of all) {
    if (o.id === s.id || o.staffId !== s.staffId) {
      continue;
    }
    const [os, oe] = span(o);
    if (start < oe && os < end) {
      add(true, `ซ้อนกับเวร${SHIFT[o.kind].label} ${o.date}`);
    } else if (oe <= start && start - oe < 8) {
      add(false, `พักไม่ถึง 8 ชม. หลังเวร${SHIFT[o.kind].label} ${o.date}`);
    }
  }
  const leave = onLeave(bo, s.staffId, s.date);
  if (leave) {
    add(true, `อยู่ระหว่างลา (${LEAVE_TYPE[leave.type]}) ${leave.from}–${leave.to}`);
  }
  if (member?.role === 'vet') {
    const l = licenseOf(bo, member.id, 'vet-license');
    if (!l) {
      add(true, 'ยังไม่มีใบอนุญาตประกอบวิชาชีพในทะเบียน');
    } else if (l.verification !== 'verified') {
      add(true, 'ใบอนุญาตประกอบวิชาชีพยังไม่ได้ตรวจสอบ');
    } else if (daysUntil(l.expiresAt, s.date) < 0) {
      add(true, `ใบอนุญาตประกอบวิชาชีพหมดอายุ ${l.expiresAt}`);
    }
  }
  return out;
}

/** Every conflict of the shifts in a week, with the weekly hours over a person's contract */
export function weekConflicts(bo: BackofficeData, monday: string): Conflict[] {
  const days = daysOf(monday);
  const shifts = bo.shifts.filter(s => days.includes(s.date));
  const out = shifts.flatMap(s => shiftConflicts(bo, s));
  for (const member of bo.staff) {
    const mine = shifts.filter(s => s.staffId === member.id);
    const hours = mine.reduce((n, s) => n + shiftHours(s.kind), 0);
    if (mine.length && hours > member.weeklyHours + 8) {
      out.push({ shiftId: mine[mine.length - 1].id, staffId: member.id, date: monday, hard: false, text: `${hours} ชม. ในสัปดาห์ · เกินสัญญา ${member.weeklyHours} ชม. เกิน 8 ชม.` });
    }
  }
  return out;
}

export interface CoverageCell { date: string; kind: ShiftKind; role: StaffRole; need: number; have: number }

/** Who is on each shift of a week against the minimum; someone on approved leave does not count */
export function coverage(bo: BackofficeData, monday: string, without?: { staffId: string; from: string; to: string }): CoverageCell[] {
  const out: CoverageCell[] = [];
  for (const date of daysOf(monday)) {
    for (const kind of SHIFT_KINDS) {
      for (const [role, need] of Object.entries(coverageRule(date, kind)) as [StaffRole, number][]) {
        const have = bo.shifts.filter(s => s.date === date && s.kind === kind && staffOf(bo, s.staffId)?.role === role && !onLeave(bo, s.staffId, date)
          && !(without && s.staffId === without.staffId && without.from <= date && date <= without.to)).length;
        out.push({ date, kind, role, need, have });
      }
    }
  }
  return out;
}
export const gaps = (cells: CoverageCell[]) => cells.filter(c => c.have < c.need);

export interface ShiftInput { staffId: string; date: string; kind: ShiftKind; area: Area }

/** A shift as it would be, checked against the others before it is added */
export function previewShift(bo: BackofficeData, input: ShiftInput): Conflict[] {
  const draft: Shift = { id: '(new)', ...input, status: 'draft' };
  return shiftConflicts(bo, draft, [...bo.shifts, draft]);
}

export function assignShift(bo: BackofficeData, input: ShiftInput): Shift {
  const shift: Shift = { id: nextSeq(bo.shifts.map(s => s.id), 'SH-'), ...input, status: 'draft' };
  bo.shifts.push(shift);
  return shift;
}

export function removeShift(bo: BackofficeData, s: Shift) {
  bo.shifts = bo.shifts.filter(x => x.id !== s.id);
}

export const weekStatus = (bo: BackofficeData, monday: string): 'draft' | 'published' | 'empty' => {
  const shifts = bo.shifts.filter(s => daysOf(monday).includes(s.date));
  return !shifts.length ? 'empty' : shifts.some(s => s.status === 'draft') ? 'draft' : 'published';
};

/** Why a week cannot go out: any hard conflict; coverage gaps are said, not blocked, since only people can fill them */
export const publishBlock = (bo: BackofficeData, monday: string) => {
  const hard = weekConflicts(bo, monday).filter(c => c.hard);
  return hard.length ? `มีความขัดแย้งที่ต้องแก้ก่อน ${hard.length} รายการ` : null;
};

export function publishWeek(bo: BackofficeData, monday: string): number {
  const days = daysOf(monday);
  let n = 0;
  for (const s of bo.shifts.filter(x => days.includes(x.date) && x.status === 'draft')) {
    s.status = 'published';
    n++;
  }
  return n;
}

/* ---- Leave ---- */

export const LEAVE_TYPE: Record<LeaveType, string> = { vacation: 'ลาพักร้อน', sick: 'ลาป่วย', maternity: 'ลาคลอด', personal: 'ลากิจ' };
export const LEAVE_STATUS: Record<LeaveRequest['status'], { label: string; cls: string }> = {
  pending: { label: 'รออนุมัติ', cls: 'warn' },
  approved: { label: 'อนุมัติแล้ว', cls: 'ok' },
  rejected: { label: 'ไม่อนุมัติ', cls: 'danger' },
};
export const leaveDays = (l: Pick<LeaveRequest, 'from' | 'to'>) => daysUntil(l.to, l.from) + 1;

export interface LeaveImpact { shifts: Shift[]; gaps: CoverageCell[] }

/** The shifts the leave takes the person off, and the minimums those shifts would then miss */
export function leaveImpact(bo: BackofficeData, l: Pick<LeaveRequest, 'staffId' | 'from' | 'to'>): LeaveImpact {
  const shifts = bo.shifts.filter(s => s.staffId === l.staffId && l.from <= s.date && s.date <= l.to).sort((a, b) => a.date.localeCompare(b.date) || SHIFT[a.kind].start - SHIFT[b.kind].start);
  const role = staffOf(bo, l.staffId)?.role;
  const weeks = [...new Set(shifts.map(s => weekOf(s.date)))];
  const cells = weeks.flatMap(w => coverage(bo, w, l));
  const touched = new Set(shifts.map(s => `${s.date}:${s.kind}`));
  return { shifts, gaps: gaps(cells).filter(c => c.role === role && touched.has(`${c.date}:${c.kind}`)) };
}

export interface LeaveInput { staffId: string; type: LeaveType; from: string; to: string; reason: string }

export function leaveProblems(bo: BackofficeData, input: LeaveInput): string[] {
  const out: string[] = [];
  if (!staffOf(bo, input.staffId)) {
    out.push('เลือกบุคลากร');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) {
    out.push('ใส่วันเริ่มและวันสิ้นสุด');
  } else if (input.to < input.from) {
    out.push('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
  } else if (bo.leaves.some(l => l.staffId === input.staffId && l.status !== 'rejected' && l.from <= input.to && input.from <= l.to)) {
    out.push('ช่วงนี้มีคำขอลาอยู่แล้ว');
  }
  if (input.reason.trim().length < NOTE_MIN) {
    out.push('ใส่เหตุผลอย่างน้อย 10 ตัวอักษร');
  }
  return out;
}

export function requestLeave(bo: BackofficeData, input: LeaveInput, by: string): LeaveRequest {
  const leave: LeaveRequest = { id: nextSeq(bo.leaves.map(l => l.id), 'LV-2609-'), ...input, reason: input.reason.trim(), status: 'pending', requestedBy: by, requestedAt: at() };
  bo.leaves.unshift(leave);
  return leave;
}

/** Never one's own leave, nor a request one made */
export const leaveBlock = (bo: BackofficeData, l: LeaveRequest, user: string) =>
  staffOf(bo, l.staffId)?.name === user || l.requestedBy === user ? 'ผู้ขอตัดสินคำขอลาของตัวเองไม่ได้ (การแยกหน้าที่)' : null;

/** Decided: an approval leaves the shifts where they are, as conflicts the schedule shows until someone else takes them */
export function decideLeave(l: LeaveRequest, status: 'approved' | 'rejected', note: string, by: string) {
  l.status = status;
  l.decidedBy = by;
  l.decidedAt = at();
  l.decisionNote = note;
}

/** Days of leave taken this year, by type */
export function leaveTaken(bo: BackofficeData, staffId: string, year = TODAY.slice(0, 4)): Partial<Record<LeaveType, number>> {
  const out: Partial<Record<LeaveType, number>> = {};
  for (const l of bo.leaves.filter(x => x.staffId === staffId && x.status === 'approved' && x.from.startsWith(year))) {
    out[l.type] = (out[l.type] ?? 0) + leaveDays(l);
  }
  return out;
}

/* ---- On-call ---- */

/** Who may be on call that night: a vet with a usable license who is not on leave */
export function onCallEligible(bo: BackofficeData, date: string): StaffMember[] {
  return bo.staff.filter(s => s.role === 'vet' && s.status !== 'inactive' && isUsable(licenseOf(bo, s.id, 'vet-license'), date) && !onLeave(bo, s.id, date));
}
export const isWeekend = (date: string) => [0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay());

export interface Fairness { staff: StaffMember; nights: number; weekends: number }

export function fairness(bo: BackofficeData, from: string, to: string): { rows: Fairness[]; spread: number; fair: boolean } {
  const slots = bo.onCall.filter(s => from <= s.date && s.date <= to);
  const rows = bo.staff.filter(s => s.role === 'vet' && s.status !== 'inactive').map(s => {
    const mine = slots.filter(x => x.staffId === s.id);
    return { staff: s, nights: mine.length, weekends: mine.filter(x => isWeekend(x.date)).length };
  });
  const counted = rows.filter(r => r.nights > 0 || onCallEligible(bo, from).some(e => e.id === r.staff.id));
  const nights = counted.map(r => r.nights);
  const spread = nights.length ? Math.max(...nights) - Math.min(...nights) : 0;
  return { rows, spread, fair: spread <= 1 };
}

/**
 * A rotation for the nights not yet planned: each night to the eligible vet with the fewest nights so far (weekends
 * counted apart), never two nights running when someone else can take it. The published nights stay as they are.
 */
export function generateOnCall(bo: BackofficeData, from: string, to: string): OnCallSlot[] {
  const made: OnCallSlot[] = [];
  const count = new Map<string, { nights: number; weekends: number }>();
  const tally = (id: string) => count.get(id) ?? { nights: 0, weekends: 0 };
  bo.onCall = bo.onCall.filter(s => !(from <= s.date && s.date <= to && s.status === 'draft'));
  for (const s of bo.onCall.filter(x => from <= x.date && x.date <= to)) {
    const t = tally(s.staffId);
    count.set(s.staffId, { nights: t.nights + 1, weekends: t.weekends + (isWeekend(s.date) ? 1 : 0) });
  }
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (bo.onCall.some(s => s.date === date)) {
      continue;
    }
    const yesterday = bo.onCall.find(s => s.date === addDays(date, -1))?.staffId;
    const weekend = isWeekend(date);
    const pool = onCallEligible(bo, date).sort((a, b) => {
      const ta = tally(a.id);
      const tb = tally(b.id);
      return Number(a.id === yesterday) - Number(b.id === yesterday) || (weekend ? ta.weekends - tb.weekends : 0) || ta.nights - tb.nights || a.id.localeCompare(b.id);
    });
    const pick = pool[0];
    if (!pick) {
      continue;
    }
    const slot: OnCallSlot = { date, staffId: pick.id, status: 'draft' };
    bo.onCall.push(slot);
    made.push(slot);
    const t = tally(pick.id);
    count.set(pick.id, { nights: t.nights + 1, weekends: t.weekends + (weekend ? 1 : 0) });
  }
  bo.onCall.sort((a, b) => a.date.localeCompare(b.date));
  return made;
}

/** Why a night's on-call person cannot stand: off the eligible list that night */
export const slotProblem = (bo: BackofficeData, s: OnCallSlot) => (onCallEligible(bo, s.date).some(e => e.id === s.staffId) ? null : 'ไม่อยู่ในรายชื่อที่รับเวรได้คืนนี้ (ลา หรือใบอนุญาตใช้ไม่ได้)');

export function publishOnCall(bo: BackofficeData, from: string, to: string): number {
  let n = 0;
  for (const s of bo.onCall.filter(x => from <= x.date && x.date <= to && x.status === 'draft')) {
    s.status = 'published';
    n++;
  }
  return n;
}

/* ---- Overtime (operational; not payroll) ---- */

export interface OvertimeRow { staff: StaffMember; shifts: number; hours: number; night: number; contract: number; scheduled: number; callOut: number; total: number }

/** For a week: the hours the schedule holds against each person's contract, and the hours called in while on call */
export function overtime(bo: BackofficeData, monday: string): OvertimeRow[] {
  const days = daysOf(monday);
  return bo.staff.filter(s => SCHEDULED_ROLES.includes(s.role)).map(s => {
    const mine = bo.shifts.filter(x => x.staffId === s.id && days.includes(x.date) && !onLeave(bo, s.id, x.date));
    const hours = mine.reduce((n, x) => n + shiftHours(x.kind), 0);
    const night = mine.filter(x => x.kind === 'night').reduce((n, x) => n + shiftHours(x.kind), 0);
    const scheduled = Math.max(0, hours - s.weeklyHours);
    const callOut = bo.callOuts.filter(c => c.staffId === s.id && days.includes(c.date)).reduce((n, c) => n + c.hours, 0);
    return { staff: s, shifts: mine.length, hours, night, contract: s.weeklyHours, scheduled, callOut, total: scheduled + callOut };
  }).filter(r => r.shifts || r.callOut);
}

/* ---- The directory's risk columns ---- */

export interface StaffRow { staff: StaffMember; credential: LicenseState | null; shifts: number; conflicts: number; onLeaveToday: boolean }

export function staffRows(bo: BackofficeData, monday = weekOf(TODAY)): StaffRow[] {
  const days = daysOf(monday);
  const conflicts = weekConflicts(bo, monday);
  return bo.staff.map(s => ({
    staff: s, credential: credentialState(bo, s.id), shifts: bo.shifts.filter(x => x.staffId === s.id && days.includes(x.date)).length,
    conflicts: conflicts.filter(c => c.staffId === s.id).length, onLeaveToday: !!onLeave(bo, s.id, TODAY),
  }));
}
