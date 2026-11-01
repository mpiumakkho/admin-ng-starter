/*
 * Executive reporting (seph1-docs 26-backoffice-erp ux/menus/08-executive-reporting.md, domains/management-reporting.md):
 * seven read-only views composed from the modules that own the records. No enterprise BI module is approved, so every
 * figure is a prototype metric: each states its formula, source, cutoff, owner and limitation (the spec's metric
 * gate), and no page says P&L, margin, EBITDA, budget variance or financial statement. A report never becomes a
 * transaction source: every row leads back to the page that owns it. Text is kept in its source language and
 * translated where it shows.
 */
import { NOW, TODAY } from '../../clinic/data/model';
import type { ClinicData } from '../../clinic/data/types';
import { calibrationCompliance, criticalBoard, downtimeHours, pmCounts, READINESS, reliability } from './assets';
import { AGING, ledger, receivables } from './finance';
import { BREACH_STATUS, breachFlag, dpoCounts, DSAR_RIGHT, dsarFlag, integrityCounts, isActive } from './governance';
import { daysUntil, SEVERITY } from './home';
import { EXPIRY_BUCKETS, inventoryOverview, stockItems } from './inventory';
import { complaintCounts, HARM, kpiNow, monthsBack, needsRca, overdueActions, qualityCounts, slaState, triageLate } from './quality';
import { claimSummary } from './sales';
import type { BackofficeData, Module, Severity } from './types';
import { coverage, expiryCounts as licenseCounts, gaps, LICENSE_STATE, licenseState, overtime, ROLE, SHIFT, staffOf, weekConflicts, weekOf } from './workforce';

export type ReportKey = 'executive' | 'revenue' | 'inventory' | 'workforce' | 'assets' | 'quality' | 'compliance';

/** The spec's metric gate: what a figure is, where it comes from, as of when, whose it is, and what it does not say */
export interface MetricContract {
  label: string;
  formula: string;
  source: string;
  cutoff: string;
  owner: string;
  limitation: string;
}
export interface Tile { label: string; value: string; sub?: string; tone?: 'danger' | 'warn'; link: string }
export interface Bar { label: string; value: number; text: string }
export interface Chart { title: string; note: string; bars: Bar[] }
export interface Row { severity: Severity; module: Module; kind: string; ref: string; detail: string; owner?: string; link: string }
export interface Report {
  key: ReportKey;
  title: string;
  source: string;
  /** Whether the period changes what it shows */
  periodic: boolean;
  tiles: Tile[];
  charts: Chart[];
  rowsTitle: string;
  rowsNote: string;
  rows: Row[];
  metrics: MetricContract[];
}

export const PERIODS: [days: number, label: string][] = [[1, 'วันนี้'], [7, '7 วัน'], [30, '30 วัน'], [90, '90 วัน']];
export const CUTOFF = `${TODAY} ${NOW}`;
const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;
const rank = (rows: Row[]) => rows.sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank || a.module.localeCompare(b.module));
const metric = (label: string, formula: string, source: string, owner: string, limitation: string, cutoff = `ณ ${CUTOFF}`): MetricContract =>
  ({ label, formula, source, cutoff, owner, limitation });
/** A bar chart's bars, scaled for their own largest value */
const bars = (rows: [label: string, value: number, text?: string][]): Bar[] => rows.map(([label, value, text]) => ({ label, value, text: text ?? String(value) }));

/* ---- Revenue and collection (M11, M16) ---- */

function collected(clinic: ClinicData, days: number) {
  const rows = ledger(clinic).filter(r => { const d = daysUntil(r.at, TODAY); return d <= 0 && d > -days; });
  const paid = rows.filter(r => r.kind === 'payment' && r.status !== 'reversed');
  const refunded = rows.filter(r => r.kind === 'refund');
  const methods = [...new Set(paid.map(r => r.method))].map(m => [m, paid.filter(r => r.method === m).reduce((s, r) => s + r.amount, 0)] as [string, number]);
  return { gross: paid.reduce((s, r) => s + r.amount, 0), refunds: -refunded.reduce((s, r) => s + r.amount, 0), count: paid.length, methods: methods.sort((a, b) => b[1] - a[1]) };
}

