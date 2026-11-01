import {
  accessLog, assessBreach, breachFlag, breachOf, closeBreachBlock, collect, consentLedger, coverage, decideExport, dpoCounts, dsarFlag, dsarOf, exportDecideBlock, fulfilBlock,
  integrityCounts, notify, notifyBlock, performExport, queryEvents, queryProblem, verifyIdentity, withdraw, withdrawBlock,
} from './governance';
import { createBackofficeSeed } from './seed';

const ME = 'วรรณา (ผู้จัดการการเงิน)';
const DPO = 'ปรีดา (DPO)';

describe('pdpa', () => {
  it('watches the DPO\'s clocks: thirty days for a request, seventy-two hours for a breach', () => {
    const bo = createBackofficeSeed();
    expect(dpoCounts(bo)).toEqual({
      dsarOpen: 3, dsarNear: 1, dsarOverdue: 0, breachOpen: 2, breachNear: 1, unnotified: 2, withdrawn30: 2, exportsPending: 1, ropaStale: 1, pastWindow: 1663,
    });
    expect(dsarFlag(dsarOf(bo, 'DSAR-2609-004')!)).toBe('near');
    expect(breachFlag(breachOf(bo, 'BR-2609-002')!)).toBe('near');
  });

  it('delivers nothing before the requester\'s identity is verified and the data gathered; each read is audited', () => {
    const bo = createBackofficeSeed();
    const r = dsarOf(bo, 'DSAR-2609-005')!;
    expect(fulfilBlock(r)).toBe('ต้องยืนยันตัวตนก่อนส่งมอบข้อมูล');
    verifyIdentity(r, 'บัตรประชาชนตรงกับทะเบียนเจ้าของเดิม', DPO);
    expect(fulfilBlock(r)).toBe('รวบรวมข้อมูลตามขอบเขตก่อนส่งมอบ');
    const before = bo.auditEvents.length;
    collect(bo, r, 'EMR', DPO);
    expect(fulfilBlock(r)).toBeNull();
    expect(bo.auditEvents[0]).toEqual(expect.objectContaining({ action: 'empi.owner.pii_read', patientId: 'HN-150221', entityId: 'DSAR-2609-005' }));
    expect(bo.auditEvents.length).toBe(before + 1);
    expect(accessLog(bo, ['HN-180533'])).toHaveLength(8);
  });

  it('keeps one consent ledger with LINE\'s, counts each purpose, and withdraws LINE\'s at its link', () => {
    const bo = createBackofficeSeed();
    expect(coverage(bo).map(c => [c.purpose, c.granted, c.total, c.percent])).toEqual([
      ['service', 8, 8, 100], ['reminder', 6, 8, 75], ['marketing', 2, 8, 25], ['insurance', 2, 3, 67], ['case-study', 1, 3, 33],
    ]);
    const ledger = consentLedger(bo);
    const service = ledger.find(g => g.ownerKey === 'Napat T.' && g.purpose === 'service')!;
    expect(withdrawBlock(service)).toBe('ถอนความยินยอมข้อความบริการคือการยกเลิกการเชื่อม LINE ทำที่ LINE CRM');
    const reminder = ledger.find(g => g.ownerKey === 'Napat T.' && g.purpose === 'reminder')!;
    expect(withdrawBlock(reminder)).toBeNull();
    withdraw(bo, reminder);
    expect(bo.lineLinks.find(l => l.ownerKey === 'Napat T.')!.consent.reminder).toBe(false);
    expect(consentLedger(bo).find(g => g.id === reminder.id)!.status).toBe('withdrawn');
  });

  it('closes a breach only once its severity\'s notices are sent, and a high one by someone other than its assessor', () => {
    const bo = createBackofficeSeed();
    const link = breachOf(bo, 'BR-2609-002')!;
    expect(closeBreachBlock(link, ME)).toBe('ต้องแจ้งก่อนปิดเหตุ (ตามระดับความรุนแรง)');
    notify(link, 'pdpc', 'PDPC-6909-0231', DPO);
    expect(link.status).toBe('notified');
    expect(closeBreachBlock(link, ME)).toBeNull();

    const list = breachOf(bo, 'BR-2609-003')!;
    expect(notifyBlock(list, 'pdpc')).toBe('ประเมินความรุนแรงก่อนแจ้ง');
    assessBreach(list, 'high', 'รายชื่อและเบอร์โทร 40 ราย เสี่ยงถูกนำไปติดต่อขาย', ME);
    notify(list, 'pdpc', 'PDPC-6909-0232', ME);
    expect(closeBreachBlock(list, ME)).toBe('ต้องแจ้งก่อนปิดเหตุ (ตามระดับความรุนแรง)');
    notify(list, 'subjects', 'SMS 40 ราย', ME);
    expect(closeBreachBlock(list, ME)).toBe('เหตุรุนแรงต้องให้ผู้อำนวยการที่ไม่ใช่ผู้ประเมินลงนามปิด (การแยกหน้าที่)');
    expect(closeBreachBlock(list, 'น.สพ. นรินทร์')).toBeNull();
  });
});

describe('audit', () => {
  it('queries one of the three shapes within a bounded window', () => {
    const bo = createBackofficeSeed();
    const q = { shape: 'tenant' as const, value: '', days: 30, action: '', risk: '' as const, result: '' as const };
    expect(queryEvents(bo, q)).toHaveLength(22);
    expect(queryEvents(bo, { ...q, shape: 'patient', value: 'HN-180533', days: 7 }).map(e => e.id)).toEqual(['EV-260924-0017', 'EV-260923-0015', 'EV-260922-0011', 'EV-260920-0010']);
    expect(queryProblem({ ...q, shape: 'patient' })).toBe('ใส่ HN ของผู้ป่วย');
    expect(queryEvents(bo, { ...q, risk: 'critical' }).map(e => e.action)).toEqual(['empi.patient.merge']);
  });

  it('exports only on someone else\'s approval, audits the export itself, and feeds the DSAR waiting on it', () => {
    const bo = createBackofficeSeed();
    const x = bo.auditExports.find(e => e.id === 'AX-2609-002')!;
    expect(exportDecideBlock(x, DPO)).toBe('ผู้ขอส่งออกอนุมัติคำขอของตัวเองไม่ได้ (การแยกหน้าที่)');
    decideExport(bo, x, true, 'ตรงกับคำขอ DSAR-2609-004', ME);
    expect(bo.approvals.find(a => a.ref === 'AX-2609-002')!.status).toBe('approved');
    const ev = performExport(bo, x, DPO);
    expect(x).toEqual(expect.objectContaining({ status: 'ready', rows: 8, artifact: 'AX-2609-002.csv', expires: '2026-10-01' }));
    expect(ev).toEqual(expect.objectContaining({ action: 'audit.export.performed', entityId: 'AX-2609-002', riskLevel: 'high' }));
    expect(dsarOf(bo, 'DSAR-2609-004')!.collected).toContain('ประวัติการเข้าถึง');
  });

  it('reports integrity from the server\'s per-event checks; a relay gap is not a mismatch', () => {
    const bo = createBackofficeSeed();
    expect(integrityCounts(bo)).toEqual({ events: 27, verified: 26, mismatch: 1, gaps: 2, open: 1 });
  });
});
