/*
 * Quality and governance, its governance half (seph1-docs 26-backoffice-erp ux/pages/quality-governance/00–09):
 * PDPA (M31) — the DPO's dashboard, data subject requests within 30 days, the consent registry, breaches within
 * 72 hours, retention and RoPA with cross-border transfers — and the audit (M13): its explorer, exports that need a
 * purpose and someone else's approval, and its integrity. M31 has no backend yet (GATED), so the statutory dates
 * stand in for the ones the backend will set; the audit is append-only and nothing here edits an event. Text is
 * kept in its source language and translated where it shows.
 */
import { NOW, TODAY } from '../../clinic/data/model';
import { daysUntil } from './home';
import { addHours, hoursLeft, NOTE_MIN } from './quality';
import { nextSeq } from './sales';
import type {
  AuditEvent, AuditExport, AuditShape, BackofficeData, Breach, ComplaintChannel, ConsentGrant, ConsentPurpose, DsarRequest, DsarRight, IntegrityPeriod, LineLink, RiskLevel,
} from './types';

const at = () => `${TODAY} ${NOW}`;
const yymm = () => `${TODAY.slice(2, 4)}${TODAY.slice(5, 7)}`;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* ---- Data subject requests ---- */

export const DSAR_RIGHT: Record<DsarRight, string> = {
  informed: 'สิทธิได้รับแจ้ง', access: 'สิทธิเข้าถึงและขอสำเนา', portability: 'สิทธิขอรับและโอนย้ายข้อมูล', objection: 'สิทธิคัดค้าน', erasure: 'สิทธิขอลบ',
  restriction: 'สิทธิขอระงับการใช้', rectification: 'สิทธิขอแก้ไข', 'withdraw-consent': 'สิทธิถอนความยินยอม',
};
export const RIGHTS = Object.keys(DSAR_RIGHT) as DsarRight[];
export const DSAR_STATUS: Record<DsarRequest['status'], { label: string; cls: string }> = {
  intake: { label: 'รอยืนยันตัวตน', cls: 'warn' },
  verified: { label: 'ยืนยันตัวตนแล้ว', cls: 'info' },
  collecting: { label: 'กำลังรวบรวมข้อมูล', cls: 'info' },
  delivered: { label: 'ส่งมอบแล้ว', cls: 'ok' },
  closed: { label: 'ปิดแล้ว', cls: 'quiet' },
  rejected: { label: 'ปฏิเสธ', cls: 'danger' },
};
/** The lifecycle the detail page draws */
export const DSAR_STEPS: [DsarRequest['status'], string][] = [
  ['intake', 'รับคำขอ'], ['verified', 'ยืนยันตัวตน'], ['collecting', 'รวบรวมข้อมูล'], ['delivered', 'ส่งมอบ'], ['closed', 'ปิดคำขอ'],
];
/** Where the data for a request is gathered from, minimum necessary */
export const DSAR_SOURCES = ['EMR', 'ผลแล็บ', 'การเงิน', 'LINE CRM', 'ประวัติการเข้าถึง'];
/** How a requester's identity is checked, and how the data goes back to them */
export const IDENTITY_METHODS = ['บัตรประชาชนตรงกับทะเบียนเจ้าของ', 'โทรกลับเบอร์ในทะเบียนและถามข้อมูลยืนยัน', 'ยืนยันผ่านบัญชี LINE ที่เชื่อมไว้', 'หนังสือมอบอำนาจพร้อมสำเนาบัตรผู้มอบ'];
export const DELIVERY_METHODS = ['ลิงก์ดาวน์โหลดทางอีเมล', 'รับเอกสารที่โรงพยาบาล', 'ส่งทาง LINE ที่เชื่อมไว้'];
/** A request is near its due date in its last seven days: the backend's flag, stood in for here */
export const NEAR_DAYS = 7;

export const isActive = (r: DsarRequest) => r.status !== 'closed' && r.status !== 'rejected' && r.status !== 'delivered';
export const daysLeft = (r: DsarRequest) => daysUntil(r.statutoryDue);
export type DueFlag = 'overdue' | 'near' | 'ok';
export const dsarFlag = (r: DsarRequest): DueFlag | null => (!isActive(r) ? null : daysLeft(r) < 0 ? 'overdue' : daysLeft(r) <= NEAR_DAYS ? 'near' : 'ok');
export const DUE_FLAG: Record<DueFlag, { label: string; cls: string }> = {
  overdue: { label: 'เกินกำหนด', cls: 'danger' },
  near: { label: 'ใกล้ครบกำหนด', cls: 'warn' },
  ok: { label: 'ในกรอบเวลา', cls: 'ok' },
};
export const dsarOf = (bo: BackofficeData, id: string) => bo.dsars.find(r => r.id === id);

