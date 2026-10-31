import { createSeed } from '../../clinic/data/seed';
import { ageDays, approvalAging, billingWork, canDecide, daysUntil, exceptionGroups, severityCounts, stockWork, worklist, workload } from './home';
import { createBackofficeSeed } from './seed';

describe('the home pages', () => {
  it('counts days to a date from the sample\'s today', () => {
    expect(daysUntil('2026-09-27')).toBe(3);
    expect(daysUntil('2026-09-20')).toBe(-4);
    expect(ageDays('2026-09-22 15:10')).toBe(2);
  });

  it('gathers the clinic\'s unpaid bills and short or expiring stock as work', () => {
    const clinic = createSeed();
    const bills = billingWork(clinic);
    expect(bills.map(b => b.ref)).toEqual(['INV-2609-0112', 'INV-2609-0031']);
    expect(bills[0].detail).toContain('฿1,450');
    const stock = stockWork(clinic);
    expect(stock.find(s => s.ref === 'BU-2411-02')?.kind).toBe('สต็อกต่ำ');
    expect(stock.find(s => s.ref === 'B-2312-04')?.kind).toBe('ใกล้หมดอายุ');
  });

  it('puts the most pressing work first, and counts it by module', () => {
    const data = createBackofficeSeed();
    const list = worklist(data, createSeed());
    expect(list[0].priority).toBe('critical');
    expect(list.filter(i => i.priority === 'critical').length).toBe(4);
    const load = workload(list);
    expect(load[0].critical).toBeGreaterThan(0);
    expect(load.reduce((n, w) => n + w.count, 0)).toBe(list.length);
  });

  it('keeps a requester from deciding their own request, and ages the queue', () => {
    const data = createBackofficeSeed();
    const refund = data.approvals.find(a => a.id === 'AP1')!;
    expect(canDecide(refund, 'วรรณา (ผู้จัดการการเงิน)')).toBe(true);
    expect(canDecide(refund, 'นัทธมน (แคชเชียร์)')).toBe(false);
    expect(approvalAging(data.approvals)).toEqual({ pending: 5, overDay: 2, oldest: 1 });
  });

  it('groups the open exceptions by kind, the gravest first', () => {
    const data = createBackofficeSeed();
    const groups = exceptionGroups(data.exceptions);
    expect(groups[0].list[0].severity).toBe('critical');
    expect(groups.flatMap(g => g.list).every(x => !x.acknowledgedAt)).toBe(true);
    expect(severityCounts(data.exceptions)).toEqual({ critical: 2, warning: 5, info: 1 });
  });
});
