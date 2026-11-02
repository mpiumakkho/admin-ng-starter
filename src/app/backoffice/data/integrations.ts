/*
 * Integration center (seph1-docs 26-backoffice-erp ux/menus/09 and ux/pages/integrations/00–07): the connectors the
 * clinic has a contract for, and no trace of the reserved ones (payment, supplier, payroll). The accounting delivery
 * queue is the very records Finance shows, one record in two views; the adapter's settings, the lab and imaging
 * connections and the insurance adapters are design contracts (GATED). Delivered means the accounting system took the
 * document, never an e-Tax result, and with no readback from PEAK reconciliation tells how complete the delivery is,
 * not that the books agree. Text is kept in its source language and translated where it shows.
 */
import { NOW, TODAY } from '../../clinic/data/model';
import type { ClinicData } from '../../clinic/data/types';
import { DOC_TYPE, ledger } from './finance';
import type { AccountingExport, BackofficeData, ConnectionTest, Equipment } from './types';

const now = () => `${TODAY} ${NOW}`;
const hoursSince = (at: string) => (Date.parse(`${TODAY}T${NOW}:00`) - Date.parse(`${at.replace(' ', 'T')}:00`)) / 3_600_000;

/* ---- Connector health (menus/09 Integration States) ---- */

export type Health = 'healthy' | 'degraded' | 'auth-failed' | 'unreachable' | 'disabled' | 'gated';
export const HEALTH: Record<Health, { label: string; cls: string }> = {
  healthy: { label: 'ทำงานปกติ', cls: 'ok' },
  degraded: { label: 'ส่งไม่สำเร็จบางรายการ', cls: 'warn' },
  'auth-failed': { label: 'ยืนยันตัวตนไม่ผ่าน', cls: 'danger' },
  unreachable: { label: 'ติดต่อไม่ได้', cls: 'danger' },
  disabled: { label: 'ปิดใช้งาน', cls: 'quiet' },
  gated: { label: 'รอสัญญา (GATED)', cls: 'quiet' },
};

/** The error's class, as the adapter contract groups its codes */
export type ErrorClass = 'auth' | 'schema' | 'network' | 'other';
export const ERROR_CLASS: Record<ErrorClass, string> = { auth: 'การยืนยันตัวตน', schema: 'ข้อมูลไม่ผ่านการตรวจ', network: 'เครือข่าย', other: 'อื่น ๆ' };
export const errorClassOf = (code?: string): ErrorClass | null =>
  !code ? null : code.startsWith('AUTH') ? 'auth' : /^(SCHEMA|MAP)/.test(code) ? 'schema' : /^(NET|TIMEOUT)/.test(code) ? 'network' : 'other';

/** The accounting connector as its records show it: a saved setting is not health, and a passed test is not either while deliveries fail */
export function accountingHealth(bo: BackofficeData) {
  const xs = bo.accountingExports;
  const failed = xs.filter(x => x.status === 'failed');
  const lastTest = bo.adapterTests[0] as ConnectionTest | undefined;
  const lastSuccess = xs.map(x => x.deliveredAt).filter((at): at is string => !!at).sort().at(-1);
  const oldest = failed.map(x => x.firstAt).sort()[0];
  const health: Health = lastTest?.result === 'auth-failed' ? 'auth-failed' : failed.length ? 'degraded' : 'healthy';
  return {
    health, failed: failed.length, queued: xs.filter(x => x.status === 'queued').length, lastSuccess, lastTest,
    oldestFailedHours: oldest ? Math.floor(hoursSince(oldest)) : 0,
  };
}

/* ---- Accounting adapter configuration (INT-ACC-01, GATED) ---- */

/** The targets M11 confirms; only the one in use has its typed form here */
export const ADAPTER_TARGETS: { key: string; name: string; mode: string }[] = [
  { key: 'erpnext', name: 'ERPNext', mode: 'REST API แบบทันที' },
  { key: 'flowaccount', name: 'FlowAccount', mode: 'API' },
  { key: 'peak', name: 'PEAK', mode: 'API' },
  { key: 'express', name: 'Express', mode: 'ไฟล์รายวันผ่าน SFTP' },
  { key: 'eod-excel', name: 'EOD Excel', mode: 'ส่งมอบด้วยมือ' },
];