export interface DsarInput { right: DsarRight | ''; requester: string; ownerKey: string; pets: string; hns: string; channel: ComplaintChannel; scope: string }

export function dsarProblems(input: DsarInput): string[] {
  const out: string[] = [];
  if (!input.right) {
    out.push('เลือกสิทธิ์ที่ขอ');
  }
  if (input.requester.trim().length < 2) {
    out.push('ใส่ชื่อผู้ขอ');
  }
  if (input.scope.trim().length < NOTE_MIN) {
    out.push('ระบุขอบเขตข้อมูลที่ขออย่างน้อย 10 ตัวอักษร');
  }
  return out;
}

/** Taken in: the thirty-day clock starts, set here as the backend will */
export function intakeDsar(bo: BackofficeData, input: DsarInput, by: string): DsarRequest {
  const split = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean);
  const r: DsarRequest = {
    id: nextSeq(bo.dsars.map(x => x.id), `DSAR-${yymm()}-`), right: input.right as DsarRight, requester: input.requester.trim(), ownerKey: input.ownerKey || undefined,
    pets: split(input.pets), hns: split(input.hns).map(h => h.toUpperCase()), channel: input.channel, scope: input.scope.trim(), receivedAt: at(), statutoryDue: addDays(TODAY, 30),
    status: 'intake', collected: [], history: [[at(), by, 'รับคำขอ DSAR', `${DSAR_RIGHT[input.right as DsarRight]} · ${input.requester.trim()}`]],
  };
  bo.dsars.unshift(r);
  return r;
}

export function verifyIdentity(r: DsarRequest, method: string, by: string) {
  r.identity = { method: method.trim(), by, at: at() };
  r.status = 'verified';
  r.history.push([at(), by, 'ยืนยันตัวตนผู้ขอ', method.trim()]);
}

/** What is still missing before the data can go: identity first, then what was asked for */
export function fulfilBlock(r: DsarRequest): string | null {
  if (r.status === 'intake') {
    return 'ต้องยืนยันตัวตนก่อนส่งมอบข้อมูล';
  }
  if (!isActive(r)) {
    return 'คำขอนี้ปิดแล้ว';
  }
  return r.collected.length ? null : 'รวบรวมข้อมูลตามขอบเขตก่อนส่งมอบ';
}

/** One source gathered for it: each read of a patient's record is itself an audit event */
export function collect(bo: BackofficeData, r: DsarRequest, source: string, by: string) {
  r.collected = [...new Set([...r.collected, source])];
  r.status = 'collecting';
  r.history.push([at(), by, 'รวบรวมข้อมูลแล้ว', source]);
  for (const hn of r.hns) {
    emit(bo, { actor: by, actorRole: 'DPOCompliance', action: 'empi.owner.pii_read', entityType: 'dsar_request', entityId: r.id, patientId: hn, riskLevel: 'medium' });
  }
}

export function fulfil(r: DsarRequest, method: string, by: string) {
  r.delivery = { method: method.trim(), artifact: `${r.id}.zip`, expires: addDays(TODAY, 14), by, at: at() };
  r.status = 'delivered';
  r.history.push([at(), by, 'ส่งมอบข้อมูลแล้ว', `${method.trim()} · หมดอายุ ${r.delivery.expires}`]);
}

export function closeDsar(r: DsarRequest, outcome: string, rejected: boolean, by: string) {
  r.status = rejected ? 'rejected' : 'closed';
  r.outcome = outcome.trim();
  r.history.push([at(), by, rejected ? 'ปฏิเสธคำขอ' : 'ปิดคำขอแล้ว', outcome.trim()]);
}

