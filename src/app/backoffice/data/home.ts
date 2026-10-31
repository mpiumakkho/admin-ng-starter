/*
 * The home pages' composition (seph1-docs 26-backoffice-erp ux/menus/01-home.md): the work overview gathers what waits
 * in every module the signed-in person may see, the approvals those with a rule to decide by, the exceptions what went
 * wrong, and the activity what was done. Nothing here changes a record: that goes back to the owning module. Text is
 * kept in its source language and translated where it shows.
 */
import { expiryMonths, isExpired } from '../../clinic/data/dispense';
import { TODAY } from '../../clinic/data/model';
import { balanceOf } from '../../clinic/data/rail';
import type { ClinicData } from '../../clinic/data/types';
import type { Approval, BackofficeData, BoException, Module, Priority, Severity, WorkItem } from './types';

export const PRIORITY: Record<Priority, { label: string; cls: string; rank: number }> = {
  critical: { label: 'วิกฤต', cls: 'danger', rank: 0 },
  high: { label: 'สูง', cls: 'warn', rank: 1 },
  normal: { label: 'ปกติ', cls: 'quiet', rank: 2 },
};
export const SEVERITY: Record<Severity, { label: string; cls: string; rank: number }> = {
  critical: { label: 'วิกฤต', cls: 'danger', rank: 0 },
  warning: { label: 'เตือน', cls: 'warn', rank: 1 },
  info: { label: 'ข้อมูล', cls: 'info', rank: 2 },
};
export const STATUS: Record<WorkItem['status'], { label: string; cls: string }> = {
  open: { label: 'รอดำเนินการ', cls: 'warn' },
  'in-progress': { label: 'กำลังดำเนินการ', cls: 'info' },
  waiting: { label: 'รอผู้อื่น', cls: 'quiet' },
};
export const APPROVAL_STATUS: Record<Approval['status'], { label: string; cls: string }> = {
  pending: { label: 'รออนุมัติ', cls: 'warn' },
  approved: { label: 'อนุมัติแล้ว', cls: 'ok' },
  rejected: { label: 'ปฏิเสธ', cls: 'danger' },
};
export const APPROVAL_KIND: Record<Approval['kind'], string> = {
  refund: 'คืนเงิน', discount: 'ส่วนลด', 'audit-export': 'ส่งออกบันทึกตรวจสอบ', complaint: 'ข้อร้องเรียนรุนแรง', 'permission-override': 'สิทธิ์ชั่วคราว',
};
export const EXCEPTION_KIND: Record<BoException['kind'], string> = {
  'payment-failure': 'รับชำระไม่สำเร็จ', 'export-failure': 'ส่งข้อมูลบัญชีไม่สำเร็จ', 'low-stock': 'สต็อกต่ำ', expiry: 'ใกล้หมดอายุ',
  'credential-expiry': 'ใบอนุญาตใกล้หมดอายุ', downtime: 'อุปกรณ์ใช้งานไม่ได้', 'sla-risk': 'เสี่ยงเกิน SLA',
};

