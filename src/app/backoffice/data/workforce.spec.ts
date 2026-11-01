import { createBackofficeSeed } from './seed';
import {
  addCe, addLicense, assignShift, canVerify, ceReviewBlock, ceSummary, changePrivilege, coverage, credentialState, decideLeave, expiryCounts, fairness, gaps, generateOnCall, leaveImpact,
  leaveBlock, licenseOf, licenseState, onCallEligible, overtime, previewShift, privilegeBlock, privilegeCell, publishBlock, publishOnCall, publishWeek, removeShift, renewLicense, renewProblems,
  verifyLicense, weekConflicts, weekOf, weekStatus,
} from './workforce';

const W1 = '2026-09-21';
const W2 = '2026-09-28';

describe('workforce', () => {
  it('ages licenses by 30/60/90 days, keeps the unverified apart, and renews into a fresh check', () => {
    const bo = createBackofficeSeed();
    expect(expiryCounts(bo)).toEqual({ expired: 1, pending: 1, d30: 1, d60: 1, d90: 1, valid: 9 });
    expect(credentialState(bo, 'S02')).toBe('d30');
    expect(credentialState(bo, 'S10')).toBe('expired');
    expect(credentialState(bo, 'S11')).toBeNull();

    const lalita = licenseOf(bo, 'S02', 'vet-license')!;
    expect(canVerify(bo, lalita, 'สพ.ญ. ลลิตา')).toBe(false);
    expect(renewProblems(lalita, '2026-10-01')).toBe('วันหมดอายุใหม่ต้องหลังวันเดิม');
    renewLicense(lalita, '2031-10-15', '', 'ใบเสร็จสัตวแพทยสภา R-55120', 'ฝ่ายบุคคล');
    expect(licenseState(lalita)).toBe('pending');
    verifyLicense(lalita, 'ตรวจกับเว็บไซต์สัตวแพทยสภา', '', 'ฝ่ายบุคคล');
    expect(licenseState(lalita)).toBe('valid');
    expect(lalita.history.map(h => h[2])).toEqual(['บันทึกใบอนุญาต', 'ตรวจสอบแล้ว', 'ต่ออายุ', 'ตรวจสอบแล้ว']);

    const added = addLicense(bo, { staffId: 'S03', kind: 'controlled-license', number: 'CD-2609-201', issuer: '', issuedAt: '2026-09-20', expiresAt: '2031-09-19' }, 'ฝ่ายบุคคล');
    expect(added).toEqual(expect.objectContaining({ id: 'L15', issuer: 'อย.', verification: 'pending' }));
  });

  it('finds the week\'s overlaps, short rests, leave and unchecked licenses, and its coverage gaps', () => {
    const bo = createBackofficeSeed();
    const first = weekConflicts(bo, W1);
    expect(first.filter(c => c.hard)).toEqual([]);
    expect(first.map(c => `${c.staffId} ${c.text}`)).toEqual([
      'S06 พักไม่ถึง 8 ชม. หลังเวรดึก 2026-09-23',
      'S06 56 ชม. ในสัปดาห์ · เกินสัญญา 40 ชม. เกิน 8 ชม.',
    ]);
    expect(gaps(coverage(bo, W1)).map(g => `${g.date} ${g.kind} ${g.role}`)).toEqual(['2026-09-26 night nurse']);
    expect(weekStatus(bo, W1)).toBe('published');

    const second = weekConflicts(bo, W2);
    expect(second.filter(c => c.hard).map(c => `${c.staffId} ${c.date} ${c.text}`)).toEqual([
      'S03 2026-09-30 ซ้อนกับเวรบ่าย 2026-09-30',
      'S03 2026-09-30 ซ้อนกับเวรเช้า 2026-09-30',
      'S04 2026-10-01 ใบอนุญาตประกอบวิชาชีพยังไม่ได้ตรวจสอบ',
      'S04 2026-10-02 ใบอนุญาตประกอบวิชาชีพยังไม่ได้ตรวจสอบ',
      'S04 2026-10-04 ใบอนุญาตประกอบวิชาชีพยังไม่ได้ตรวจสอบ',
    ]);
    expect(second.filter(c => !c.hard).map(c => c.staffId)).toEqual(['S06']);
    expect(gaps(coverage(bo, W2))).toEqual([]);
    expect(publishBlock(bo, W2)).toBe('มีความขัดแย้งที่ต้องแก้ก่อน 5 รายการ');

    // Checked license, the afternoon handed over: the week can go out
    verifyLicense(licenseOf(bo, 'S04', 'vet-license')!, 'ตรวจเอกสารตัวจริง', '', 'ฝ่ายบุคคล');
    removeShift(bo, bo.shifts.find(s => s.staffId === 'S03' && s.date === '2026-09-30' && s.kind === 'afternoon')!);
    expect(gaps(coverage(bo, W2)).map(g => `${g.date} ${g.kind} ${g.role}`)).toEqual(['2026-09-30 afternoon vet']);
    expect(previewShift(bo, { staffId: 'S04', date: '2026-09-30', kind: 'afternoon', area: 'OPD' })).toEqual([]);
    assignShift(bo, { staffId: 'S04', date: '2026-09-30', kind: 'afternoon', area: 'OPD' });
    expect(publishBlock(bo, W2)).toBeNull();
    expect(publishWeek(bo, W2)).toBe(55);
    expect(weekStatus(bo, W2)).toBe('published');
  });

  it('shows what a leave takes off the schedule, and lets no one decide their own', () => {
    const bo = createBackofficeSeed();
    const nicha = bo.leaves.find(l => l.id === 'LV-2609-08')!;
    const impact = leaveImpact(bo, nicha);
    expect(impact.shifts.map(s => `${s.date} ${s.kind}`)).toEqual(['2026-10-01 afternoon', '2026-10-02 morning', '2026-10-03 morning']);
    expect(impact.gaps.map(g => `${g.date} ${g.kind} ${g.have}/${g.need}`)).toEqual(['2026-10-01 afternoon 0/1', '2026-10-02 morning 1/2', '2026-10-03 morning 0/1']);
    expect(leaveBlock(bo, nicha, 'พ.ส. ณิชา')).not.toBeNull();
    expect(leaveBlock(bo, nicha, 'พ.ส. อรุณี')).toBeNull();

    decideLeave(nicha, 'approved', 'อนุมัติ จัดคนแทนแล้ว', 'พ.ส. อรุณี');
    expect(weekConflicts(bo, W2).filter(c => c.staffId === 'S06' && c.hard)).toHaveLength(3);
    expect(gaps(coverage(bo, W2))).toHaveLength(3);
  });

  it('keeps privileges to what the licenses hold, and never one\'s own', () => {
    const bo = createBackofficeSeed();
    expect(privilegeCell(bo, 'S02', 'prescribe')).toBe('at-risk');
    expect(privilegeCell(bo, 'S01', 'surgery')).toBe('granted');
    expect(privilegeCell(bo, 'S03', 'prescribe-controlled')).toBe('none');
    expect(privilegeCell(bo, 'S10', 'prescribe')).toBe('n/a');
    expect(privilegeBlock(bo, 'S03', 'prescribe-controlled', 'grant', 'น.สพ. นรินทร์')).toBe('ต้องมีใบอนุญาตสั่งใช้ยาควบคุมที่ตรวจสอบแล้วและยังไม่หมดอายุ');
    expect(privilegeBlock(bo, 'S04', 'prescribe', 'grant', 'น.สพ. นรินทร์')).toContain('ใบอนุญาตประกอบวิชาชีพการสัตวแพทย์');
    expect(privilegeBlock(bo, 'S01', 'surgery', 'revoke', 'น.สพ. นรินทร์')).toBe('เปลี่ยนสิทธิ์ของตัวเองไม่ได้ (การแยกหน้าที่)');

    const change = changePrivilege(bo, 'S07', 'imaging', 'grant', 'ผ่านการอบรมความปลอดภัยทางรังสีแล้ว', 'พ.ส. อรุณี');
    expect(change.id).toBe('PV-005');
    expect(privilegeCell(bo, 'S07', 'imaging')).toBe('granted');

    // A lapsed license suspends what rests on it, without anyone taking it away
    licenseOf(bo, 'S02', 'vet-license')!.expiresAt = '2026-09-01';
    expect(privilegeCell(bo, 'S02', 'prescribe')).toBe('lapsed');
  });

  it('counts CE from the approved list at once, and an unlisted course only with its certificate and another reviewer', () => {
    const bo = createBackofficeSeed();
    const by = (id: string) => ceSummary(bo).find(r => r.staff.id === id)!;
    expect(by('S01')).toEqual(expect.objectContaining({ approved: 16, pending: 0, target: 20, behind: false }));
    expect(by('S02')).toEqual(expect.objectContaining({ approved: 16, pending: 8 }));
    expect(by('S03').behind).toBe(true);
    expect(by('S04').behind).toBe(false);

    const listed = addCe(bo, { staffId: 'S03', course: 'CPR (RECOVER) BLS', provider: '', date: '2026-09-20', hours: 1, category: 'other' }, 'ฝ่ายบุคคล');
    expect(listed).toEqual(expect.objectContaining({ id: 'CE-26-016', status: 'approved', hours: 4, category: 'clinical' }));
    expect(by('S03').approved).toBe(10);

    const webinar = bo.ce.find(c => c.id === 'CE-26-014')!;
    expect(ceReviewBlock(bo, webinar, 'ภก. ธนพร')).toBe('ผู้เข้าอบรมตรวจบันทึกของตัวเองไม่ได้ (การแยกหน้าที่)');
    expect(ceReviewBlock(bo, webinar, 'ฝ่ายบุคคล')).toBe('ต้องแนบใบรับรองก่อนนับชั่วโมง');
    expect(ceReviewBlock(bo, webinar, 'ฝ่ายบุคคล', 'rejected')).toBeNull();
  });

  it('rotates on-call fairly among the vets who may take it, and counts overtime from the schedule and the call-outs', () => {
    const bo = createBackofficeSeed();
    expect(fairness(bo, W1, '2026-09-27')).toEqual(expect.objectContaining({ spread: 1, fair: true }));
    expect(onCallEligible(bo, W2).map(s => s.id)).toEqual(['S01', 'S02', 'S03']);

    const made = generateOnCall(bo, W2, '2026-10-11');
    expect(made).toHaveLength(14);
    expect(made.map(s => s.staffId).join(' ')).toBe('S02 S01 S03 S01 S02 S03 S01 S02 S03 S01 S02 S03 S02 S01');
    const f = fairness(bo, W2, '2026-10-11');
    expect(f.rows.filter(r => r.nights).map(r => [r.staff.id, r.nights, r.weekends])).toEqual([['S01', 5, 2], ['S02', 5, 1], ['S03', 4, 1]]);
    expect(f.fair).toBe(true);
    expect(publishOnCall(bo, W2, '2026-10-11')).toBe(14);

    const ot = overtime(bo, W1);
    const row = (id: string) => ot.find(r => r.staff.id === id)!;
    expect(row('S02')).toEqual(expect.objectContaining({ shifts: 6, hours: 48, scheduled: 8, callOut: 2.5, total: 10.5 }));
    expect(row('S06')).toEqual(expect.objectContaining({ hours: 56, night: 24, scheduled: 16 }));
    expect(row('S08')).toEqual(expect.objectContaining({ hours: 24, contract: 24, total: 0 }));
    expect(weekOf('2026-09-24')).toBe(W1);
  });
});