/** Who touched these patients' records: the access log a request is answered with */
export const accessLog = (bo: BackofficeData, hns: string[]) =>
  bo.auditEvents.filter(e => e.patientId && hns.includes(e.patientId)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

/* ---- Consent ---- */

export const CONSENT_PURPOSE: Record<ConsentPurpose, { label: string; required: boolean; source: string }> = {
  service: { label: 'ข้อความบริการทาง LINE', required: true, source: 'LINE CRM (M15)' },
  reminder: { label: 'การแจ้งเตือนทาง LINE', required: false, source: 'LINE CRM (M15)' },
  marketing: { label: 'การตลาดทาง LINE', required: false, source: 'LINE CRM (M15)' },
  insurance: { label: 'ส่งข้อมูลให้บริษัทประกัน', required: false, source: 'Insurance (M16)' },
  'case-study': { label: 'ใช้เคสแบบไม่ระบุตัวตนเพื่อการเรียนการสอน', required: false, source: 'M31' },
};
export const PURPOSES = Object.keys(CONSENT_PURPOSE) as ConsentPurpose[];
export const CONSENT_STATUS: Record<ConsentGrant['status'], { label: string; cls: string }> = {
  granted: { label: 'ยินยอม', cls: 'ok' },
  declined: { label: 'ไม่ยินยอม', cls: 'quiet' },
  withdrawn: { label: 'ถอนแล้ว', cls: 'warn' },
};
const LINE_PURPOSES: ConsentPurpose[] = ['service', 'reminder', 'marketing'];
const isLine = (p: ConsentPurpose): p is 'service' | 'reminder' | 'marketing' => LINE_PURPOSES.includes(p);

/** Every consent as one ledger: LINE's read from its link, so a withdrawal here is one there too */
export function consentLedger(bo: BackofficeData): ConsentGrant[] {
  const line = bo.lineLinks.flatMap(l => LINE_PURPOSES.map(purpose => lineGrant(l, purpose as 'service' | 'reminder' | 'marketing')));
  return [...line, ...bo.consents].sort((a, b) => b.at.localeCompare(a.at));
}

function lineGrant(l: LineLink, purpose: 'service' | 'reminder' | 'marketing'): ConsentGrant {
  const withdrawn = l.withdrawn?.purpose === purpose;
  return {
    id: `LINE-${l.ownerKey}-${purpose}`, ownerKey: l.ownerKey, purpose, status: l.consent[purpose] ? 'granted' : withdrawn ? 'withdrawn' : 'declined', version: l.consent.version,
    at: withdrawn ? l.withdrawn!.at : l.consent.at, channel: 'LINE', withdrawnAt: withdrawn ? l.withdrawn!.at : undefined,
  };
}

/** Per purpose: granted of all asked, and the share — counted from the sample, where production reads /consent/summary */
export function coverage(bo: BackofficeData) {
  const ledger = consentLedger(bo);
  return PURPOSES.map(purpose => {
    const rows = ledger.filter(g => g.purpose === purpose);
    const granted = rows.filter(g => g.status === 'granted').length;
    const versions = [...new Set(rows.map(g => g.version))].sort();
    return { purpose, granted, total: rows.length, percent: rows.length ? Math.round((granted / rows.length) * 100) : 0, withdrawn: rows.filter(g => g.status === 'withdrawn').length, versions };
  });
}

export const withdrawBlock = (g: ConsentGrant) =>
  g.status !== 'granted' ? 'ความยินยอมนี้ไม่ได้มีผลอยู่' : CONSENT_PURPOSE[g.purpose].required ? 'ถอนความยินยอมข้อความบริการคือการยกเลิกการเชื่อม LINE ทำที่ LINE CRM' : null;

/** Withdrawn, in one step: from that moment the purpose stops; LINE's goes back to its link */
export function withdraw(bo: BackofficeData, g: ConsentGrant) {
  if (isLine(g.purpose)) {
    const l = bo.lineLinks.find(x => x.ownerKey === g.ownerKey)!;
    l.consent[g.purpose] = false;
    l.withdrawn = { purpose: g.purpose, at: at() };
    return;
  }
  const own = bo.consents.find(x => x.id === g.id)!;
  own.status = 'withdrawn';
  own.withdrawnAt = at();
}

export function recordConsent(bo: BackofficeData, ownerKey: string, purpose: 'insurance' | 'case-study', granted: boolean, channel: string): ConsentGrant {
  const g: ConsentGrant = {
    id: nextSeq(bo.consents.map(x => x.id), 'CNS-'), ownerKey, purpose, status: granted ? 'granted' : 'declined', version: CONSENT_VERSION, at: at(), channel,
  };
  bo.consents.unshift(g);
  return g;
}
/** The consent form in force (consent_version, set in settings/10) */
export const CONSENT_VERSION = 'v3';

/* ---- Breaches ---- */

export const BREACH_SEVERITY: Record<NonNullable<Breach['severity']>, { label: string; cls: string; notify: ('pdpc' | 'subjects')[] }> = {
  high: { label: 'สูง', cls: 'danger', notify: ['pdpc', 'subjects'] },
  medium: { label: 'ปานกลาง', cls: 'warn', notify: ['pdpc'] },
  low: { label: 'ต่ำ (ไม่มีความเสี่ยงต่อสิทธิ)', cls: 'quiet', notify: [] },
};
export const BREACH_STATUS: Record<Breach['status'], { label: string; cls: string }> = {
  open: { label: 'รอประเมิน', cls: 'warn' },
  assessed: { label: 'ประเมินแล้ว', cls: 'info' },
  notified: { label: 'แจ้งแล้ว', cls: 'ok' },
  closed: { label: 'ปิดแล้ว', cls: 'quiet' },
};
export const BREACH_STEPS: [Breach['status'], string][] = [['open', 'พบเหตุ'], ['assessed', 'ประเมิน'], ['notified', 'แจ้งเหตุ'], ['closed', 'ปิดเหตุ']];
export const NOTIFY_TO: Record<'pdpc' | 'subjects', string> = { pdpc: 'สำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.)', subjects: 'เจ้าของข้อมูลที่ได้รับผลกระทบ' };
/** Near its 72 hours in the last 24: the backend's flag, stood in for here */
export const NEAR_HOURS = 24;

export const breachOf = (bo: BackofficeData, id: string) => bo.breaches.find(b => b.id === id);
export const notified = (b: Breach, to: 'pdpc' | 'subjects') => b.notifications.some(n => n[0] === to);
/** The notifications its severity still needs */
export const owedNotices = (b: Breach) => (b.severity ? BREACH_SEVERITY[b.severity].notify.filter(to => !notified(b, to)) : (['pdpc'] as ('pdpc' | 'subjects')[]));
export function breachFlag(b: Breach): DueFlag | null {
  if (b.status === 'closed' || (b.severity && !owedNotices(b).length)) {
    return null;
  }
  const left = hoursLeft(b.statutoryDue);
  return left < 0 ? 'overdue' : left <= NEAR_HOURS ? 'near' : 'ok';
}

export interface BreachInput { title: string; discoveredAt: string; source: string; description: string; count: string; kinds: string }

export function breachProblems(input: BreachInput): string[] {
  const out: string[] = [];
  const when = input.discoveredAt.replace('T', ' ').slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(when) || when > at()) {
    out.push('ใส่วันเวลาที่พบเหตุ (ไม่เกินตอนนี้)');
  }
  if (input.title.trim().length < 5) {
    out.push('ใส่ชื่อเหตุอย่างน้อย 5 ตัวอักษร');
  }
  if (input.description.trim().length < NOTE_MIN) {
    out.push('เล่าเหตุอย่างน้อย 10 ตัวอักษร');
  }
  if (!/^\d+$/.test(input.count.trim())) {
    out.push('ใส่จำนวนผู้ได้รับผลกระทบเป็นตัวเลข (ประมาณได้)');
  }
  return out;
}

