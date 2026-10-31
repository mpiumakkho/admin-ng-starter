/* The back office's records: what the home pages compose (seph1-docs 26-backoffice-erp ux/menus/01-home.md) */

/** The canonical modules the back office composes over (seph1-docs 21-module-specifications) */
export type Module = 'M06' | 'M11' | 'M13' | 'M14' | 'M22' | 'M24' | 'M28' | 'M31';
export const MODULES: Record<Module, { name: string; group: string }> = {
  M11: { name: 'Billing', group: 'การเงินและรายได้' },
  M06: { name: 'Medication inventory', group: 'คลังสินค้า' },
  M24: { name: 'Personnel', group: 'บุคลากร' },
  M22: { name: 'Equipment', group: 'ทรัพย์สินและการบำรุงรักษา' },
  M28: { name: 'Complaints', group: 'คุณภาพและกำกับดูแล' },
  M31: { name: 'PDPA', group: 'คุณภาพและกำกับดูแล' },
  M13: { name: 'Audit', group: 'คุณภาพและกำกับดูแล' },
  M14: { name: 'IAM', group: 'ตั้งค่าระบบ' },
};

export type Priority = 'critical' | 'high' | 'normal';
export type Severity = 'critical' | 'warning' | 'info';

/** Something on the work overview: from a module's own queue, or an approval or exception that waits */
export interface WorkItem {
  id: string;
  module: Module;
  /** What kind of work: the owning module's word for it */
  kind: string;
  title: string;
  detail: string;
  priority: Priority;
  /** When it is due, as a date, or when it came */
  due: string;
  owner: string;
  status: 'open' | 'in-progress' | 'waiting';
  /** The source record's number */
  ref: string;
  /** Where the source record is, when it has a page */
  link?: string;
}

/** A decision a canonical rule needs: a refund, an audit export, a severe complaint, a permission override */
export type ApprovalKind = 'refund' | 'discount' | 'audit-export' | 'complaint' | 'permission-override';
export interface Approval {
  id: string;
  module: Module;
  kind: ApprovalKind;
  title: string;
  detail: string;
  amount?: number;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  /** What the decision rests on: label / value */
  evidence: [string, string][];
  /** Who may decide, by the rule of the owning module */
  approver: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  decision?: string;
  ref: string;
}

/** Something that went wrong or is about to: a failure, a shortage, an expiry, a risk to an SLA */
export type ExceptionKind = 'payment-failure' | 'export-failure' | 'low-stock' | 'expiry' | 'credential-expiry' | 'downtime' | 'sla-risk';
export interface BoException {
  id: string;
  module: Module;
  kind: ExceptionKind;
  severity: Severity;
  title: string;
  detail: string;
  at: string;
  /** The owning workflow the exception is settled in */
  source: string;
  ref: string;
  link?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  note?: string;
}

/** A line of the back office's own audit: who did what to which record */
export interface ActivityEntry {
  id: string;
  at: string;
  by: string;
  module: Module;
  action: string;
  target: string;
  ref: string;
  detail?: string;
  /** What changed, when something did */
  before?: string;
  after?: string;
}

/** One delivery of a bill, receipt or credit note to the accounting system (M11 accounting_export_log; ux/pages/integrations/02) */
export interface AccountingExport {
  id: string;
  invoiceId: string;
  /** The document delivered, by its number */
  document: string;
  docType: 'invoice' | 'receipt' | 'credit-note';
  amount: number;
  businessDate: string;
  adapter: 'PEAK';
  status: 'queued' | 'delivered' | 'failed';
  attempts: number;
  firstAt: string;
  lastAt: string;
  deliveredAt?: string;
  /** The accounting system's own reference once it has the document; never an e-Tax state */
  externalRef?: string;
  errorCode?: string;
  errorText?: string;
  retryable: boolean;
  idempotencyKey: string;
}

/** The day's reconciliation as someone signed it off: what was found and what was done about it */
export interface Reconciliation { date: string; by: string; at: string; variances: number; note: string }

/* Medication inventory (M06; ux/pages/inventory/00–07). The lots themselves are the clinic's batches (clinic/data/dispense.ts shelfOf) */

/** How Thai law classes a controlled drug (ADR-0026): the narcotics act, the psychotropics act, or neither */
export type ControlSystem = 'narcotic' | 'psychotropic' | 'none';

/** A drug in the registry: what the pharmacist verified about it, and the stock rules the count workflow keeps */
export interface DrugRecord {
  id: string;
  name: string;
  /** What one unit is, from the formulary */
  unit: string;
  form: string;
  reorderThreshold: number;
  classSystem: ControlSystem;
  /** The category under its act (1–5 narcotic, 1–4 psychotropic) */
  category?: number;
  /** Dispensing needs a second person, by the hospital's rule for this drug (at least categories 1–2) */
  requiresWitnessDispense: boolean;
  /** The pharmacist who verified the classification, as the go-live gate asks */
  verifiedBy?: string;
  lastCountAt?: string;
  lastCountBy?: string;
}

/** Stock received: one lot of one drug, posted and not edited again */
export interface StockReceipt {
  id: string;
  drug: string;
  lot: string;
  /** "MM/YYYY", as the clinic's batches have it */
  expiry: string;
  qty: number;
  unit: string;
  location: string;
  /** The delivery or supplier reference, shown as given; no purchase order is made here */
  sourceRef?: string;
  note?: string;
  by: string;
  at: string;
}

/** A controlled drug drawn from the ledger for a patient, with the witness the drug's rule asks for */
export interface LedgerDispense {
  id: string;
  drug: string;
  lot?: string;
  qty: number;
  unit: string;
  patient: string;
  encounter?: string;
  order?: string;
  by: string;
  witness?: string;
  at: string;
}

export type WasteReason = 'partial_dose' | 'spillage' | 'expired' | 'refused' | 'contaminated' | 'count_reconcile' | 'other';
export interface WasteRecord {
  id: string;
  drug: string;
  lot?: string;
  qty: number;
  unit: string;
  reason: WasteReason;
  detail: string;
  /** Always a second person, whatever the drug */
  witness: string;
  by: string;
  at: string;
  /** The dispense the leftover came from */
  dispenseId?: string;
}

export type InvestigationStatus = 'none' | 'open' | 'resolved' | 'escalated';
/** A count of a controlled drug: what was found against what the stock said; a difference opens an investigation */
export interface CountRecord {
  id: string;
  drug: string;
  expected: number;
  actual: number;
  discrepancy: number;
  unit: string;
  by: string;
  at: string;
  investigation: InvestigationStatus;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

export type RecallStatus = 'open' | 'in-progress' | 'contained' | 'closed';
/** A recall of one lot: traced to where it went, with what was done about it */
export interface Recall {
  id: string;
  drug: string;
  lot: string;
  reason: string;
  /** The classification the notice gave, when it gave one */
  severity?: 'class-1' | 'class-2' | 'class-3';
  status: RecallStatus;
  openedBy: string;
  openedAt: string;
  /** Each change of state: when, by whom, to what, and why */
  updates: [at: string, by: string, status: RecallStatus, note: string][];
}

export interface BackofficeData {
  workItems: WorkItem[];
  approvals: Approval[];
  exceptions: BoException[];
  activity: ActivityEntry[];
  accountingExports: AccountingExport[];
  reconciliations: Reconciliation[];
  drugs: DrugRecord[];
  receipts: StockReceipt[];
  ledgerDispenses: LedgerDispense[];
  wastes: WasteRecord[];
  counts: CountRecord[];
  recalls: Recall[];
}
