import { CONSULTATION, consentItems, estimateFor, needsReapproval, priceRange } from './estimate';
import { syncHandoff } from './model';
import { createSeed } from './seed';
import type { ClinicData, Patient } from './types';

const pet = (data: ClinicData, name: string): Patient => data.patients.find(p => p.pet === name)!;

describe('the estimate and the consent', () => {
  it('reads a price and a price range', () => {
    expect(priceRange('฿850')).toEqual([850, 850]);
    expect(priceRange('฿900–1,200')).toEqual([900, 1200]);
  });

  it('is worked out from the consultation, today\'s orders and today\'s prescriptions', () => {
    const data = createSeed();
    const bolt = pet(data, 'Bolt');
    const e = estimateFor(data, bolt);
    expect(e.lines[0]).toEqual(CONSULTATION);
    // Carprofen: 10 tablets at ฿32
    expect(e.lines).toContainEqual(['Carprofen 25 mg', '10 เม็ด', 320, 320]);
    expect(e.min).toBe(e.lines.reduce((sum, l) => sum + l[2], 0));
    expect(consentItems(e)).not.toContain(CONSULTATION[0]);
  });

  it('asks the owner again once the visit grows past what they approved', () => {
    const data = createSeed();
    const bolt = pet(data, 'Bolt');
    // Bolt is in the room: approved at check-in, as the seed has it
    expect(bolt.estimate).toBeDefined();
    expect(needsReapproval(bolt, estimateFor(data, bolt))).toBe(false);
    data.orders.push({ ...data.orders[0], id: 'O99', pet: 'Bolt', name: 'Abdominal ultrasound', price: '฿1,500', col: 'Accepted', time: '2026-09-24 11:32' });
    expect(needsReapproval(bolt, estimateFor(data, bolt))).toBe(true);
  });

  it('is not approved or signed by moving the pet on', () => {
    const data = createSeed();
    const early = data.patients.find(p => !p.estimate)!;
    early.stages.forEach(s => { s.at ??= '11:30'; });
    syncHandoff(early);
    expect(early.handoff.estimate.state).toBe('active');
    expect(early.handoff.consent.state).not.toBe('done');
  });
});
