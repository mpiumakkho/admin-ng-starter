/*
 * The drug safety check run while a prescription is written (seph1-docs M21 CDS, seph1-fe screens/CDS.tsx): the dose
 * worked out from the weight, the patient's allergies with cross-reactions, what the species must not have, drugs that
 * clash with what the pet already takes, and the kidneys. Advisory: a finding can be overridden with a reason, and the
 * gravest also need a senior vet's sign-off. Text is kept in its source language and translated where it shows.
 */
import { drugConflict, type DrugItem, FORMULARY, TODAY } from './model';
import type { Patient } from './types';

/** block: contraindicated or toxic, override needs a reason and a senior sign-off; major: a reason; minor: a heads-up */
export type Severity = 'block' | 'major' | 'minor';
export interface CdsFinding {
  kind: 'allergy' | 'species' | 'dose' | 'interaction' | 'duplicate' | 'renal' | 'weight';
  severity: Severity;
  /** Source text with {placeholders}, and what fills them */
  text: string;
  vars?: Record<string, string | number>;
}

/** The dose worked out from the weight: the range for the species, in mg and in the drug's unit, and what was asked for */
export interface DoseCalc {
  kg: number | null;
  range: [number, number] | null;
  /** The range in mg and in units, for this pet */
  mg: [number, number] | null;
  units: [number, number] | null;
  /** What was asked for, per dose */
  askedMg: number | null;
  askedMgKg: number | null;
  /** The middle of the range, rounded to what can be measured out */
  suggested: number | null;
}

export interface CdsResult { calc: DoseCalc; findings: CdsFinding[]; worst: Severity | null }

/** What the override needs: nothing, a reason, or a reason and a senior vet's sign-off */
export const overrideNeeded = (worst: Severity | null): 'none' | 'reason' | 'senior' =>
  worst === 'block' ? 'senior' : worst === 'major' ? 'reason' : 'none';

/** Classes an allergy to one reaches into */
const CROSS: Record<string, { cls: string; label: string }[]> = {
  penicillin: [{ cls: 'cephalosporin', label: 'cephalosporin' }],
  cephalosporin: [{ cls: 'penicillin', label: 'penicillin' }],
};

/** Clashes between drug classes, the gravest first */
const INTERACTIONS: { a: string; b: string; severity: Severity; text: string }[] = [
  { a: 'nsaid', b: 'nsaid', severity: 'major', text: 'NSAID ซ้อนกัน — เสี่ยงแผลในทางเดินอาหารและไตวาย ต้องเว้น washout อย่างน้อย 5–7 วัน' },
  { a: 'nsaid', b: 'corticosteroid', severity: 'major', text: 'NSAID ร่วมกับ corticosteroid — เสี่ยงแผลและเลือดออกในทางเดินอาหาร' },
  { a: 'nsaid', b: 'aminoglycoside', severity: 'major', text: 'NSAID ร่วมกับ aminoglycoside — เพิ่มพิษต่อไต' },
  { a: 'opioid', b: 'antiemetic', severity: 'minor', text: 'Tramadol ร่วมกับ ondansetron — ฤทธิ์แก้ปวดของ tramadol อาจลดลง' },
];

/** What each species must not have, or should have with care */
const SPECIES: { kind: Patient['kind']; cls: string; severity: Severity; text: string }[] = [
  { kind: 'cat', cls: 'paracetamol', severity: 'block', text: 'Paracetamol เป็นพิษร้ายแรงต่อแมวทุกขนาด (methemoglobinemia) — ห้ามใช้' },
  { kind: 'cat', cls: 'jak-inhibitor', severity: 'major', text: 'Oclacitinib (Apoquel) ไม่มีข้อบ่งใช้ในแมว' },
  { kind: 'cat', cls: 'nsaid', severity: 'minor', text: 'NSAID ในแมว — ใช้ระยะสั้นและขนาดต่ำสุด ตรวจค่าไตก่อนและระหว่างใช้' },
  { kind: 'cat', cls: 'tetracycline', severity: 'minor', text: 'Doxycycline ในแมว — ป้อนน้ำตามทันที เสี่ยงหลอดอาหารตีบ' },
];

