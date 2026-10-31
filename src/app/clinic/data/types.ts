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

/** An alert taken off the record: kept, with when, by whom and why */
export interface WithdrawnAlert extends ClinicalAlert { withdrawnAt: string; withdrawnBy: string; withdrawnReason: string }

/** One set of vital signs, as written: "28.4", "38.6", "108 bpm" */
export interface VitalSigns { at: string; weight: string; temp: string; hr: string; rr: string; pain: string; by: string }

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
  /** Today's estimate as the owner approved it, and the treatment consent they signed (data/estimate.ts) */
  estimate?: EstimateRecord;
  consentForm?: ConsentRecord;
  /** The invoice issued at discharge */
  invoiceId?: string;
  /** Vital signs taken before, oldest first; alerts withdrawn; doses of vaccine given: [date, vaccine, lot, next due, by] */
  vitals?: VitalSigns[];
  withdrawnAlerts?: WithdrawnAlert[];
  vaccineLog?: [date: string, name: string, lot: string, next: string, by: string][];
  /** Kept in hospital (data/ward.ts) */
  admission?: Admission;
}

/** A stay in a ward: the bed, why and under whom, how often the nurses take obs, the drips, and when the pet left */
export interface Admission {
  bed: string; at: string; by: string; vet: string; reason: string;
  /** Hours between observations */
  obsEvery: number;
  lines: Infusion[];
  out?: { at: string; by: string };
}

/** A drip that runs at a rate, in mL an hour: each change kept as [when, what, the rate from then, by whom] */
export interface Infusion {
  id: string; fluid: string; route: string; rate: number; status: 'running' | 'paused' | 'stopped';
  events: [at: string, kind: 'start' | 'rate' | 'pause' | 'resume' | 'stop', rate: number, by: string][];
}

/** What became of a dose on the treatment sheet */
export type DoseOutcome = 'given' | 'held' | 'refused' | 'missed';
/** A dose recorded against its time on the sheet: what happened, when and by whom, why when it was not given, and the witness of a controlled drug */
export interface MarDose { slot: string; outcome: DoseOutcome; at: string; by: string; reason?: string; witness?: string }

/** A line of an estimate: what, how many, and the lowest and highest it may come to, in baht */
export type EstimateLine = [name: string, qty: string, min: number, max: number];
export interface EstimateRecord {
  no: string; lines: EstimateLine[]; min: number; max: number;
  approvedBy: string; approvedAt: string; via: string;
}
/** The owner's consent to today's treatment: who signed, for what and at what estimate, and who saw it */
export interface ConsentRecord {
  at: string; signer: string; relation: string; witness: string;
  /** The signature drawn on the screen, as an image; none when it was signed on paper */
  signature?: string;
  cpr: boolean; estimateNo: string; min: number; max: number; items: string[];
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

/** A batch of a drug on the shelf: its number, expiry ("06/2027"), what is left and where */
export type Batch = [batch: string, exp: string, qty: string, loc: string];

export interface Prescription {
  id: string; col: string; state: string; code: string; pet: string; owner: string; by: string;
  drug: string; dose: string; route: string; freq: string; days: string; qty: string; advice: string;
  stock: Batch[];
  history: Pair[];
  /** A verbal order a nurse took: a draft until a vet co-signs it */
  verbal?: boolean;
  orderedAt?: string;
  cosignedBy?: string; cosignedAt?: string;
  /** The pharmacy's steps (data/dispense.ts): who verified it, the batch it was prepared from and by whom, and who took it home */
  verifiedBy?: string; verifiedAt?: string;
  batch?: string; preparedBy?: string; preparedAt?: string;
  /** A controlled drug's second person */
  witness?: string;
  dispensedTo?: string; dispensedBy?: string; dispensedAt?: string;
  labelPrintedAt?: string;
  /** Written for a pet in hospital: given on the ward from the treatment sheet at these times, each dose recorded, until stopped */
  inpatient?: boolean;
  marTimes?: string[];
  doses?: MarDose[];
  stoppedAt?: string; stoppedBy?: string;
  /** The vet who gave a verbal order */
  orderedBy?: string;
  /** The dose per kg it was written at, and what the safety check found (data/cds.ts) with the override that let it through */
  mgPerKg?: number;
  cds?: { findings: string[]; override?: string; approvedBy?: string };
}

/** Today's encounter record of one patient */
export interface EncounterNote {
  reason: string; ownerObs: string; appetite: string; energy: string;
  weight: string; temp: string; hr: string; rr: string; mm: string; bcs: string; pain: string;
  chief: string; hpi: string; duration: string; progression: string; ros: string[];
  general: string; msk: string; cardio: string; remark: string;
  ddx: string; dx: string; plan: string;
  summary: string; home: string; followup: string;
  /** Signs to come back for at once, and what to feed and how much to let the pet do */
  warning: string; restrict: string;
  /** The follow-up booked from this visit, and how the discharge papers go to the owner */
  followupAt?: string; channel?: string;
  /** Notes added after the signature, which leaves S/O/A/P as signed: [when, by, text] */
  addenda?: [at: string, by: string, text: string][];
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
  /** Each payment taken: when, how much, how, and by whom */
  payments?: [at: string, amount: number, method: string, by: string][];
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
  /** Beds left by a pet that wait to be cleaned before the next */
  cleaning?: string[];
}
