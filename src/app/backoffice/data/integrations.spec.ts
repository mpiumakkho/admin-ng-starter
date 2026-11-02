import { createSeed } from '../../clinic/data/seed';
import { retryExport } from './finance';
import { accountingHealth, connectors, jobs, labHealth, LAB_CONNECTIONS, reconcileDeliveries, reconSummary, sourceEvents, testConnection } from './integrations';
import { createBackofficeSeed } from './seed';

describe('integration center', () => {
  it('reads the accounting connector from its records: a passed test is not health while deliveries fail', () => {
    const bo = createBackofficeSeed();
    expect(accountingHealth(bo)).toEqual(expect.objectContaining({ health: 'auth-failed', failed: 3, queued: 0 }));
    const t = testConnection(bo, 'ผู้ดูแลระบบ');
    expect(t).toEqual(expect.objectContaining({ id: 'CT-0015', result: 'passed' }));
    expect(accountingHealth(bo).health).toBe('degraded');
    bo.accountingExports.filter(x => x.status === 'failed').forEach(x => retryExport(x));
    expect(accountingHealth(bo)).toEqual(expect.objectContaining({ health: 'healthy', failed: 0 }));
    expect(bo.accountingExports.find(x => x.id === 'XP-0096')!.priorError).toBe('AUTH_401');
  });

  it('pairs each billing event with its delivery and never calls the books matched', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    expect(sourceEvents(clinic).filter(e => e.invoiceId === 'I9').map(e => [e.docType, e.amount])).toEqual([['invoice', 1200], ['receipt', 1200], ['credit-note', 1200]]);
    const month = reconcileDeliveries(clinic, bo, 'month');
    const s = reconSummary(month);
    expect(s.events).toBe(10);
    expect(s.counts).toEqual({ delivered: 7, awaiting: 0, failed: 3, missing: 0, duplicate: 0, variance: 0 });
    expect(month.filter(r => r.outcome === 'failed').map(r => r.delivery!.id).sort()).toEqual(['XP-0096', 'XP-0101', 'XP-0102']);
    expect(reconcileDeliveries(clinic, bo, 'all').length).toBeGreaterThan(month.length);
    bo.accountingExports.push({ ...bo.accountingExports.find(x => x.id === 'XP-0095')!, id: 'XP-0200' });
    expect(reconcileDeliveries(clinic, bo, 'month').find(r => r.delivery?.id === 'XP-0200')!.outcome).toBe('duplicate');
  });

  it('lists only connectors with a contract, a lab link down with its device, and history grouped by run', () => {
    const bo = createBackofficeSeed();
    expect(connectors(bo).map(c => c.key)).toEqual(['accounting', 'lab', 'insurance', 'import-export']);
    expect(labHealth(LAB_CONNECTIONS[1], bo.equipment)).toBe('healthy');
    bo.equipment.find(e => e.id === 'EQ-XR-IMG-01')!.status = 'down';
    expect(labHealth(LAB_CONNECTIONS[1], bo.equipment)).toBe('unreachable');
    const js = jobs(bo);
    expect(js.find(j => j.id === 'JOB-XP-2609232300')).toEqual(expect.objectContaining({ status: 'failed', result: '0/2' }));
    expect(js.find(j => j.module === 'M31')).toEqual(expect.objectContaining({ artifact: 'ROPA-2603-001.pdf', status: 'done' }));
  });
});