/** The steps the form runs through */
export const CONFIG_STEPS: [string, string][] = [
  ['adapter', 'Adapter และความสามารถ'], ['connection', 'การเชื่อมต่อ'], ['mapping', 'การจับคู่ข้อมูล'], ['retry', 'การลองส่งใหม่'], ['reconciliation', 'การกระทบยอด'], ['review', 'ตรวจทาน'],
];

/** The PEAK adapter as it stands: read from its typed schema; saving, activating and rotating wait for their contracts */
export const ADAPTER = {
  target: 'peak',
  contractVersion: 'PEAK adapter v3',
  mappingVersion: 'mapping v3 (2026-05-20)',
  activatedAt: '2026-06-01 09:00',
  activatedBy: 'ผู้ดูแลระบบ',
  uatSignedOff: '2026-05-20',
  capabilities: [['ใบแจ้งหนี้', true], ['ใบเสร็จ', true], ['ใบลดหนี้', true], ['เลขอ้างอิงจากระบบบัญชี', true], ['อ่านยอดกลับ (readback)', false]] as [string, boolean][],
  connection: [['สภาพแวดล้อม', 'Production'], ['รหัสบริษัทใน PEAK', 'PEAK-CO-0412'], ['ปลายทาง API', 'ตาม PEAK adapter v3'], ['เขตเวลา', 'Asia/Bangkok (UTC+7)']] as [string, string][],
  credential: { label: 'peak-api-token', fingerprint: '••••a41f', rotatedAt: '2026-09-24 08:15', rotatedBy: 'ผู้ดูแลระบบ' },
  mapping: [
    ['ใบแจ้งหนี้', 'ใบแจ้งหนี้ (Invoice)'], ['ใบเสร็จ', 'ใบเสร็จรับเงิน (Receipt)'], ['ใบลดหนี้', 'ใบลดหนี้ (Credit note)'],
    ['สาขาหลัก', 'PEAK-CO-0412 · สำนักงานใหญ่'], ['VAT 7%', 'ภาษีขาย 7%'], ['ไม่มีภาษี', 'ยกเว้นภาษี'],
  ] as [string, string][],
  retry: [['จำนวนครั้งสูงสุด', '5'], ['ระยะห่าง', 'รอบส่งถัดไป (06:00 และ 23:00)'], ['หยุดลองอัตโนมัติเมื่อ', 'AUTH_401 · ข้อมูลไม่ผ่านการตรวจ'], ['การเงินและการปัดเศษ', 'ตามเอกสารต้นทาง (M11) ไม่คำนวณใหม่']] as [string, string][],
  reconciliation: [['โหมด', 'ความครบของการส่ง'], ['ยืนยันยอดกับระบบบัญชี', 'ยังไม่ได้: PEAK ไม่มี readback ตามสัญญา'], ['เวลาตัดยอด', '23:00 ของวันทำการ']] as [string, string][],
  /** The actions the page keeps hidden until their API and permission are approved */
  gated: ['บันทึกฉบับร่าง', 'เปิด/ปิดใช้งาน', 'เปลี่ยนข้อมูลลับ', 'ตรวจการจับคู่ข้อมูล'],
};

/** What the review step checks before anything goes live */
export function reviewChecklist(bo: BackofficeData): [string, boolean, string][] {
  const test = bo.adapterTests[0];
  return [
    ['การเชื่อมต่อ', test?.result === 'passed', test ? `${test.at} · ${test.result === 'passed' ? 'ผ่าน' : test.code ?? ''}` : '—'],
    ['การจับคู่ข้อมูล', true, ADAPTER.mappingVersion],
    ['สิทธิ์', true, 'Admin'],
    ['เวอร์ชันสัญญา', true, ADAPTER.contractVersion],
    ['UAT sign-off', true, ADAPTER.uatSignedOff],
  ];
}

