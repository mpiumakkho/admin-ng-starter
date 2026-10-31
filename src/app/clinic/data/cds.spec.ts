import { checkPrescription, doseCalc, overrideNeeded, parseUnits, quantityFor, roundDose } from './cds';
import { FORMULARY } from './model';
import { createSeed } from './seed';
import type { ClinicData, Patient } from './types';

const pet = (data: ClinicData, name: string): Patient => data.patients.find(p => p.pet === name)!;
const drug = (name: string) => FORMULARY.find(d => d.name.startsWith(name))!;
const kinds = (r: ReturnType<typeof checkPrescription>) => r.findings.map(f => `${f.kind}:${f.severity}`);

describe('the drug safety check', () => {
  it('reads a dose as a number of units, fractions too', () => {
    expect(parseUnits('1')).toBe(1);
    expect(parseUnits('0.5')).toBe(0.5);
    expect(parseUnits('1/2')).toBe(0.5);
    expect(parseUnits('1 1/2')).toBe(1.5);
    expect(parseUnits('')).toBeNull();
    expect(parseUnits('abc')).toBeNull();
  });

  it('works out the dose from the weight, rounded to what can be measured out', () => {
    const bolt = pet(createSeed(), 'Bolt');
    // 9.8 kg × 2–4.4 mg/kg of a 25 mg tablet = 0.78–1.72 tablets, the middle rounded to a quarter
    const calc = doseCalc(bolt, drug('Carprofen'), 1);
    expect(calc.mg?.map(n => Math.round(n * 10) / 10)).toEqual([19.6, 43.1]);
    expect(calc.suggested).toBe(1.25);
    expect(Math.round(calc.askedMgKg! * 100) / 100).toBe(2.55);
    expect(roundDose(0.33, 'mL')).toBe(0.3);
    expect(quantityFor(1, 'วันละ 2 ครั้ง', '5 วัน', 'เม็ด')).toBe('10 เม็ด');
    expect(quantityFor(0.5, 'ครั้งเดียว', '—', 'เม็ด')).toBe('1 เม็ด');
  });

  it('blocks an allergy, and warns of the class it reaches into', () => {
    const bolt = pet(createSeed(), 'Bolt');
    expect(kinds(checkPrescription(bolt, drug('Amoxicillin-clavulanate'), 1))).toContain('allergy:block');
    const cefalexin = checkPrescription(bolt, drug('Cefalexin'), 1);
    expect(kinds(cefalexin)).toContain('allergy:major');
    expect(overrideNeeded(cefalexin.worst)).toBe('reason');
  });

  it('knows what a cat must not have, and what it should have with care', () => {
    const mochi = pet(createSeed(), 'Mochi');
    const paracetamol = checkPrescription(mochi, drug('Paracetamol'), 0.25);
    expect(kinds(paracetamol)).toContain('species:block');
    expect(overrideNeeded(paracetamol.worst)).toBe('senior');
    expect(kinds(checkPrescription(mochi, drug('Meloxicam'), 0.2))).toContain('species:minor');
  });

  it('finds a clash with what the pet already takes, and the same drug twice', () => {
    const bolt = pet(createSeed(), 'Bolt');
    // Bolt is on carprofen: another NSAID or a steroid clashes with it
    expect(kinds(checkPrescription(bolt, drug('Meloxicam'), 1))).toContain('interaction:major');
    expect(kinds(checkPrescription(bolt, drug('Prednisolone'), 2))).toContain('interaction:major');
    expect(kinds(checkPrescription(bolt, drug('Carprofen'), 1))).toContain('duplicate:minor');
  });

  it('warns of a drug hard on the kidneys for a pet with kidney disease', () => {
    const data = createSeed();
    const ckd = data.patients.find(p => p.problems.some(x => /kidney/i.test(x[0])) && p.kind === 'cat')!;
    expect(kinds(checkPrescription(ckd, drug('Gentamicin'), 0.5))).toContain('renal:major');
  });

  it('grades a dose above the range, far above it and below it', () => {
    const bolt = pet(createSeed(), 'Bolt');
    const omeprazole = drug('Omeprazole');
    // 9.8 kg: 0.5–1.5 mg/kg of 10 mg tablets
    expect(checkPrescription(bolt, omeprazole, 1).findings.filter(f => f.kind === 'dose')).toEqual([]);
    expect(kinds(checkPrescription(bolt, omeprazole, 2))).toContain('dose:major');
    expect(kinds(checkPrescription(bolt, omeprazole, 4))).toContain('dose:block');
    expect(kinds(checkPrescription(bolt, omeprazole, 0.25))).toContain('dose:minor');
  });

  it('says when the weight is old, and that an allergy history nobody reviewed is not "no allergies"', () => {
    const data = createSeed();
    const old = data.patients.find(p => !p.weightAt.startsWith('2026-09-24'))!;
    expect(kinds(checkPrescription(old, drug('Omeprazole'), 0.5))).toContain('weight:minor');
    const unreviewed = { ...pet(data, 'Bolt'), alerts: [], allergyReview: undefined };
    expect(kinds(checkPrescription(unreviewed, drug('Omeprazole'), 0.5))).toContain('allergy:major');
  });
});
