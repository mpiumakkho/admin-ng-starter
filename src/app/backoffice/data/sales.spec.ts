import { createSeed } from '../../clinic/data/seed';
import {
  blockOf, claimableInvoices, claimEstimate, claimProblems, claimSummary, decideClaim, eobVariance, isOverdue, lineSummary, markDocuments, newClaim, outbox, policyOf, reimburse,
  revenueOverview, sendMessage, submitClaim,
} from './sales';
import { createBackofficeSeed } from './seed';

describe('sales', () => {
  it('sends a LINE message only to a linked owner with the consent its purpose needs', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    expect(blockOf(bo, 'Kittikun S.', 'bill-link')).toBe('ไม่ได้เชื่อม LINE กับโรงพยาบาล');
    expect(blockOf(bo, 'Arisa K.', 'vaccine-reminder')).toBe('ถอนความยินยอมการแจ้งเตือนเมื่อ 2026-09-10 20:15');
    expect(blockOf(bo, 'Kanokwan R.', 'appointment-reminder')).toBe('ไม่ได้ให้ความยินยอมการแจ้งเตือน');
    // A bill link is a service message: the link's own consent is enough
    expect(blockOf(bo, 'Kanokwan R.', 'bill-link')).toBeNull();

    const box = outbox(clinic, bo);
    expect(box.map(i => i.key)).toEqual(['bill:I3', 'appt:A8', 'appt:A9', 'appt:A10', 'bill:I1', 'vac:Kiki:FVRCP booster', 'vac:Pumpkin:Rabies', 'vac:Coco:DHPPiL booster', 'vac:Milo:FVRCP booster']);
    expect(box.filter(i => i.block).map(i => i.ownerKey)).toEqual(['Arisa K.', 'Kittikun S.']);
    expect(box[0].retry?.id).toBe('MSG-2609-120');
    expect(() => sendMessage(bo, box.find(i => i.ownerKey === 'Arisa K.')!, 'x')).toThrow();

    const sent = sendMessage(bo, box.find(i => i.key === 'appt:A8')!, 'นัทธมน (แคชเชียร์)');
    expect(sent).toEqual(expect.objectContaining({ id: 'MSG-2609-122', ref: 'A8', status: 'delivered' }));
    expect(outbox(clinic, bo).some(i => i.key === 'appt:A8')).toBe(false);
    expect(lineSummary(clinic, bo)).toEqual(expect.objectContaining({ owners: 9, linked: 8, reminder: 6, today: 2, failed: 1 }));
  });

  it('writes a claim on an issued bill within the policy, estimates what it pays, and refuses a bill already claimed', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    const falcon = policyOf(bo, 'PL1')!;
    expect(claimEstimate(falcon, 2450)).toBe(1560);
    // Bolt's July bill was claimed and rejected, so it may be claimed again; September's is claimed already
    expect(claimableInvoices(clinic, bo, falcon).map(i => i.id)).toEqual(['I2']);
    expect(claimProblems(clinic, bo, { policyId: 'PL1', kind: 'claim', invoiceId: 'I1', diagnosis: 'x', amount: 20000 })).toEqual({
      invoiceId: 'ใบแจ้งหนี้นี้เคลมแล้วหรือเคลมไม่ได้', diagnosis: 'ต้องระบุการวินิจฉัย', amount: 'เกินวงเงินคงเหลือของกรมธรรม์',
    });
    expect(claimProblems(clinic, bo, { policyId: 'PL2', kind: 'pre-auth', diagnosis: 'Dental scaling', amount: 4000 })).toEqual({});
    const claim = newClaim(clinic, bo, { policyId: 'PL2', kind: 'pre-auth', diagnosis: 'Dental scaling', amount: 4000 }, 'นัทธมน (แคชเชียร์)');
    expect(claim).toEqual(expect.objectContaining({ id: 'CLM-2609-009', insurer: 'MSIG', pet: 'Mali', status: 'draft' }));
  });

  it('moves a claim forward by hand: documents, sent, the insurer\'s answer, the money, and the difference on the EOB', () => {
    const bo = createBackofficeSeed();
    const claim = bo.claims.find(c => c.id === 'CLM-2609-008')!;
    expect(() => submitClaim(claim, 'อีเมล', '', 'x')).toThrow();
    markDocuments(claim, 'x');
    expect(claim.status).toBe('documents-ready');
    submitClaim(claim, 'พอร์ทัล MSIG', 'MS-PA-7710', 'x');
    expect(claim.log.at(-1)?.[3]).toBe('ส่งทาง พอร์ทัล MSIG · เลขรับเรื่อง MS-PA-7710');
    expect(() => decideClaim(bo, claim, 'partially-approved', 20000, 'เกิน', 'x')).toThrow();
    decideClaim(bo, claim, 'partially-approved', 15000, 'อนุมัติค่าผ่าตัด ไม่รวมค่าห้องวันที่ 3', 'x');
    // A pre-authorisation does not use the limit; the claim that follows does
    expect(policyOf(bo, 'PL2')!.remaining).toBe(50000);

    const falcon = bo.claims.find(c => c.id === 'CLM-2609-007')!;
    decideClaim(bo, falcon, 'approved', 0, 'อนุมัติเต็มจำนวน', 'x');
    expect(policyOf(bo, 'PL1')!.remaining).toBe(18000 - 1560);
    reimburse(falcon, 1500, 'hospital', 'FAL-PAY-8811', 'x');
    expect(falcon.status).toBe('reimbursed');
    expect(eobVariance(falcon)).toBe(-60);
    expect(falcon.log.at(-1)?.[3]).toContain('ต่างจากที่อนุมัติ ฿-60');
    expect(isOverdue(bo.claims.find(c => c.id === 'CLM-2607-012')!)).toBe(false);
    expect(claimSummary(bo)).toEqual(expect.objectContaining({ drafts: 0, rejected: 1, reimbursed: 1500 }));
  });

  it('puts the revenue side by side by source, and lists what needs attention, each with its owner module', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    const o = revenueOverview(clinic, bo);
    expect(o.outstanding).toEqual({ amount: 2430, count: 2 });
    expect(o.sources.map(s => s.source)).toEqual(['QR PromptPay', 'เงินสด', 'บัตรเครดิต', 'คืนเงิน', 'ประกันจ่ายเจ้าของโดยตรง']);
    expect(o.sources[0]).toEqual(expect.objectContaining({ month: 2350, week: 0 }));
    expect(o.claims.waiting).toEqual({ count: 1, amount: 1560 });
    expect(o.exceptions.map(x => `${x.module} ${x.ref}`)).toEqual(['M11 PAY-2609-0391', 'M15 MSG-2609-120', 'M16 CLM-2609-005']);
    expect(o.outbox).toEqual({ ready: 7, blocked: 2 });
  });
});
