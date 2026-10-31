import { dischargeChecks, visitInvoice } from './discharge';
import { estimateFor } from './estimate';
import { defaultNote, stageKey } from './model';
import { createSeed } from './seed';
import type { ClinicData, Patient } from './types';
import {
  admit, bedCleaned, bedsOf, dosesWaiting, freeBeds, infusedTotal, infusionEvent, inpatients, leaveWard, maintenanceRate, marOrders, marTimes,
  nextObs, recordDose, sheetTimes, slotState, startInfusion, stayDay, stopOrder, verbalOrder, wardChecks, wardLoad, WARDS,
} from './ward';

const pet = (data: ClinicData, name: string): Patient => data.patients.find(p => p.pet === name)!;

describe('the ward', () => {
  it('shows who is in which bed, and which beds are free or wait to be cleaned', () => {
    const data = createSeed();
    expect(inpatients(data).map(p => p.pet)).toEqual(['Mochi', 'Nala', 'Mali']);
    const icu = bedsOf(data, WARDS[0]);
    expect(icu.map(b => b.state)).toEqual(['free', 'taken', 'free', 'free']);
    expect(freeBeds(data)).not.toContain('C-02');
    expect(stayDay(pet(data, 'Mali').admission!)).toBe(2);
    expect(stayDay(pet(data, 'Mochi').admission!)).toBe(1);

    // Admitting a pet takes a bed and moves it to treatment, at the bed
    const bolt = pet(data, 'Bolt');
    admit(bolt, 'D-01', 'น.สพ. นรินทร์', 'Observation after sedation', 4, 'พ.ส. ณิชา');
    expect(stageKey(bolt)).toBe('treatment');
    expect(bolt.stages[3].loc).toBe('Dog ward · D-01');
    expect(freeBeds(data)).not.toContain('D-01');
  });

  it('tells each dose on the sheet by its time: given, not given with why, due, late or still to come', () => {
    const data = createSeed();
    const mali = pet(data, 'Mali');
    const orders = marOrders(data, mali);
    expect(orders.map(rx => rx.drug.split(' ')[0])).toEqual(['Maropitant', 'Buprenorphine', 'Metronidazole', 'Omeprazole']);
    expect(sheetTimes(orders)).toEqual(['06:00', '08:00', '14:00', '20:00', '22:00']);
    const [maropitant, buprenorphine, metronidazole, omeprazole] = orders;
    expect(slotState(maropitant, '08:00')).toBe('done');
    expect(slotState(omeprazole, '08:00')).toBe('held');
    expect(slotState(metronidazole, '08:00')).toBe('late');
    expect(slotState(buprenorphine, '14:00')).toBe('upcoming');
    expect(slotState(metronidazole, '08:00', '08:30')).toBe('due');
    expect(dosesWaiting(data, mali).map(x => `${x.rx.drug.split(' ')[0]} ${x.slot} ${x.state}`)).toEqual(['Metronidazole 08:00 late']);
    // Mochi's omeprazole at 11:00 is due; Nala's mirtazapine at 12:00 is within the hour
    expect(wardLoad(data)).toEqual({ due: 2, late: 1 });

    recordDose(metronidazole, '08:00', 'refused', 'พ.ส. ณิชา', 'อาเจียนหลังให้ยา');
    expect(slotState(metronidazole, '08:00')).toBe('refused');
    expect(metronidazole.history[0][1]).toContain('อาเจียนหลังให้ยา');
    expect(wardLoad(data)).toEqual({ due: 2, late: 0 });

    // A stopped order leaves the sheet
    stopOrder(omeprazole, 'เริ่มกินได้แล้ว', 'น.สพ. นรินทร์');
    expect(marOrders(data, mali).length).toBe(3);
    expect(marTimes('ทุก 8 ชม.', '05:00')).toEqual(['06:00', '14:00', '22:00']);
    expect(marTimes('ทุก 8 ชม.')).toEqual(['14:00', '22:00']);
    expect(marTimes('วันละ 1 ครั้ง')).toEqual(['11:32']);
    expect(marTimes('ครั้งเดียว', '11:20')).toEqual(['11:20']);
  });

  it('runs a drip at a rate and adds up what it has given through every change', () => {
    const data = createSeed();
    const mali = pet(data, 'Mali');
    // 51 mL/h for 3.5 h, then 40 mL/h for 2 h 2 min
    expect(infusedTotal(mali.admission!.lines[0])).toBe(Math.round(51 * 3.5 + (40 * 122) / 60));
    expect(maintenanceRate(24.5)).toBe(51);

    const line = startInfusion(mali.admission!, 'NaCl 0.9%', 30, 'พ.ส. ณิชา', '10:00');
    infusionEvent(line, 'pause', 'พ.ส. ณิชา', undefined, '10:30');
    expect(line.status).toBe('paused');
    infusionEvent(line, 'resume', 'พ.ส. ณิชา', undefined, '11:00');
    expect(line.rate).toBe(30);
    expect(infusedTotal(line, '11:32')).toBe(15 + 16);
    infusionEvent(line, 'stop', 'พ.ส. ณิชา');
    expect(line.status).toBe('stopped');
    infusionEvent(line, 'resume', 'พ.ส. ณิชา');
    expect(line.status).toBe('stopped');
  });

  it('knows when the next obs are due from the last set taken', () => {
    const data = createSeed();
    expect(nextObs(pet(data, 'Mali'))).toEqual({ at: '10:00', late: true });
    expect(nextObs(pet(data, 'Nala'))).toEqual({ at: '13:10', late: false });
    expect(nextObs(pet(data, 'Bolt'))).toBeNull();
  });

  it('writes a verbal order down as a draft for the sheet, which does nothing until the vet co-signs it', () => {
    const data = createSeed();
    const mochi = pet(data, 'Mochi');
    const rx = verbalOrder(data, mochi, { drug: 'Ondansetron 2 mg', dose: '1/2 เม็ด', route: 'รับประทาน', freq: 'วันละ 2 ครั้ง', days: '3 วัน', vet: 'สพ.ญ. ลลิตา', readBack: true }, 'พ.ส. กมล', []);
    expect(rx.verbal).toBe(true);
    expect(rx.col).toBe('Draft');
    expect(rx.marTimes).toEqual(['20:00']);
    expect(marOrders(data, mochi).map(x => x.id)).not.toContain(rx.id);
    expect(wardChecks(data, mochi).find(c => c.label.includes('คำสั่งวาจา'))?.ok).toBe(false);
  });

  it('lets a pet leave its bed once its lines are stopped and its doses recorded, and bills the stay', () => {
    const data = createSeed();
    const mochi = pet(data, 'Mochi');
    expect(wardChecks(data, mochi).map(c => c.ok)).toEqual([false, false, true]);
    expect(dischargeChecks(data, mochi, defaultNote(mochi)).find(c => c.label === 'ออกจากวอร์ดแล้ว')).toEqual({ label: 'ออกจากวอร์ดแล้ว', ok: false, required: true });

    infusionEvent(mochi.admission!.lines[0], 'stop', 'พ.ส. กมล');
    recordDose(marOrders(data, mochi)[1], '11:00', 'given', 'พ.ส. กมล');
    expect(wardChecks(data, mochi).every(c => c.ok)).toBe(true);

    leaveWard(data, mochi, 'พ.ส. กมล');
    expect(mochi.admission!.out?.by).toBe('พ.ส. กมล');
    expect(stageKey(mochi)).toBe('discharge');
    expect(inpatients(data).map(p => p.pet)).toEqual(['Nala', 'Mali']);
    expect(marOrders(data, mochi)).toEqual([]);
    expect(bedsOf(data, WARDS[2]).find(b => b.bed === 'C-02')?.state).toBe('cleaning');
    bedCleaned(data, 'C-02');
    expect(bedsOf(data, WARDS[2]).find(b => b.bed === 'C-02')?.state).toBe('free');

    // The bed is on the estimate and the bill
    expect(estimateFor(data, mochi).lines.find(l => l[0].startsWith('ค่าห้องพัก'))).toEqual(['ค่าห้องพัก Cat ward C-02 × 1 วัน', '1', 600, 600]);
    const invoice = visitInvoice(data, mochi);
    expect(invoice.title).toContain('IPD stay');
    expect(invoice.items.find(i => i[0].startsWith('ค่าห้องพัก'))?.[1]).toBe(600);
    expect(visitInvoice(data, pet(data, 'Mali')).items.find(i => i[0].startsWith('ค่าห้องพัก'))?.[1]).toBe(1200);
  });
});
