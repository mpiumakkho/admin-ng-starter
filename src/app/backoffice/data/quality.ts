/*
 * Quality and governance, its quality half (seph1-docs 26-backoffice-erp ux/menus/07-quality-and-governance.md,
 * domains/quality-and-compliance.md): quality and patient safety (M12 P2) — incidents with the anonymous option, near
 * misses, the 5-Why RCA, the KPI library, the safety culture survey and M&M — and complaints (M28 P2, TAHSA-13) taken
 * from every channel, triaged by severity, investigated, answered (the Director signs off a severe one) and trended.
 * The spec defines no SOP/document control and no CAPA, so neither is here. Text is kept in its source language and
 * translated where it shows.
 */
import { NOW, TODAY } from '../../clinic/data/model';
import { calibrationCompliance, hoursBetween, pmCounts } from './assets';
import { daysUntil } from './home';
import { nextSeq } from './sales';
import type {
  BackofficeData, CatchPoint, Complaint, ComplaintCategory, ComplaintChannel, ComplaintSeverity, HarmLevel, Incident, KpiDefinition, MmReview, NearMiss, Rca, RcaAction, Remedy,
  SafetyCategory, SafetySurvey,
} from './types';

const at = () => `${TODAY} ${NOW}`;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMoment = (v: string) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v);
const yymm = () => `${TODAY.slice(2, 4)}${TODAY.slice(5, 7)}`;
/** A note that will stand as evidence */
export const NOTE_MIN = 10;
/** Who an anonymous report shows as: the reporter's name is never kept */
export const ANONYMOUS = 'ไม่ระบุตัวตน';