function revenueReport(clinic: ClinicData, bo: BackofficeData, days: number): Report {
  const c = collected(clinic, days);
  const ar = receivables(clinic);
  const overdue = ar.rows.filter(r => (r.overdue ?? 0) > 0);
  const claims = claimSummary(bo);
  const discounts = clinic.invoices.flatMap(i => i.discounts ?? []).filter(d => d.status === 'applied');
  return {
    key: 'revenue', title: 'รายได้และการรับชำระ', periodic: true,
    source: 'COMPOSED · M11 การเงิน · M16 ประกัน · ยอดรับชำระจากบันทึกการชำระ ไม่ใช่งบการเงิน · ตรวจยอดกับระบบบัญชีภายนอกที่หน้าส่งข้อมูลบัญชี',
    tiles: [
      { label: 'รับชำระในช่วง', value: baht(c.gross), sub: `${c.count} รายการ`, link: '/backoffice/finance/payments' },
      { label: 'คืนเงินในช่วง', value: baht(c.refunds), link: '/backoffice/finance/adjustments' },
      { label: 'ลูกหนี้คงค้าง', value: baht(ar.total), sub: `${ar.rows.length} ใบ`, link: '/backoffice/finance/receivables' },
      { label: 'เกินกำหนดชำระ', value: baht(overdue.reduce((s, r) => s + r.balance, 0)), sub: `${overdue.length} ใบ`, tone: overdue.length ? 'warn' : undefined, link: '/backoffice/finance/receivables' },
      { label: 'ส่วนลดที่อนุมัติ', value: baht(discounts.reduce((s, d) => s + d.amount, 0)), sub: `${discounts.length} รายการ`, link: '/backoffice/finance/adjustments' },
      { label: 'เคลมรอผล', value: String(claims.waiting.count), sub: claims.overdue ? `เกินกำหนด ${claims.overdue}` : baht(claims.waiting.amount), tone: claims.overdue ? 'warn' : undefined, link: '/backoffice/sales/claims' },
    ],
    charts: [
      { title: 'ลูกหนี้ตามอายุหนี้', note: 'ยอดค้างตามจำนวนวันเกินกำหนด', bars: bars(ar.buckets.filter(b => b.key !== 'none').map(b => [b.label, b.amount, baht(b.amount)])) },
      { title: 'รับชำระตามช่องทาง', note: 'ในช่วงที่เลือก', bars: bars(c.methods.map(([m, v]) => [m, v, baht(v)])) },
    ],
    rowsTitle: 'ลูกหนี้ที่ต้องติดตาม', rowsNote: 'เกินกำหนดนานที่สุดก่อน · เปิดใบแจ้งหนี้ที่หน้าการเงิน',
    rows: ar.rows.map(r => ({
      severity: (r.overdue ?? 0) > 30 ? 'critical' : (r.overdue ?? 0) > 0 ? 'warning' : 'info', module: 'M11', kind: AGING.find(a => a.key === r.bucket)!.label, ref: r.invoice.no,
      detail: `${r.invoice.ownerKey} · ${r.invoice.pet} · ค้างชำระ ${baht(r.balance)}`, link: `/backoffice/finance/invoices/${r.invoice.id}`,
    } satisfies Row)),
    metrics: [
      metric('รับชำระในช่วง', 'ผลรวมการชำระที่ไม่ถูกกลับรายการ ในจำนวนวันที่เลือกถึงวันนี้', 'M11 payment', 'ผู้จัดการการเงิน', 'ไม่หักคืนเงิน ไม่ใช่รายได้ทางบัญชี'),
      metric('ลูกหนี้คงค้าง', 'ยอดคงเหลือของใบแจ้งหนี้ที่ออกแล้วและยังเก็บได้', 'M11 invoice', 'ผู้จัดการการเงิน', 'ไม่รวมส่วนที่บริษัทประกันจะจ่าย'),
      metric('เคลมรอผล', 'เคลมที่ส่งแล้วและยังไม่มีผลจากบริษัทประกัน', 'M16 claim', 'ผู้จัดการการเงิน', 'ติดตามด้วยมือ ไม่มีการเชื่อมต่อบริษัทประกัน'),
    ],
  };
}

/* ---- Inventory risk (M06) ---- */