/** A connection test: passes once the credential was rotated after the last failure. It checks the connection only */
export function testConnection(bo: BackofficeData, by: string, at = now()): ConnectionTest {
  const failedAt = bo.adapterTests.find(t => t.result === 'auth-failed')?.at ?? '';
  const ok = ADAPTER.credential.rotatedAt > failedAt;
  const ids = bo.adapterTests.map(t => Number(t.id.slice(3)));
  const test: ConnectionTest = {
    id: `CT-${String(Math.max(0, ...ids) + 1).padStart(4, '0')}`, at, by, result: ok ? 'passed' : 'auth-failed', code: ok ? undefined : 'AUTH_401', ms: ok ? 366 : 405,
  };
  bo.adapterTests.unshift(test);
  return test;
}

/* ---- Delivery queue (INT-ACC-02): Finance's records, the technical side ---- */

/** The payload as metadata only; the body never reaches the browser */
export function payloadMeta(x: AccountingExport) {
  let h = 0;
  for (const c of x.idempotencyKey + x.document) {
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
  }
  return { schema: 'accounting-document/1.2', mapping: ADAPTER.mappingVersion, contentType: 'application/json', size: `${(1.2 + (h % 90) / 100).toFixed(2)} KB`, checksum: `sha256:${h.toString(16).padStart(8, '0')}…` };
}

/** The tries as the record keeps them: the first and the last, and what the earlier ones answered */
export function attemptsOf(x: AccountingExport): { n: number; at: string; result: string; code?: string }[] {
  if (!x.attempts) {
    return [];
  }
  const last = { n: x.attempts, at: x.lastAt, result: x.status === 'delivered' ? 'ส่งแล้ว' : x.status === 'failed' ? 'ส่งไม่สำเร็จ' : 'รอส่ง', code: x.errorCode };
  return x.attempts === 1 ? [last] : [last, { n: 1, at: x.firstAt, result: 'ส่งไม่สำเร็จ', code: x.priorError ?? x.errorCode }];
}

/* ---- Reconciliation (INT-ACC-03): each source event against its delivery ---- */

export interface SourceEvent { invoiceId: string; document: string; docType: AccountingExport['docType']; amount: number; at: string }