/** Drugs hard on the kidneys, for a pet with kidney disease on its problem list */
const NEPHROTOXIC = new Set(['nsaid', 'aminoglycoside']);

export const weightKg = (p: Patient): number | null => {
  const kg = parseFloat(p.weight);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
};

/** "1", "0.5", "1/2", "1 1/2" → a number of units, or null */
export function parseUnits(text: string): number | null {
  const s = text.trim();
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(s);
  if (fraction) {
    return Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
  }
  const n = Number(s);
  return s && Number.isFinite(n) && n > 0 ? n : null;
}

/** A dose rounded to what can be measured out: a quarter tablet, a tenth of a mL, a whole drop */
export function roundDose(units: number, unit: string): number {
  const step = unit === 'เม็ด' ? 0.25 : unit === 'mL' ? 0.1 : 1;
  return Math.max(step, Number((Math.round(units / step) * step).toFixed(2)));
}
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** How many times a day a frequency gives; once is a single dose */
export const TIMES_A_DAY: Record<string, number> = {
  'วันละ 1 ครั้ง': 1, 'วันละ 2 ครั้ง': 2, 'วันละ 3 ครั้ง': 3, 'ทุก 8 ชม.': 3, 'ทุก 12 ชม.': 2, 'วันเว้นวัน': 0.5, 'ครั้งเดียว': 0,
};

/** The quantity to dispense: a dose, times a day, for so many days, rounded up to whole units */
export function quantityFor(dose: number, freq: string, days: string, unit: string): string {
  const perDay = TIMES_A_DAY[freq];
  const n = parseInt(days, 10);
  const total = perDay === 0 ? dose : perDay !== undefined && Number.isFinite(n) ? dose * perDay * n : null;
  if (unit === 'หยด') {
    return '1 ขวด';
  }
  if (total === null) {
    return '';
  }
  return `${unit === 'mL' ? fmt(Math.ceil(total * 10) / 10) : Math.ceil(total)} ${unit}`;
}

export function doseCalc(p: Patient, drug: DrugItem, units: number | null): DoseCalc {
  const kg = weightKg(p);
  const range = (p.kind === 'cat' ? drug.cat : p.kind === 'dog' ? drug.dog : undefined) ?? null;
  const mg = kg && range ? [range[0] * kg, range[1] * kg] as [number, number] : null;
  const unitRange = mg && drug.mg ? [mg[0] / drug.mg, mg[1] / drug.mg] as [number, number] : null;
  const askedMg = units !== null && drug.mg ? units * drug.mg : null;
  return {
    kg, range, mg, units: unitRange, askedMg,
    askedMgKg: askedMg !== null && kg ? askedMg / kg : null,
    suggested: unitRange ? roundDose((unitRange[0] + unitRange[1]) / 2, drug.unit) : null,
  };
}

/** Drug classes the pet already takes: today's prescriptions and the medication list, not the drug being written */
function activeClasses(p: Patient, drug: DrugItem, current: string[]): { name: string; cls: string }[] {
  return [...new Set([...p.meds.map(m => m[0]), ...current])]
    .map(name => ({ name, cls: FORMULARY.find(d => d.name === name)?.cls ?? '' }))
    .filter(x => x.cls && x.name !== drug.name);
}