function inventoryReport(clinic: ClinicData, bo: BackofficeData): Report {
  const o = inventoryOverview(clinic, bo);
  const items = stockItems(clinic, bo);
  return {
    key: 'inventory', title: 'ความเสี่ยงด้านคลังสินค้า', periodic: false,
    source: 'COMPOSED · M06 คลังยา · สต็อกต่ำ วันหมดอายุ การเรียกคืน และผลต่างยาควบคุม ณ เวลาตัดข้อมูล',
    tiles: [
      { label: 'ยาต่ำกว่าจุดสั่งซื้อ', value: String(o.low), tone: o.low ? 'warn' : undefined, link: '/backoffice/inventory/reorder' },
      { label: 'หมดอายุแล้ว', value: String(o.expiry.expired), tone: o.expiry.expired ? 'danger' : undefined, link: '/backoffice/inventory/lots' },
      { label: 'หมดอายุใน 90 วัน', value: String(o.expiring), tone: o.expiring ? 'warn' : undefined, link: '/backoffice/inventory/lots' },
      { label: 'การเรียกคืนที่เปิดอยู่', value: String(o.recalls), tone: o.recalls ? 'danger' : undefined, link: '/backoffice/inventory/recall' },
      { label: 'ยาควบคุมนับไม่ตรง', value: String(o.investigations), tone: o.investigations ? 'danger' : undefined, link: '/backoffice/inventory/controlled' },
    ],
    charts: [{ title: 'Lot ตามวันหมดอายุ', note: 'เฉพาะ lot ที่ยังมีของ', bars: bars(EXPIRY_BUCKETS.filter(b => b.key !== 'ok').map(b => [b.label, o.expiry[b.key]])) }],
    rowsTitle: 'รายการยาที่มีความเสี่ยง', rowsNote: 'สต็อกต่ำ หมดอายุ การเรียกคืน และผลต่างยาควบคุม',
    rows: rank([
      ...bo.recalls.filter(r => r.status !== 'closed').map(r => ({ severity: 'critical' as Severity, module: 'M06' as Module, kind: 'เรียกคืน', ref: r.lot, detail: `${r.drug} · ${r.reason}`, link: '/backoffice/inventory/recall' })),
      ...bo.counts.filter(c => c.investigation === 'open').map(c => ({ severity: 'critical' as Severity, module: 'M06' as Module, kind: 'ยาควบคุมนับไม่ตรง', ref: c.id, detail: `${c.drug} · ผลต่าง ${c.discrepancy} ${c.unit}`, link: '/backoffice/inventory/controlled' })),
      ...o.expiringLots.map(l => ({ severity: (l.bucket === 'expired' || l.bucket === 'd30' ? 'warning' : 'info') as Severity, module: 'M06' as Module, kind: EXPIRY_BUCKETS.find(b => b.key === l.bucket)!.label, ref: l.lot, detail: `${l.drug} · ${l.qty ?? '—'} ${l.unit}`, link: '/backoffice/inventory/lots' })),
      ...items.filter(i => i.isLow).map(i => ({ severity: 'warning' as Severity, module: 'M06' as Module, kind: 'ต่ำกว่าจุดสั่งซื้อ', ref: i.drug.id, detail: `${i.drug.name} · เหลือ ${i.onHand ?? '—'} ${i.drug.unit}`, link: `/backoffice/inventory/items/${i.drug.id}` })),
    ]),
    metrics: [
      metric('ต่ำกว่าจุดสั่งซื้อ', 'ยาที่คงเหลือน้อยกว่าหรือเท่ากับจุดสั่งซื้อ', 'M06 stock · batch', 'เภสัชกร', 'คงเหลือคำนวณจาก batch ในงานตรวจรักษา ไม่ใช่การนับจริง'),
      metric('หมดอายุใน 90 วัน', 'lot ที่ยังมีของและหมดอายุภายใน 90 วัน', 'M06 batch', 'เภสัชกร', 'วันหมดอายุระดับเดือน'),
      metric('ยาควบคุมนับไม่ตรง', 'การนับยาควบคุมที่มีผลต่างและการสอบสวนยังเปิด', 'M06 controlled count', 'เภสัชกร', 'นับตามรอบที่บันทึก ไม่ต่อเนื่อง'),
    ],
  };
}

