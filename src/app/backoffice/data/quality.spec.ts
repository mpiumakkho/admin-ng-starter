import {
  addRcaAction, addWhy, ANONYMOUS, approveBlock, closeBlock, closeSurvey, complaintCounts, complaintOf, decideRca, dimensionChange, escalateBlock, escalateNearMiss, incidentProblems,
  kpiNow, mmBlock, qualityCounts, receiveComplaint, recurring, reportIncident, respond, responseBlock, responseCompliance, safetyTrend, satisfaction, setRootCause, signOff, signOffBlock,
  slaState, submitProblems, surveyBlock, targetProblems, triageLate,
} from './quality';
import { createBackofficeSeed } from './seed';

const ME = 'วรรณา (ผู้จัดการการเงิน)';

describe('quality and patient safety', () => {
  it('counts what waits: triage, the late one, major harm, near misses, RCAs and their late actions', () => {
    const bo = createBackofficeSeed();
    expect(qualityCounts(bo)).toEqual({ open: 5, awaitingTriage: 3, triageLate: 1, severeOpen: 1, nearMiss30: 5, nearMissOpen: 2, rcaOpen: 2, rcaReview: 1, actionsLate: 1 });
    expect(bo.incidents.filter(triageLate).map(i => i.id)).toEqual(['INC-2609-003']);
    expect(safetyTrend(bo).at(-1)).toEqual({ month: '2026-09', incidents: 5, severe: 1, nearMisses: 4 });
    expect(safetyTrend(bo)).toHaveLength(12);
  });

  it('keeps no name on an anonymous report, and asks for what a report needs', () => {
    const bo = createBackofficeSeed();
    const input = { at: '2026-09-24T10:00', category: '' as const, location: 'OPD', pet: '', description: 'สั้น', immediateAction: '', harm: '', anonymous: true };
    expect(incidentProblems(input)).toEqual(['เลือกประเภทเหตุการณ์', 'เล่าเหตุการณ์อย่างน้อย 10 ตัวอักษร', 'บันทึกสิ่งที่ทำทันทีอย่างน้อย 10 ตัวอักษร', 'เลือกระดับอันตราย']);
    const i = reportIncident(bo, { ...input, category: 'fall', description: 'สุนัขลื่นล้มในห้องรอ', immediateAction: 'สัตวแพทย์ตรวจแล้วไม่บาดเจ็บ', harm: '1' }, ME);
    expect(i).toEqual(expect.objectContaining({ id: 'INC-2609-006', reportedBy: undefined, at: '2026-09-24 10:00', status: 'reported' }));
    expect(i.history[0][1]).toBe(ANONYMOUS);
    expect(JSON.stringify(i)).not.toContain(ME);
  });

  it('closes a major harm only on an approved RCA, approved by someone outside its team', () => {
    const bo = createBackofficeSeed();
    const insulin = bo.incidents.find(i => i.id === 'INC-2609-001')!;
    expect(closeBlock(bo, insulin)).toBe('อันตรายระดับรุนแรงขึ้นไปต้องมี RCA ที่อนุมัติแล้วก่อนปิด');
    expect(closeBlock(bo, bo.incidents.find(i => i.id === 'INC-2609-003')!)).toBe('คัดกรองก่อนปิด');
    const rca = bo.rcas.find(r => r.id === 'RCA-2609-002')!;
    expect(approveBlock(rca, 'พ.ส. อรุณี')).toBe('ผู้อนุมัติต้องไม่ใช่ทีมวิเคราะห์หรือผู้ส่ง (การแยกหน้าที่)');
    expect(approveBlock(rca, 'ภก. ธนพร (เภสัชกร)')).toBe('ผู้อนุมัติต้องไม่ใช่ทีมวิเคราะห์หรือผู้ส่ง (การแยกหน้าที่)');
    expect(approveBlock(rca, ME)).toBeNull();
    decideRca(rca, true, 'มาตรการครอบคลุม ติดตามตามกำหนด', ME);
    expect(closeBlock(bo, insulin)).toBeNull();
  });

  it('holds an RCA to five whys, a root cause and an action before it goes for approval', () => {
    const bo = createBackofficeSeed();
    const rca = bo.rcas.find(r => r.id === 'RCA-2609-001')!;
    expect(submitProblems(rca)).toEqual(['ต้องถาม "ทำไม" อย่างน้อย 5 ข้อ (ตอนนี้ 3)', 'สรุปสาเหตุรากก่อนส่ง', 'ต้องมีมาตรการอย่างน้อย 1 ข้อ']);
    addWhy(rca, 'ไม่มีแผนจัดสรรอุปกรณ์ให้ความอบอุ่นระหว่างหน่วยงาน', ME);
    addWhy(rca, 'การจัดซื้ออุปกรณ์ไม่ได้ดูจากจำนวนห้องที่ใช้พร้อมกัน', ME);
    setRootCause(rca, 'อุปกรณ์ให้ความอบอุ่นไม่พอสำหรับห้องผ่าตัดและ ICU ที่ใช้พร้อมกัน', ME);
    addRcaAction(rca, { text: 'จัดหาผ้าห่มลมร้อนเพิ่ม 1 เครื่องสำหรับ ICU', owner: 'ช่างซ่อมบำรุง', due: '2026-10-31' }, ME);
    expect(submitProblems(rca)).toEqual([]);
  });

  it('escalates a near miss into an incident that carries its number', () => {
    const bo = createBackofficeSeed();
    const n = bo.nearMisses.find(x => x.id === 'NM-2609-004')!;
    const i = escalateNearMiss(bo, n, 2, 'พบว่าเปิดเครื่องไปแล้ว 10 นาทีก่อนตรวจพบ', ME);
    expect(i).toEqual(expect.objectContaining({ id: 'INC-2609-006', source: 'NM-2609-004', harm: 2 }));
    expect(n).toEqual(expect.objectContaining({ status: 'escalated', incidentId: 'INC-2609-006' }));
  });

  it('reads the live KPIs from the modules they come from', () => {
    const bo = createBackofficeSeed();
    const value = (id: string) => kpiNow(bo, bo.kpis.find(k => k.id === id)!);
    expect(value('K04')).toEqual(expect.objectContaining({ value: 0.8, live: true, met: false }));
    expect(value('K05').value).toBe(88);
    expect(value('K06').value).toBe(85);
    expect(value('K07')).toEqual(expect.objectContaining({ value: 88, previous: 83, change: 5, improving: true, met: false }));
    expect(value('K08')).toEqual(expect.objectContaining({ value: 39, live: false, improving: true }));
    expect(targetProblems(bo.kpis[0], '3', 'สั้น')).toEqual(['เป้าหมายใหม่ต้องไม่เท่าเดิม', 'บันทึกเหตุผลอย่างน้อย 10 ตัวอักษร']);
  });

  it('closes a survey round once half have answered, and holds M&M to its date', () => {
    const bo = createBackofficeSeed();
    const [now, before] = bo.surveys;
    expect(surveyBlock(now)).toBeNull();
    expect(dimensionChange(now, before, 'การไม่ลงโทษเมื่อเกิดความผิดพลาด')).toBe(9);
    closeSurvey(now, ME);
    expect(surveyBlock(now)).toBe('รอบนี้ปิดแล้ว');
    expect(mmBlock(bo.mm.find(m => m.id === 'MM-2609-02')!)).toBe('ยังไม่ถึงวันประชุม (2026-09-30)');
    expect(mmBlock(bo.mm.find(m => m.id === 'MM-2609-01')!)).toBeNull();
  });
});

