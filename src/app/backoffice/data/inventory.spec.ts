import { fefo } from '../../clinic/data/dispense';
import { createSeed } from '../../clinic/data/seed';
import {
  allLots, canResolve, daysLeft, dispenseHistory, expiryBucket, expiryDate, inventoryOverview, ledgerDispense, ledgerProblems, movementsOf, openRecall, quarantine, receiptProblems, receive,
  recordCount, recordWaste, resolveInvestigation, stockItems, stockList, traceLot, updateRecall, wasteProblems,
} from './inventory';
import { createBackofficeSeed } from './seed';

describe('inventory', () => {
  it('reads each drug\'s stock from the clinic\'s batches, flags what is below its reorder point, and ages the lots', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    const items = stockItems(clinic, bo);
    expect(items.length).toBe(20);
    const carprofen = items.find(i => i.drug.name === 'Carprofen 25 mg')!;
    expect(carprofen.onHand).toBe(168);
    expect(carprofen.isLow).toBe(false);
    expect(carprofen.lots.map(l => l.state)).toEqual(['active', 'recalled']);
    const bup = items.find(i => i.drug.name === 'Buprenorphine 0.3 mg/mL (inj)')!;
    expect(bup.onHand).toBe(6);
    expect(bup.isLow).toBe(true);
    expect(bup.controlled).toBe(true);
    expect(stockList(items, { lowOnly: true }).map(i => i.drug.name)).toEqual(['Amoxicillin 250 mg', 'Meloxicam 1.5 mg/mL', 'Buprenorphine 0.3 mg/mL (inj)', 'Apoquel 3.6 mg']);
    expect(stockList(items, { q: 'tram' }).length).toBe(1);

    expect(expiryDate('09/2026')).toBe('2026-09-30');
    expect(daysLeft('09/2026')).toBe(6);
    expect(daysLeft('10/2026')).toBe(37);
    expect(expiryBucket(6)).toBe('d30');
    expect(expiryBucket(-1)).toBe('expired');
    expect(expiryBucket(null)).toBe('ok');
    expect(allLots(items, { bucket: 'd30', withStock: true }).map(l => l.lot)).toEqual(['PC-2408-02']);
    expect(allLots(items, { withStock: true })[1].lot).toBe('DX-2409-05');
  });

  it('receives a lot into the shelf the clinic dispenses from, and refuses a bad receipt by field', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    const bad = receiptProblems(clinic, bo, { drug: 'Nothing', lot: '', expiry: '01/2020', qty: 0, location: '' });
    expect(Object.keys(bad).sort()).toEqual(['drug', 'expiry', 'location', 'lot', 'qty']);
    expect(receiptProblems(clinic, bo, { drug: 'Carprofen 25 mg', lot: 'B-2408-11', expiry: '06/2027', qty: 10, location: 'ตู้ A2' }).lot).toContain('มีอยู่ในคลังแล้ว');

    const receipt = receive(clinic, bo, { drug: 'Amoxicillin 250 mg', lot: 'AM-2509-01', expiry: '09/2028', qty: 100, location: 'ตู้ A1', sourceRef: 'DN-77100' }, 'คุณสมชาย (คลัง)');
    expect(receipt.id).toBe('RC-2609-017');
    expect(stockItems(clinic, bo).find(i => i.drug.name === 'Amoxicillin 250 mg')!.onHand).toBe(118);
    // A drug nobody has prescribed gets its own shelf; the clinic's FEFO then finds the lot
    expect(clinic.shelf!['Amoxicillin 250 mg'].length).toBe(2);
    const rx = { ...clinic.prescriptions[0], drug: 'Amoxicillin 250 mg', qty: '10 เม็ด', stock: clinic.shelf!['Amoxicillin 250 mg'] };
    expect(fefo(rx)?.[0]).toBe('AM-2412-08');
    expect(movementsOf(clinic, bo, 'Amoxicillin 250 mg')[0]).toEqual(expect.objectContaining({ kind: 'receipt', qty: 100, lot: 'AM-2509-01' }));
  });

  it('answers a dispense history only within a patient or a drug', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    expect(dispenseHistory(clinic, bo, {})).toEqual([]);
    const mali = dispenseHistory(clinic, bo, { patient: 'Mali · Kanokwan R.' });
    expect(mali.length).toBe(5);
    expect(mali[0]).toEqual(expect.objectContaining({ id: 'LD-2609-031', source: 'ledger', witness: 'พ.ส. กมล' }));
    expect(mali[0].waste?.id).toBe('WS-2609-008');
    const ward = mali.find(r => r.id === 'X7')!;
    expect(ward.source).toBe('ward');
    expect(ward.administered).toBe('1.2 mL');
    expect(dispenseHistory(clinic, bo, { drug: 'Maropitant 16 mg', from: '2026-09-24' }).length).toBe(1);
  });

  it('keeps the controlled-drug ledger: a witness that is not the actor, waste from the shelf or from a draw, and a count that opens an investigation', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    const me = 'พ.ส. ณิชา';
    expect(ledgerProblems(bo, { drug: 'Buprenorphine 0.3 mg/mL (inj)', patient: '', qty: 0 }, me, 6)).toEqual({ patient: 'ต้องระบุผู้ป่วย', qty: 'จำนวนต้องมากกว่า 0', witness: 'ยานี้ต้องมีพยานตอนเบิก' });
    expect(ledgerProblems(bo, { drug: 'Buprenorphine 0.3 mg/mL (inj)', patient: 'Mali', qty: 7, witness: me }, me, 6)).toEqual({ qty: 'เกินจำนวนคงเหลือ', witness: 'พยานต้องไม่ใช่ผู้ทำรายการ' });
    // Tramadol's rule asks no witness; one may still be named
    expect(ledgerProblems(bo, { drug: 'Tramadol 50 mg', patient: 'Bolt', qty: 2 }, me, 42)).toEqual({});
    const d = ledgerDispense(clinic, bo, { drug: 'Buprenorphine 0.3 mg/mL (inj)', patient: 'Nala · Waraporn D.', qty: 0.5, witness: 'พ.ส. กมล' }, me);
    expect(d.id).toBe('LD-2609-032');
    expect(d.lot).toBe('BU-2411-02');
    expect(stockItems(clinic, bo).find(i => i.drug.name === 'Buprenorphine 0.3 mg/mL (inj)')!.onHand).toBe(5.5);

    expect(wasteProblems({ drug: '', qty: 0, reason: 'other', detail: 'short', witness: me }, me)).toEqual({ drug: 'เลือกรายการยา', qty: 'จำนวนต้องมากกว่า 0', detail: 'ต้องระบุคำอธิบายอย่างน้อย 10 ตัวอักษร', witness: 'พยานต้องไม่ใช่ผู้ทำรายการ' });
    recordWaste(clinic, bo, { drug: 'Buprenorphine 0.3 mg/mL (inj)', qty: 0.1, reason: 'partial_dose', detail: 'เหลือจากการดูดยาให้ Nala', witness: 'พ.ส. กมล', dispenseId: d.id }, me);
    expect(stockItems(clinic, bo).find(i => i.drug.name === 'Buprenorphine 0.3 mg/mL (inj)')!.onHand).toBe(5.5);
    recordWaste(clinic, bo, { drug: 'Buprenorphine 0.3 mg/mL (inj)', qty: 0.5, reason: 'spillage', detail: 'ขวดตกแตกขณะเตรียมยา', witness: 'พ.ส. กมล' }, me);
    expect(stockItems(clinic, bo).find(i => i.drug.name === 'Buprenorphine 0.3 mg/mL (inj)')!.onHand).toBe(5);

    const count = recordCount(clinic, bo, 'Buprenorphine 0.3 mg/mL (inj)', 4.5, me);
    expect(count).toEqual(expect.objectContaining({ id: 'CT-2609-022', expected: 5, actual: 4.5, discrepancy: -0.5, investigation: 'open' }));
    expect(bo.drugs.find(x => x.name === 'Buprenorphine 0.3 mg/mL (inj)')!.lastCountBy).toBe(me);
    expect(canResolve(count, me)).toBe(false);
    expect(canResolve(count, 'น.สพ. นรินทร์')).toBe(true);
    resolveInvestigation(count, 'escalated', 'ไม่พบสาเหตุ ส่งผู้อำนวยการ', 'น.สพ. นรินทร์');
    expect(count.investigation).toBe('escalated');
    expect(() => resolveInvestigation(count, 'resolved', 'อีกครั้ง ไม่ได้แล้ว', 'น.สพ. นรินทร์')).toThrow();
    expect(recordCount(clinic, bo, 'Tramadol 50 mg', 42, me).investigation).toBe('none');
  });

  it('traces a recalled lot to the shelf and the patients, holds it back from the clinic, and moves the recall one way', () => {
    const clinic = createSeed();
    const bo = createBackofficeSeed();
    const trace = traceLot(clinic, bo, 'BU-2411-02');
    expect(trace.onHand.map(l => l.qty)).toEqual([6]);
    expect(trace.dispensed.map(r => r.id)).toEqual(['LD-2609-031', 'X7']);
    expect(trace.untraced).toBe(0);

    expect(() => openRecall(bo, 'Carprofen 25 mg', 'B-2312-04', 'ซ้ำกับที่เปิดอยู่', undefined, 'x')).toThrow();
    const recall = openRecall(bo, 'Buprenorphine 0.3 mg/mL (inj)', 'BU-2411-02', 'ประกาศผู้ผลิต: ฉลากความแรงผิด', 'class-1', 'ภก. ธนพร');
    expect(recall.id).toBe('RCL-2609-003');
    expect(traceLot(clinic, bo, 'BU-2411-02').onHand[0].state).toBe('recalled');
    quarantine(clinic, 'BU-2411-02', 'recall RCL-2609-003');
    const rx = clinic.prescriptions.find(x => x.drug === 'Buprenorphine 0.3 mg/mL (inj)')!;
    expect(fefo(rx, clinic.holds)).toBeUndefined();
    expect(() => updateRecall(recall, 'open', 'ย้อนกลับ', 'x')).toThrow();
    updateRecall(recall, 'contained', 'กันของในคลังแล้ว แจ้งเจ้าของที่ได้รับยาแล้ว', 'ภก. ธนพร');
    expect(recall.updates.length).toBe(2);

    const o = inventoryOverview(clinic, bo);
    expect(o).toEqual(expect.objectContaining({ items: 20, low: 4, investigations: 1, recalls: 2, expiring: 3 }));
    expect(o.expiry.expired).toBe(0);
  });
});