/* ---- Workforce readiness (M24) ---- */

function workforceReport(bo: BackofficeData): Report {
  const monday = weekOf(TODAY);
  const cells = coverage(bo, monday);
  const missing = gaps(cells);
  const conflicts = weekConflicts(bo, monday);
  const lic = licenseCounts(bo);
  const ot = overtime(bo, monday).filter(r => r.total > 0).sort((a, b) => b.total - a.total);
  const days = [...new Set(cells.map(c => c.date))];
  return {
    key: 'workforce', title: 'ความพร้อมด้านบุคลากร', periodic: false,
    source: `COMPOSED · M24 บุคลากร · สัปดาห์ของ ${monday} · ข้อมูลบุคลากรรายคนแสดงเท่าที่จำเป็นต่อการตัดสินใจ`,
    tiles: [
      { label: 'ช่องว่างเวรสัปดาห์นี้', value: String(missing.length), tone: missing.length ? 'danger' : undefined, link: '/backoffice/workforce/schedule' },
      { label: 'เวรที่ขัดกัน', value: String(conflicts.length), tone: conflicts.length ? 'warn' : undefined, link: '/backoffice/workforce/schedule' },
      { label: 'ใบอนุญาตหมดใน 30 วันหรือหมดแล้ว', value: String(lic.d30 + lic.expired), tone: lic.d30 + lic.expired ? 'warn' : undefined, link: '/backoffice/workforce/credentials' },
      { label: 'ใบอนุญาตรอตรวจสอบ', value: String(lic.pending), link: '/backoffice/workforce/credentials' },
      { label: 'ชั่วโมงล่วงเวลาสัปดาห์นี้', value: String(ot.reduce((n, r) => n + r.total, 0)), sub: `${ot.length} คน`, link: '/backoffice/workforce/overtime' },
    ],
    charts: [{ title: 'ช่องว่างเวรรายวัน', note: 'จำนวนตำแหน่งที่ยังขาดตามขั้นต่ำ', bars: bars(days.map(d => [d, missing.filter(c => c.date === d).reduce((n, c) => n + c.need - c.have, 0)])) }],
    rowsTitle: 'บุคลากรและเวรที่กระทบ', rowsNote: 'ช่องว่างเวร ใบอนุญาต และล่วงเวลา',
    rows: rank([
      ...missing.map(c => ({ severity: 'critical' as Severity, module: 'M24' as Module, kind: 'ช่องว่างเวร', ref: `${c.date} ${SHIFT[c.kind].label}`, detail: `${ROLE[c.role].label} ${c.have}/${c.need}`, link: '/backoffice/workforce/schedule' })),
      ...bo.licenses.map(l => ({ l, s: licenseState(l) })).filter(x => x.s === 'expired' || x.s === 'd30' || x.s === 'pending')
        .map(({ l, s }) => ({ severity: (s === 'expired' ? 'critical' : 'warning') as Severity, module: 'M24' as Module, kind: LICENSE_STATE[s].label, ref: l.number, detail: `${staffOf(bo, l.staffId)?.name ?? l.staffId} · หมดอายุ ${l.expiresAt}`, link: '/backoffice/workforce/credentials' })),
      ...conflicts.map(c => ({ severity: (c.hard ? 'warning' : 'info') as Severity, module: 'M24' as Module, kind: 'เวรขัดกัน', ref: c.date, detail: `${staffOf(bo, c.staffId)?.name ?? c.staffId} · ${c.text}`, link: '/backoffice/workforce/schedule' })),
      ...ot.map(r => ({ severity: 'info' as Severity, module: 'M24' as Module, kind: 'ล่วงเวลา', ref: `${r.total} ชม.`, detail: r.staff.name, link: '/backoffice/workforce/overtime' })),
    ]),
    metrics: [
      metric('ช่องว่างเวรสัปดาห์นี้', 'เวรและตำแหน่งที่มีคนน้อยกว่าขั้นต่ำ โดยไม่นับคนที่ลาอนุมัติแล้ว', 'M24 shift · leave', 'หัวหน้าพยาบาล', 'ขั้นต่ำเป็นค่าตัวอย่างจนกว่าจะมีนโยบายอัตรากำลัง'),
      metric('ใบอนุญาตหมดใน 30 วันหรือหมดแล้ว', 'ใบอนุญาตที่หมดอายุแล้วหรือจะหมดใน 30 วัน', 'M24 license', 'ฝ่ายบุคคล', 'ไม่ได้ตรวจกับสภาวิชาชีพแบบอัตโนมัติ'),
      metric('ชั่วโมงล่วงเวลาสัปดาห์นี้', 'ชั่วโมงเวรเกินสัญญา บวกการเรียกตัว', 'M24 shift · call-out', 'ฝ่ายบุคคล', 'ไม่ใช่ข้อมูลเงินเดือน (payroll อยู่นอกขอบเขต)'),
    ],
  };
}

