import { createSeed } from '../../clinic/data/seed';
import { agingOf, financeOverview, invoiceList, issue, ledger, linesOf, newInvoice, queueExport, receivables, reconcile, refundable, retryExport, settle, statusOf, summaryOf } from './finance';
import { createBackofficeSeed } from './seed';

describe('finance', () => {
  it('reads a bill\'s state from what is kept, or from its amounts', () => {
    const data = createSeed();
    expect(data.invoices.map(statusOf)).toEqual(['partial', 'paid', 'issued', 'paid', 'paid', 'paid', 'draft', 'cancelled', 'refunded']);
    expect(statusOf({ ...data.invoices[0], status: undefined, paid: 0 })).toBe('issued');
    const bolt = data.invoices[0];
    expect(linesOf(bolt).length).toBe(4);
    expect(summaryOf(bolt)).toEqual(expect.objectContaining({ total: 2450, paid: 1000, balance: 1450, refunded: 0 }));
    // One line per item when the detailed lines are not kept
    expect(linesOf(data.invoices[1])).toEqual([{ source: '—', name: 'Consultation — General', qty: 1, unitPrice: 450, discount: 0, taxRate: 0 }, { source: '—', name: 'DHPPiL booster', qty: 1, unitPrice: 700, discount: 0, taxRate: 0 }]);
  });

  it('issues a draft with the next number and a due date, and settles the state after payments and refunds', () => {
    const data = createSeed();
    const draft = newInvoice(data, 'Somsak W.', 'Kiki', 'Retail', [{ source: 'Retail', name: 'Flea and tick collar', qty: 2, unitPrice: 650, discount: 100, taxRate: 7 }]);
    expect(draft.id).toBe('I10');
    expect(draft.total).toBe(1284);
    expect(draft.no).toBe('');
    data.invoices.push(draft);
    issue(data, draft);
    expect(draft.no).toBe('INV-2609-0159');
    expect(draft.dueAt).toBe('2026-10-09');
    expect(draft.status).toBe('issued');

    draft.paid = 1000;
    draft.payments = [['2026-09-24 11:32', 1284, 'เงินสด', 'x', '', 'completed']];
    settle(draft);
    expect(draft.status).toBe('partial');
    draft.paid = 1284;
    settle(draft);
    expect(draft.status).toBe('paid');
    draft.refunds = [{ id: 'RF-1', paymentIndex: 0, amount: 1284, reason: 'r', by: 'x', at: '2026-09-24 11:40', status: 'done' }];
    settle(draft);
    expect(draft.status).toBe('refunded');
    expect(refundable(draft, 0)).toBe(0);
    expect(refundable(data.invoices[3], 0)).toBe(2350 - 650);
  });

  it('lists bills by filter, and the ledger across them', () => {
    const data = createSeed();
    expect(invoiceList(data, { outstandingOnly: true }).map(i => i.no)).toEqual(['INV-2609-0112', 'INV-2609-0031']);
    expect(invoiceList(data, { q: 'mochi' }).length).toBe(2);
    expect(invoiceList(data, { status: 'draft' })[0].id).toBe('I7');
    const rows = ledger(data);
    expect(rows[0].kind).toBe('payment');
    expect(rows.find(r => r.kind === 'refund')?.amount).toBe(-1200);
  });

  it('ages what is owed by its due date, and sums the day', () => {
    const data = createSeed();
    expect(agingOf(data.invoices[0])).toBe('current');
    expect(agingOf(data.invoices[2])).toBe('d30');
    const ar = receivables(data);
    expect(ar.total).toBe(1450 + 980);
    expect(ar.buckets.find(b => b.key === 'd30')?.amount).toBe(980);
    const bo = createBackofficeSeed();
    const o = financeOverview(data, bo);
    expect(o.outstanding).toEqual({ amount: 2430, count: 2, overdue: 1 });
    expect(o.exports.failed).toBe(3);
    expect(o.pendingRefunds).toBe(1);
  });

  it('queues a delivery when a bill is issued, delivers it again on a retry, and reconciles the day', () => {
    const data = createSeed();
    const bo = createBackofficeSeed();
    const x = queueExport(bo, data.invoices[0], 'receipt', 500);
    expect(x.status).toBe('queued');
    expect(x.idempotencyKey).toBe('I1:receipt:2');
    retryExport(x);
    expect(x.status).toBe('delivered');
    expect(x.externalRef).toContain('PEAK-');

    const day = reconcile(data, bo, '2026-09-23');
    expect(day.totals.exports).toEqual({ total: 3, delivered: 0 });
    expect(day.variances.map(v => v.kind)).toContain('การส่งบัญชีไม่ครบ');
    const today = reconcile(data, bo, '2026-09-24');
    expect(today.variances.map(v => v.kind)).toEqual(expect.arrayContaining(['รับชำระไม่สำเร็จ', 'คืนเงินรออนุมัติ']));
  });
});
