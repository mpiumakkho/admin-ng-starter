/*
 * The back office's menu, as the spec approves it (seph1-docs 26-backoffice-erp ux/00 and menus/00): ten groups, in
 * this order, with the pages the workspace has. A group with no page yet is not shown; the reserved groups
 * (procurement, projects and CAPEX, budgeting, payroll) have no place here at all.
 */
import {
  lucideBriefcase, lucideChartColumn, lucideHouse, lucidePackage, lucidePlug, lucideSettings, lucideShieldCheck, lucideStore, lucideUsersRound, lucideWallet,
  lucideWrench,
} from '@ng-icons/lucide';

export interface NavLink {
  path: string;
  label: string;
  /** What the link counts, from BackofficeStore.counts */
  count?: 'overview' | 'approvals' | 'alerts';
  /** The submenu it opens, when a group has several (menus/07 has four) */
  section?: string;
}
export interface NavGroup {
  key: string;
  label: string;
  icon: string;
  links: NavLink[];
}

export const BACKOFFICE_NAV: NavGroup[] = [
  { key: 'home', label: 'หน้าหลัก', icon: lucideHouse, links: [
    { path: '/backoffice/home/overview', label: 'ภาพรวมงาน', count: 'overview' },
    { path: '/backoffice/home/approvals', label: 'รายการอนุมัติ', count: 'approvals' },
    { path: '/backoffice/home/alerts', label: 'การแจ้งเตือนและข้อยกเว้น', count: 'alerts' },
    { path: '/backoffice/home/activity', label: 'กิจกรรมล่าสุด' },
  ] },
  { key: 'finance', label: 'การเงินและรายได้', icon: lucideWallet, links: [
    { path: '/backoffice/finance/overview', label: 'ภาพรวมการเงิน' },
    { path: '/backoffice/finance/invoices', label: 'ใบแจ้งหนี้' },
    { path: '/backoffice/finance/payments', label: 'รายการชำระเงิน' },
    { path: '/backoffice/finance/adjustments', label: 'ส่วนลดและคืนเงิน' },
    { path: '/backoffice/finance/receivables', label: 'ลูกหนี้คงค้าง' },
    { path: '/backoffice/finance/reconciliation', label: 'กระทบยอดประจำวัน' },
    { path: '/backoffice/finance/exports', label: 'ส่งข้อมูลบัญชี' },
  ] },
  { key: 'inventory', label: 'คลังสินค้า', icon: lucidePackage, links: [
    { path: '/backoffice/inventory/overview', label: 'ภาพรวมคลัง' },
    { path: '/backoffice/inventory/stock', label: 'คลังยา' },
    { path: '/backoffice/inventory/lots', label: 'Lot และวันหมดอายุ' },
    { path: '/backoffice/inventory/receipts', label: 'รับยาเข้าคลัง' },
    { path: '/backoffice/inventory/dispenses', label: 'ประวัติการจ่ายยา' },
    { path: '/backoffice/inventory/reorder', label: 'รายการต้องเติมยา' },
    { path: '/backoffice/inventory/controlled', label: 'ยาควบคุม' },
    { path: '/backoffice/inventory/recall', label: 'Drug Recall' },
  ] },
  { key: 'sales', label: 'การขายและบริการลูกค้า', icon: lucideStore, links: [
    { path: '/backoffice/sales/overview', label: 'ภาพรวมรายได้' },
    { path: '/backoffice/sales/line', label: 'LINE CRM' },
    { path: '/backoffice/sales/claims', label: 'Insurance Claims' },
  ] },
  { key: 'workforce', label: 'บุคลากร', icon: lucideUsersRound, links: [
    { path: '/backoffice/workforce/staff', label: 'บุคลากรทั้งหมด' },
    { path: '/backoffice/workforce/credentials', label: 'ใบอนุญาตและ Credential' },
    { path: '/backoffice/workforce/education', label: 'Continuing Education' },
    { path: '/backoffice/workforce/privileges', label: 'Scope และ Privilege' },
    { path: '/backoffice/workforce/schedule', label: 'ตารางเวร' },
    { path: '/backoffice/workforce/leave', label: 'การลาและ Time-off' },
    { path: '/backoffice/workforce/on-call', label: 'On-call Rotation' },
    { path: '/backoffice/workforce/overtime', label: 'Overtime Summary' },
  ] },
  { key: 'assets', label: 'ทรัพย์สินและการบำรุงรักษา', icon: lucideWrench, links: [
    { path: '/backoffice/assets/registry', label: 'ทะเบียนอุปกรณ์' },
    { path: '/backoffice/assets/pm', label: 'แผน PM' },
    { path: '/backoffice/assets/calibration', label: 'Calibration' },
    { path: '/backoffice/assets/downtime', label: 'Downtime' },
    { path: '/backoffice/assets/critical', label: 'อุปกรณ์ Critical' },
    { path: '/backoffice/assets/contracts', label: 'Service Contracts' },
    { path: '/backoffice/assets/decommission', label: 'Decommission' },
  ] },
  { key: 'quality', label: 'คุณภาพและกำกับดูแล', icon: lucideShieldCheck, links: [
    { path: '/backoffice/quality/overview', label: 'Quality Dashboard', section: 'Quality & Patient Safety' },
    { path: '/backoffice/quality/incidents', label: 'Incident Reports' },
    { path: '/backoffice/quality/near-miss', label: 'Near Miss' },
    { path: '/backoffice/quality/rca', label: 'RCA' },
    { path: '/backoffice/quality/kpi', label: 'KPI Library' },
    { path: '/backoffice/quality/culture', label: 'Safety Culture / M&M' },
    { path: '/backoffice/quality/complaints', label: 'ข้อร้องเรียนทั้งหมด', section: 'Complaint Management' },
    { path: '/backoffice/quality/investigation', label: 'Investigation' },
    { path: '/backoffice/quality/resolution', label: 'Resolution & Trends' },
    { path: '/backoffice/quality/pdpa', label: 'DPO Dashboard', section: 'PDPA' },
    { path: '/backoffice/quality/dsar', label: 'DSAR' },
    { path: '/backoffice/quality/consent', label: 'Consent Registry' },
    { path: '/backoffice/quality/breach', label: 'Breach Management' },
    { path: '/backoffice/quality/retention', label: 'Retention' },
    { path: '/backoffice/quality/ropa', label: 'RoPA / Cross-border' },
    { path: '/backoffice/quality/audit', label: 'Audit Explorer', section: 'Audit' },
    { path: '/backoffice/quality/audit-exports', label: 'Export Requests' },
    { path: '/backoffice/quality/audit-integrity', label: 'Chain / Retention Status' },
  ] },
  { key: 'reports', label: 'รายงานผู้บริหาร', icon: lucideChartColumn, links: [
    { path: '/backoffice/reports/executive', label: 'Executive Overview' },
    { path: '/backoffice/reports/revenue', label: 'Revenue & Collection' },
    { path: '/backoffice/reports/inventory', label: 'Inventory Risk' },
    { path: '/backoffice/reports/workforce', label: 'Workforce Readiness' },
    { path: '/backoffice/reports/assets', label: 'Asset Readiness' },
    { path: '/backoffice/reports/quality', label: 'Quality & Safety' },
    { path: '/backoffice/reports/compliance', label: 'Audit & Compliance' },
  ] },
  { key: 'integrations', label: 'Integration Center', icon: lucidePlug, links: [] },
  { key: 'settings', label: 'ตั้งค่าระบบ', icon: lucideSettings, links: [] },
];

export const BRAND_ICON = lucideBriefcase;