/* ---- Asset readiness (M22) ---- */

function assetsReport(bo: BackofficeData): Report {
  const board = criticalBoard(bo);
  const pm = pmCounts(bo);
  const cal = calibrationCompliance(bo);
  const open = bo.downtime.filter(d => !d.to);
  const rel = reliability(bo, board.map(b => b.equipment.id));
  const name = (id: string) => bo.equipment.find(e => e.id === id)?.name ?? id;
  return {
    key: 'assets', title: 'ความพร้อมด้านอุปกรณ์', periodic: false,
    source: 'COMPOSED · M22 อุปกรณ์ · ความพร้อมของอุปกรณ์ critical · PM สอบเทียบ และการขัดข้อง · ไม่ใช่ทะเบียนสินทรัพย์ทางบัญชี',
    tiles: [
      { label: 'อุปกรณ์ critical พร้อมใช้', value: `${board.filter(b => b.state === 'ready' || b.state === 'due').length}/${board.length}`, tone: board.some(b => b.state === 'down') ? 'danger' : undefined, link: '/backoffice/assets/critical' },
      { label: 'กำลังขัดข้อง', value: String(open.length), tone: open.length ? 'danger' : undefined, link: '/backoffice/assets/downtime' },
      { label: 'PM เกินกำหนด', value: String(pm.overdue), sub: pm.criticalOverdue ? `critical ${pm.criticalOverdue}` : undefined, tone: pm.overdue ? 'warn' : undefined, link: '/backoffice/assets/pm' },
      { label: 'สอบเทียบไม่เกินกำหนด', value: `${cal.percent}%`, sub: `${cal.inDate}/${cal.required}`, tone: cal.overdue ? 'warn' : undefined, link: '/backoffice/assets/calibration' },
      { label: 'ความพร้อมใช้ของอุปกรณ์ critical', value: `${(rel.availability * 100).toFixed(1)}%`, sub: rel.mttr === null ? undefined : `MTTR ${rel.mttr.toFixed(1)} ชม.`, link: '/backoffice/assets/downtime' },
    ],
    charts: [{ title: 'อุปกรณ์ critical ตามความพร้อม', note: 'นับตามสถานะ', bars: bars((['down', 'attention', 'due', 'ready'] as const).map(s => [READINESS[s].label, board.filter(b => b.state === s).length])) }],
    rowsTitle: 'อุปกรณ์ที่ต้องตัดสินใจ', rowsNote: 'ขัดข้อง ต้องดำเนินการ และใกล้ครบกำหนด',
    rows: rank([
      ...open.map(d => ({ severity: 'critical' as Severity, module: 'M22' as Module, kind: 'ขัดข้อง', ref: d.id, detail: `${name(d.equipmentId)} · ${Math.round(downtimeHours(d))} ชม. · ${d.problem}`, link: '/backoffice/assets/downtime' })),
      ...board.filter(b => b.state === 'attention' || b.state === 'due').map(b => ({
        severity: (b.state === 'attention' ? 'warning' : 'info') as Severity, module: 'M22' as Module, kind: READINESS[b.state].label, ref: b.equipment.id, detail: `${b.equipment.name} · ${b.reasons.join(' · ')}`, link: `/backoffice/assets/equipment/${b.equipment.id}`,
      })),
    ]),
    metrics: [
      metric('อุปกรณ์ critical พร้อมใช้', 'อุปกรณ์ critical ที่ไม่ขัดข้องและไม่มีรายการค้างที่ต้องดำเนินการ', 'M22 equipment · pm · calibration · downtime', 'ช่างซ่อมบำรุง', 'ความพร้อมตามบันทึก ไม่ใช่การทดสอบเครื่องจริง'),
      metric('ความพร้อมใช้ของอุปกรณ์ critical', 'ชั่วโมงที่ใช้งานได้ ÷ ชั่วโมงทั้งหมด ย้อนหลัง 12 เดือน', 'M22 downtime', 'ช่างซ่อมบำรุง', 'นับเฉพาะการขัดข้องที่บันทึกไว้'),
    ],
  };
}