/** Recorded: its 72 hours run from discovery, set here as the backend will */
export function reportBreach(bo: BackofficeData, input: BreachInput, by: string): Breach {
  const found = input.discoveredAt.replace('T', ' ').slice(0, 16);
  const b: Breach = {
    id: nextSeq(bo.breaches.map(x => x.id), `BR-${yymm()}-`), title: input.title.trim(), discoveredAt: found, reportedBy: by, source: input.source.trim() || '—',
    description: input.description.trim(), statutoryDue: addHours(found, 72), affected: { count: Number(input.count), kinds: input.kinds.split(',').map(k => k.trim()).filter(Boolean) },
    status: 'open', notifications: [], history: [[at(), by, 'บันทึกเหตุละเมิด', `กระทบ ${input.count} ราย · ${input.title.trim()}`]],
  };
  bo.breaches.unshift(b);
  return b;
}

export function assessBreach(b: Breach, severity: NonNullable<Breach['severity']>, dpia: string, by: string) {
  b.severity = severity;
  b.assessment = { dpia: dpia.trim(), by, at: at() };
  b.status = 'assessed';
  b.history.push([at(), by, 'ประเมินความรุนแรงแล้ว', `${BREACH_SEVERITY[severity].label} · ${dpia.trim()}`]);
}