const ms = (s: string) => Date.parse(`${s.slice(0, 10)}T${s.slice(11, 16) || '00:00'}:00Z`);
export const addHours = (when: string, h: number) => new Date(ms(when) + h * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
/** Hours from now to a moment: negative once it has passed */
export const hoursLeft = (due: string) => hoursBetween(at(), due);
/** "2026-09-24T09:40" from a date-time field, as the records keep it */
export const moment = (v: string) => v.replace('T', ' ').slice(0, 16);
/** The twelve months up to this one, oldest first: "2025-10" … "2026-09" */
export function monthsBack(n: number, today = TODAY): string[] {
  const out: string[] = [];
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/* ---- Safety events (M12) ---- */

export const HARM: Record<HarmLevel, { label: string; cls: string }> = {
  1: { label: 'ไม่มีอันตราย', cls: 'quiet' },
  2: { label: 'อันตรายเล็กน้อย', cls: 'info' },
  3: { label: 'อันตรายปานกลาง', cls: 'warn' },
  4: { label: 'อันตรายรุนแรง', cls: 'danger' },
  5: { label: 'เสียชีวิต', cls: 'danger' },
};
export const HARM_LEVELS: HarmLevel[] = [1, 2, 3, 4, 5];
export const SAFETY_CATEGORY: Record<SafetyCategory, string> = {
  medication: 'ยา', surgery: 'การผ่าตัด', anaesthesia: 'การดมยา', fall: 'การพลัดตก', infection: 'การติดเชื้อ', identification: 'การระบุตัวผู้ป่วย', equipment: 'อุปกรณ์',
  communication: 'การสื่อสาร',
};
export const CATEGORIES = Object.keys(SAFETY_CATEGORY) as SafetyCategory[];
export const INCIDENT_STATUS: Record<Incident['status'], { label: string; cls: string }> = {
  reported: { label: 'รอคัดกรอง', cls: 'warn' },
  triaged: { label: 'กำลังดำเนินการ', cls: 'info' },
  closed: { label: 'ปิดแล้ว', cls: 'quiet' },
};
export const SAFETY_PLACES = ['OPD', 'ห้องผ่าตัด 1', 'ห้องผ่าตัด 2', 'ICU', 'Dog ward', 'Cat ward', 'Isolation', 'ห้องยา', 'ห้องปฏิบัติการ', 'ห้องเอกซเรย์', 'แผนกต้อนรับ'];

/** A major harm or a death is analysed to its root before it closes */
export const needsRca = (i: Incident) => i.harm >= 4;
/** Triage within a day for a major harm or a death, within three days for any other */
export const triageHours = (harm: HarmLevel) => (harm >= 4 ? 24 : 72);
export const triageDue = (i: Incident) => addHours(i.reportedAt, triageHours(i.harm));
export const triageLate = (i: Incident) => i.status === 'reported' && hoursLeft(triageDue(i)) < 0;
export const reporterOf = (r: { reportedBy?: string }) => r.reportedBy ?? ANONYMOUS;

export interface IncidentInput {
  at: string;
  category: SafetyCategory | '';
  location: string;
  pet: string;
  description: string;
  immediateAction: string;
  harm: string;
  anonymous: boolean;
}

export function incidentProblems(input: IncidentInput): string[] {
  const out: string[] = [];
  const when = moment(input.at);
  if (!isMoment(when) || when > at()) {
    out.push('ใส่วันเวลาที่เกิดเหตุ (ไม่เกินตอนนี้)');
  }
  if (!input.category) {
    out.push('เลือกประเภทเหตุการณ์');
  }
  if (!input.location) {
    out.push('เลือกสถานที่');
  }
  if (input.description.trim().length < NOTE_MIN) {
    out.push('เล่าเหตุการณ์อย่างน้อย 10 ตัวอักษร');
  }
  if (input.immediateAction.trim().length < NOTE_MIN) {
    out.push('บันทึกสิ่งที่ทำทันทีอย่างน้อย 10 ตัวอักษร');
  }
  if (!HARM_LEVELS.includes(Number(input.harm) as HarmLevel)) {
    out.push('เลือกระดับอันตราย');
  }
  return out;
}

/** Reported, under the reporter's name or none: an anonymous report keeps no trace of who sent it */
export function reportIncident(bo: BackofficeData, input: IncidentInput, by: string, source?: string): Incident {
  const harm = Number(input.harm) as HarmLevel;
  const who = input.anonymous ? undefined : by;
  const i: Incident = {
    id: nextSeq(bo.incidents.map(x => x.id), `INC-${yymm()}-`), at: moment(input.at), reportedAt: at(), reportedBy: who, category: input.category as SafetyCategory,
    location: input.location, pet: input.pet.trim() || undefined, description: input.description.trim(), immediateAction: input.immediateAction.trim(), harm, status: 'reported', source,
    history: [[at(), who ?? ANONYMOUS, 'รับแจ้งอุบัติการณ์', `${HARM[harm].label} · ${SAFETY_CATEGORY[input.category as SafetyCategory]}`]],
  };
  bo.incidents.unshift(i);
  return i;
}

export interface TriageInput { harm: string; owner: string; note: string }

export function triageProblems(i: Incident, input: TriageInput): string[] {
  const out: string[] = [];
  if (i.status !== 'reported') {
    out.push('คัดกรองแล้ว');
  }
  if (!HARM_LEVELS.includes(Number(input.harm) as HarmLevel)) {
    out.push('เลือกระดับอันตราย');
  }
  if (input.owner.trim().length < 2) {
    out.push('ระบุผู้รับผิดชอบ');
  }
  if (input.note.trim().length < NOTE_MIN) {
    out.push('บันทึกเหตุผลการคัดกรองอย่างน้อย 10 ตัวอักษร');
  }
  return out;
}

export function triageIncident(i: Incident, input: TriageInput, by: string) {
  const before = i.harm;
  Object.assign(i, { harm: Number(input.harm) as HarmLevel, owner: input.owner.trim(), status: 'triaged', triagedBy: by, triagedAt: at() });
  i.history.push([at(), by, 'คัดกรองเรียบร้อย', `${HARM[before].label} → ${HARM[i.harm].label} · ${i.owner} · ${input.note.trim()}`]);
}

/** Why an incident cannot close yet: it is not triaged, or a major harm has no approved RCA */
export function closeBlock(bo: BackofficeData, i: Incident): string | null {
  if (i.status === 'closed') {
    return 'อุบัติการณ์นี้ปิดแล้ว';
  }
  if (i.status === 'reported') {
    return 'คัดกรองก่อนปิด';
  }
  if (needsRca(i) && rcaOf(bo, i.rcaId)?.status !== 'approved') {
    return 'อันตรายระดับรุนแรงขึ้นไปต้องมี RCA ที่อนุมัติแล้วก่อนปิด';
  }
  return null;
}

export function closeIncident(i: Incident, outcome: string, by: string) {
  Object.assign(i, { status: 'closed', closedBy: by, closedAt: at(), outcome: outcome.trim() });
  i.history.push([at(), by, 'ปิดอุบัติการณ์แล้ว', outcome.trim()]);
}

/* ---- Near misses ---- */

export const CATCH_POINT: Record<CatchPoint, string> = {
  prescribing: 'ขั้นสั่งยา', dispensing: 'ขั้นจ่ายยา', administration: 'ขั้นให้ยา', procedure: 'ก่อนทำหัตถการ', handover: 'การส่งเวร', specimen: 'การเก็บสิ่งส่งตรวจ',
};
export const CATCH_POINTS = Object.keys(CATCH_POINT) as CatchPoint[];
export const NEAR_MISS_STATUS: Record<NearMiss['status'], { label: string; cls: string }> = {
  open: { label: 'รอมาตรการป้องกัน', cls: 'warn' },
  actioned: { label: 'มีมาตรการแล้ว', cls: 'ok' },
  escalated: { label: 'ยกระดับเป็นอุบัติการณ์', cls: 'info' },
};

export interface NearMissInput {
  at: string;
  category: SafetyCategory | '';
  location: string;
  description: string;
  caughtAt: CatchPoint | '';
  caughtBy: string;
  anonymous: boolean;
}

export function nearMissProblems(input: NearMissInput): string[] {
  const out: string[] = [];
  const when = moment(input.at);
  if (!isMoment(when) || when > at()) {
    out.push('ใส่วันเวลาที่พบ (ไม่เกินตอนนี้)');
  }
  if (!input.category) {
    out.push('เลือกประเภทเหตุการณ์');
  }
  if (!input.location) {
    out.push('เลือกสถานที่');
  }
  if (!input.caughtAt) {
    out.push('เลือกขั้นตอนที่จับได้');
  }
  if (input.caughtBy.trim().length < 2) {
    out.push('ระบุผู้ที่จับได้');
  }
  if (input.description.trim().length < NOTE_MIN) {
    out.push('เล่าเหตุการณ์อย่างน้อย 10 ตัวอักษร');
  }
  return out;
}

export function recordNearMiss(bo: BackofficeData, input: NearMissInput, by: string): NearMiss {
  const who = input.anonymous ? undefined : by;
  const n: NearMiss = {
    id: nextSeq(bo.nearMisses.map(x => x.id), `NM-${yymm()}-`), at: moment(input.at), reportedBy: who, category: input.category as SafetyCategory, location: input.location,
    description: input.description.trim(), caughtAt: input.caughtAt as CatchPoint, caughtBy: input.caughtBy.trim(), status: 'open',
    history: [[at(), who ?? ANONYMOUS, 'รับแจ้งเหตุเกือบพลาด', `${CATCH_POINT[input.caughtAt as CatchPoint]} · ${input.caughtBy.trim()}`]],
  };
  bo.nearMisses.unshift(n);
  return n;
}

export function preventNearMiss(n: NearMiss, prevention: string, by: string) {
  n.prevention = prevention.trim();
  n.status = 'actioned';
  n.history.push([at(), by, 'บันทึกมาตรการป้องกันแล้ว', n.prevention]);
}

/** Escalated: it turned out to reach the patient, or keeps coming back; the incident it opens carries its number */
export function escalateNearMiss(bo: BackofficeData, n: NearMiss, harm: HarmLevel, reason: string, by: string): Incident {
  const i = reportIncident(bo, {
    at: n.at, category: n.category, location: n.location, pet: '', description: n.description, immediateAction: `${CATCH_POINT[n.caughtAt]} · ${n.caughtBy} · ${reason.trim()}`,
    harm: String(harm), anonymous: false,
  }, by, n.id);
  n.status = 'escalated';
  n.incidentId = i.id;
  n.history.push([at(), by, 'ยกระดับเป็นอุบัติการณ์', `${i.id} · ${reason.trim()}`]);
  return i;
}

/* ---- Root cause analysis ---- */

/** The 5-Why minimum M12 sets */
export const WHY_MIN = 5;
export const RCA_STATUS: Record<Rca['status'], { label: string; cls: string }> = {
  open: { label: 'กำลังวิเคราะห์', cls: 'info' },
  review: { label: 'รออนุมัติ', cls: 'warn' },
  approved: { label: 'อนุมัติแล้ว', cls: 'ok' },
};
export const rcaOf = (bo: BackofficeData, id?: string) => (id ? bo.rcas.find(r => r.id === id) : undefined);

/** What an RCA analyses: an incident, a near miss or a complaint, by its number */
export function rcaSource(bo: BackofficeData, ref: string): { kind: string; title: string; link: string } | null {
  const i = bo.incidents.find(x => x.id === ref);
  if (i) {
    return { kind: 'อุบัติการณ์', title: i.description, link: '/backoffice/quality/incidents' };
  }
  const n = bo.nearMisses.find(x => x.id === ref);
  if (n) {
    return { kind: 'เหตุเกือบพลาด', title: n.description, link: '/backoffice/quality/near-miss' };
  }
  const c = bo.complaints.find(x => x.id === ref);
  return c ? { kind: 'ข้อร้องเรียน', title: c.subject, link: '/backoffice/quality/complaints' } : null;
}

/** An RCA opened on a record, which then points to it */
export function openRca(bo: BackofficeData, source: string, title: string, team: string[], by: string): Rca {
  const r: Rca = {
    id: nextSeq(bo.rcas.map(x => x.id), `RCA-${yymm()}-`), source, title: title.trim(), team, openedBy: by, openedAt: at(), whys: [], rootCause: '', actions: [], status: 'open',
    history: [[at(), by, 'เปิด RCA แล้ว', `${source} · ${team.join(', ')}`]],
  };
  bo.rcas.unshift(r);
  const i = bo.incidents.find(x => x.id === source);
  if (i) {
    i.rcaId = r.id;
    i.history.push([at(), by, 'เปิด RCA แล้ว', r.id]);
  }
  const c = bo.complaints.find(x => x.id === source);
  if (c) {
    c.links.push(r.id);
    c.history.push([at(), by, 'เปิด RCA แล้ว', r.id]);
  }
  return r;
}

export const whyProblem = (text: string) => (text.trim().length >= NOTE_MIN ? null : 'คำตอบ "ทำไม" อย่างน้อย 10 ตัวอักษร');

export function addWhy(r: Rca, text: string, by: string) {
  r.whys.push(text.trim());
  r.history.push([at(), by, `ทำไมข้อ ${r.whys.length}`, text.trim()]);
}

export function setRootCause(r: Rca, text: string, by: string) {
  r.rootCause = text.trim();
  r.history.push([at(), by, 'สรุปสาเหตุราก', r.rootCause]);
}

export function actionProblems(a: { text: string; owner: string; due: string }): string[] {
  const out: string[] = [];
  if (a.text.trim().length < NOTE_MIN) {
    out.push('มาตรการอย่างน้อย 10 ตัวอักษร');
  }
  if (a.owner.trim().length < 2) {
    out.push('ระบุผู้รับผิดชอบมาตรการ');
  }
  if (!isDate(a.due) || a.due < TODAY) {
    out.push('กำหนดเสร็จต้องไม่ก่อนวันนี้');
  }
  return out;
}

export function addRcaAction(r: Rca, a: { text: string; owner: string; due: string }, by: string) {
  r.actions.push({ text: a.text.trim(), owner: a.owner.trim(), due: a.due });
  r.history.push([at(), by, 'เพิ่มมาตรการแล้ว', `${a.text.trim()} · ${a.owner.trim()} · ${a.due}`]);
}

/** What an RCA still lacks before it goes for approval */
export function submitProblems(r: Rca): string[] {
  const out: string[] = [];
  if (r.status !== 'open') {
    out.push('RCA นี้ส่งแล้ว');
  }
  if (r.whys.length < WHY_MIN) {
    out.push(`ต้องถาม "ทำไม" อย่างน้อย ${WHY_MIN} ข้อ (ตอนนี้ ${r.whys.length})`);
  }
  if (r.rootCause.trim().length < NOTE_MIN) {
    out.push('สรุปสาเหตุรากก่อนส่ง');
  }
  if (!r.actions.length) {
    out.push('ต้องมีมาตรการอย่างน้อย 1 ข้อ');
  }
  return out;
}

export function submitRca(r: Rca, by: string) {
  Object.assign(r, { status: 'review', submittedBy: by, submittedAt: at() });
  r.history.push([at(), by, 'ส่งอนุมัติแล้ว', `${r.whys.length} ทำไม · ${r.actions.length} มาตรการ`]);
}

/** Who may approve: someone outside the team that did the analysis, and not the one who sent it */
export function approveBlock(r: Rca, user: string): string | null {
  if (r.status !== 'review') {
    return 'RCA นี้ไม่ได้รออนุมัติ';
  }
  return user === r.submittedBy || r.team.includes(user) || r.team.some(t => user.startsWith(t)) ? 'ผู้อนุมัติต้องไม่ใช่ทีมวิเคราะห์หรือผู้ส่ง (การแยกหน้าที่)' : null;
}

/** Approved, or sent back to the team with what it lacks */
export function decideRca(r: Rca, approve: boolean, note: string, by: string) {
  if (approve) {
    Object.assign(r, { status: 'approved', approvedBy: by, approvedAt: at(), note: note.trim() });
  } else {
    Object.assign(r, { status: 'open', note: note.trim() });
  }
  r.history.push([at(), by, approve ? 'อนุมัติ RCA แล้ว' : 'ส่งกลับให้ทีมแก้ไขแล้ว', note.trim()]);
}

export function completeAction(r: Rca, a: RcaAction, by: string) {
  a.doneAt = TODAY;
  r.history.push([at(), by, 'มาตรการเสร็จ', a.text]);
}

/** Actions of approved RCAs past their date and not done */
export const overdueActions = (bo: BackofficeData) =>
  bo.rcas.filter(r => r.status === 'approved').flatMap(r => r.actions.filter(a => !a.doneAt && a.due < TODAY).map(a => ({ rca: r, action: a })));

/* ---- The quality dashboard ---- */

export function qualityCounts(bo: BackofficeData) {
  const open = bo.incidents.filter(i => i.status !== 'closed');
  const from = addHours(at(), -30 * 24).slice(0, 10);
  return {
    open: open.length,
    awaitingTriage: open.filter(i => i.status === 'reported').length,
    triageLate: open.filter(triageLate).length,
    severeOpen: open.filter(needsRca).length,
    nearMiss30: bo.nearMisses.filter(n => n.at.slice(0, 10) >= from).length,
    nearMissOpen: bo.nearMisses.filter(n => n.status === 'open').length,
    rcaOpen: bo.rcas.filter(r => r.status !== 'approved').length,
    rcaReview: bo.rcas.filter(r => r.status === 'review').length,
    actionsLate: overdueActions(bo).length,
  };
}

/** Each of the twelve months: the incidents, the near misses, and the incidents of major harm or worse */
export function safetyTrend(bo: BackofficeData) {
  return monthsBack(12).map(month => {
    const incidents = bo.incidents.filter(i => i.at.startsWith(month));
    return { month, incidents: incidents.length, severe: incidents.filter(needsRca).length, nearMisses: bo.nearMisses.filter(n => n.at.startsWith(month)).length };
  });
}

/* ---- KPI library ---- */

export const KPI_DOMAIN: Record<KpiDefinition['domain'], string> = { clinical: 'คลินิก', operational: 'การดำเนินงาน', financial: 'การเงิน' };

/** The KPIs read from the modules as they are now, not from a monthly snapshot */
const LIVE: Record<string, (bo: BackofficeData) => number> = {
  /* near misses per incident, this month: more near misses reported per harm is a reporting culture that works */
  K04: bo => {
    const month = TODAY.slice(0, 7);
    const incidents = bo.incidents.filter(i => i.at.startsWith(month)).length;
    return Math.round((bo.nearMisses.filter(n => n.at.startsWith(month)).length / Math.max(1, incidents)) * 10) / 10;
  },
  K05: bo => {
    const c = pmCounts(bo);
    const total = c.overdue + c.due30 + c.scheduled;
    return total ? Math.round(((total - c.overdue) / total) * 100) : 100;
  },
  K06: bo => calibrationCompliance(bo).percent,
  K07: bo => responseCompliance(bo).percent,
};
export const isLive = (k: KpiDefinition) => k.id in LIVE;

/** Its months, the current one read live when the KPI is */
export function kpiSeries(bo: BackofficeData, k: KpiDefinition): [month: string, value: number][] {
  const live = LIVE[k.id];
  if (!live) {
    return k.snapshots;
  }
  const month = TODAY.slice(0, 7);
  return [...k.snapshots.filter(s => s[0] !== month), [month, live(bo)]];
}
export const onTarget = (k: KpiDefinition, v: number) => (k.better === 'higher' ? v >= k.target : v <= k.target);

export function kpiNow(bo: BackofficeData, k: KpiDefinition) {
  const series = kpiSeries(bo, k);
  const [month, value] = series.at(-1) ?? [TODAY.slice(0, 7), 0];
  const previous = series.at(-2)?.[1];
  const change = previous === undefined ? 0 : Math.round((value - previous) * 10) / 10;
  return { month, value, previous, change, improving: change === 0 ? null : (change > 0) === (k.better === 'higher'), met: onTarget(k, value), live: isLive(k) };
}

export function targetProblem(k: KpiDefinition, target: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(target.trim())) {
    return 'ใส่เป้าหมายเป็นตัวเลข';
  }
  if (Number(target) === k.target) {
    return 'เป้าหมายใหม่ต้องไม่เท่าเดิม';
  }
  return k.unit === '%' && Number(target) > 100 ? 'เป้าหมายร้อยละต้องไม่เกิน 100' : null;
}

export function targetProblems(k: KpiDefinition, target: string, reason: string): string[] {
  return [targetProblem(k, target), reason.trim().length < NOTE_MIN ? 'บันทึกเหตุผลอย่างน้อย 10 ตัวอักษร' : null].filter((p): p is string => !!p);
}

export function setTarget(k: KpiDefinition, target: number, reason: string, by: string) {
  k.history.push([at(), by, 'เปลี่ยนเป้าหมายแล้ว', `${k.target} → ${target} · ${reason.trim()}`]);
  k.target = target;
}

/* ---- Safety culture and M&M ---- */

/** A round's result stands for the hospital once at least half the staff have answered */
export const SURVEY_MIN_RATE = 50;
export const responseRate = (s: SafetySurvey) => Math.round((s.responded / Math.max(1, s.invited)) * 100);
export const surveyBlock = (s: SafetySurvey) =>
  s.status === 'closed' ? 'รอบนี้ปิดแล้ว' : responseRate(s) < SURVEY_MIN_RATE ? `ตอบแล้ว ${responseRate(s)}% ต้องถึง ${SURVEY_MIN_RATE}% ก่อนปิดรอบ` : null;

export function closeSurvey(s: SafetySurvey, by: string) {
  s.status = 'closed';
  s.closedBy = by;
}

/** A dimension's change from the round before, in points */
export function dimensionChange(current: SafetySurvey, previous: SafetySurvey | undefined, name: string): number | null {
  const was = previous?.dimensions.find(d => d[0] === name)?.[1];
  const now = current.dimensions.find(d => d[0] === name)?.[1];
  return was === undefined || now === undefined ? null : now - was;
}

export const MM_OUTCOME: Record<MmReview['outcome'], { label: string; cls: string }> = {
  death: { label: 'เสียชีวิต', cls: 'danger' },
  complication: { label: 'ภาวะแทรกซ้อน', cls: 'warn' },
  readmission: { label: 'กลับมารักษาซ้ำ', cls: 'info' },
};

export interface MmInput { pet: string; outcome: MmReview['outcome']; eventDate: string; summary: string; presenter: string; reviewDate: string; incidentId: string }

export function mmProblems(bo: BackofficeData, input: MmInput): string[] {
  const out: string[] = [];
  if (input.pet.trim().length < 2) {
    out.push('ใส่ชื่อผู้ป่วย');
  }
  if (!isDate(input.eventDate) || input.eventDate > TODAY) {
    out.push('ใส่วันที่เกิดเหตุ (ไม่เกินวันนี้)');
  }
  if (!isDate(input.reviewDate) || input.reviewDate < TODAY) {
    out.push('วันประชุมต้องไม่ก่อนวันนี้');
  }
  if (input.summary.trim().length < NOTE_MIN) {
    out.push('สรุปเคสอย่างน้อย 10 ตัวอักษร');
  }
  if (input.presenter.trim().length < 2) {
    out.push('ระบุผู้นำเสนอ');
  }
  if (input.incidentId && !bo.incidents.some(i => i.id === input.incidentId)) {
    out.push('ไม่พบเลขอุบัติการณ์นี้');
  }
  return out;
}

export function scheduleMm(bo: BackofficeData, input: MmInput): MmReview {
  const m: MmReview = {
    id: nextSeq(bo.mm.map(x => x.id), `MM-${yymm()}-`), pet: input.pet.trim(), outcome: input.outcome, eventDate: input.eventDate, summary: input.summary.trim(),
    presenter: input.presenter.trim(), reviewDate: input.reviewDate, status: 'scheduled', incidentId: input.incidentId || undefined,
  };
  bo.mm.unshift(m);
  return m;
}

export const mmBlock = (m: MmReview) => (m.status === 'reviewed' ? 'ทบทวนแล้ว' : m.reviewDate > TODAY ? `ยังไม่ถึงวันประชุม (${m.reviewDate})` : null);

export function recordMm(m: MmReview, learning: string, attendees: number) {
  Object.assign(m, { status: 'reviewed', learning: learning.trim(), attendees });
}

/* ---- Complaints (M28) ---- */

export const CHANNEL: Record<ComplaintChannel, string> = { line: 'LINE', phone: 'โทรศัพท์', 'in-person': 'ที่โรงพยาบาล', email: 'อีเมล' };
export const CHANNELS = Object.keys(CHANNEL) as ComplaintChannel[];
export const COMPLAINT_CATEGORY: Record<ComplaintCategory, string> = { clinical: 'การรักษา', operational: 'การบริการ', financial: 'การเงิน' };
export const COMPLAINT_CATEGORIES = Object.keys(COMPLAINT_CATEGORY) as ComplaintCategory[];
/** How soon each severity is answered */
export const COMPLAINT_SEVERITY: Record<ComplaintSeverity, { label: string; cls: string; hours: number }> = {
  severe: { label: 'รุนแรง', cls: 'danger', hours: 24 },
  moderate: { label: 'ปานกลาง', cls: 'warn', hours: 72 },
  low: { label: 'ต่ำ', cls: 'quiet', hours: 168 },
};
export const SEVERITIES = Object.keys(COMPLAINT_SEVERITY) as ComplaintSeverity[];
export const COMPLAINT_STATUS: Record<Complaint['status'], { label: string; cls: string }> = {
  new: { label: 'รอคัดกรอง', cls: 'warn' },
  triaged: { label: 'มอบหมายแล้ว', cls: 'info' },
  investigating: { label: 'กำลังสอบสวน', cls: 'info' },
  responded: { label: 'ตอบกลับแล้ว', cls: 'ok' },
  resolved: { label: 'แก้ไขแล้ว', cls: 'quiet' },
};
export const REMEDY: Record<Remedy, string> = {
  apology: 'ขอโทษและชี้แจง', refund: 'คืนเงิน', credit: 'ส่วนลดครั้งถัดไป', process: 'ปรับปรุงขั้นตอน', none: 'ไม่มีการชดเชย',
};
export const TOPICS = ['เวลารอ', 'การสื่อสาร', 'ค่าบริการ', 'ยา', 'ผลการรักษา', 'การนัดหมาย', 'ความสะอาด', 'พฤติกรรมบริการ'];
export const HANDLERS = ['ผู้จัดการ OPD', 'หัวหน้าพยาบาล', 'การเงิน', 'ภก. ธนพร', 'ผู้อำนวยการ'];
/** Who may lodge a complaint with a regulator on the hospital's behalf, and the bodies it goes to */
export const REGULATORS = ['สัตวแพทยสภา', 'สำนักงานคณะกรรมการคุ้มครองผู้บริโภค (สคบ.)', 'กรมปศุสัตว์'];
/** Every complaint is triaged within four hours of coming in */
export const TRIAGE_HOURS = 4;

export const complaintOf = (bo: BackofficeData, id: string) => bo.complaints.find(c => c.id === id);
export const complainantOf = (c: Complaint) => c.ownerKey ?? `${ANONYMOUS} (บุคลากร)`;
export const complaintTriageDue = (c: Complaint) => addHours(c.receivedAt, TRIAGE_HOURS);
export const responseDue = (c: Complaint) => (c.severity ? addHours(c.receivedAt, COMPLAINT_SEVERITY[c.severity].hours) : undefined);

export type SlaState = 'met' | 'breached' | 'due-soon' | 'on-track' | 'triage';
export const SLA_STATE: Record<SlaState, { label: string; cls: string }> = {
  breached: { label: 'เกินกำหนด', cls: 'danger' },
  'due-soon': { label: 'ใกล้ครบกำหนด', cls: 'warn' },
  triage: { label: 'รอคัดกรอง', cls: 'warn' },
  'on-track': { label: 'ทันเวลา', cls: 'ok' },
  met: { label: 'ตอบทันกำหนด', cls: 'ok' },
};

/** Where its answer stands: in time, nearly out of it (the last quarter of its window), or past; before triage, the triage clock */
export function slaState(c: Complaint): SlaState {
  const due = responseDue(c);
  if (c.response?.sentAt) {
    return due && c.response.sentAt <= due ? 'met' : 'breached';
  }
  if (!c.severity || !due) {
    return hoursLeft(complaintTriageDue(c)) < 0 ? 'breached' : 'triage';
  }
  const left = hoursLeft(due);
  return left < 0 ? 'breached' : left <= COMPLAINT_SEVERITY[c.severity].hours / 4 ? 'due-soon' : 'on-track';
}
export const isOpen = (c: Complaint) => c.status !== 'resolved' && c.status !== 'responded';
export const awaitingSignOff = (c: Complaint) => c.severity === 'severe' && !!c.response && !c.response.sentAt;

export interface ComplaintInput {
  channel: ComplaintChannel;
  ownerKey: string;
  pet: string;
  anonymous: boolean;
  category: ComplaintCategory;
  topic: string;
  subject: string;
  description: string;
}

export function complaintProblems(input: ComplaintInput): string[] {
  const out: string[] = [];
  if (!input.anonymous && !input.ownerKey) {
    out.push('เลือกผู้ร้องเรียน หรือระบุว่าเป็นข้อร้องเรียนไม่ระบุตัวตนของบุคลากร');
  }
  if (!input.topic) {
    out.push('เลือกหัวข้อ');
  }
  if (input.subject.trim().length < 5) {
    out.push('ใส่เรื่องอย่างน้อย 5 ตัวอักษร');
  }
  if (input.description.trim().length < NOTE_MIN) {
    out.push('ใส่รายละเอียดอย่างน้อย 10 ตัวอักษร');
  }
  return out;
}

/** Taken in, whatever the channel: what was said is its first communication */
export function receiveComplaint(bo: BackofficeData, input: ComplaintInput, by: string): Complaint {
  const from = input.anonymous ? undefined : input.ownerKey;
  const c: Complaint = {
    id: nextSeq(bo.complaints.map(x => x.id), `CMP-${yymm()}-`), receivedAt: at(), channel: input.channel, ownerKey: from, pet: from ? input.pet || undefined : undefined,
    category: input.category, topic: input.topic, subject: input.subject.trim(), description: input.description.trim(), status: 'new', links: [],
    communications: [[at(), from ?? ANONYMOUS, 'in', input.channel, input.description.trim()]],
    history: [[at(), by, 'รับเรื่องร้องเรียน', `${CHANNEL[input.channel]} · ${input.subject.trim()}`]],
  };
  bo.complaints.unshift(c);
  return c;
}

export function triageComplaint(c: Complaint, severity: ComplaintSeverity, handler: string, by: string) {
  Object.assign(c, { severity, handler, status: 'triaged', triagedBy: by, triagedAt: at() });
  c.history.push([at(), by, 'คัดกรองเรียบร้อย', `${COMPLAINT_SEVERITY[severity].label} · ${handler} · ตอบภายใน ${responseDue(c)}`]);
}

export function logContact(c: Complaint, direction: 'in' | 'out', channel: ComplaintChannel, text: string, by: string) {
  c.communications.push([at(), direction === 'in' ? complainantOf(c) : by, direction, channel, text.trim()]);
}

/** The links an investigation may rest on: near misses, incidents and RCAs that exist */
export function linkProblems(bo: BackofficeData, links: string[]): string | null {
  const unknown = links.filter(l => !bo.nearMisses.some(n => n.id === l) && !bo.incidents.some(i => i.id === l) && !bo.rcas.some(r => r.id === l));
  return unknown.length ? `ไม่พบเลขที่ ${unknown.join(', ')}` : null;
}

export function recordFindings(c: Complaint, findings: string, links: string[], by: string) {
  c.findings = findings.trim();
  c.links = [...new Set([...c.links, ...links])];
  c.status = c.status === 'triaged' ? 'investigating' : c.status;
  c.history.push([at(), by, 'บันทึกผลสอบสวนแล้ว', [findings.trim(), links.join(', ')].filter(Boolean).join(' · ')]);
}

/** Why it cannot be answered yet: not triaged, or a moderate or severe one not yet investigated */
export function responseBlock(c: Complaint): string | null {
  if (c.status === 'new') {
    return 'คัดกรองก่อนตอบกลับ';
  }
  if (c.response?.sentAt) {
    return 'ตอบกลับแล้ว';
  }
  if (awaitingSignOff(c)) {
    return 'คำตอบรอผู้อำนวยการลงนาม';
  }
  return c.severity !== 'low' && !c.findings ? 'ข้อร้องเรียนระดับปานกลางขึ้นไปต้องบันทึกผลสอบสวนก่อนตอบ' : null;
}

/** An answer: sent at once, or for a severe complaint drafted for the Director to sign off */
export function respond(c: Complaint, text: string, by: string) {
  c.response = { text: text.trim(), draftedBy: by, draftedAt: at() };
  if (c.severity === 'severe') {
    c.history.push([at(), by, 'ร่างคำตอบแล้ว', 'รอผู้อำนวยการลงนาม']);
    return;
  }
  send(c, by);
}

function send(c: Complaint, by: string) {
  Object.assign(c.response!, { sentAt: at(), sentBy: by });
  c.status = 'responded';
  c.communications.push([at(), by, 'out', c.channel, c.response!.text]);
  c.history.push([at(), by, 'ส่งคำตอบแล้ว', `${CHANNEL[c.channel]} · ${SLA_STATE[slaState(c)].label}`]);
}

/** The Director's sign-off of a severe complaint's answer, by someone other than its drafter; the answer then goes */
export function signOffBlock(c: Complaint, user: string): string | null {
  if (!awaitingSignOff(c)) {
    return 'ไม่มีคำตอบที่รอลงนาม';
  }
  return c.response!.draftedBy === user ? 'ผู้ร่างคำตอบลงนามเองไม่ได้ (การแยกหน้าที่)' : null;
}

export function signOff(c: Complaint, note: string, by: string) {
  Object.assign(c.response!, { signedOffBy: by, signedOffAt: at() });
  c.history.push([at(), by, 'ลงนามคำตอบแล้ว', note.trim()]);
  send(c, by);
}

export function sendBack(c: Complaint, note: string, by: string) {
  c.history.push([at(), by, 'ส่งคำตอบกลับไปแก้แล้ว', note.trim()]);
  c.response = undefined;
}

export const resolveBlock = (c: Complaint) => (c.status !== 'responded' ? 'ตอบกลับผู้ร้องเรียนก่อนปิดเรื่อง' : null);

export function resolveComplaint(c: Complaint, outcome: string, remedy: Remedy, by: string) {
  c.resolution = { outcome: outcome.trim(), remedy, by, at: at() };
  c.status = 'resolved';
  c.history.push([at(), by, 'ปิดเรื่องแล้ว', `${REMEDY[remedy]} · ${outcome.trim()}`]);
}

export const satisfactionBlock = (c: Complaint) =>
  c.status !== 'resolved' ? 'ติดตามความพึงพอใจได้เมื่อปิดเรื่องแล้ว' : c.satisfaction ? 'ติดตามความพึงพอใจแล้ว' : !c.ownerKey ? 'ข้อร้องเรียนไม่ระบุตัวตนติดตามไม่ได้' : null;

export function recordSatisfaction(c: Complaint, score: number, note: string, by: string) {
  c.satisfaction = { score, at: at(), note: note.trim() || undefined };
  c.history.push([at(), by, 'บันทึกความพึงพอใจ', `${score}/5${note.trim() ? ` · ${note.trim()}` : ''}`]);
}

export const escalateBlock = (c: Complaint) => (c.escalation ? `ส่งถึง${c.escalation.body}แล้ว` : c.severity !== 'severe' ? 'ส่งหน่วยงานกำกับได้เฉพาะข้อร้องเรียนรุนแรง' : null);

export function escalate(c: Complaint, body: string, reason: string, by: string) {
  c.escalation = { body, reason: reason.trim(), by, at: at() };
  c.history.push([at(), by, 'แจ้งหน่วยงานกำกับแล้ว', `${body} · ${reason.trim()}`]);
}

export function complaintCounts(bo: BackofficeData) {
  const open = bo.complaints.filter(isOpen);
  return {
    open: open.length,
    new: open.filter(c => c.status === 'new').length,
    dueSoon: open.filter(c => slaState(c) === 'due-soon').length,
    breached: open.filter(c => slaState(c) === 'breached').length,
    severe: open.filter(c => c.severity === 'severe').length,
    signOff: bo.complaints.filter(awaitingSignOff).length,
  };
}

/** The answers sent, and the share sent in time */
export function responseCompliance(bo: BackofficeData) {
  const sent = bo.complaints.filter(c => c.response?.sentAt);
  const met = sent.filter(c => slaState(c) === 'met').length;
  return { sent: sent.length, met, percent: sent.length ? Math.round((met / sent.length) * 100) : 100 };
}

/** Six months of complaints by category */
export function complaintTrend(bo: BackofficeData, months = 6) {
  return monthsBack(months).map(month => {
    const these = bo.complaints.filter(c => c.receivedAt.startsWith(month));
    return { month, total: these.length, ...Object.fromEntries(COMPLAINT_CATEGORIES.map(k => [k, these.filter(c => c.category === k).length])) } as
      { month: string; total: number } & Record<ComplaintCategory, number>;
  });
}

/** A topic is recurring when it comes back three times or more within 90 days */
export const RECURRING_MIN = 3;
export function recurring(bo: BackofficeData, days = 90) {
  const counts = new Map<string, Complaint[]>();
  for (const c of bo.complaints.filter(x => -daysUntil(x.receivedAt) <= days)) {
    counts.set(c.topic, [...(counts.get(c.topic) ?? []), c]);
  }
  return [...counts].map(([topic, list]) => ({ topic, count: list.length, recurring: list.length >= RECURRING_MIN, latest: list.map(c => c.receivedAt).sort().at(-1)! }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

export function satisfaction(bo: BackofficeData) {
  const scored = bo.complaints.filter(c => c.satisfaction);
  const total = scored.reduce((n, c) => n + c.satisfaction!.score, 0);
  return {
    count: scored.length, mean: scored.length ? Math.round((total / scored.length) * 10) / 10 : 0,
    awaiting: bo.complaints.filter(c => !satisfactionBlock(c)).length,
    spread: [5, 4, 3, 2, 1].map(score => [score, scored.filter(c => c.satisfaction!.score === score).length] as [number, number]),
  };
}