/* ---- Quality and safety (M12, M28) ---- */

function qualityReport(bo: BackofficeData): Report {
  const q = qualityCounts(bo);
  const c = complaintCounts(bo);
  const kpis = bo.kpis.map(def => ({ def, now: kpiNow(bo, def) }));
  const off = kpis.filter(k => !k.now.met);
  const months = monthsBack(12);
  return {
    key: 'quality', title: 'คุณภาพและความปลอดภัย', periodic: false,
    source: 'COMPOSED · M12 คุณภาพ · M28 ข้อร้องเรียน · ตัวชี้วัดจากคลังตัวชี้วัด · ค่าเทียบมาตรฐานเป็นตัวอย่าง',
    tiles: [
      { label: 'อุบัติการณ์ที่ยังไม่ปิด', value: String(q.open), sub: q.triageLate ? `เกินกำหนดคัดกรอง ${q.triageLate}` : undefined, tone: q.triageLate ? 'warn' : undefined, link: '/backoffice/quality/incidents' },
      { label: 'อันตรายรุนแรงขึ้นไปที่ยังไม่ปิด', value: String(q.severeOpen), tone: q.severeOpen ? 'danger' : undefined, link: '/backoffice/quality/incidents' },
      { label: 'มาตรการ RCA เกินกำหนด', value: String(q.actionsLate), tone: q.actionsLate ? 'warn' : undefined, link: '/backoffice/quality/rca' },
      { label: 'ตัวชี้วัดที่ไม่ถึงเป้า', value: `${off.length}/${kpis.length}`, tone: off.length ? 'warn' : undefined, link: '/backoffice/quality/kpi' },
      { label: 'ข้อร้องเรียนที่ยังไม่ตอบ', value: String(c.open), sub: c.breached ? `เกินกำหนด ${c.breached}` : undefined, tone: c.breached ? 'danger' : c.dueSoon ? 'warn' : undefined, link: '/backoffice/quality/complaints' },
    ],
    charts: [{ title: 'อุบัติการณ์รายเดือน', note: '12 เดือนถึงวันนี้', bars: bars(months.map(m => [m, bo.incidents.filter(i => i.at.startsWith(m)).length])) }],
    rowsTitle: 'อุบัติการณ์ RCA และข้อร้องเรียนที่ต้องตัดสินใจ', rowsNote: 'รุนแรงก่อน · เปิดรายการที่หน้าคุณภาพ',
    rows: rank([
      ...bo.incidents.filter(i => i.status !== 'closed').map(i => ({
        severity: (needsRca(i) ? 'critical' : triageLate(i) ? 'warning' : 'info') as Severity, module: 'M12' as Module, kind: HARM[i.harm].label, ref: i.id,
        detail: `${i.description}${triageLate(i) ? ' · เกินกำหนดคัดกรอง' : ''}`, link: '/backoffice/quality/incidents',
      })),
      ...overdueActions(bo).map(({ rca, action }) => ({ severity: 'warning' as Severity, module: 'M12' as Module, kind: 'มาตรการ RCA เกินกำหนด', ref: rca.id, detail: `${action.text} · ${action.owner} · ${action.due}`, link: '/backoffice/quality/rca' })),
      ...off.map(k => ({ severity: 'info' as Severity, module: 'M12' as Module, kind: 'ตัวชี้วัดไม่ถึงเป้า', ref: k.def.id, detail: `${k.def.name} · ${k.now.value} / ${k.def.target}`, link: '/backoffice/quality/kpi' })),
      ...bo.complaints.filter(x => ['breached', 'due-soon'].includes(slaState(x)) && x.status !== 'resolved' && x.status !== 'responded').map(x => ({
        severity: (slaState(x) === 'breached' ? 'critical' : 'warning') as Severity, module: 'M28' as Module, kind: 'ข้อร้องเรียนใกล้หรือเกินกำหนดตอบ', ref: x.id, detail: x.subject, link: '/backoffice/quality/complaints',
      })),
    ]),
    metrics: [
      metric('อุบัติการณ์ที่ยังไม่ปิด', 'รายงานอุบัติการณ์ที่สถานะยังไม่ปิด', 'M12 incident_report', 'คณะกรรมการคุณภาพ', 'นับเฉพาะที่รายงาน การรายงานมากไม่ได้แปลว่าเกิดเหตุมาก'),
      metric('ตัวชี้วัดที่ไม่ถึงเป้า', 'ตัวชี้วัดที่ค่าเดือนล่าสุดไม่ถึงเป้าหมาย', 'M12 kpi_definition · kpi_snapshot', 'คณะกรรมการคุณภาพ', 'ค่าเทียบมาตรฐานเป็นตัวอย่างจนกว่าจะได้เกณฑ์ TAHSA/AAHA ฉบับจริง'),
    ],
  };
}