export const notifyBlock = (b: Breach, to: 'pdpc' | 'subjects') =>
  b.status === 'open' ? 'ประเมินความรุนแรงก่อนแจ้ง' : notified(b, to) ? 'แจ้งแล้ว' : b.status === 'closed' ? 'เหตุนี้ปิดแล้ว' : null;

export function notify(b: Breach, to: 'pdpc' | 'subjects', ref: string, by: string) {
  b.notifications.push([to, at(), by, ref.trim()]);
  if (!owedNotices(b).length) {
    b.status = 'notified';
  }
  b.history.push([at(), by, 'แจ้งเหตุแล้ว', `${NOTIFY_TO[to]} · ${ref.trim()}`]);
}

/** Why it cannot close: not assessed, notices its severity needs not sent, or a high one without the Director's sign-off by someone other than its assessor */
export function closeBreachBlock(b: Breach, user: string): string | null {
  if (b.status === 'closed') {
    return 'เหตุนี้ปิดแล้ว';
  }
  if (!b.severity) {
    return 'ประเมินความรุนแรงก่อนปิด';
  }
  if (owedNotices(b).length) {
    return 'ต้องแจ้งก่อนปิดเหตุ (ตามระดับความรุนแรง)';
  }
  return b.severity === 'high' && b.assessment?.by === user ? 'เหตุรุนแรงต้องให้ผู้อำนวยการที่ไม่ใช่ผู้ประเมินลงนามปิด (การแยกหน้าที่)' : null;
}

export function closeBreach(b: Breach, outcome: string, by: string) {
  if (b.severity === 'high') {
    b.signOff = { by, at: at(), note: outcome.trim() };
  }
  Object.assign(b, { status: 'closed', closedAt: at(), outcome: outcome.trim() });
  b.history.push([at(), by, b.severity === 'high' ? 'ผู้อำนวยการลงนามปิดเหตุ' : 'ปิดเหตุแล้ว', outcome.trim()]);
}

/* ---- Retention and RoPA ---- */

/** A record of processing is reviewed at least once a year */
export const ROPA_REVIEW_DAYS = 365;
export const ropaStale = (reviewedAt: string) => -daysUntil(reviewedAt) > ROPA_REVIEW_DAYS;

/** The RoPA as a document: generated from the records in under five minutes (M31), its own audit */
export function generateRopa(bo: BackofficeData, by: string) {
  const e = { id: nextSeq(bo.ropaExports.map(x => x.id), `ROPA-${yymm()}-`), at: at(), by, records: bo.ropa.length, seconds: 4 + bo.ropa.length, artifact: '' };
  e.artifact = `${e.id}.pdf`;
  bo.ropaExports.unshift(e);
  return e;
}

/* ---- The audit (M13) ---- */

export const RISK: Record<RiskLevel, { label: string; cls: string }> = {
  critical: { label: 'วิกฤต', cls: 'danger' },
  high: { label: 'สูง', cls: 'warn' },
  medium: { label: 'ปานกลาง', cls: 'info' },
  low: { label: 'ต่ำ', cls: 'quiet' },
};
export const RISKS = Object.keys(RISK) as RiskLevel[];
export const RESULT: Record<AuditEvent['result'], { label: string; cls: string }> = {
  success: { label: 'สำเร็จ', cls: 'ok' },
  denied: { label: 'ถูกปฏิเสธ', cls: 'danger' },
  error: { label: 'ผิดพลาด', cls: 'warn' },
};
export const SHAPE: Record<AuditShape, string> = { tenant: 'ทั้งโรงพยาบาล', patient: 'ผู้ป่วย (HN)', actor: 'ผู้ใช้งาน' };
export const SHAPES = Object.keys(SHAPE) as AuditShape[];
/** The window a query may cover: bounded, never open-ended */
export const RANGE_DAYS = [1, 7, 30, 90];
/** The relay that feeds the audit (Phase 1): when it last brought events in */
export const RELAY = { lastIngest: '2026-09-24 11:30', lagMinutes: 2 };

/** A content hash, as the server keeps per event */
export function hashOf(e: Omit<AuditEvent, 'eventHash' | 'hashCheck' | 'id'>): string {
  let h = 0x811c9dc5;
  for (const c of [e.occurredAt, e.actor, e.action, e.entityType, e.entityId, e.patientId ?? '', e.result].join('|')) {
    h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  }
  return `sha256:${h.toString(16).padStart(8, '0')}${(h ^ 0x5bd1e995).toString(16).padStart(8, '0')}`;
}

