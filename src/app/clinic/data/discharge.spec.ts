import { dischargeChecks, encounterNo, followUpAppointment, followUpDate, needsFollowUp, visitInvoice } from './discharge';
import { defaultNote } from './model';
import { createSeed } from './seed';
import type { ClinicData, Patient } from './types';

const pet = (data: ClinicData, name: string): Patient => data.patients.find(p => p.pet === name)!;

describe('discharge', () => {
  it('numbers the encounter and dates the follow-up from the plan', () => {
    const bolt = pet(createSeed(), 'Bolt');
    expect(encounterNo(bolt)).toBe('E-260924-05');
    expect(followUpDate('นัดติดตาม 7 วัน')).toBe('2026-10-01');
    expect(needsFollowUp('ไม่ต้องนัด')).toBe(false);
    expect(needsFollowUp('นัดตามผลตรวจ')).toBe(true);
  });

  it('holds discharge until the SOAP is signed, the summary and home care are written and the follow-up is booked', () => {
    const data = createSeed();
    const bolt = pet(data, 'Bolt');
    const n = defaultNote(bolt);
    const missing = () => dischargeChecks(data, bolt, n).filter(c => c.required && !c.ok).map(c => c.label);
    expect(missing()).toEqual(['ลงนาม SOAP แล้ว', 'จองนัดติดตามแล้ว']);
    n.status = 'signed';
    const a = followUpAppointment(data, bolt, '2026-10-01', '10:00–12:00', 'Recheck');
    n.followupAt = a.id;
    expect(missing()).toEqual([]);
    // Carprofen is still with the pharmacy: a reminder, not a stop
    expect(dischargeChecks(data, bolt, n).find(c => !c.ok)?.required).toBe(false);
  });

  it('books the follow-up with the pet\'s vet in the room it was seen in', () => {
    const data = createSeed();
    const a = followUpAppointment(data, pet(data, 'Bolt'), '2026-10-01', '10:00–12:00', 'Lameness recheck');
    expect(a).toEqual(expect.objectContaining({ pet: 'Bolt', owner: 'Patcharee L.', provider: 'น.สพ. นรินทร์', room: 'Exam Room 2', time: '10:00', state: 'Confirmed' }));
    expect(data.appointments.some(x => x.id === a.id)).toBe(false);
  });

  it('bills the consultation, the orders carried out or under way, and the drugs', () => {
    const data = createSeed();
    const invoice = visitInvoice(data, pet(data, 'Bolt'));
    // The CBC is still a draft: not billed. The X-ray is billed at its lower price.
    expect(invoice.items.map(i => i[0])).toEqual(['Consultation — General', 'Right hind limb X-ray', 'Carprofen 25 mg · 10 เม็ด']);
    expect(invoice.total).toBe(450 + 900 + 320);
    expect(invoice.no).toBe('INV-2609-0159');
    expect(invoice.paid).toBe(0);
  });
});