/* ---- Audit and compliance (M13, M31) ---- */

function complianceReport(bo: BackofficeData): Report {
  const p = dpoCounts(bo);
  const integ = integrityCounts(bo);
  return {
    key: 'compliance', title: 'Audit และการกำกับดูแล', periodic: false,
    source: 'COMPOSED · M31 PDPA (GATED) · M13 Audit · ภาพรวมระดับสูงเท่านั้น รายละเอียดเปิดได้ตามสิทธิ์ที่หน้าต้นทาง',
    tiles: [
      { label: 'DSAR ใกล้หรือเกิน 30 วัน', value: String(p.dsarNear + p.dsarOverdue), sub: `เปิดอยู่ ${p.dsarOpen}`, tone: p.dsarOverdue ? 'danger' : p.dsarNear ? 'warn' : undefined, link: '/backoffice/quality/dsar' },
      { label: 'เหตุละเมิดใกล้ครบ 72 ชม.', value: String(p.breachNear), sub: `ยังไม่แจ้ง สคส. ${p.unnotified}`, tone: p.breachNear ? 'danger' : undefined, link: '/backoffice/quality/breach' },
      { label: 'คำขอส่งออก Audit รออนุมัติ', value: String(p.exportsPending), tone: p.exportsPending ? 'warn' : undefined, link: '/backoffice/quality/audit-exports' },
      { label: 'hash ไม่ตรงที่ยังไม่เปิด finding', value: String(integ.open), tone: integ.open ? 'danger' : undefined, link: '/backoffice/quality/audit-integrity' },
      { label: 'RoPA ที่ต้องทบทวน', value: String(p.ropaStale), tone: p.ropaStale ? 'warn' : undefined, link: '/backoffice/quality/ropa' },
    ],
    charts: [{ title: 'คำขอ DSAR ตามสิทธิ์', note: 'คำขอทั้งหมดในข้อมูลตัวอย่าง', bars: bars(Object.entries(DSAR_RIGHT).map(([k, label]) => [label, bo.dsars.filter(r => r.right === k).length] as [string, number]).filter(b => b[1])) }],
    rowsTitle: 'ข้อยกเว้นด้านการกำกับดูแล', rowsNote: 'เส้นตายตามกฎหมายก่อน',
    rows: rank([
      ...bo.breaches.filter(b => b.status !== 'closed').map(b => ({
        severity: (breachFlag(b) === 'near' || breachFlag(b) === 'overdue' ? 'critical' : 'warning') as Severity, module: 'M31' as Module, kind: `เหตุละเมิด · ${BREACH_STATUS[b.status].label}`, ref: b.id,
        detail: `${b.title} · แจ้งภายใน ${b.statutoryDue}`, link: `/backoffice/quality/breach/${b.id}`,
      })),
      ...bo.dsars.filter(isActive).map(r => ({
        severity: (dsarFlag(r) === 'overdue' ? 'critical' : dsarFlag(r) === 'near' ? 'warning' : 'info') as Severity, module: 'M31' as Module, kind: DSAR_RIGHT[r.right], ref: r.id,
        detail: `${r.requester} · ครบกำหนด ${r.statutoryDue}`, link: `/backoffice/quality/dsar/${r.id}`,
      })),
      ...bo.auditExports.filter(x => x.status === 'pending').map(x => ({ severity: 'warning' as Severity, module: 'M13' as Module, kind: 'คำขอส่งออกรออนุมัติ', ref: x.id, detail: `${x.purpose} · ${x.reference}`, link: '/backoffice/quality/audit-exports' })),
      ...bo.integrity.filter(i => !i.finding && bo.auditEvents.some(e => e.hashCheck === 'mismatch' && e.occurredAt.startsWith(i.period))).map(i => ({
        severity: 'critical' as Severity, module: 'M13' as Module, kind: 'hash ไม่ตรง', ref: i.period, detail: 'ยังไม่เปิด finding', link: '/backoffice/quality/audit-integrity',
      })),
    ]),
    metrics: [
      metric('DSAR ใกล้หรือเกิน 30 วัน', 'คำขอที่เปิดอยู่และเหลือไม่เกิน 7 วันหรือเกินกำหนด', 'M31 dsar_request (GATED)', 'DPO', 'เส้นตายในต้นแบบคำนวณที่หน้าจอ production ต้องมาจาก backend'),
      metric('hash ไม่ตรงที่ยังไม่เปิด finding', 'เดือนที่มีเหตุการณ์ hash ไม่ตรงและยังไม่เปิด finding', 'M13 audit_event', 'Security owner', 'การตรวจแบบลูกโซ่ (P3) ยังไม่เปิด จึงยืนยันได้ระดับเหตุการณ์เท่านั้น'),
    ],
  };
}