/** An event the governance pages cause, appended as the backend would: never edited after */
export function emit(bo: BackofficeData, e: Pick<AuditEvent, 'actor' | 'actorRole' | 'action' | 'entityType' | 'entityId' | 'riskLevel'> & { patientId?: string }): AuditEvent {
  const base = { occurredAt: at(), result: 'success' as const, requestId: `req-${(bo.auditEvents.length + 7001).toString(16)}`, ...e };
  const ev: AuditEvent = { id: nextSeq(bo.auditEvents.map(x => x.id), `EV-${TODAY.slice(2).replaceAll('-', '')}-`), ...base, eventHash: hashOf(base), hashCheck: 'verified' };
  bo.auditEvents.unshift(ev);
  return ev;
}

export interface AuditQuery { shape: AuditShape; value: string; days: number; action: string; risk: RiskLevel | ''; result: AuditEvent['result'] | '' }

/** The query's own problem: a patient or actor shape needs its value */
export const queryProblem = (q: AuditQuery) => (q.shape !== 'tenant' && !q.value.trim() ? (q.shape === 'patient' ? 'ใส่ HN ของผู้ป่วย' : 'ใส่ชื่อผู้ใช้งาน') : null);

/** One of the three indexed shapes: the whole tenant, one patient by HN, or one actor */
function inShape(e: AuditEvent, shape: AuditShape, value: string) {
  const v = value.trim().toLowerCase();
  return shape === 'tenant' || (shape === 'patient' ? (e.patientId ?? '').toLowerCase() === v : e.actor.toLowerCase().includes(v));
}

