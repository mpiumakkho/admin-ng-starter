import { defaultNote } from './model';
import { outOfRange, sparkline, stepFill, vaccinate, vitalsSeries, weightChange, withdrawAlert } from './record';
import { createSeed } from './seed';
import type { ClinicData, Patient } from './types';

const pet = (data: ClinicData, name: string): Patient => data.patients.find(p => p.pet === name)!;

describe('keeping the record', () => {
  it('says how far each step of the note is filled in, not where it sits', () => {
    const data = createSeed();
    const bolt = pet(data, 'Bolt');
    const n = defaultNote(bolt);
    // Bolt's worked example has every step but the discharge papers' extra fields
    expect([0, 1, 2, 3].map(i => stepFill(data, bolt, n, i))).toEqual(['done', 'done', 'done', 'done']);
    const blank = defaultNote(pet(data, 'Luna'));
    expect(stepFill(data, pet(data, 'Luna'), { ...blank, temp: '38.5' }, 1)).toBe('partial');
    expect(stepFill(data, pet(data, 'Luna'), { ...blank, dx: '', plan: '', ddx: '' }, 3)).toBe('empty');
  });

  it('puts today\'s vitals after the ones taken before, and finds a weight change worth a look', () => {
    const data = createSeed();
    const nala = pet(data, 'Nala');
    const series = vitalsSeries(nala, { ...defaultNote(nala), weight: '3.7', temp: '38.4', hr: '190', rr: '32' });
    expect(series.length).toBe(4);
    expect(series[3].weight).toBe('3.7');
    expect(Math.round(weightChange(series)! * 100)).toBe(-12);
    expect(outOfRange(nala, 'rr', '32')).toBe(true);
    expect(outOfRange(nala, 'temp', '38.4')).toBe(false);
  });

  it('draws a line of readings in its box, and nothing for one reading', () => {
    expect(sparkline([1, 2, 3], 64, 20, 3)).toEqual([[3, 17, 0], [32, 10, 1], [61, 3, 2]]);
    expect(sparkline([null, 5])).toBeNull();
  });

  it('records a dose with its lot and next due date, and keeps a withdrawn alert with why', () => {
    const data = createSeed();
    const bolt = pet(data, 'Bolt');
    vaccinate(bolt, 'Leptospirosis', 'LP-2608-02', 365, 'น.สพ. นรินทร์');
    expect(bolt.vaccines.find(v => v[0] === 'Leptospirosis')).toEqual(['Leptospirosis', 'ฉีดแล้ว 2026-09-24 · Lot LP-2608-02 · ครั้งถัดไป 2027-09-24', 'ok']);
    expect(bolt.vaccineLog?.[0]).toEqual(['2026-09-24', 'Leptospirosis', 'LP-2608-02', '2027-09-24', 'น.สพ. นรินทร์']);

    const count = bolt.alerts.length;
    withdrawAlert(bolt, 1, 'ไม่กังวลแล้วเมื่อจับยึดครั้งนี้', 'น.สพ. นรินทร์');
    expect(bolt.alerts.length).toBe(count - 1);
    expect(bolt.withdrawnAlerts?.[0]).toEqual(expect.objectContaining({ type: 'handling', withdrawnBy: 'น.สพ. นรินทร์' }));
  });
});