/* ---- The executive overview ---- */

function executiveReport(clinic: ClinicData, bo: BackofficeData, days: number): Report {
  const parts = [revenueReport(clinic, bo, days), inventoryReport(clinic, bo), workforceReport(bo), assetsReport(bo), qualityReport(bo), complianceReport(bo)];
  const [rev, inv, wf, as, qa, co] = parts;
  const exceptions: Row[] = bo.exceptions.filter(x => !x.acknowledgedAt).map(x => ({
    severity: x.severity, module: x.module, kind: x.source, ref: x.ref, detail: x.title, link: x.link ?? '/backoffice/home/alerts',
  }));
  const seen = new Set(exceptions.map(r => r.ref));
  const risks = parts.flatMap(p => p.rows.filter(r => r.severity === 'critical' && !seen.has(r.ref)));
  return {
    key: 'executive', title: 'ภาพรวมสำหรับผู้บริหาร', periodic: true,
    source: 'COMPOSED · M11 M12 M22 M24 M31 · ความเสี่ยงและข้อยกเว้นที่ต้องตัดสินใจ · ทุกตัวเลขเป็น metric ต้นแบบ ไม่ใช่ตัวเลขทางการ',
    tiles: [rev.tiles[0], rev.tiles[3], inv.tiles[0], wf.tiles[0], as.tiles[0], qa.tiles[1], co.tiles[1]],
    charts: [
      { title: 'ความเสี่ยงระดับวิกฤตตามด้าน', note: 'จำนวนรายการวิกฤตในแต่ละรายงาน', bars: bars(parts.slice(1).map(p => [p.title, p.rows.filter(r => r.severity === 'critical').length])) },
      rev.charts[0],
    ],
    rowsTitle: 'ข้อยกเว้นที่ต้องตัดสินใจ', rowsNote: 'วิกฤตก่อน · ข้อยกเว้นที่ยังไม่รับทราบ และรายการวิกฤตจากทุกรายงาน',
    rows: rank([...exceptions, ...risks]),
    metrics: parts.flatMap(p => p.metrics.slice(0, 1)),
  };
}

export function report(key: ReportKey, clinic: ClinicData, bo: BackofficeData, days = 30): Report {
  switch (key) {
    case 'executive': return executiveReport(clinic, bo, days);
    case 'revenue': return revenueReport(clinic, bo, days);
    case 'inventory': return inventoryReport(clinic, bo);
    case 'workforce': return workforceReport(bo);
    case 'assets': return assetsReport(bo);
    case 'quality': return qualityReport(bo);
    case 'compliance': return complianceReport(bo);
  }
}
