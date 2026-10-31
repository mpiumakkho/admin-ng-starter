/*
 * The rules of the clinical workspace, ported from the design (seph1-vet-erp-rc: data/model.ts, features/encounter.tsx,
 * features/workflow.tsx). Text is kept in its source language and translated where it shows (TxPipe).
 */
import type {
  AckMethod, AlertType, Badge, EncounterNote, Handoff, HandoffKey, HandoffStep, LabResult, Order, Patient, StageEntry, StageKey,
  StageState,
} from './types';

/* Clinical alerts: their tone on chips and icons */
export const ALERT_META: Record<AlertType, { cls: 'danger' | 'warn' | 'iso' }> = {
  allergy: { cls: 'danger' },
  drug: { cls: 'danger' },
  handling: { cls: 'warn' },
  dnr: { cls: 'danger' },
  isolation: { cls: 'iso' },
  pregnancy: { cls: 'warn' },
};
/** Most severe first */
export const ALERT_ORDER = { danger: 0, iso: 1, warn: 2 } as const;

/* The sample is a snapshot of one morning: the clock stands still at NOW on TODAY */
export const NOW = '11:32';
export const TODAY = '2026-09-24';

/* Where each pet is in its visit, and for how long */
export const STAGES: { key: StageKey; label: string; th: string }[] = [
  { key: 'arrival', label: 'Arrival', th: 'มาถึง' },
  { key: 'checkin', label: 'Check-in', th: 'เช็คอิน' },
  { key: 'room', label: 'In room', th: 'ห้องตรวจ' },
  { key: 'treatment', label: 'Treatment', th: 'หัตถการ' },
  { key: 'discharge', label: 'Discharge', th: 'จำหน่าย' },
];
/** The longest a pet should stay in each stage, in minutes */
export const STAGE_SLA: Record<StageKey, number> = { arrival: 10, checkin: 15, room: 45, treatment: 60, discharge: 20 };
const STAGE_STATUS: Record<StageKey, Badge> = {
  arrival: { text: 'Waiting', cls: 'waiting' },
  checkin: { text: 'Checked in', cls: 'checked' },
  room: { text: 'In room', cls: 'room' },
  treatment: { text: 'Treatment', cls: 'treatment' },
  discharge: { text: 'Discharge', cls: 'done' },
};
export const LOCATIONS = [
  'Check-in counter', 'Exam Room 1', 'Exam Room 2', 'Exam Room 3', 'Exam Room 4',
  'Treatment room 1', 'Treatment room 2', 'Isolation room', 'Discharge desk',
];

export const toMin = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const NOW_MIN = toMin(NOW);
type Staged = Pick<Patient, 'stages'>;
export function stageIndex(p: Staged): number {
  let index = 0;
  p.stages.forEach((s, k) => { if (s.at) { index = k; } });
  return index;
}
export const stageKey = (p: Staged): StageKey => STAGES[stageIndex(p)].key;
export function stageMinutes(p: Staged): number {
  const s = p.stages[stageIndex(p)];
  return s.at ? Math.max(0, NOW_MIN - toMin(s.at)) : 0;
}
export function stageState(p: Staged): StageState {
  const sla = STAGE_SLA[stageKey(p)];
  const m = stageMinutes(p);
  return m > sla * 1.5 ? 'late' : m > sla ? 'warn' : 'ok';
}
export const statusOf = (p: Staged): Badge => STAGE_STATUS[stageKey(p)];
export const locOf = (p: Staged): string => p.stages[stageIndex(p)].loc || '—';
export const stateChipCls = (st: StageState) => (st === 'late' ? 'danger' : st === 'warn' ? 'warn' : 'ok');
export const minutesSince = (hhmm: string) => (/^\d\d:\d\d$/.test(hhmm) ? Math.max(0, NOW_MIN - toMin(hhmm)) : 0);