/** What the billing records say should reach the accounting system: each bill issued, payment received, refund made and bill cancelled */
export function sourceEvents(clinic: ClinicData): SourceEvent[] {
  const events: SourceEvent[] = [];
  for (const i of clinic.invoices) {
    if (!i.issuedAt) {
      continue;
    }
    const document = i.no || i.id;
    events.push({ invoiceId: i.id, document, docType: 'invoice', amount: i.total, at: i.issuedAt });
    if (i.cancelledAt) {
      events.push({ invoiceId: i.id, document, docType: 'credit-note', amount: i.total, at: i.cancelledAt });
    }
  }
  for (const r of ledger(clinic)) {
    if (r.kind === 'payment' && (r.status === 'completed' || r.status === 'reversed')) {
      events.push({ invoiceId: r.invoice.id, document: r.invoice.no || r.invoice.id, docType: 'receipt', amount: r.amount, at: r.at });
    } else if (r.kind === 'refund') {
      events.push({ invoiceId: r.invoice.id, document: r.invoice.no || r.invoice.id, docType: 'credit-note', amount: -r.amount, at: r.at });
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export type Outcome = 'delivered' | 'awaiting' | 'failed' | 'missing' | 'duplicate' | 'variance';
export const OUTCOME: Record<Outcome, { label: string; cls: string }> = {
  delivered: { label: 'ส่งแล้ว (เทียบระบบบัญชีไม่ได้)', cls: 'quiet' },
  awaiting: { label: 'รอส่ง', cls: 'info' },
  failed: { label: 'ส่งไม่สำเร็จ', cls: 'danger' },
  missing: { label: 'ไม่พบรายการส่ง', cls: 'danger' },
  duplicate: { label: 'อาจส่งซ้ำ', cls: 'warn' },
  variance: { label: 'ยอดต่างจากต้นทาง', cls: 'warn' },
};
export const RECON_FORMULA = 'แต่ละเหตุการณ์ต้นทางจับคู่กับรายการส่งของเอกสารและประเภทเดียวกันตามลำดับเวลา · ยอดต่าง = ยอดต้นทาง − ยอดในรายการส่ง · ไม่เทียบกับยอดในระบบบัญชีเพราะไม่มี readback';

export interface ReconResult { key: string; outcome: Outcome; event?: SourceEvent; delivery?: AccountingExport; docType: AccountingExport['docType']; document: string; invoiceId: string; at: string }

export const PERIODS: [string, string][] = [['month', 'เดือนนี้'], ['quarter', '90 วัน'], ['all', 'ทั้งหมด']];
const inPeriod = (at: string, period: string) =>
  period === 'all' ? true : period === 'month' ? at.startsWith(TODAY.slice(0, 7)) : hoursSince(at) <= 90 * 24;

/** Every source event in the period with its delivery, and every delivery no event accounts for */
export function reconcileDeliveries(clinic: ClinicData, bo: BackofficeData, period = 'month'): ReconResult[] {
  const results: ReconResult[] = [];
  const groups = new Map<string, { events: SourceEvent[]; deliveries: AccountingExport[] }>();
  const groupOf = (k: string) => groups.get(k) ?? groups.set(k, { events: [], deliveries: [] }).get(k)!;
  sourceEvents(clinic).forEach(e => groupOf(`${e.invoiceId}:${e.docType}`).events.push(e));
  bo.accountingExports.slice().sort((a, b) => a.id.localeCompare(b.id)).forEach(x => groupOf(`${x.invoiceId}:${x.docType}`).deliveries.push(x));
  for (const [k, g] of groups) {
    const n = Math.max(g.events.length, g.deliveries.length);
    for (let i = 0; i < n; i++) {
      const event = g.events[i];
      const delivery = g.deliveries[i];
      const outcome: Outcome = !delivery ? 'missing' : !event ? 'duplicate' : delivery.status === 'queued' ? 'awaiting' : delivery.status === 'failed' ? 'failed'
        : delivery.amount !== event.amount ? 'variance' : 'delivered';
      const at = event?.at ?? delivery!.firstAt;
      if (inPeriod(at, period)) {
        const any = (event ?? delivery)!;
        results.push({ key: `${k}:${i}`, outcome, event, delivery, docType: any.docType, document: any.document, invoiceId: any.invoiceId, at });
      }
    }
  }
  return results.sort((a, b) => b.at.localeCompare(a.at));
}

/** The period's totals by document type: what the source holds against what was delivered */
export function reconSummary(results: ReconResult[]) {
  const types = Object.keys(DOC_TYPE) as AccountingExport['docType'][];
  const rows = types.map(t => {
    const rs = results.filter(r => r.docType === t);
    const delivered = rs.filter(r => r.delivery?.status === 'delivered' && r.event);
    return {
      docType: t,
      sourceCount: rs.filter(r => r.event).length, sourceAmount: rs.reduce((s, r) => s + (r.event?.amount ?? 0), 0),
      deliveredCount: delivered.length, deliveredAmount: delivered.reduce((s, r) => s + r.delivery!.amount, 0),
      refs: rs.filter(r => r.delivery?.externalRef).length, open: rs.filter(r => r.outcome !== 'delivered').length,
    };
  });
  const count = (o: Outcome) => results.filter(r => r.outcome === o).length;
  return {
    rows, events: results.filter(r => r.event).length,
    counts: { delivered: count('delivered'), awaiting: count('awaiting'), failed: count('failed'), missing: count('missing'), duplicate: count('duplicate'), variance: count('variance') },
  };
}

/* ---- Lab and imaging connections (INT-LAB-01, GATED: HL7/PACS is not in the backend) ---- */

export interface LabConnection { id: string; name: string; kind: 'HL7' | 'DICOM'; equipment: string[]; flow: string; enabled: boolean; lastMessage?: string }
export const LAB_CONNECTIONS: LabConnection[] = [
  { id: 'LC-01', name: 'IDEXX VetLab Station', kind: 'HL7', equipment: ['EQ-LAB-CBC-02', 'EQ-LAB-CHEM-01'], flow: 'ORM ออก · ORU เข้า', enabled: true, lastMessage: '2026-09-24 11:20' },
  { id: 'LC-02', name: 'Orthanc PACS', kind: 'DICOM', equipment: ['EQ-XR-IMG-01'], flow: 'MWL · C-STORE', enabled: true, lastMessage: '2026-09-24 10:55' },
  { id: 'LC-03', name: 'Mindray Vetus 8', kind: 'DICOM', equipment: ['EQ-OPD-IMG-02'], flow: 'C-STORE', enabled: false },
];

/** A connection is unreachable while its device is down in the asset register */
export function labHealth(c: LabConnection, equipment: Equipment[]): Health {
  if (!c.enabled) {
    return 'disabled';
  }
  return c.equipment.some(id => equipment.find(e => e.id === id)?.status === 'down') ? 'unreachable' : 'healthy';
}

export const MESSAGE_STATUS: Record<'accepted' | 'rejected' | 'pending', { label: string; cls: string }> = {
  accepted: { label: 'รับแล้ว', cls: 'ok' },
  rejected: { label: 'ถูกตีกลับ', cls: 'danger' },
  pending: { label: 'รอตอบรับ', cls: 'info' },
};
/** The message flow, metadata only: no patient payload leaves the connector */
export const LAB_MESSAGES: { at: string; connection: string; direction: 'in' | 'out'; type: string; status: keyof typeof MESSAGE_STATUS; error?: string; ref: string }[] = [
  { at: '2026-09-24 11:20', connection: 'LC-01', direction: 'in', type: 'ORU^R01 ผลตรวจ', status: 'accepted', ref: 'ACC-260924-031' },
  { at: '2026-09-24 11:02', connection: 'LC-01', direction: 'out', type: 'ORM^O01 คำสั่งตรวจ', status: 'accepted', ref: 'ACC-260924-031' },
  { at: '2026-09-24 10:55', connection: 'LC-02', direction: 'in', type: 'C-STORE ภาพ', status: 'accepted', ref: 'ACC-260924-029' },
  { at: '2026-09-24 10:41', connection: 'LC-01', direction: 'in', type: 'ORU^R01 ผลตรวจ', status: 'rejected', error: 'ACC_MISMATCH · accession ไม่ตรงกับคำสั่งตรวจ', ref: 'ACC-260924-027' },
  { at: '2026-09-24 10:30', connection: 'LC-02', direction: 'out', type: 'MWL รายการนัดถ่ายภาพ', status: 'pending', ref: 'ACC-260924-029' },
];

/* ---- Insurance adapters (INT-INS-01, P4 · HIDDEN until a contract) ---- */

export const INSURANCE_PREREQS: [string, string][] = [
  ['Protocol และ endpoint ของ adapter ประกัน', 'ไม่มีแหล่งข้อมูลก็ไม่มีสิทธิ์หรือเคลม'],
  ['รายชื่อบริษัทประกัน และที่เก็บข้อมูลลับพร้อมการเปลี่ยน', 'การตั้งค่าต้องมีสัญญาข้อมูลลับ'],
  ['สถานะเคลม/EOB และวงจรชีวิต', 'สถานะต้องมาจาก backend'],
  ['การเชื่อมใบแจ้งหนี้กับเคลม', 'การกระทบยอดประกันต้องจับคู่ได้'],
  ['สิทธิ์และ audit', 'การตั้งค่าและการส่งเคลมเป็นงานอ่อนไหว'],
];

/** Who the clinic claims from today, by hand on the sales claims page */
export function payers(bo: BackofficeData) {
  const map = new Map<string, { claims: number; open: number }>();
  for (const c of bo.claims) {
    const p = map.get(c.insurer) ?? { claims: 0, open: 0 };
    p.claims++;
    if (!['approved', 'partially-approved', 'rejected', 'reimbursed'].includes(c.status)) {
      p.open++;
    }
    map.set(c.insurer, p);
  }
  return [...map].map(([insurer, p]) => ({ insurer, ...p })).sort((a, b) => a.insurer.localeCompare(b.insurer));
}

/* ---- Import and export history (INT-IEX-01): a read view; each job is owned and re-run elsewhere ---- */

export type JobStatus = 'done' | 'partial' | 'failed' | 'queued';
export const JOB_STATUS: Record<JobStatus, { label: string; cls: string }> = {
  done: { label: 'สำเร็จ', cls: 'ok' },
  partial: { label: 'สำเร็จบางส่วน', cls: 'warn' },
  failed: { label: 'ล้มเหลว', cls: 'danger' },
  queued: { label: 'อยู่ในคิว', cls: 'info' },
};
export interface Job {
  id: string; kind: 'export' | 'import'; module: 'M11' | 'M31'; title: string; scope: string; at: string; by: string; status: JobStatus;
  result: string; artifact?: string; errors: string[]; link: string; owner: string;
}

/** The accounting runs, grouped by when each record was first sent, and the RoPA exports with their file */
export function jobs(bo: BackofficeData): Job[] {
  const runs = new Map<string, AccountingExport[]>();
  bo.accountingExports.forEach(x => runs.set(x.firstAt, [...(runs.get(x.firstAt) ?? []), x]));
  const list: Job[] = [...runs].map(([at, xs]) => {
    const delivered = xs.filter(x => x.status === 'delivered').length;
    const failed = xs.filter(x => x.status === 'failed');
    const queued = xs.filter(x => x.status === 'queued').length;
    const status: JobStatus = queued ? 'queued' : !failed.length ? 'done' : delivered ? 'partial' : 'failed';
    return {
      id: `JOB-XP-${at.replace(/[^0-9]/g, '').slice(2, 12)}`, kind: 'export', module: 'M11', title: 'ส่งข้อมูลบัญชีไป PEAK', at, by: 'ระบบ (adapter)', status,
      scope: xs.map(x => x.document).filter((d, i, all) => all.indexOf(d) === i).join(', '),
      result: `${delivered}/${xs.length}`, errors: failed.map(x => `${x.id} · ${x.errorCode}`), link: '/backoffice/integrations/accounting/queue', owner: 'คิวส่งข้อมูลบัญชี',
    };
  });
  for (const e of bo.ropaExports) {
    list.push({
      id: e.id, kind: 'export', module: 'M31', title: 'ส่งออก RoPA', at: e.at, by: e.by, status: 'done', scope: `${e.records} กิจกรรม`, result: `${e.records}/${e.records}`,
      artifact: e.artifact, errors: [], link: '/backoffice/quality/ropa', owner: 'RoPA / Cross-border',
    });
  }
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

/* ---- Overview (INT-OVW-01): only the connectors with a contract; a gated one shows no figures, its sample data is not a source ---- */

export function connectors(bo: BackofficeData) {
  const acc = accountingHealth(bo);
  const js = jobs(bo);
  const failedJobs = js.filter(j => j.status === 'failed' || j.status === 'partial').length;
  return [
    {
      key: 'accounting', name: 'Accounting · PEAK', kind: 'ส่งออกข้อมูลบัญชี', health: acc.health, backlog: { failed: acc.failed, queued: acc.queued }, readiness: 'ใช้งาน · บางส่วน GATED',
      observed: acc.lastSuccess, link: '/backoffice/integrations/accounting/queue',
    },
    {
      key: 'lab', name: 'Lab & Imaging', kind: 'HL7 / DICOM', health: 'gated' as Health, backlog: { failed: 0, queued: 0 }, readiness: 'GATED', observed: undefined,
      link: '/backoffice/integrations/lab-imaging',
    },
    { key: 'insurance', name: 'Insurance', kind: 'เคลมประกัน', health: 'gated' as Health, backlog: { failed: 0, queued: 0 }, readiness: 'P4 · GATED', observed: undefined, link: '/backoffice/integrations/insurance' },
    {
      key: 'import-export', name: 'Import/Export', kind: 'ประวัติงาน', health: (failedJobs ? 'degraded' : 'healthy') as Health, backlog: { failed: failedJobs, queued: js.filter(j => j.status === 'queued').length },
      readiness: 'บางส่วน · นำเข้า GATED', observed: js[0]?.at, link: '/backoffice/integrations/import-export',
    },
  ];
}
