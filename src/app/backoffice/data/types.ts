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

export interface BackofficeData {
  workItems: WorkItem[];
  approvals: Approval[];
  exceptions: BoException[];
  activity: ActivityEntry[];
}
