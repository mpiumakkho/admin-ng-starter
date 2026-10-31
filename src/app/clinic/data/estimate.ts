/*
 * The estimate an owner approves before treatment, worked out from what the visit has: the consultation, today's orders
 * and today's prescriptions; and the treatment consent they sign against it (seph1-fe screens/FrontDesk.tsx
 * ScreenEstimate). An approved estimate is kept as it was; when the visit grows past it the owner approves again.
 */
import { amount } from './dispense';
import { FORMULARY, TODAY } from './model';
import { bedCharge } from './ward';
import type { ClinicData, EstimateLine, Patient } from './types';

/** Every visit starts with the consultation */
export const CONSULTATION: EstimateLine = ['Consultation — General', '1', 450, 450];

/** "฿900–1,200" → 900 and 1,200; "฿850" → 850 both */
export function priceRange(price: string): [number, number] {
  const [low, high] = price.replace(/[^\d,–-]/g, '').split(/[–-]/).map(x => Number(x.replace(/,/g, '')) || 0);
  return [low, high || low];
}

export interface Estimate { no: string; lines: EstimateLine[]; min: number; max: number }

/** The estimate for today's visit as it stands now */
export function estimateFor(data: ClinicData, p: Patient): Estimate {
  const owner = data.owners[p.ownerKey]?.name;
  const lines: EstimateLine[] = [CONSULTATION];
  for (const o of data.orders.filter(x => x.pet === p.pet && x.time.startsWith(TODAY) && x.col !== 'Cancelled')) {
    const [min, max] = priceRange(o.price);
    lines.push([o.name, '1', min, max]);
  }
  for (const rx of data.prescriptions.filter(x => x.pet === p.pet && x.owner === owner && !(x.verbal && !x.cosignedBy))) {
    const drug = FORMULARY.find(d => d.name === rx.drug);
    const n = amount(rx.qty)?.n ?? 1;
    const cost = drug ? (drug.unit === 'หยด' ? drug.price : Math.round(drug.price * n)) : 0;
    lines.push([rx.drug, rx.qty, cost, cost]);
  }
  if (p.admission) {
    const [name, amount] = bedCharge(p.admission);
    lines.push([name, '1', amount, amount]);
  }
  return {
    no: `EST-${TODAY.slice(2).replace(/-/g, '')}-${String(p.id).padStart(2, '0')}`,
    lines,
    min: lines.reduce((sum, l) => sum + l[2], 0),
    max: lines.reduce((sum, l) => sum + l[3], 0),
  };
}

/** The visit has grown past what the owner approved: they approve again before more is done */
export const needsReapproval = (p: Patient, now: Estimate): boolean => !!p.estimate && now.max > p.estimate.max;

/** What the consent covers: everything on the estimate but the consultation */
export const consentItems = (estimate: Pick<Estimate, 'lines'>): string[] => estimate.lines.slice(1).map(l => l[0]);

/** The pet is not to be resuscitated: its alerts say DNR */
export const isDnr = (p: Patient) => p.alerts.some(a => a.type === 'dnr');

/** How the owner approved the estimate */
export const APPROVAL_CHANNELS = ['ที่โรงพยาบาล', 'โทรศัพท์', 'LINE'];
/** Who can sign the consent for the pet */
export const SIGNER_RELATIONS = ['เจ้าของ', 'ผู้ร่วมเป็นเจ้าของ', 'ผู้ได้รับมอบหมายจากเจ้าของ'];