/** Days from today to a date: negative when it has passed */
export function daysUntil(date: string, today = TODAY): number {
  const from = new Date(today + 'T00:00:00').getTime();
  const to = new Date(date.slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((to - from) / 86_400_000);
}
/** How long something has waited, in whole days */
export const ageDays = (at: string, today = TODAY) => Math.max(0, -daysUntil(at, today));

/** A batch's expiry "11/2026" as months from this month */
const monthsLeft = (exp: string) => expiryMonths(exp) - expiryMonths(TODAY.slice(5, 7) + '/' + TODAY.slice(0, 4));

/* ---- The work overview ---- */

/** Bills the hospital waits to be paid for (M11), from the clinic's records */
export function billingWork(clinic: ClinicData): WorkItem[] {
  return clinic.invoices.filter(i => balanceOf(i) > 0).map(i => {
    const days = ageDays(i.date);
    return {
      id: 'inv-' + i.id, module: 'M11', kind: 'ลูกหนี้', title: `เก็บเงินค้าง ${i.no} · ${i.ownerKey}`, detail: `${i.pet} · ${i.title} · ค้าง ฿${balanceOf(i).toLocaleString('en-US')} · ${days} วัน`,
      priority: days > 30 ? 'high' : 'normal', due: i.date, owner: 'การเงิน', status: days > 0 ? 'open' : 'in-progress', ref: i.no,
    } satisfies WorkItem;
  });
}

/** Drugs short on the shelf or close to their expiry (M06), from the batches the clinic's prescriptions show */
export function stockWork(clinic: ClinicData): WorkItem[] {
  const seen = new Set<string>();
  const items: WorkItem[] = [];
  for (const rx of clinic.prescriptions) {
    for (const batch of rx.stock) {
      if (seen.has(batch[0]) || isExpired(batch)) {
        continue;
      }
      seen.add(batch[0]);
      const qty = parseFloat(batch[2]);
      const months = monthsLeft(batch[1]);
      if (Number.isFinite(qty) && qty <= 10) {
        items.push({
          id: 'stock-' + batch[0], module: 'M06', kind: 'สต็อกต่ำ', title: `${rx.drug} เหลือ ${batch[2]}`, detail: `batch ${batch[0]} · ${batch[3]} · ต่ำกว่าจุดสั่งซื้อ`,
          priority: 'high', due: TODAY, owner: 'ห้องยา', status: 'open', ref: batch[0], link: '/clinic/dispense',
        });
      } else if (months <= 3) {
        items.push({
          id: 'exp-' + batch[0], module: 'M06', kind: 'ใกล้หมดอายุ', title: `${rx.drug} batch ${batch[0]} หมดอายุ ${batch[1]}`, detail: `คงเหลือ ${batch[2]} · ${batch[3]} · จ่ายก่อนตาม FEFO`,
          priority: months <= 1 ? 'high' : 'normal', due: `${batch[1].slice(3)}-${batch[1].slice(0, 2)}-01`, owner: 'ห้องยา', status: 'open', ref: batch[0], link: '/clinic/dispense',
        });
      }
    }
  }
  return items;
}

/** Everything that waits, the most pressing first: the modules' own work, approvals to decide and exceptions to see to */
export function worklist(data: BackofficeData, clinic: ClinicData): WorkItem[] {
  const approvals: WorkItem[] = data.approvals.filter(a => a.status === 'pending').map(a => ({
    id: 'ap-' + a.id, module: a.module, kind: 'รออนุมัติ', title: a.title, detail: `${APPROVAL_KIND[a.kind]} · ขอโดย ${a.requestedBy} · ${a.requestedAt}`,
    priority: a.kind === 'complaint' ? 'critical' : a.module === 'M14' ? 'high' : 'normal', due: a.requestedAt.slice(0, 10), owner: a.approver, status: 'open', ref: a.ref,
    link: '/backoffice/home/approvals',
  }));
  const exceptions: WorkItem[] = data.exceptions.filter(x => !x.acknowledgedAt).map(x => ({
    id: 'ex-' + x.id, module: x.module, kind: EXCEPTION_KIND[x.kind], title: x.title, detail: x.detail,
    priority: x.severity === 'critical' ? 'critical' : x.severity === 'warning' ? 'high' : 'normal', due: x.at.slice(0, 10), owner: x.source, status: 'open', ref: x.ref,
    link: x.link ?? '/backoffice/home/alerts',
  }));
  // A bill or batch an exception already names is on the list once, as the exception
  const named = new Set(exceptions.map(x => x.ref));
  return [...approvals, ...exceptions, ...data.workItems, ...billingWork(clinic), ...stockWork(clinic).filter(s => !named.has(s.ref))]
    .sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.due.localeCompare(b.due));
}

/** How much waits, by module, for the strip above the table */
export function workload(items: WorkItem[]): { module: Module; count: number; critical: number }[] {
  const by = new Map<Module, { module: Module; count: number; critical: number }>();
  for (const item of items) {
    const entry = by.get(item.module) ?? { module: item.module, count: 0, critical: 0 };
    entry.count++;
    if (item.priority === 'critical') {
      entry.critical++;
    }
    by.set(item.module, entry);
  }
  return [...by.values()].sort((a, b) => b.critical - a.critical || b.count - a.count);
}

/* ---- Approvals ---- */

/** Nobody decides their own request: the separation of duties every approval rule shares */
export const canDecide = (a: Approval, user: string): boolean => a.status === 'pending' && !a.requestedBy.startsWith(user);

/** The oldest pending request, and how many have waited over a day */
export function approvalAging(approvals: Approval[]): { pending: number; overDay: number; oldest: number } {
  const pending = approvals.filter(a => a.status === 'pending');
  const ages = pending.map(a => ageDays(a.requestedAt));
  return { pending: pending.length, overDay: ages.filter(d => d >= 1).length, oldest: ages.length ? Math.max(...ages) : 0 };
}

/* ---- Exceptions ---- */

/** The exceptions still open, grouped by kind, the gravest kinds first */
export function exceptionGroups(exceptions: BoException[]): { kind: BoException['kind']; list: BoException[] }[] {
  const groups = new Map<BoException['kind'], BoException[]>();
  for (const x of exceptions.filter(e => !e.acknowledgedAt).sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank || b.at.localeCompare(a.at))) {
    groups.set(x.kind, [...(groups.get(x.kind) ?? []), x]);
  }
  return [...groups.entries()].map(([kind, list]) => ({ kind, list }))
    .sort((a, b) => SEVERITY[a.list[0].severity].rank - SEVERITY[b.list[0].severity].rank);
}

export function severityCounts(exceptions: BoException[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const x of exceptions.filter(e => !e.acknowledgedAt)) {
    counts[x.severity]++;
  }
  return counts;
}