/** Every check on one prescription, the gravest first */
export function checkPrescription(p: Patient, drug: DrugItem, units: number | null, current: string[] = []): CdsResult {
  const findings: CdsFinding[] = [];
  const calc = doseCalc(p, drug, units);

  if (!p.allergyReview && !p.alerts.some(a => a.type === 'allergy' || a.type === 'drug')) {
    findings.push({ kind: 'allergy', severity: 'major', text: 'ตรวจ CDS ไม่ได้ — ยังไม่ได้ทบทวนประวัติแพ้ยาของสัตว์ตัวนี้' });
  }
  const allergy = drugConflict(p, drug);
  if (allergy) {
    findings.push({ kind: 'allergy', severity: 'block', text: 'ขัดกับ clinical alert: {0}', vars: { 0: allergy } });
  }
  for (const cross of CROSS[drug.cls ?? ''] ?? []) {
    const hit = p.alerts.find(a => a.type === 'allergy' && `${a.label} ${a.detail ?? ''}`.toLowerCase().includes(cross.cls));
    if (hit && !allergy) {
      findings.push({ kind: 'allergy', severity: 'major', text: 'แพ้ยากลุ่ม {0} — อาจแพ้ข้ามกลุ่มได้', vars: { 0: cross.label } });
    }
  }
  for (const rule of SPECIES.filter(r => r.kind === p.kind && r.cls === drug.cls)) {
    findings.push({ kind: 'species', severity: rule.severity, text: rule.text });
  }
  if (drug.cls && NEPHROTOXIC.has(drug.cls) && p.problems.some(x => x[2] !== 'ok' && /kidney|ckd|ไต/i.test(x[0]))) {
    findings.push({ kind: 'renal', severity: 'major', text: 'มีโรคไตใน problem list — ยานี้มีพิษต่อไต พิจารณาลดขนาดหรือเลือกยาอื่น' });
  }
  for (const other of activeClasses(p, drug, current)) {
    const rule = INTERACTIONS.find(r => (r.a === drug.cls && r.b === other.cls) || (r.b === drug.cls && r.a === other.cls));
    if (rule) {
      findings.push({ kind: 'interaction', severity: rule.severity, text: '{0} (กับ {1})', vars: { 0: rule.text, 1: other.name } });
    }
  }
  if (p.meds.some(m => m[0] === drug.name) || current.includes(drug.name)) {
    findings.push({ kind: 'duplicate', severity: 'minor', text: 'สัตว์ตัวนี้มียานี้อยู่แล้ว — ตรวจว่าไม่ได้สั่งซ้ำ' });
  }

  if (drug.mg && (drug.dog || drug.cat)) {
    if (calc.kg === null) {
      findings.push({ kind: 'weight', severity: 'major', text: 'ไม่มีน้ำหนักของสัตว์ — คำนวณขนาดยาไม่ได้ ชั่งน้ำหนักก่อนสั่ง' });
    } else if (!p.weightAt.startsWith(TODAY)) {
      findings.push({ kind: 'weight', severity: 'minor', text: 'น้ำหนักล่าสุดชั่งเมื่อ {0} — ชั่งใหม่ก่อนคำนวณขนาดยา', vars: { 0: p.weightAt } });
    }
    if (!calc.range) {
      findings.push({ kind: 'dose', severity: 'major', text: 'ไม่มีขนาดยาอ้างอิงสำหรับสัตว์ชนิดนี้' });
    } else if (calc.askedMgKg !== null) {
      const [min, max] = calc.range;
      const v = calc.askedMgKg;
      if (v > max * 2) {
        findings.push({ kind: 'dose', severity: 'block', text: 'ขนาดยาเกินช่วงอ้างอิงมากกว่า 2 เท่า ({0} mg/kg · ช่วง {1}–{2}) — อาจเป็นพิษ', vars: { 0: fmt(v), 1: fmt(min), 2: fmt(max) } });
      } else if (v > max * 1.001) {
        findings.push({ kind: 'dose', severity: 'major', text: 'ขนาดยาสูงกว่าช่วงอ้างอิง ({0} mg/kg · ช่วง {1}–{2})', vars: { 0: fmt(v), 1: fmt(min), 2: fmt(max) } });
      } else if (v < min * 0.999) {
        findings.push({ kind: 'dose', severity: 'minor', text: 'ขนาดยาต่ำกว่าช่วงอ้างอิง ({0} mg/kg · ช่วง {1}–{2})', vars: { 0: fmt(v), 1: fmt(min), 2: fmt(max) } });
      }
    }
  }

  const order: Severity[] = ['block', 'major', 'minor'];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return { calc, findings, worst: findings[0]?.severity ?? null };
}
