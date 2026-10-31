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
  { key: 'sales', label: 'การขายและบริการลูกค้า', icon: lucideStore, links: [] },
  { key: 'workforce', label: 'บุคลากร', icon: lucideUsersRound, links: [] },
  { key: 'assets', label: 'ทรัพย์สินและการบำรุงรักษา', icon: lucideWrench, links: [] },
  { key: 'quality', label: 'คุณภาพและกำกับดูแล', icon: lucideShieldCheck, links: [] },
  { key: 'reports', label: 'รายงานผู้บริหาร', icon: lucideChartColumn, links: [] },
  { key: 'integrations', label: 'Integration Center', icon: lucidePlug, links: [] },
  { key: 'settings', label: 'ตั้งค่าระบบ', icon: lucideSettings, links: [] },
];

export const BRAND_ICON = lucideBriefcase;