/** Moves a pet to a stage now, keeping what is already done in its hand-off */
export function advanceStage(p: Patient, key: StageKey, loc: string | undefined, by: string) {
  const s: StageEntry | undefined = p.stages.find(x => x.key === key);
  if (!s) {
    return;
  }
  s.at = NOW;
  s.loc = loc || s.loc;
  s.by = by;
  syncHandoff(p);
}

/* What the visit has to hand over before the pet goes home: a separate axis from where the pet is */
export const HANDOFF: { key: HandoffKey; label: string }[] = [
  { key: 'estimate', label: 'Estimate' }, { key: 'consent', label: 'Consent' },
  { key: 'dispense', label: 'Dispense' }, { key: 'billing', label: 'Billing' }, { key: 'discharge', label: 'Discharge' },
];
export function defaultHandoff(p: Staged): Handoff {
  const i = stageIndex(p);
  const mk = (state: HandoffStep['state'], note: string): HandoffStep => ({ state, note });
  if (i <= 1) {
    return { estimate: mk('active', 'ร่าง 4 รายการ'), consent: mk('todo', 'ยังไม่เริ่ม'), dispense: mk('todo', '—'), billing: mk('todo', '—'), discharge: mk('todo', '—') };
  }
  if (i === 2) {
    return { estimate: mk('done', 'อนุมัติแล้ว'), consent: mk('active', 'รอเจ้าของลงนาม'), dispense: mk('todo', 'ยังไม่เริ่ม'), billing: mk('todo', '—'), discharge: mk('todo', '—') };
  }
  if (i === 3) {
    return { estimate: mk('done', 'อนุมัติแล้ว'), consent: mk('done', 'ลงนามแล้ว'), dispense: mk('active', 'รอตรวจสอบใบสั่งยา'), billing: mk('todo', '—'), discharge: mk('todo', '—') };
  }
  return { estimate: mk('done', 'อนุมัติแล้ว'), consent: mk('done', 'ลงนามแล้ว'), dispense: mk('done', 'จ่ายยาแล้ว'), billing: mk('active', 'รอรับชำระ'), discharge: mk('todo', 'รอปิด visit') };
}
export function syncHandoff(p: Patient) {
  const next = defaultHandoff(p);
  HANDOFF.forEach(h => { if (p.handoff[h.key].state === 'done') { next[h.key] = p.handoff[h.key]; } });
  // An estimate and a consent have records of their own: moving on does not approve or sign them
  if (next.estimate.state === 'done' && !p.estimate) {
    next.estimate = { state: 'active', note: 'รออนุมัติ' };
  }
  if (next.consent.state === 'done' && !p.consentForm) {
    next.consent = p.estimate ? { state: 'active', note: 'รอเจ้าของลงนาม' } : { state: 'todo', note: 'ยังไม่เริ่ม' };
  }
  p.handoff = next;
}

/* Who and where */
export const VETS = ['น.สพ. นรินทร์', 'สพ.ญ. ลลิตา', 'สพ.ญ. พิชญา'];
export const NURSES = ['พ.ส. ณิชา', 'พ.ส. กมล'];
export const TRIAGE = [{ value: 'Routine', cls: 'ok' }, { value: 'Urgent', cls: 'warn' }, { value: 'Emergency', cls: 'danger' }] as const;

/* The appointment board: four slots of the day and the waitlist */
export const SLOTS = ['08:00–10:00', '10:00–12:00', '13:00–15:00', '15:00–17:00'] as const;
export const WAITLIST = 'Waitlist';