export function queryEvents(bo: BackofficeData, q: AuditQuery): AuditEvent[] {
  if (queryProblem(q)) {
    return [];
  }
  const from = addDays(TODAY, -(q.days - 1));
  return bo.auditEvents.filter(e => e.occurredAt.slice(0, 10) >= from && inShape(e, q.shape, q.value)
    && (!q.action || e.action === q.action) && (!q.risk || e.riskLevel === q.risk) && (!q.result || e.result === q.result))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/* ---- Audit exports ---- */

/** The purposes an export may be for; free text is not one */
export const EXPORT_PURPOSES = ['ตอบคำขอ DSAR', 'สอบสวนอุบัติการณ์หรือเหตุละเมิด', 'ตรวจสอบภายใน', 'คำสั่งหน่วยงานรัฐหรือศาล'];
export const EXPORT_STATUS: Record<AuditExport['status'], { label: string; cls: string }> = {
  pending: { label: 'รออนุมัติ', cls: 'warn' },
  approved: { label: 'อนุมัติแล้ว', cls: 'info' },
  rejected: { label: 'ปฏิเสธ', cls: 'danger' },
  ready: { label: 'พร้อมดาวน์โหลด', cls: 'ok' },
  expired: { label: 'หมดอายุแล้ว', cls: 'quiet' },
};
/** An artifact can be downloaded for seven days */
export const ARTIFACT_DAYS = 7;

export interface ExportInput { shape: AuditShape; value: string; days: number; purpose: string; reference: string }

export function exportProblems(input: ExportInput): string[] {
  const out: string[] = [];
  if (input.shape !== 'tenant' && !input.value.trim()) {
    out.push(input.shape === 'patient' ? 'ใส่ HN ของผู้ป่วย' : 'ใส่ชื่อผู้ใช้งาน');
  }
  if (!EXPORT_PURPOSES.includes(input.purpose)) {
    out.push('เลือกวัตถุประสงค์จากรายการที่อนุมัติไว้');
  }
  if (input.reference.trim().length < 4) {
    out.push('ใส่เลขอ้างอิงของวัตถุประสงค์ (เช่น เลข DSAR)');
  }
  return out;
}

export function requestExport(bo: BackofficeData, input: ExportInput, by: string): AuditExport {
  const x: AuditExport = {
    id: nextSeq(bo.auditExports.map(e => e.id), `AX-${yymm()}-`), requestedBy: by, requestedAt: at(), shape: input.shape, value: input.value.trim(),
    from: addDays(TODAY, -(input.days - 1)), to: TODAY, purpose: input.purpose, reference: input.reference.trim(), status: 'pending',
  };
  bo.auditExports.unshift(x);
  return x;
}

/** Never the requester's own: an export is decided by someone else */
export function exportDecideBlock(x: AuditExport, user: string): string | null {
  if (x.status !== 'pending') {
    return 'คำขอนี้ตัดสินแล้ว';
  }
  return x.requestedBy === user ? 'ผู้ขอส่งออกอนุมัติคำขอของตัวเองไม่ได้ (การแยกหน้าที่)' : null;
}

export function decideExport(bo: BackofficeData, x: AuditExport, approve: boolean, note: string, by: string) {
  Object.assign(x, { status: approve ? 'approved' : 'rejected', decidedBy: by, decidedAt: at(), decision: note.trim() });
  const a = bo.approvals.find(p => p.kind === 'audit-export' && p.ref === x.id && p.status === 'pending');
  if (a) {
    Object.assign(a, { status: approve ? 'approved' : 'rejected', decidedBy: by, decidedAt: at(), decision: note.trim() });
  }
}

/** The rows the server would put in it: the same query as the explorer's */
export const exportRows = (bo: BackofficeData, x: AuditExport) =>
  bo.auditEvents.filter(e => inShape(e, x.shape, x.value) && e.occurredAt.slice(0, 10) >= x.from && e.occurredAt.slice(0, 10) <= x.to);

/** Performed by the server once approved: the artifact with its expiry, and the export's own audit event */
export function performExport(bo: BackofficeData, x: AuditExport, by: string): AuditEvent {
  const rows = exportRows(bo, x).length;
  Object.assign(x, { status: 'ready', performedAt: at(), artifact: `${x.id}.csv`, expires: addDays(TODAY, ARTIFACT_DAYS), rows });
  const ev = emit(bo, { actor: by, actorRole: 'DPOCompliance', action: 'audit.export.performed', entityType: 'audit_export', entityId: x.id, riskLevel: 'high' });
  const dsar = bo.dsars.find(r => r.exportId === x.id);
  if (dsar) {
    dsar.collected = [...new Set([...dsar.collected, 'ประวัติการเข้าถึง'])];
    dsar.history.push([at(), by, 'รวบรวมข้อมูลแล้ว', `ประวัติการเข้าถึง · ${x.id} · ${rows} รายการ`]);
  }
  return ev;
}

/* ---- Integrity ---- */

/** Each month: its events and their hash checks, its relay gaps, and the finding a mismatch opened */
export function integrity(bo: BackofficeData) {
  return bo.integrity.map(p => {
    const events = bo.auditEvents.filter(e => e.occurredAt.startsWith(p.period));
    return { ...p, source: p, events: events.length, verified: events.filter(e => e.hashCheck === 'verified').length, mismatch: events.filter(e => e.hashCheck === 'mismatch') };
  });
}

export function integrityCounts(bo: BackofficeData) {
  const rows = integrity(bo);
  return {
    events: rows.reduce((n, r) => n + r.events, 0), verified: rows.reduce((n, r) => n + r.verified, 0), mismatch: rows.reduce((n, r) => n + r.mismatch.length, 0),
    gaps: rows.reduce((n, r) => n + r.gaps.length, 0), open: rows.filter(r => r.mismatch.length && !r.finding).length,
  };
}

export function recordFinding(p: IntegrityPeriod, note: string, by: string) {
  p.finding = { by, at: at(), note: note.trim() };
}

/* ---- The DPO's dashboard ---- */

export function dpoCounts(bo: BackofficeData) {
  const active = bo.dsars.filter(isActive);
  const breaches = bo.breaches.filter(b => b.status !== 'closed');
  const from = addDays(TODAY, -30);
  return {
    dsarOpen: active.length,
    dsarNear: active.filter(r => dsarFlag(r) === 'near').length,
    dsarOverdue: active.filter(r => dsarFlag(r) === 'overdue').length,
    breachOpen: breaches.length,
    breachNear: breaches.filter(b => breachFlag(b) === 'near' || breachFlag(b) === 'overdue').length,
    unnotified: breaches.filter(b => owedNotices(b).length).length,
    withdrawn30: consentLedger(bo).filter(g => g.withdrawnAt && g.withdrawnAt.slice(0, 10) >= from).length,
    exportsPending: bo.auditExports.filter(x => x.status === 'pending').length,
    ropaStale: bo.ropa.filter(r => ropaStale(r.reviewedAt)).length,
    pastWindow: bo.retention.reduce((n, d) => n + d.pastWindow, 0),
  };
}
