import {
  addCalibration, addEquipment, calibrationCompliance, calibrationLapses, calibrationProblems, closeDowntime, closeProblems, completeDecommission, completePm, contractState,
  criticalBoard, decideBlock, decideDecommission, decommissionImpact, downtimeProblems, equipmentOf, equipmentProblems, moveProblems, openDowntime, openPm, pmCounts, pmProblems,
  readiness, reliability, requestProblems, retireImpact,
} from './assets';
import { createBackofficeSeed } from './seed';

const TECH = 'ช่างเอก (ช่างซ่อมบำรุง)';

describe('assets', () => {
  it('alerts PM 30 days ahead; a done PM plans the next a cycle on, and a failed one takes the device down', () => {
    const bo = createBackofficeSeed();
    expect(pmCounts(bo)).toEqual({ overdue: 2, due30: 4, scheduled: 10, criticalOverdue: 1 });

    const anes = openPm(bo, 'EQ-OR1-ANES-01')!;
    expect(moveProblems(bo, anes, '2026-10-10')).toBe('อุปกรณ์ critical เลื่อน PM ได้ไม่เกิน 14 วันจากกำหนดเดิม');
    expect(moveProblems(bo, anes, '2026-10-02')).toBeNull();
    expect(moveProblems(bo, openPm(bo, 'EQ-LAB-CHEM-01')!, '2026-10-15')).toBeNull();

    const o2 = openPm(bo, 'EQ-ICU-O2-01')!;
    expect(pmProblems(o2, { doneAt: '2026-09-24', outcome: 'fail', findings: 'สั้น', cost: '' })).toEqual(['PM ไม่ผ่านต้องบันทึกสิ่งที่พบอย่างน้อย 10 ตัวอักษร']);
    const { next, downtime } = completePm(bo, o2, { doneAt: '2026-09-24', outcome: 'fail', findings: 'compressor ร้อนเกินและดับเอง', cost: '1200' }, TECH);
    expect(next).toEqual(expect.objectContaining({ id: 'PM-023', due: '2027-03-24', status: 'open' }));
    expect(downtime).toEqual(expect.objectContaining({ id: 'DT-2609-006', equipmentId: 'EQ-ICU-O2-01' }));
    expect(equipmentOf(bo, 'EQ-ICU-O2-01')!.status).toBe('down');
    expect(equipmentOf(bo, 'EQ-ICU-O2-01')!.costs).toEqual([['2026-09-24', 'PM', 1200, 'PM-014']]);
  });

  it('checks calibration against its frequency: what is in date, what lapsed, and what a record needs', () => {
    const bo = createBackofficeSeed();
    const c = calibrationCompliance(bo);
    expect([c.required, c.inDate, c.percent, c.due30, c.overdue, c.failed, c.lapsed]).toEqual([13, 11, 85, 3, 2, 0, 3]);
    expect(calibrationLapses(bo, equipmentOf(bo, 'EQ-OR1-ANES-01')!)).toEqual([['2025-11-05', '2025-11-10', 5]]);

    const input = { equipmentId: 'EQ-ICU-MON-03', date: '2026-09-24', by: 'บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง', result: 'pass' as const, certificate: '', reading: '', nextDue: '2027-10-24' };
    expect(calibrationProblems(bo, input)).toEqual(['ผลที่ผ่านต้องแนบใบรับรองการสอบเทียบ', 'ครั้งถัดไปต้องไม่เกินความถี่ที่กำหนด']);
    expect(calibrationProblems(bo, { ...input, equipmentId: 'EQ-ICU-O2-01' })).toEqual(['เลือกอุปกรณ์ที่ต้องสอบเทียบ']);
    const { record } = addCalibration(bo, { ...input, certificate: 'CAL-MON03.pdf', nextDue: '2027-09-24' }, TECH);
    expect(record.id).toBe('CAL-26-009');
    expect(calibrationCompliance(bo).overdue).toBe(1);

    const failed = addCalibration(bo, { ...input, equipmentId: 'EQ-LAB-CBC-02', result: 'fail', reading: 'HCT เบี่ยง 6%', nextDue: '2026-10-24' }, TECH);
    expect(failed.downtime?.problem).toBe('สอบเทียบไม่ผ่าน CAL-26-010 · HCT เบี่ยง 6%');
    expect(readiness(bo, equipmentOf(bo, 'EQ-LAB-CBC-02')!).state).toBe('down');
  });

  it('computes MTBF and MTTR from the year\'s downtime, and closes a downtime only once tested', () => {
    const bo = createBackofficeSeed();
    const anes = reliability(bo, ['EQ-OR1-ANES-01']);
    expect(anes.failures).toBe(3);
    expect(anes.mttr).toBe(15.5);
    expect(Math.round(anes.mtbf!)).toBe(2908);
    expect(reliability(bo, ['EQ-DEN-DEN-01'])).toEqual(expect.objectContaining({ failures: 0, mtbf: null, mttr: null, availability: 1 }));

    expect(downtimeProblems(bo, { equipmentId: 'EQ-OR1-ANES-01', kind: 'failure', problem: 'ยังเสียอยู่ตามเดิมทุกอย่าง', impact: '' })).toEqual(['อุปกรณ์นี้มีรายการขัดข้องที่ยังเปิดอยู่']);
    expect(closeProblems('เปลี่ยน flow sensor', false, '')).toEqual(['ต้องทดสอบการทำงานก่อนกลับมาใช้']);
    const open = bo.downtime.find(d => d.id === 'DT-2609-005')!;
    closeDowntime(bo, open, 'เปลี่ยน flow sensor และทดสอบรั่วผ่าน', '9800', TECH);
    expect(equipmentOf(bo, 'EQ-OR1-ANES-01')!.status).toBe('in-service');
    expect(equipmentOf(bo, 'EQ-OR1-ANES-01')!.costs.at(-1)).toEqual(['2026-09-24', 'ซ่อม', 9800, 'DT-2609-005']);

    const planned = openDowntime(bo, { equipmentId: 'EQ-DEN-DEN-01', kind: 'planned', problem: 'เปลี่ยนสายน้ำตามรอบผู้ผลิต', impact: '' }, TECH);
    expect(planned.id).toBe('DT-2609-006');
    expect(equipmentOf(bo, 'EQ-DEN-DEN-01')!.status).toBe('down');
  });

  it('ranks the critical devices by readiness, with every reason, and finds what a lapsed contract leaves uncovered', () => {
    const bo = createBackofficeSeed();
    expect(criticalBoard(bo).map(r => `${r.equipment.id} ${r.state}`)).toEqual([
      'EQ-OR1-ANES-01 down', 'EQ-ICU-DEF-01 attention', 'EQ-ICU-MON-03 attention', 'EQ-ICU-O2-01 attention', 'EQ-CSSD-STR-01 due', 'EQ-OR1-MON-01 due',
      'EQ-ICU-MON-02 ready', 'EQ-OR2-ANES-02 ready',
    ]);
    expect(readiness(bo, equipmentOf(bo, 'EQ-OR1-ANES-01')!).reasons).toEqual(['DT-2609-005 · ไม่จ่ายแก๊ส · flow meter ไม่ขึ้น', 'PM เกินกำหนด 4 วัน']);
    expect(readiness(bo, equipmentOf(bo, 'EQ-ICU-O2-01')!).reasons).toEqual(['ไม่มีสัญญาซ่อมที่มีผล', 'PM ครบกำหนด 2026-09-30']);
    expect(bo.contracts.map(c => contractState(c))).toEqual(['d60', 'd90', 'expired', 'active', 'active', 'active']);
    expect(retireImpact(bo, bo.contracts[0]).map(e => e.id)).toEqual(['EQ-OR1-ANES-01', 'EQ-OR2-ANES-02', 'EQ-OR1-MON-01', 'EQ-ICU-MON-02', 'EQ-ICU-MON-03']);
    expect(retireImpact(bo, bo.contracts[5])).toEqual([]);
  });

  it('registers a device with its first PM, and decommissions by someone else with evidence, keeping its history', () => {
    const bo = createBackofficeSeed();
    const input = {
      name: 'เครื่องติดตามสัญญาณชีพ Isolation', cls: 'monitor' as const, maker: 'Mindray', model: 'uMEC 10 Vet', serial: 'UMEC-26-0901', location: 'Isolation', bed: 'I-01',
      criticality: 'high' as const, purchasedAt: '2026-09-20', purchaseCost: '185000', pmMonths: '6', calibrationMonths: '12',
    };
    expect(equipmentProblems(bo, input)).toEqual(['เตียงต้องอยู่ในจุดที่ตั้งเดียวกัน']);
    expect(equipmentProblems(bo, { ...input, bed: 'ISO-01', serial: 'UMEC-23-5521' })).toEqual(['มีหมายเลขเครื่องนี้ในทะเบียนแล้ว']);
    const e = addEquipment(bo, { ...input, bed: 'ISO-01' }, TECH);
    expect(e.id).toBe('EQ-ISO-MON-01');
    expect(openPm(bo, e.id)?.due).toBe('2027-03-24');

    const anes = equipmentOf(bo, 'EQ-OR2-ANES-02')!;
    expect(decommissionImpact(bo, anes)).toEqual([
      { text: 'ไม่มีเครื่องดมยาสลบเครื่องอื่นที่พร้อมใช้งาน', severe: true }, { text: 'ยกเลิก PM PM-008 ที่ค้างอยู่', severe: false },
      { text: 'ถอดออกจากสัญญา SC-001 · บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง', severe: false },
    ]);

    const ecg = bo.decommissions.find(r => r.id === 'DEC-2609-001')!;
    expect(requestProblems(bo, { equipmentId: 'EQ-OPD-MON-00', reason: 'ซ้ำกับคำขอเดิมที่ยังไม่ปิด', method: 'scrap', replacement: '' })).toEqual(['อุปกรณ์นี้มีคำขอเลิกใช้ที่ยังไม่ปิด']);
    expect(decideBlock(ecg, TECH)).toBe('ผู้ขอตัดสินคำขอเลิกใช้ของตัวเองไม่ได้ (การแยกหน้าที่)');
    decideDecommission(bo, ecg, 'approved', 'อนุมัติ · มีเครื่องทดแทนแล้ว', 'น.สพ. นรินทร์');
    expect(decideBlock(ecg, 'น.สพ. นรินทร์')).toBe('คำขอนี้ตัดสินแล้ว');
    completeDecommission(bo, ecg, 'ใบรับซาก RC-6609-031', TECH);
    const old = equipmentOf(bo, 'EQ-OPD-MON-00')!;
    expect(old.status).toBe('decommissioned');
    expect(openPm(bo, old.id)).toBeUndefined();
    expect(bo.contracts.find(c => c.id === 'SC-006')!.equipmentIds).toEqual(['EQ-ICU-INF-01', 'EQ-DW-INF-01']);
    expect(old.history.map(h => h[2])).toEqual(['ขึ้นทะเบียน', 'อนุมัติการเลิกใช้', 'เลิกใช้งานแล้ว']);
    expect(calibrationCompliance(bo).required).toBe(13);
  });
});