/* Dates are ISO in the data and shown in the language: Thai with the Buddhist year (24 ก.ย. 2569), English
   the Gregorian one (24 Sep 2026) */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function formatDate(iso: string, style: 'long' | 'short' | 'weekday', lang: 'th' | 'en'): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const locale = lang === 'th' ? 'th-TH' : 'en-GB';
  if (style === 'long') {
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (style === 'weekday') {
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
/** Monday of the week of a date */
export const weekStart = (iso: string) => addDays(iso, -((new Date(iso + 'T00:00:00').getDay() + 6) % 7));
/** "2026-09-24 10:58" → "10:58" for today, otherwise as it is */
export const timeOf = (s: string) => (s.startsWith(TODAY + ' ') ? s.slice(TODAY.length + 1) : s);

/** The next running number for codes such as ORD-260924-31 */
export function nextSeq(codes: string[], prefix: string): string {
  const n = Math.max(0, ...codes.filter(c => c.startsWith(prefix)).map(c => Number(c.slice(prefix.length)) || 0)) + 1;
  return prefix + String(n).padStart(2, '0');
}

/* Orders: Draft > Accepted > In progress > Completed; a cancel needs a reason of 10 characters or more */
export const ORDER_FLOW: Record<string, { next: string; label: string } | undefined> = {
  Draft: { next: 'Accepted', label: 'ส่งคำสั่ง' },
  Accepted: { next: 'In progress', label: 'เริ่มดำเนินการ' },
  'In progress': { next: 'Completed', label: 'บันทึกผลและปิด order' },
};
export const isOpenOrder = (o: Order) => o.col !== 'Completed' && o.col !== 'Cancelled';
export const REASON_MIN = 10;

export interface CatalogItem { id: string; name: string; kind: 'Lab' | 'Imaging' | 'Procedure'; dept: string; price: string }
export const ORDER_CATALOG: CatalogItem[] = [
  { id: 'cbc', name: 'CBC', kind: 'Lab', dept: 'In-house lab', price: '฿850' },
  { id: 'cbc-chem', name: 'CBC + Blood chemistry', kind: 'Lab', dept: 'In-house lab', price: '฿1,250' },
  { id: 'renal', name: 'Renal panel', kind: 'Lab', dept: 'In-house lab', price: '฿980' },
  { id: 'lytes', name: 'Electrolytes', kind: 'Lab', dept: 'In-house lab', price: '฿650' },
  { id: 'ua', name: 'Urinalysis', kind: 'Lab', dept: 'In-house lab', price: '฿400' },
  { id: 'ear', name: 'Ear cytology', kind: 'Lab', dept: 'In-house lab', price: '฿450' },
  { id: 'skin', name: 'Skin scraping', kind: 'Lab', dept: 'In-house lab', price: '฿350' },
  { id: 'joint', name: 'Joint fluid analysis', kind: 'Lab', dept: 'In-house lab', price: '฿1,100' },
  { id: 'xray', name: 'X-ray (2 views)', kind: 'Imaging', dept: 'Imaging', price: '฿900–1,200' },
  { id: 'us', name: 'Abdominal ultrasound', kind: 'Imaging', dept: 'Imaging', price: '฿1,500' },
  { id: 'fluids', name: 'IV fluid therapy', kind: 'Procedure', dept: 'Treatment room', price: '฿700' },
  { id: 'dental', name: 'Dental scaling', kind: 'Procedure', dept: 'Surgery', price: '฿2,500' },
];

/** Values reported when a lab order is completed (sample reference data) */
export const LAB_VALUES: Record<string, LabResult['values']> = {
  CBC: [['WBC', '10.2 x10³/µL', '6.0–17.0', 0], ['RBC', '6.9 x10⁶/µL', '5.5–8.5', 0], ['HCT', '44 %', '37–55', 0], ['Platelet', '305 x10³/µL', '200–500', 0]],
  'CBC + Blood chemistry': [['WBC', '10.2 x10³/µL', '6.0–17.0', 0], ['HCT', '44 %', '37–55', 0], ['ALT', '48 U/L', '10–100', 0],
    ['BUN', '18 mg/dL', '7–27', 0], ['Creatinine', '1.1 mg/dL', '0.5–1.8', 0], ['Glucose', '98 mg/dL', '70–143', 0]],
  'Renal panel': [['BUN', '22 mg/dL', '7–27', 0], ['Creatinine', '1.4 mg/dL', '0.5–1.8', 0], ['SDMA', '12 µg/dL', '0–14', 0], ['Phosphorus', '4.6 mg/dL', '2.5–6.8', 0]],
  Electrolytes: [['Sodium', '148 mmol/L', '144–160', 0], ['Potassium', '4.4 mmol/L', '3.5–5.8', 0], ['Chloride', '112 mmol/L', '109–122', 0]],
  Urinalysis: [['USG', '1.032', '1.015–1.045', 0], ['pH', '6.5', '5.5–7.5', 0], ['Protein', 'Negative', 'Negative', 0]],
  'Ear cytology': [['Cocci', '1+', '0–1+', 0], ['Rods', '0', '0', 0], ['Yeast (Malassezia)', '1+', '0–1+', 0]],
  'Skin scraping': [['Demodex', 'ไม่พบ', 'ไม่พบ', 0], ['Sarcoptes', 'ไม่พบ', 'ไม่พบ', 0]],
  'Joint fluid analysis': [['Nucleated cells', '1,200 /µL', '< 3,000', 0], ['Protein', '2.2 g/dL', '< 2.5', 0], ['Viscosity', 'ปกติ', 'ปกติ', 0]],
};

/* Results: a critical value is acknowledged by phone with read-back, and the first acknowledgement stands */
export const ACK_METHODS: { value: AckMethod; label: string }[] = [
  { value: 'phone', label: 'โทรศัพท์ + read-back' }, { value: 'in_person', label: 'พบตัว' }, { value: 'line', label: 'LINE' }, { value: 'other', label: 'อื่นๆ' },
];
export const CRITICAL_RULE = 'ค่าวิกฤต — ต้องโทรศัพท์ + ยืนยัน read-back (ห้าม LINE/SMS อย่างเดียว)';

/* The encounter note */
export const ENCOUNTER_STEPS = ['Intake', 'Vitals', 'SOAP', 'Assessment & Plan', 'Orders', 'Medication', 'Discharge'];
/** Steps a signature locks (S/O/A/P) */
export const SIGNED_STEPS = new Set([2, 3]);
export const SOAP_FIELDS: (keyof EncounterNote)[] = ['chief', 'hpi', 'duration', 'progression', 'ros', 'general', 'msk', 'cardio', 'remark', 'ddx', 'dx', 'plan'];
export const OPTIONS = {
  appetite: ['Normal', 'Decreased', 'Increased', 'None'],
  energy: ['Normal', 'Slightly decreased', 'Lethargic'],
  duration: ['วันนี้', '1 วัน', '2 วัน', '3–7 วัน', 'มากกว่า 1 สัปดาห์', 'เรื้อรัง'],
  progression: ['Worsening', 'Stable', 'Improving'],
  bcs: ['3/9 — ผอม', '4/9', '5/9 — เหมาะสม', '6/9', '7/9 — อ้วน'],
  followup: ['ไม่ต้องนัด', 'นัดติดตาม 3 วัน', 'นัดติดตาม 7 วัน', 'นัดติดตาม 14 วัน', 'นัดตามผลตรวจ'],
  ros: ['Musculoskeletal', 'GI', 'Respiratory', 'Neurologic', 'Dermatologic', 'Urinary'],
} as const;

/** The orders the encounter suggests for this visit, the first two ticked */
export const ENCOUNTER_ORDERS = [
  { name: 'CBC + Blood chemistry', kind: 'Lab', dept: 'In-house lab', price: '฿1,250', note: 'Lab · Routine · ฿1,250', checked: true },
  { name: 'Right hind limb X-ray', kind: 'Imaging', dept: 'Imaging', price: '฿900–1,200', note: 'Imaging · Urgent · ฿900–1,200', checked: true },
  { name: 'Joint fluid analysis', kind: 'Lab', dept: 'In-house lab', price: '฿1,100', note: 'Lab · Routine · ฿1,100', checked: false },
];

const blank = (v: string) => (v && v !== '—' ? v : '');

/** Bolt's visit is the worked example; everyone else starts from what was recorded at check-in */
export function defaultNote(p: Patient): EncounterNote {
  const base: EncounterNote = {
    reason: p.chief, ownerObs: '', appetite: 'Normal', energy: 'Normal',
    weight: blank(p.weight).replace(/\s*kg$/, ''), temp: '', hr: '', rr: '', mm: '', bcs: '5/9 — เหมาะสม', pain: '0',
    chief: p.chief, hpi: '', duration: '', progression: 'Stable', ros: [],
    general: '', msk: '', cardio: '', remark: '',
    ddx: '', dx: '', plan: '', summary: '', home: '', followup: 'ไม่ต้องนัด', warning: '', restrict: '',
    templates: [],
  };
  if (p.id !== 5) {
    return base;
  }
  return {
    ...base,
    ownerObs: 'เริ่มเป็นเมื่อ 2 วันก่อน และแย่ลงหลังออกกำลังกาย', energy: 'Slightly decreased',
    temp: '38.6', hr: '108 bpm', rr: '26 rpm', mm: 'Pink / < 2 วินาที', pain: '3',
    hpi: 'เริ่ม 2 วันก่อน แย่ลงหลังออกกำลัง ไม่มีประวัติอุบัติเหตุ', duration: '2 วัน', progression: 'Worsening', ros: ['Musculoskeletal'],
    general: 'ตื่นตัวดี ตอบสนองปกติ ไม่มีภาวะขาดน้ำ', msk: 'ขาหลังขวา ลงน้ำหนักไม่เต็มที่ เจ็บเมื่อคลำบริเวณเข่า',
    cardio: 'เสียงหัวใจและปอดปกติ ไม่มีเสียงผิดปกติ', remark: 'Brachycephalic — เฝ้าระวังการหายใจขณะจับยึด',
    ddx: '1. Soft-tissue injury\n2. Cranial cruciate ligament partial tear\n3. Patellar luxation',
    dx: 'Suspected mild soft-tissue injury of right hind limb',
    plan: 'จำกัดการออกกำลัง 5–7 วัน · ให้ยาแก้ปวดกลุ่ม NSAID · X-ray ยืนยัน · นัดติดตาม 7 วัน',
    summary: 'Suspected mild soft-tissue injury of right hind limb',
    home: 'จำกัดการออกกำลัง 5–7 วัน ให้ยาพร้อมอาหาร และกลับมาพบสัตวแพทย์หากอาการแย่ลง', followup: 'นัดติดตาม 7 วัน',
    warning: 'ไม่ลงน้ำหนักขาหลังขวาเลย ขาบวมหรือร้อน อาเจียนหรือถ่ายดำหลังให้ยา',
    restrict: 'เดินจูงสั้นๆ วันละ 2–3 ครั้ง งดวิ่งและกระโดด 7 วัน · อาหารเดิม',
  };
}

export interface NoteTemplate {
  id: string; name: string; desc: string;
  /** Words in the visit reason that make it the suggestion */
  match: string[];
  fields: Partial<EncounterNote>;
}
export const TEMPLATES: NoteTemplate[] = [
  {
    id: 'lameness', name: 'ขาเจ็บ / เดินกะเผลก', desc: 'Orthopedic exam · ขาหน้า/ขาหลัง', match: ['limp', 'lame', 'กะเผลก', 'ขา'],
    fields: {
      ros: ['Musculoskeletal'],
      hpi: 'เริ่มเดินกะเผลกเมื่อ … วันก่อน อาการ (แย่ลง/คงที่) หลังออกกำลัง · ประวัติอุบัติเหตุ: …',
      msk: 'Lameness grade …/5 ขา … · เจ็บเมื่อคลำ … · drawer test … · patellar … · ไม่พบบวม/ร้อน',
      general: 'ตื่นตัวดี ตอบสนองปกติ ไม่มีภาวะขาดน้ำ',
      ddx: '1. Soft-tissue injury\n2. Cranial cruciate ligament tear\n3. Patellar luxation\n4. Hip dysplasia / OA',
      plan: 'X-ray ขาที่มีอาการ 2 ท่า · NSAID 5–7 วัน · จำกัดการออกกำลัง · นัดติดตาม 7 วัน',
      home: 'จำกัดการออกกำลัง 5–7 วัน เดินจูงสั้นๆ เท่านั้น ให้ยาพร้อมอาหาร และกลับมาทันทีหากไม่ลงน้ำหนักเลย',
      followup: 'นัดติดตาม 7 วัน',
    },
  },
  {
    id: 'gi', name: 'อาเจียน / ท้องเสีย', desc: 'GI · ประเมินภาวะขาดน้ำ', match: ['vomit', 'diarr', 'อาเจียน', 'ท้องเสีย', 'appetite', 'เบื่ออาหาร'],
    fields: {
      ros: ['GI'],
      hpi: 'อาเจียน … ครั้ง/วัน ตั้งแต่ … · ลักษณะ … · อุจจาระ … · กินอาหาร/น้ำ … · ประวัติกินสิ่งแปลกปลอม …',
      general: 'ภาวะขาดน้ำ …% · เยื่อเมือก … · CRT …',
      remark: 'คลำช่องท้อง: … · เจ็บท้อง …',
      ddx: '1. Dietary indiscretion / gastroenteritis\n2. Foreign body\n3. Pancreatitis\n4. Systemic disease (renal/hepatic)',
      plan: 'CBC + chemistry · พิจารณา X-ray/Ultrasound ช่องท้อง · สารน้ำ · ยาแก้อาเจียน · อาหารย่อยง่าย',
      home: 'งดอาหาร 6–8 ชม. แล้วให้อาหารย่อยง่ายทีละน้อย ให้น้ำสะอาด สังเกตการอาเจียนและอุจจาระ กลับมาทันทีหากอาเจียนซ้ำหรือซึม',
      followup: 'นัดติดตาม 3 วัน',
    },
  },
  {
    id: 'skin', name: 'ผิวหนัง / คัน', desc: 'Dermatology · cytology', match: ['skin', 'itch', 'ผิว', 'คัน'],
    fields: {
      ros: ['Dermatologic'],
      hpi: 'คัน … สัปดาห์ · ตำแหน่ง … · ฤดูกาล … · การป้องกันเห็บหมัด … · อาหาร …',
      remark: 'รอยโรค: … (papule/pustule/alopecia/crust) · ตำแหน่ง … · ผลขูดผิวหนัง … · cytology …',
      ddx: '1. Flea allergy dermatitis\n2. Atopic dermatitis\n3. Food allergy\n4. Pyoderma / Malassezia',
      plan: 'Skin scraping + cytology · ป้องกันเห็บหมัด · ยาลดคัน · แชมพูยา · ประเมินอาหาร',
      home: 'อาบแชมพูยาสัปดาห์ละ 2 ครั้ง ทิ้งไว้ 10 นาทีก่อนล้าง ป้องกันเห็บหมัดทุกเดือน และงดอาหารอื่นนอกจากที่แนะนำ',
      followup: 'นัดติดตาม 14 วัน',
    },
  },
  {
    id: 'ear', name: 'หูอักเสบ', desc: 'Otitis externa · otoscope', match: ['ear', 'หู'],
    fields: {
      ros: ['Dermatologic'],
      hpi: 'สะบัดหัว/เกาหู … วัน · หูข้าง … · มีกลิ่น/สิ่งคัดหลั่ง …',
      remark: 'Otoscope: ช่องหู … · แก้วหู … · สิ่งคัดหลั่ง … · ear cytology: cocci … / yeast …',
      ddx: '1. Otitis externa (bacterial / Malassezia)\n2. Ear mites\n3. Underlying allergy',
      plan: 'Ear cytology · ล้างหูที่โรงพยาบาล · ยาหยอดหู 7–14 วัน · ประเมินภูมิแพ้ถ้าเป็นซ้ำ',
      home: 'ล้างหูก่อนหยอดยา หยอดยาตามขนาดวันละ 2 ครั้ง นวดโคนหูเบาๆ ห้ามใช้ไม้พันสำลีแยงลึก',
      followup: 'นัดติดตาม 14 วัน',
    },
  },
  {
    id: 'wellness', name: 'ตรวจสุขภาพประจำปี + วัคซีน', desc: 'Annual exam · vaccination', match: ['annual', 'vaccin', 'wellness', 'วัคซีน', 'ตรวจสุขภาพ'],
    fields: {
      ros: [],
      hpi: 'มาตรวจสุขภาพประจำปี · ไม่มีอาการผิดปกติตามที่เจ้าของแจ้ง · อาหาร … · การป้องกันพยาธิ/เห็บหมัด …',
      general: 'ตื่นตัวดี BCS เหมาะสม ขนและผิวหนังปกติ',
      msk: 'เดินปกติ ไม่พบความเจ็บปวดเมื่อคลำ',
      cardio: 'เสียงหัวใจและปอดปกติ',
      remark: 'ฟัน: tartar grade … · หู ตา ปกติ',
      dx: 'Healthy — annual wellness',
      plan: 'ฉีดวัคซีนตามกำหนด · ถ่ายพยาธิ · ป้องกันเห็บหมัด · แนะนำตรวจเลือดประจำปี',
      home: 'อาจมีไข้ต่ำหรือซึมเล็กน้อยได้ 24 ชม. หลังฉีดวัคซีน หากหน้าบวม อาเจียน หรือหายใจลำบาก ให้กลับมาทันที',
      followup: 'ไม่ต้องนัด',
    },
  },
];
export const suggestTemplate = (p: Patient) =>
  TEMPLATES.find(tpl => tpl.match.some(w => p.reason.toLowerCase().includes(w.toLowerCase())));
export const TEMPLATE_FIELD_LABELS: Partial<Record<keyof EncounterNote, string>> = {
  ros: 'Review of systems', hpi: 'History of present illness', general: 'General appearance', msk: 'Musculoskeletal',
  cardio: 'Cardiopulmonary', remark: 'หมายเหตุ (Objective)', ddx: 'Differential diagnosis', dx: 'Working diagnosis',
  plan: 'Treatment plan', home: 'Home instructions', followup: 'Follow-up',
};

/* Prescribing: the drugs the order form can pick, with the class the safety check uses (a subset of the design's
   formulary, data/model.ts and data/cds.ts). Doses are mg per kg per dose, by species, from common veterinary
   references; mg is what one unit holds (a tablet, a mL), and a drug dosed by the unit has none. */
export interface DrugItem {
  name: string; cls?: string; route: string; stock: string;
  /** What one unit is: a tablet, a mL, a drop */
  unit: string;
  mg?: number;
  dog?: [min: number, max: number];
  cat?: [min: number, max: number];
  /** Baht for one unit; a drug dosed by the drop is sold by the bottle */
  price: number;
}
export const FORMULARY: DrugItem[] = [
  { name: 'Amoxicillin-clavulanate 250 mg', cls: 'penicillin', route: 'รับประทาน', stock: 'ตู้ A1', unit: 'เม็ด', mg: 250, dog: [12.5, 25], cat: [12.5, 25], price: 18 },
  { name: 'Amoxicillin 250 mg', cls: 'penicillin', route: 'รับประทาน', stock: 'ตู้ A1', unit: 'เม็ด', mg: 250, dog: [10, 20], cat: [10, 20], price: 8 },
  { name: 'Cefalexin 250 mg', cls: 'cephalosporin', route: 'รับประทาน', stock: 'ตู้ A1', unit: 'เม็ด', mg: 250, dog: [15, 30], cat: [15, 30], price: 10 },
  { name: 'Doxycycline 100 mg', cls: 'tetracycline', route: 'รับประทาน', stock: 'ตู้ A2', unit: 'เม็ด', mg: 100, dog: [5, 10], cat: [5, 10], price: 12 },
  { name: 'Metronidazole 250 mg', cls: 'nitroimidazole', route: 'รับประทาน', stock: 'ตู้ A2', unit: 'เม็ด', mg: 250, dog: [10, 15], cat: [10, 15], price: 6 },
  { name: 'Carprofen 25 mg', cls: 'nsaid', route: 'รับประทาน', stock: 'ตู้ A2', unit: 'เม็ด', mg: 25, dog: [2, 4.4], cat: [1, 2], price: 32 },
  { name: 'Meloxicam 1.5 mg/mL', cls: 'nsaid', route: 'รับประทาน', stock: 'ตู้ A3', unit: 'mL', mg: 1.5, dog: [0.05, 0.2], cat: [0.025, 0.1], price: 25 },
  { name: 'Paracetamol 500 mg', cls: 'paracetamol', route: 'รับประทาน', stock: 'ตู้ A3', unit: 'เม็ด', mg: 500, dog: [10, 15], price: 3 },
  { name: 'Tramadol 50 mg', cls: 'opioid', route: 'รับประทาน', stock: 'ตู้ล็อก C', unit: 'เม็ด', mg: 50, dog: [2, 5], cat: [1, 4], price: 15 },
  { name: 'Buprenorphine 0.3 mg/mL (inj)', cls: 'opioid', route: 'ฉีดเข้ากล้าม', stock: 'ตู้ล็อก C', unit: 'mL', mg: 0.3, dog: [0.01, 0.02], cat: [0.01, 0.02], price: 120 },
  { name: 'Prednisolone 5 mg', cls: 'corticosteroid', route: 'รับประทาน', stock: 'ตู้ A3', unit: 'เม็ด', mg: 5, dog: [0.5, 2], cat: [1, 2], price: 4 },
  { name: 'Gentamicin 40 mg/mL (inj)', cls: 'aminoglycoside', route: 'ฉีดเข้ากล้าม', stock: 'ตู้เย็น 1', unit: 'mL', mg: 40, dog: [6, 9], cat: [5, 8], price: 60 },
  { name: 'Ondansetron 2 mg', cls: 'antiemetic', route: 'รับประทาน', stock: 'ตู้ B3', unit: 'เม็ด', mg: 2, dog: [0.1, 1], cat: [0.1, 1], price: 20 },
  { name: 'Maropitant 16 mg', cls: 'antiemetic', route: 'รับประทาน', stock: 'ตู้ B3', unit: 'เม็ด', mg: 16, dog: [2, 8], cat: [1, 2], price: 95 },
  { name: 'Omeprazole 10 mg', route: 'รับประทาน', stock: 'ตู้ B3', unit: 'เม็ด', mg: 10, dog: [0.5, 1.5], cat: [0.5, 1.5], price: 12 },
  { name: 'Mirtazapine 1.88 mg', route: 'รับประทาน', stock: 'ตู้ B2', unit: 'เม็ด', mg: 1.88, dog: [0.5, 1], cat: [0.3, 0.6], price: 35 },
  { name: 'Apoquel 3.6 mg', cls: 'jak-inhibitor', route: 'รับประทาน', stock: 'ตู้ B2', unit: 'เม็ด', mg: 3.6, dog: [0.4, 0.6], price: 55 },
  { name: 'Otic drops (ear)', route: 'หยอดหู', stock: 'ตู้ C1', unit: 'หยด', price: 380 },
];
export const RX_FREQS = ['วันละ 1 ครั้ง', 'วันละ 2 ครั้ง', 'วันละ 3 ครั้ง', 'ทุก 8 ชม.', 'ทุก 12 ชม.', 'วันเว้นวัน', 'ครั้งเดียว'];
export const RX_DAYS = ['3 วัน', '5 วัน', '7 วัน', '10 วัน', '14 วัน', '30 วัน', '—'];

/** The patient's allergy or drug-caution alert that a drug runs into: by the drug's name or by its class */
export function drugConflict(p: Patient, drug: DrugItem): string | null {
  const name = drug.name.split(' ')[0].toLowerCase();
  for (const alert of p.alerts.filter(a => a.type === 'allergy' || a.type === 'drug')) {
    const text = `${alert.label} ${alert.detail ?? ''}`.toLowerCase();
    if (text.includes(name) || (drug.cls && text.includes(drug.cls))) {
      return alert.label;
    }
  }
  return null;
}