describe('complaints', () => {
  it('times each answer by severity, the last quarter of its window as nearly due', () => {
    const bo = createBackofficeSeed();
    expect(complaintCounts(bo)).toEqual({ open: 4, new: 1, dueSoon: 1, breached: 0, severe: 1, signOff: 1 });
    expect(['CMP-2609-013', 'CMP-2609-012', 'CMP-2609-010', 'CMP-2609-006'].map(id => slaState(complaintOf(bo, id)!))).toEqual(['triage', 'on-track', 'due-soon', 'breached']);
    expect(responseCompliance(bo)).toEqual({ sent: 17, met: 15, percent: 88 });
  });

  it('has the Director sign off a severe answer, never its drafter; a moderate one is investigated first', () => {
    const bo = createBackofficeSeed();
    const severe = complaintOf(bo, 'CMP-2609-010')!;
    expect(responseBlock(severe)).toBe('คำตอบรอผู้อำนวยการลงนาม');
    expect(signOffBlock(severe, 'ผู้จัดการ OPD')).toBe('ผู้ร่างคำตอบลงนามเองไม่ได้ (การแยกหน้าที่)');
    expect(signOffBlock(severe, 'น.สพ. นรินทร์')).toBeNull();
    signOff(severe, 'คำตอบครบถ้วน ส่งได้', 'น.สพ. นรินทร์');
    expect(severe.status).toBe('responded');
    expect(slaState(severe)).toBe('met');
    expect(severe.communications.at(-1)![2]).toBe('out');

    const billing = complaintOf(bo, 'CMP-2609-012')!;
    expect(responseBlock(billing)).toBe('ข้อร้องเรียนระดับปานกลางขึ้นไปต้องบันทึกผลสอบสวนก่อนตอบ');
    expect(escalateBlock(billing)).toBe('ส่งหน่วยงานกำกับได้เฉพาะข้อร้องเรียนรุนแรง');
    expect(escalateBlock(severe)).toBeNull();
  });

  it('takes a complaint from any channel, answers a low one at once, and finds what recurs', () => {
    const bo = createBackofficeSeed();
    const c = receiveComplaint(bo, {
      channel: 'line', ownerKey: 'Napat T.', pet: 'Mochi', anonymous: false, category: 'operational', topic: 'เวลารอ', subject: 'รอรับยานาน', description: 'รอรับยาที่ห้องยาเกิน 40 นาที',
    }, ME);
    expect(c).toEqual(expect.objectContaining({ id: 'CMP-2609-014', status: 'new' }));
    expect(slaState(c)).toBe('triage');
    Object.assign(c, { severity: 'low', status: 'triaged' });
    respond(c, 'ขออภัยในความล่าช้า ห้องยาเพิ่มเจ้าหน้าที่ช่วงบ่ายแล้ว', ME);
    expect(c.status).toBe('responded');
    expect(recurring(bo).slice(0, 2)).toEqual([
      expect.objectContaining({ topic: 'เวลารอ', count: 5, recurring: true }), expect.objectContaining({ topic: 'ค่าบริการ', count: 3, recurring: true }),
    ]);
    expect(satisfaction(bo)).toEqual(expect.objectContaining({ count: 14, mean: 3.6, awaiting: 1 }));
  });
});
