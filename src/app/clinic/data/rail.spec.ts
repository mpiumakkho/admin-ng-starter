import {
  baht, consentState, nextAppointment, openInvoices, outstanding, pastVisits, priceOf, railBadges, resultsNewestFirst, resultsToReview, runningBill,
  visitRecords,
} from './rail';
import { createSeed } from './seed';
import type { ClinicData, Patient } from './types';

const pet = (data: ClinicData, name: string): Patient => data.patients.find(p => p.pet === name)!;

describe('the context rail', () => {
  it('counts alerts, active problems, current medications, vaccines due and documents', () => {
    const data = createSeed();
    const bolt = pet(data, 'Bolt');
    const badges = railBadges(data, bolt);
    expect(badges.alerts).toEqual({ count: bolt.alerts.length, text: String(bolt.alerts.length), tone: 'danger' });
    expect(badges.problems?.count).toBe(bolt.problems.filter(x => x[2] !== 'ok').length);
    expect(badges.meds?.count).toBe(bolt.meds.length);
    expect(badges.docs).toEqual({ count: 2, text: '2', tone: 'neutral' });

    // A resolved problem is not counted
    bolt.problems.push(['Otitis externa', 'หายแล้ว 2026-02', 'ok']);
    expect(railBadges(data, bolt).problems?.count).toBe(badges.problems?.count);
  });

  it('counts only results not acknowledged that are abnormal or critical, in danger when one is critical', () => {
    const data = createSeed();
    // Bolt's new CBC is within range: nothing to look at
    expect(resultsToReview(data, pet(data, 'Bolt'))).toEqual([]);
    expect(railBadges(data, pet(data, 'Bolt')).results).toBeUndefined();

    // Nala's potassium is critical
    expect(railBadges(data, pet(data, 'Nala')).results).toEqual({ count: 1, text: '1', tone: 'danger' });

    // An abnormal value, not critical: counted, not in danger; acknowledged, gone
    const cbc = data.results.find(r => r.id === 'R2')!;
    cbc.values[0][3] = 1;
    expect(railBadges(data, pet(data, 'Bolt')).results).toEqual({ count: 1, text: '1', tone: 'primary' });
    cbc.ack = true;
    expect(railBadges(data, pet(data, 'Bolt')).results).toBeUndefined();
  });

  it('lists the patient\'s results from every visit, newest first', () => {
    const data = createSeed();
    expect(resultsNewestFirst(data, pet(data, 'Bolt')).map(r => r.id)).toEqual(['R2', 'R6']);
  });

  it('counts the owner\'s unpaid bills and what is still owed', () => {
    const data = createSeed();
    const bolt = pet(data, 'Bolt');
    expect(openInvoices(data, bolt.ownerKey).map(i => i.no)).toEqual(['INV-2609-0112']);
    expect(outstanding(data, bolt.ownerKey)).toBe(1450);
    expect(railBadges(data, bolt).billing?.count).toBe(1);
    expect(baht(1450)).toBe('฿1,450');

    // Paid in full: no badge
    data.invoices.find(i => i.no === 'INV-2609-0112')!.paid = 2450;
    expect(railBadges(data, bolt).billing).toBeUndefined();
    expect(railBadges(data, pet(data, 'Khao Niao')).billing?.count).toBe(1);
  });

  it('adds up today\'s orders as the running bill, at the lower price of a range', () => {
    const data = createSeed();
    expect(priceOf('฿900–1,200')).toBe(900);
    expect(priceOf('฿1,250')).toBe(1250);
    const bill = runningBill(data, pet(data, 'Bolt'))!;
    expect(bill.lines.map(l => l[0])).toEqual(['CBC + Blood chemistry', 'Right hind limb X-ray']);
    expect(bill.total).toBe(2150);
    expect(runningBill(data, pet(data, 'Coco'))).toBeNull();
  });

  it('shows "!" on consent when it is missing, waiting to be signed, withdrawn or expired', () => {
    const data = createSeed();
    expect(railBadges(data, pet(data, 'Bolt')).consent).toBeUndefined();
    expect(railBadges(data, pet(data, 'Khao Niao')).consent).toEqual({ count: 1, text: '!', tone: 'danger' });
    const owner = data.owners['Patcharee L.'];
    for (const [text, state] of [
      ['—', 'missing'], ['', 'missing'], ['รอลงนาม', 'pending'], ['ถอนความยินยอม 2026-09-20', 'withdrawn'], ['หมดอายุ · ลงนาม 2025-01-12', 'expired'],
    ] as const) {
      owner.consent = text;
      expect(consentState(owner)).toBe(state);
      expect(railBadges(data, pet(data, 'Bolt')).consent?.text).toBe('!');
    }
  });

  it('opens a past visit with its documents, results and bill, and finds the next appointment', () => {
    const data = createSeed();
    const bolt = pet(data, 'Bolt');
    expect(pastVisits(bolt).map(v => v.date)).toEqual(['2026-09-11', '2026-07-02', '2025-10-19']);
    expect(pastVisits(bolt)[0]).toEqual({ date: '2026-09-11', title: 'Lameness recheck', vet: 'น.สพ. นรินทร์' });
    const visit = visitRecords(data, bolt, '2026-09-11');
    expect(visit.docs.map(d => d.doc[0])).toEqual(['Lameness report 2026-09-11']);
    expect(visit.results.map(r => r.id)).toEqual(['R6']);
    expect(visit.invoice?.no).toBe('INV-2609-0112');
    expect(visit.status).toBe('Completed');
    expect(nextAppointment(data, bolt)?.date).toBe('2026-09-26');
    expect(nextAppointment(data, pet(data, 'Coco'))).toBeUndefined();
  });
});
