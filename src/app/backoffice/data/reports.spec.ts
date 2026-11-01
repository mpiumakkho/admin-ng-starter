import { createSeed } from '../../clinic/data/seed';
import { report, type ReportKey } from './reports';
import { createBackofficeSeed } from './seed';

const KEYS: ReportKey[] = ['executive', 'revenue', 'inventory', 'workforce', 'assets', 'quality', 'compliance'];
const PROHIBITED = /P&L|Gross Margin|EBITDA|Cost-center|Budget Variance|Financial Statement|กำไร|งบประมาณ/i;

describe('executive reports', () => {
  it('compose from the owning modules, each figure with its metric contract, and no prohibited label', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    for (const k of KEYS) {
      const r = report(k, clinic, bo);
      expect(r.tiles.length).toBeGreaterThan(0);
      expect(r.metrics.length).toBeGreaterThan(0);
      for (const m of r.metrics) {
        expect([m.formula, m.source, m.cutoff, m.owner, m.limitation].every(Boolean)).toBe(true);
      }
      expect(JSON.stringify(r)).not.toMatch(PROHIBITED);
      expect(r.rows.every(row => row.link.startsWith('/'))).toBe(true);
    }
  });

  it('reads revenue for the period chosen and receivables as they stand', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    const month = report('revenue', clinic, bo, 30);
    expect(month.tiles.map(t => t.value)).toEqual(['฿3,350', '฿1,200', '฿2,430', '฿980', '฿0', '1']);
    expect(report('revenue', clinic, bo, 1).tiles[0].value).not.toBe(undefined);
    expect(month.rows.map(r => [r.severity, r.ref])).toEqual([['warning', 'INV-2609-0031'], ['info', 'INV-2609-0112']]);
  });

  it('ranks what needs deciding: critical first, an exception shown once', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    const r = report('executive', clinic, bo);
    expect(r.rows[0].severity).toBe('critical');
    const refs = r.rows.map(x => x.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs).toContain('DT-2609-005');
    expect(report('assets', clinic, bo).tiles.map(t => t.value)).toEqual(['4/8', '1', '2', '85%', '99.9%']);
    expect(report('compliance', clinic, bo).rows[0]).toEqual(expect.objectContaining({ severity: 'critical', ref: '2026-08' }));
  });
});
