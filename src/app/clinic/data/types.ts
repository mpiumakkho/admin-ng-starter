/* The clinical workspace's records, as in the design it follows (seph1-vet-erp-rc, src/types.ts) */

export type Tone = 'ok' | 'warn' | 'danger';
export type PetKind = 'dog' | 'cat' | 'other';
export type StageState = 'ok' | 'warn' | 'late';

export type AlertType = 'allergy' | 'drug' | 'handling' | 'dnr' | 'isolation' | 'pregnancy';
export interface ClinicalAlert {
  type: AlertType;
  label: string;
  detail?: string;
  recordedBy?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export type StageKey = 'arrival' | 'checkin' | 'room' | 'treatment' | 'discharge';
export interface StageEntry { key: StageKey; at: string | null; by?: string; loc?: string }

export type HandoffKey = 'estimate' | 'consent' | 'dispense' | 'billing' | 'discharge';
export interface HandoffStep { state: 'todo' | 'active' | 'done'; note: string }
export type Handoff = Record<HandoffKey, HandoffStep>;

/** A status pill: its text and tone class */
export interface Badge { text: string; cls: string }

/** [label, secondary] pairs for timelines and simple lists */
export type Pair = [string, string];

export interface Owner {
  name: string; phone: string; phone2: string; email: string; line: string;
  coOwner: string; address: string; consent: string; pdpa: string; prefer: string;
  badges: string[]; pets: string[]; note: string; insurance: string;
  /** The Thai ID, 13 digits, when the owner gave it at registration */
  thaiId?: string;
  /** Money the owner has with the hospital, in baht: a deposit or a refund not used yet */
  credit?: number;
  appts: [date: string, title: string, status: string][];
}

export interface Patient {
  id: number; time: string; pet: string; kind: PetKind; code: string; hn: string;
  species: string; breed: string; sex: string; age: string; weight: string; weightAt: string;
  microchip: string; blood: string; ownerKey: string;
  reason: string; chief: string; triage: string; triageCls: Tone;
  vet: string; nurse: string;
  stages: StageEntry[];
  alerts: ClinicalAlert[];
  /** When the allergy history was last reviewed with the owner */
  allergyReview?: { at: string; by: string };
  tasks: string[];
  tasksDone: string[];
  problems: [name: string, note: string, tone: Tone][];
  meds: Pair[];
  vaccines: [name: string, note: string, tone: Tone][];
  visits: Pair[];
  docs: Pair[];
  note: string;
  handoff: Handoff;
}

export interface Appointment {
  id: string; slot: string; date: string; time: string; pet: string; kind: PetKind; breed: string;
  owner: string; phone: string; type: string; reason: string; provider: string; room: string; dur: string;
  state: string; deposit: string; est: string; prev: Pair | null; reminders: [text: string, tone: Tone][];
}

export interface Order {
  id: string; col: string; state: string; name: string; pet: string; code: string; kind: string;
  priority: string; dept: string; by: string; time: string; price: string; trail: Pair[];
}

export type AckMethod = 'phone' | 'in_person' | 'line' | 'other';
export interface LabResult {
  id: string; col: string; name: string; pet: string; status: string; time: string; by: string;
  flag: '' | 'critical'; ack: boolean;
  values: [name: string, value: string, range: string, abnormal: number][];
  interp: string;
  ackMethod?: AckMethod; ackReadBack?: boolean; ackBy?: string; ackAt?: string; ackNote?: string;
}

export interface Prescription {
  id: string; col: string; state: string; code: string; pet: string; owner: string; by: string;
  drug: string; dose: string; route: string; freq: string; days: string; qty: string; advice: string;
  stock: [batch: string, exp: string, qty: string, loc: string][];
  history: Pair[];
  /** A verbal order a nurse took: a draft until a vet co-signs it */
  verbal?: boolean;
  orderedAt?: string;
  cosignedBy?: string; cosignedAt?: string;
}

/** Today's encounter record of one patient */
export interface EncounterNote {
  reason: string; ownerObs: string; appetite: string; energy: string;
  weight: string; temp: string; hr: string; rr: string; mm: string; bcs: string; pain: string;
  chief: string; hpi: string; duration: string; progression: string; ros: string[];
  general: string; msk: string; cardio: string; remark: string;
  ddx: string; dx: string; plan: string;
  summary: string; home: string; followup: string;
  /** Templates applied, newest last */
  templates: string[];
  /** Last save, "HH:MM · by" */
  savedAt?: string;
  /** Signed: S/O/A/P are locked */
  status?: 'draft' | 'signed';
  signedBy?: string; signedAt?: string;
  /** Closed: the whole record of the visit is locked */
  closedBy?: string; closedAt?: string;
}

/** A bill given to an owner, in baht: what it was for, what it came to and how much is paid */
export interface Invoice {
  id: string; no: string; ownerKey: string; pet: string; date: string; title: string;
  items: [name: string, amount: number][];
  total: number; paid: number;
}

export interface ClinicData {
  owners: Record<string, Owner>;
  patients: Patient[];
  appointments: Appointment[];
  orders: Order[];
  results: LabResult[];
  prescriptions: Prescription[];
  encounters: Record<number, EncounterNote>;
  invoices: Invoice[];
}
