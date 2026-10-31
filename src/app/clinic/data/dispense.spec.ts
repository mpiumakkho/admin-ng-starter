import { amount, batchProblem, fefo, isControlled, isExpired, openPrescriptions, stockFor, syncDispense, takeFrom, witnessesFor } from './dispense';
import { createSeed } from './seed';
import type { Batch, ClinicData, Patient, Prescription } from './types';

const pet = (data: ClinicData, name: string): Patient => data.patients.find(p => p.pet === name)!;
const rxOf = (data: ClinicData, pet: string): Prescription => data.prescriptions.find(rx => rx.pet === pet)!;

describe('dispensing', () => {
  it('reads a quantity and its unit', () => {
    expect(amount('10 เม็ด')).toEqual({ n: 10, unit: 'เม็ด' });
    expect(amount('1.5 mL')).toEqual({ n: 1.5, unit: 'mL' });
    expect(amount('—')).toBeNull();
  });

  it('takes the batch that expires first, and never an expired one or one with too little left', () => {
    const rx = { ...rxOf(createSeed(), 'Bolt'), qty: '10 เม็ด' };
    rx.stock = [['LATE', '06/2027', '128 เม็ด', 'A2'], ['SOON', '11/2026', '40 เม็ด', 'A2'], ['OLD', '08/2026', '90 เม็ด', 'A2'], ['LOW', '10/2026', '4 เม็ด', 'A2']];
    expect(isExpired(rx.stock[2])).toBe(true);
    expect(batchProblem(rx, rx.stock[2])).toContain('หมดอายุ');
    expect(batchProblem(rx, rx.stock[3])).toContain('ไม่พอ');
    expect(fefo(rx)?.[0]).toBe('SOON');
  });

  it('takes the quantity off a batch only when both count in the same unit', () => {
    const batch: Batch = ['B', '06/2027', '128 เม็ด', 'A2'];
    takeFrom(batch, '10 เม็ด');
    expect(batch[2]).toBe('118 เม็ด');
    takeFrom(batch, '1 ขวด');
    expect(batch[2]).toBe('118 เม็ด');
  });

  it('knows a controlled drug, and its witness is someone other than the person preparing it', () => {
    expect(isControlled('Tramadol 50 mg')).toBe(true);
    expect(isControlled('Carprofen 25 mg')).toBe(false);
    expect(witnessesFor('น.สพ. นรินทร์')).not.toContain('น.สพ. นรินทร์');
  });

  it('fills a new prescription from the shelf another prescription of the drug shows, or from the formulary\'s shelf', () => {
    const data = createSeed();
    const carprofen = rxOf(data, 'Bolt');
    expect(stockFor(data, carprofen.drug)).toBe(carprofen.stock);
    expect(stockFor(data, 'Tramadol 50 mg')[0][3]).toBe('ตู้ล็อก C');
  });

  it('marks the pet\'s dispensing done once everything prescribed is handed over', () => {
    const data = createSeed();
    const bolt = pet(data, 'Bolt');
    expect(openPrescriptions(data, bolt).length).toBe(1);
    syncDispense(data, bolt, '11:32');
    expect(bolt.handoff.dispense).toEqual({ state: 'active', note: 'รอตรวจสอบใบสั่งยา' });

    rxOf(data, 'Bolt').col = 'Dispensed';
    syncDispense(data, bolt, '11:40');
    expect(bolt.handoff.dispense).toEqual({ state: 'done', note: 'จ่ายยาแล้ว 11:40' });
  });
});
