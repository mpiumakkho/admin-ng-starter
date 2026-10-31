import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { ClinicUi, type DialogField } from './clinic-ui';
import { ClinicStore } from './clinic.store';
import {
  ACK_METHODS, addDays, CRITICAL_RULE, formatDate, LOCATIONS, NOW, NURSES, ORDER_FLOW, REASON_MIN, RX_DAYS, RX_FREQS, SLOTS, STAGES, stageIndex,
  TODAY, TRIAGE, VETS,
} from './data/model';
import { batchProblem, fefo, isControlled, VERIFY_CHECKS, witnessesFor } from './data/dispense';
import { dischargeChecks, encounterNo, followUpDate, followUpOf, PAYMENT_METHODS, visitInvoice } from './data/discharge';
import { APPROVAL_CHANNELS, estimateFor } from './data/estimate';
import { baht } from './data/rail';
import { BOOSTERS, PROBLEM_STATUS, vaccinate, VACCINES, withdrawAlert } from './data/record';
import { draftFromRecord, petRecords } from './data/registration';
import type { AckMethod, AlertType, DoseOutcome, Infusion, Invoice, LabResult, Order, Patient, Prescription, StageKey, Tone } from './data/types';
import {
  canGive, DOSE_OUTCOMES, FIVE_RIGHTS, FLUIDS, freeBeds, HOLD_REASONS, inWard, maintenanceRate, OBS_EVERY, wardChecks, wardOf,
} from './data/ward';
import { weightKg } from './data/cds';
import { FORMULARY } from './data/model';
import { ClinicI18n } from './i18n/clinic-i18n';
import { RegistrationForm } from './registration-form';
import {
  CERTIFICATE_PURPOSES, printCertificate, printConsent, printDischarge, printDrugLabel, printEstimate, printReceipt, printTreatmentSheet,
} from './shared/documents';

const reasonCheck = (v: string) => (v.trim().length >= REASON_MIN ? null : 'อย่างน้อย {n} ตัวอักษร — ข้อความนี้คือหลักฐานตรวจสอบ');

/**
 * What the workspace's buttons do, when a decision needs a dialog first (the design's features/workflow.tsx,
 * features/actions.tsx and features/patientEdit.tsx). Each asks, changes the store, then says what happened.
 */
@Injectable({ providedIn: 'root' })
export class ClinicActions {
  private readonly store = inject(ClinicStore);
  private readonly ui = inject(ClinicUi);
  private readonly i18n = inject(ClinicI18n);
  private readonly router = inject(Router);
  private readonly registration = inject(RegistrationForm);

  /* Patients and visits */

  /** Opens today's encounter of a pet */
  startEncounter(p: Patient) {
    this.ui.closeSheet();
    this.store.select(p);
    this.router.navigate(['/clinic/encounter']);
  }

  /** The pet's record and its owner's on the registration tab, where the desk keeps them, consent to the data too */
  openInRegistry(p: Patient) {
    const data = this.store.data();
    const record = petRecords(data).find(r => r.patient?.id === p.id);
    if (record) {
      this.registration.load(record, draftFromRecord(data, record));
    }
    this.ui.closeSheet();
    this.router.navigate(['/clinic/register']);
  }

  moveStage(p: Patient) {
    const next = STAGES[Math.min(stageIndex(p) + 1, STAGES.length - 1)];
    this.ui.ask({
      title: `ย้ายขั้นตอน · ${p.pet}`,
      intro: ['ตำแหน่งปัจจุบันจะบันทึกเวลา ณ ขณะนี้และผู้ย้าย'],
      fields: [
        { name: 'stage', label: 'ขั้นตอน', type: 'select', value: next.key, options: STAGES.map(s => ({ value: s.key, label: s.label })) },
        { name: 'loc', label: 'ตำแหน่ง', type: 'select', value: p.stages.find(s => s.key === next.key)?.loc ?? LOCATIONS[0], options: LOCATIONS.map(l => ({ value: l, label: l })) },
      ],
      confirmLabel: 'ย้ายขั้นตอน',
      onConfirm: v => {
        this.store.moveStage(p, v['stage'] as StageKey, v['loc']);
        this.ui.toast('{pet} → {stage} · {loc}', { pet: p.pet, stage: this.i18n.t(STAGES.find(s => s.key === v['stage'])!.label), loc: this.i18n.t(v['loc']) });
      },
    });
  }

  assign(p: Patient) {
    this.ui.ask({
      title: `Assign · ${p.pet}`,
      fields: [
        { name: 'vet', label: 'สัตวแพทย์', type: 'select', value: p.vet, options: VETS.map(v => ({ value: v, label: v })) },
        { name: 'nurse', label: 'พยาบาล', type: 'select', value: p.nurse, options: NURSES.map(n => ({ value: n, label: n })) },
      ],
      confirmLabel: 'บันทึก',
      onConfirm: v => {
        this.store.assign(p, v['vet'], v['nurse']);
        this.ui.toast('มอบหมาย {pet} ให้ {vet} และ {nurse} แล้ว', { pet: p.pet, vet: this.i18n.t(v['vet']), nurse: this.i18n.t(v['nurse']) });
      },
    });
  }

  callOwner(p: Patient) {
    const o = this.store.owner(p);
    this.ui.ask({
      title: `โทรหาเจ้าของ · ${o.name}`,
      facts: [['เบอร์หลัก', o.phone], ['เบอร์สำรอง', o.phone2], ['ช่องทางที่ต้องการ', o.prefer]],
      fields: [{
        name: 'outcome', label: 'ผลการติดต่อ', type: 'select',
        options: ['ติดต่อได้', 'ไม่รับสาย', 'ฝากข้อความ'].map(x => ({ value: x, label: x })),
      }],
      confirmLabel: 'บันทึกการโทร',
      onConfirm: v => this.ui.toast('บันทึกการโทรหา {owner} · {outcome}', { owner: o.name, outcome: this.i18n.t(v['outcome']) }),
    });
  }

  sendMessage(p: Patient, subject: string, text: string, onSent?: (channel: string) => void) {
    const o = this.store.owner(p);
    this.ui.ask({
      title: `ส่งถึงเจ้าของ · ${o.name}`,
      intro: ['จำลองการส่ง — ยังไม่ได้เชื่อมต่อ LINE OA / SMS / อีเมล'],
      fields: [
        { name: 'channel', label: 'ช่องทาง', type: 'select', value: ['LINE', 'SMS', 'Email'].includes(o.prefer) ? o.prefer : 'SMS', options: ['LINE', 'SMS', 'Email'].map(c => ({ value: c, label: c })) },
        { name: 'subject', label: 'เรื่อง', type: 'input', value: this.i18n.t(subject) },
        { name: 'text', label: 'ข้อความ', type: 'textarea', value: text },
      ],
      confirmLabel: 'ส่ง',
      onConfirm: v => {
        onSent?.(v['channel']);
        this.ui.toast('ส่ง {subject} ถึง {owner} ทาง {channel} แล้ว', { subject: v['subject'], owner: o.name, channel: v['channel'] });
      },
    });
  }

  addAlert(p: Patient) {
    const types: AlertType[] = ['allergy', 'drug', 'handling', 'dnr', 'isolation', 'pregnancy'];
    const names: Record<AlertType, string> = { allergy: 'Allergy', drug: 'Drug caution', handling: 'Handling', dnr: 'DNR', isolation: 'Isolation', pregnancy: 'Pregnancy' };
    this.ui.ask({
      title: `เพิ่ม clinical alert · ${p.pet}`,
      fields: [
        { name: 'type', label: 'ประเภท', type: 'select', options: types.map(t => ({ value: t, label: names[t] })) },
        { name: 'label', label: 'หัวข้อ', type: 'input', placeholder: 'เช่น Allergy · Cefalexin' },
        { name: 'detail', label: 'รายละเอียด', type: 'textarea', optional: true },
      ],
      confirmLabel: 'เพิ่ม alert',
      onConfirm: v => {
        const type = v['type'] as AlertType;
        this.store.mutate(() => {
          p.alerts.push({ type, label: v['label'].trim(), detail: v['detail'].trim() || undefined, recordedBy: this.store.userName(), verifiedBy: this.store.userName(), verifiedAt: NOW });
        });
        this.ui.toast('เพิ่ม alert ของ {pet} แล้ว · แสดงบน patient banner และในแถวคิว', { pet: p.pet });
      },
    });
  }

  addProblem(p: Patient) {
    this.ui.ask({
      title: `เพิ่ม problem · ${p.pet}`,
      fields: [
        { name: 'name', label: 'Problem', type: 'input', placeholder: 'เช่น Right hind limb lameness' },
        { name: 'note', label: 'หมายเหตุ', type: 'input', optional: true, value: 'Active · วันนี้' },
      ],
      confirmLabel: 'เพิ่ม problem',
      onConfirm: v => {
        this.store.mutate(() => { p.problems.push([v['name'].trim(), v['note'].trim() || 'Active · วันนี้', 'warn']); });
        this.ui.toast('เพิ่ม problem ของ {pet} แล้ว', { pet: p.pet });
      },
    });
  }

  recordWeight(p: Patient) {
    const last = parseFloat(p.weight);
    this.ui.ask({
      title: `บันทึกน้ำหนัก · ${p.pet}`,
      facts: [['น้ำหนักล่าสุด', `${p.weight} · ${p.weightAt}`]],
      fields: [{
        name: 'kg', label: 'น้ำหนัก (kg)', type: 'input', placeholder: 'เช่น 9.6',
        validate: v => (/^\d{1,3}(\.\d{1,2})?$/.test(v.trim()) && Number(v) > 0 ? null : 'ใส่ตัวเลข เช่น 9.6'),
      }],
      after: 'น้ำหนักที่เปลี่ยนเกิน 10% จากครั้งก่อนจะแจ้งเตือนให้ตรวจสอบ',
      confirmLabel: 'บันทึกน้ำหนัก',
      onConfirm: v => {
        const kg = Number(v['kg']);
        this.store.recordWeight(p, String(kg));
        const change = last ? Math.abs(kg - last) / last : 0;
        this.ui.toast(change > 0.1 ? 'บันทึก {kg} kg · เปลี่ยนจากครั้งก่อนเกิน 10% — ตรวจสอบอีกครั้ง' : 'บันทึกน้ำหนัก {pet} {kg} kg แล้ว', { kg, pet: p.pet }, change > 0.1 ? 'info' : 'success');
      },
    });
  }

  setTriage(p: Patient, value: string) {
    const triage = TRIAGE.find(t => t.value === value);
    if (triage) {
      this.store.mutate(() => { p.triage = triage.value; p.triageCls = triage.cls; });
    }
  }

  /* Encounter */

  signNote(p: Patient) {
    const n = this.store.noteFor(p);
    if (n.status === 'signed') {
      this.ui.toast('ลงนาม SOAP แล้ว · {by} {at} — ไม่เปลี่ยนแปลง', { by: this.i18n.t(n.signedBy ?? ''), at: n.signedAt ?? '' }, 'info');
      return;
    }
    if (!this.store.canSign(p)) {
      this.ui.toast('ต้องมีข้อมูลอย่างน้อยหนึ่งช่องใน S/O/A/P ก่อนลงนาม', undefined, 'info');
      return;
    }
    this.ui.ask({
      title: `ลงนาม SOAP · ${p.pet}`,
      intro: ['เมื่อลงนาม ช่อง Subjective / Objective / Assessment & Plan จะถูกล็อก แก้ไขไม่ได้อีก (การแก้ไขภายหลังต้องทำเป็น addendum) · Intake, Vitals และ Discharge ยังบันทึกต่อได้'],
      confirmLabel: 'ลงนาม',
      onConfirm: () => {
        this.store.signNote(p);
        this.ui.toast('ลงนาม SOAP แล้ว — บันทึกถูกล็อก');
      },
    });
  }

  /** Closes the encounter and sends the pet home, once what discharge needs is done (data/discharge.ts) */
  closeEncounter(p: Patient) {
    const checks = dischargeChecks(this.store.data(), p, this.store.noteFor(p));
    const missing = checks.filter(c => c.required && !c.ok).map(c => this.i18n.t(c.label));
    const bill = visitInvoice(this.store.data(), p);
    this.ui.ask({
      title: `ปิด encounter และจำหน่าย · ${p.pet}`,
      tone: 'danger',
      intro: ['เมื่อปิด เวชระเบียนของ visit นี้ทั้งชุดจะล็อกและสั่งยาเพิ่มไม่ได้ สัตว์ย้ายไปขั้นจำหน่าย และออกใบแจ้งหนี้ให้เจ้าของ · ย้อนกลับไม่ได้'],
      facts: [...checks.map(c => [c.label, c.ok ? '✓' : c.required ? '✗ ต้องทำก่อน' : '— ยังไม่ครบ'] as [string, string]), ['ใบแจ้งหนี้', baht(bill.total)]],
      warning: missing.length ? this.i18n.t('ยังจำหน่ายไม่ได้: {0}', { 0: missing.join(', ') }) : undefined,
      fields: [{
        name: 'confirm', label: 'ตรวจทานเวชระเบียนและเอกสารจำหน่ายแล้ว', type: 'checkbox',
        validate: v => (missing.length ? 'ทำรายการที่ต้องทำก่อนให้ครบ' : v === 'yes' ? null : 'ต้องยืนยันข้อนี้'),
      }],
      confirmLabel: 'ปิด encounter และจำหน่าย',
      onConfirm: () => {
        const invoice = this.store.closeEncounter(p);
        this.ui.toast('จำหน่าย {pet} แล้ว · ใบแจ้งหนี้ {no} {total}', { pet: p.pet, no: invoice.no, total: baht(invoice.total) });
      },
    });
  }

  /** A follow-up visit on the day the plan says, in the slot the owner picks */
  bookFollowUp(p: Patient) {
    const n = this.store.noteFor(p);
    this.ui.ask({
      title: `จองนัดติดตาม · ${p.pet}`,
      facts: [['ผู้ให้บริการ', p.vet], ['ตามแผน', n.followup]],
      fields: [
        { name: 'date', label: 'วันที่ (YYYY-MM-DD)', type: 'input', value: followUpDate(n.followup), validate: v => (/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && v.trim() > TODAY ? null : 'ใส่วันที่หลังวันนี้ เช่น 2026-10-01') },
        { name: 'slot', label: 'ช่วงเวลา', type: 'select', value: SLOTS[1], options: SLOTS.map(s => ({ value: s, label: s })) },
        { name: 'reason', label: 'เหตุผล', type: 'input', value: n.dx || p.reason },
      ],
      confirmLabel: 'จองนัด',
      onConfirm: v => {
        const a = this.store.bookFollowUp(p, v['date'].trim(), v['slot'], v['reason'].trim());
        this.ui.toast('จองนัดติดตาม {pet} {date} {slot} แล้ว · {id}', { pet: p.pet, date: formatDate(a.date, 'short', this.i18n.lang()), slot: a.slot, id: a.id });
      },
    });
  }

  /** Takes a payment on an invoice, and prints the receipt when asked */
  pay(invoice: Invoice) {
    const due = invoice.total - invoice.paid;
    this.ui.ask({
      title: `รับชำระ · ${invoice.no}`,
      facts: [['ผู้ป่วย', invoice.pet], ['รายการ', invoice.title], ['ยอดคงค้าง', baht(due)]],
      fields: [
        { name: 'amount', label: 'จำนวนเงิน (บาท)', type: 'input', value: String(due), validate: v => (Number(v) > 0 && Number(v) <= due ? null : 'ใส่จำนวนเงินไม่เกินยอดคงค้าง') },
        { name: 'method', label: 'วิธีชำระ', type: 'select', options: PAYMENT_METHODS.map(m => ({ value: m, label: m })) },
        { name: 'receipt', label: 'พิมพ์ใบเสร็จ', type: 'checkbox', value: 'yes', optional: true },
      ],
      confirmLabel: 'รับชำระ',
      onConfirm: v => {
        this.store.pay(invoice, Number(v['amount']), v['method']);
        if (v['receipt'] === 'yes') {
          this.printReceipt(invoice);
        }
        this.ui.toast('รับชำระ {amount} · {no}', { amount: baht(Number(v['amount'])), no: invoice.no });
      },
    });
  }

  printReceipt(invoice: Invoice) {
    printReceipt(invoice, this.store.data().owners[invoice.ownerKey], (key, vars) => this.i18n.t(key, vars), this.i18n.lang());
  }

  /** The discharge summary, with the drugs to give at home and the follow-up */
  printDischarge(p: Patient) {
    const d = this.store.data();
    const rxs = d.prescriptions.filter(rx => rx.pet === p.pet && rx.owner === this.store.owner(p).name && !(rx.verbal && !rx.cosignedBy));
    printDischarge(p, this.store.owner(p), this.store.noteFor(p), rxs, followUpOf(d, this.store.noteFor(p)), encounterNo(p), (key, vars) => this.i18n.t(key, vars), this.i18n.lang());
  }

  /** A medical certificate of today's examination, for the purpose the owner needs it */
  printCertificate(p: Patient) {
    const n = this.store.noteFor(p);
    this.ui.ask({
      title: `ใบรับรองแพทย์ · ${p.pet}`,
      fields: [
        { name: 'purpose', label: 'ใช้เพื่อ', type: 'select', options: CERTIFICATE_PURPOSES.map(x => ({ value: x, label: x })) },
        { name: 'finding', label: 'ผลการตรวจ', type: 'textarea', value: n.summary || n.dx },
        { name: 'remark', label: 'ความเห็นของสัตวแพทย์', type: 'textarea', optional: true, value: n.restrict },
      ],
      confirmLabel: 'พิมพ์ใบรับรอง',
      onConfirm: v => printCertificate(p, this.store.owner(p), { purpose: v['purpose'], finding: v['finding'].trim(), remark: v['remark'].trim(), vet: this.store.userName() },
        encounterNo(p), (key, vars) => this.i18n.t(key, vars), this.i18n.lang()),
    });
  }

  /* Keeping the record (data/record.ts) */

  /** A note after the signature; S/O/A/P stay as signed */
  addAddendum(p: Patient) {
    this.ui.ask({
      title: `เพิ่ม addendum · ${p.pet}`,
      intro: ['Addendum ต่อท้ายบันทึกที่ลงนามแล้ว โดยไม่แก้ S/O/A/P เดิม และบันทึกชื่อผู้เขียนกับเวลาไว้'],
      fields: [{
        name: 'text', label: 'ข้อความ addendum', type: 'textarea', placeholder: 'เช่น ผล X-ray ไม่พบกระดูกหัก ยืนยันการวินิจฉัย soft-tissue injury',
        validate: v => (reasonCheck(v) ? this.i18n.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
      }],
      confirmLabel: 'บันทึก addendum',
      onConfirm: v => {
        this.store.addAddendum(p, v['text'].trim());
        this.ui.toast('เพิ่ม addendum ของ {pet} แล้ว', { pet: p.pet });
      },
    });
  }

  /** A problem renamed, noted or given another status; resolving it keeps it on the list as resolved */
  editProblem(p: Patient, index: number) {
    const [name, note, tone] = p.problems[index];
    this.ui.ask({
      title: `แก้ไข problem · ${p.pet}`,
      fields: [
        { name: 'name', label: 'Problem', type: 'input', value: name },
        { name: 'note', label: 'หมายเหตุ', type: 'input', optional: true, value: note },
        { name: 'tone', label: 'สถานะ', type: 'select', value: tone, options: PROBLEM_STATUS.map(([label, value]) => ({ value, label })) },
      ],
      confirmLabel: 'บันทึก',
      onConfirm: v => {
        const resolved = v['tone'] === 'ok' && tone !== 'ok';
        this.store.mutate(() => {
          p.problems[index] = [v['name'].trim(), resolved ? `Resolved · ${TODAY} · ${this.store.userName()}` : v['note'].trim(), v['tone'] as Tone];
        });
        this.ui.toast(resolved ? 'ปิด problem {name} แล้ว (Resolved)' : 'แก้ไข problem {name} แล้ว', { name: v['name'].trim() });
      },
    });
  }

  editAlert(p: Patient, index: number) {
    const alert = p.alerts[index];
    this.ui.ask({
      title: `แก้ไข alert · ${p.pet}`,
      fields: [
        { name: 'label', label: 'หัวข้อ', type: 'input', value: alert.label },
        { name: 'detail', label: 'รายละเอียด', type: 'textarea', optional: true, value: alert.detail ?? '' },
      ],
      confirmLabel: 'บันทึก',
      onConfirm: v => {
        this.store.mutate(() => {
          p.alerts[index] = { ...alert, label: v['label'].trim(), detail: v['detail'].trim() || undefined, verifiedBy: this.store.userName(), verifiedAt: TODAY };
        });
        this.ui.toast('แก้ไข alert ของ {pet} แล้ว', { pet: p.pet });
      },
    });
  }

  /** An alert taken off: it needs a reason, and stays on the record as withdrawn */
  withdrawAlert(p: Patient, index: number) {
    const alert = p.alerts[index];
    this.ui.ask({
      title: `ยกเลิก alert · ${p.pet}`,
      tone: 'danger',
      facts: [['Alert', alert.label], ['รายละเอียด', alert.detail ?? '—']],
      intro: ['Alert ที่ยกเลิกจะไม่แสดงบน patient banner และไม่ใช้ตรวจยาอีก แต่ยังเก็บไว้ในประวัติพร้อมเหตุผล'],
      fields: [{
        name: 'reason', label: this.i18n.t('เหตุผลที่ยกเลิก (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'input', placeholder: 'เช่น ทดสอบแพ้ยาซ้ำแล้วผลเป็นลบ',
        validate: v => (reasonCheck(v) ? this.i18n.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
      }],
      confirmLabel: 'ยกเลิก alert',
      onConfirm: v => {
        this.store.mutate(() => withdrawAlert(p, index, v['reason'].trim(), this.store.userName()));
        this.ui.toast('ยกเลิก alert {label} แล้ว · เก็บไว้ในประวัติ', { label: this.i18n.t(alert.label) });
      },
    });
  }

  /** A dose of vaccine given today, with its lot and when the next one is due */
  recordVaccine(p: Patient, name?: string) {
    const choices = VACCINES.filter(v => v.kinds.includes(p.kind));
    this.ui.ask({
      title: `บันทึกการฉีดวัคซีน · ${p.pet}`,
      fields: [
        { name: 'name', label: 'วัคซีน', type: 'select', value: name ?? choices[0]?.name, options: choices.map(v => ({ value: v.name, label: v.name })) },
        { name: 'lot', label: 'Lot / Batch', type: 'input', placeholder: 'เช่น RB-2608-14' },
        { name: 'booster', label: 'เข็มถัดไป', type: 'select', value: '365', options: BOOSTERS.map(([label, days]) => ({ value: String(days), label })) },
      ],
      after: 'วันครบกำหนดเข็มถัดไปจะแสดงในแท็บวัคซีน และใช้ส่งเตือนเจ้าของ',
      confirmLabel: 'บันทึกการฉีด',
      onConfirm: v => {
        this.store.mutate(() => vaccinate(p, v['name'], v['lot'].trim(), Number(v['booster']), this.store.userName()));
        this.ui.toast('บันทึก {name} ของ {pet} แล้ว · ครั้งถัดไป {next}', { name: v['name'], pet: p.pet, next: addDays(TODAY, Number(v['booster'])) });
      },
    });
  }

  /** Reminds the owner of a vaccine that is due */
  remindVaccine(p: Patient, name: string, note: string) {
    const o = this.store.owner(p);
    this.sendMessage(p, `เตือนวัคซีน ${name}`, this.i18n.t('เรียนคุณ {0}\n{1} ถึงกำหนดฉีดวัคซีน {2} ({3})\nนัดหมายได้ที่โรงพยาบาลหรือตอบกลับข้อความนี้', { 0: o.name, 1: p.pet, 2: name, 3: this.i18n.t(note) }));
  }

  /* Orders */

  /** The order's next step; completing a lab or imaging order asks for the finding first */
  advanceOrder(o: Order) {
    const step = ORDER_FLOW[o.col];
    if (!step) {
      return;
    }
    if (step.next === 'Completed' && o.kind !== 'Procedure') {
      this.ui.ask({
        title: `บันทึกผล · ${o.name}`,
        facts: [['ผู้ป่วย', o.pet], ['Order', `${o.code} · ${o.kind}`], ['สั่งโดย', o.by]],
        fields: [
          { name: 'finding', label: 'สรุปผล', type: 'select', options: ['ปกติ', 'ผิดปกติ', 'วิกฤต (critical)'].map(x => ({ value: x, label: x })) },
          { name: 'note', label: 'ข้อสังเกต / รายงาน', type: 'textarea', optional: true, placeholder: o.kind.startsWith('Lab') ? 'เช่น hemolysis เล็กน้อย' : 'เช่น ไม่พบกระดูกหัก soft tissue บวมเล็กน้อย' },
        ],
        confirmLabel: 'บันทึกผลและปิด order',
        onConfirm: v => {
          const critical = this.store.completeOrder(o, v['finding'], v['note'].trim());
          this.ui.toast(critical ? 'ปิด {code} · ผลเข้า Results inbox (Critical)' : 'ปิด {code} · ผลเข้า Results inbox', { code: o.code });
        },
      });
      return;
    }
    this.store.advanceOrder(o);
    this.ui.toast('{name} · {pet} → {state}', { name: this.i18n.t(o.name), pet: o.pet, state: this.i18n.t(step.next) });
  }

  cancelOrder(o: Order) {
    this.ui.ask({
      title: 'ยกเลิก Order',
      tone: 'danger',
      intro: [this.i18n.t('ยกเลิก {name} ({code}) ของ {pet} — order จะออกจากบอร์ดและไม่ถูกคิดเงิน · ยกเลิกแล้วย้อนกลับไม่ได้', { name: this.i18n.t(o.name), code: o.code, pet: o.pet })],
      fields: [{
        name: 'reason', label: this.i18n.t('เหตุผลที่ยกเลิก (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'input', placeholder: 'เช่น เจ้าของปฏิเสธการตรวจ',
        validate: v => (reasonCheck(v) ? this.i18n.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
      }],
      confirmLabel: 'ยกเลิก Order',
      onConfirm: v => {
        this.store.cancelOrder(o, v['reason'].trim());
        this.ui.closeSheet();
        this.ui.toast('ยกเลิก {code} · เหตุผล: {reason}', { code: o.code, reason: v['reason'].trim() });
      },
    });
  }

  /* Results */

  acknowledge(r: LabResult) {
    if (r.ack) {
      this.ui.toast('{name} รับทราบไปแล้ว — การรับทราบครั้งแรกถือเป็นหลักฐาน แก้ไขไม่ได้', { name: this.i18n.t(r.name) }, 'info');
      return;
    }
    const critical = r.flag === 'critical';
    this.ui.ask({
      title: `รับทราบผล (callback) · ${r.name}`,
      tone: critical ? 'danger' : 'primary',
      facts: [['ผู้ป่วย', r.pet], ['ผลตรวจ', `${r.name} · ${r.status} · ${r.time}`], ['สั่งโดย', r.by]],
      warning: critical ? CRITICAL_RULE : undefined,
      fields: [
        {
          name: 'method', label: 'วิธีติดต่อกลับ (Callback)', type: 'select', value: 'phone', options: ACK_METHODS.map(m => ({ value: m.value, label: m.label })),
          validate: v => (critical && v !== 'phone' ? CRITICAL_RULE : null),
        },
        { name: 'readBack', label: 'ยืนยัน read-back', type: 'checkbox', optional: !critical, validate: v => (critical && v !== 'yes' ? 'ต้องยืนยัน read-back' : null) },
        { name: 'note', label: 'บันทึก', type: 'textarea', optional: true, placeholder: 'บันทึก (ไม่บังคับ)' },
      ],
      after: critical ? 'ปุ่มรับทราบจะเปิดเมื่อเลือกโทรศัพท์และยืนยัน read-back แล้วเท่านั้น' : undefined,
      confirmLabel: 'รับทราบ',
      onConfirm: v => {
        this.store.acknowledge(r, v['method'] as AckMethod, v['readBack'] === 'yes', v['note'] ?? '');
        this.ui.toast('รับทราบผลแล้ว (บันทึก audit)');
      },
    });
  }

  interpret(r: LabResult) {
    this.ui.ask({
      title: `การแปลผล · ${r.name} · ${r.pet}`,
      fields: [{ name: 'interp', label: 'การแปลผล', type: 'textarea', value: r.interp.replace(/ — .+$/, ''), placeholder: 'เช่น ค่าอยู่ในเกณฑ์ปกติ ไม่พบภาวะติดเชื้อ' }],
      after: r.ack ? 'ผลนี้รับทราบแล้ว' : 'การแปลผลไม่นับเป็นการรับทราบ — กด Acknowledge แยกต่างหาก',
      confirmLabel: 'บันทึกการแปลผล',
      onConfirm: v => {
        this.store.interpret(r, v['interp']);
        this.ui.toast('บันทึกการแปลผล {name} แล้ว', { name: this.i18n.t(r.name) });
      },
    });
  }

  notifyOwner(r: LabResult) {
    const p = this.store.patientByPet(r.pet);
    if (!p) {
      return;
    }
    const o = this.store.owner(p);
    const text = this.i18n.t('เรียนคุณ {0}\nผลตรวจ {1} ของ {2} ออกแล้ว ({3} · {4})\n{5}', {
      0: o.name, 1: this.i18n.t(r.name), 2: r.pet, 3: r.status, 4: r.time, 5: r.interp || this.i18n.t('สัตวแพทย์จะติดต่อเพื่ออธิบายผลอีกครั้ง'),
    });
    this.sendMessage(p, `ผลตรวจ ${r.name}`, text, () => this.store.markSent(r));
  }

  /* Prescriptions */

  /** A new prescription, written beside the drug safety check (sheets/prescribe-sheet.ts) */
  prescribe(p: Patient) {
    this.store.select(p);
    this.ui.openSheet('prescribe');
  }

  /* Estimate and consent (data/estimate.ts) */

  /** The owner approves the estimate as it stands now, then signs the consent */
  approveEstimate(p: Patient) {
    const e = estimateFor(this.store.data(), p);
    const o = this.store.owner(p);
    const range = e.min === e.max ? baht(e.min) : `${baht(e.min)} – ${baht(e.max)}`;
    this.ui.ask({
      title: `อนุมัติประมาณการ · ${p.pet}`,
      facts: [['เลขที่', e.no], ['จำนวนรายการ', String(e.lines.length)], ['ช่วงค่าใช้จ่าย', range]],
      fields: [
        { name: 'approver', label: 'ผู้อนุมัติ', type: 'input', value: o.name },
        { name: 'via', label: 'ช่องทาง', type: 'select', options: APPROVAL_CHANNELS.map(c => ({ value: c, label: c })) },
        { name: 'told', label: 'เจ้าของรับทราบว่าค่าใช้จ่ายจริงอาจต่างจากประมาณการ และโรงพยาบาลจะแจ้งก่อนหากเกิน', type: 'checkbox', validate: v => (v === 'yes' ? null : 'ต้องยืนยันข้อนี้') },
      ],
      confirmLabel: 'บันทึกการอนุมัติ',
      onConfirm: v => {
        this.store.approveEstimate(p, v['approver'].trim(), v['via']);
        this.ui.toast('{owner} อนุมัติประมาณการ {no} แล้ว · {range}', { owner: v['approver'].trim(), no: e.no, range });
        if (!p.consentForm) {
          this.ui.openSheet('consent');
        }
      },
    });
  }

  printEstimate(p: Patient) {
    printEstimate(estimateFor(this.store.data(), p), p, this.store.owner(p), (key, vars) => this.i18n.t(key, vars), this.i18n.lang());
  }

  printConsent(p: Patient) {
    if (p.consentForm) {
      printConsent(p.consentForm, p, this.store.owner(p), (key, vars) => this.i18n.t(key, vars), this.i18n.lang());
    }
  }

  /* Dispense (data/dispense.ts) */

  /** The pharmacist checks the prescription against the pet: the five rights and the allergy history, each ticked */
  verifyRx(rx: Prescription) {
    const p = this.store.patientByPet(rx.pet);
    const allergies = p?.alerts.filter(a => a.type === 'allergy' || a.type === 'drug').map(a => this.i18n.t(a.label)) ?? [];
    this.ui.ask({
      title: `ตรวจสอบใบสั่งยา · ${rx.code}`,
      facts: [
        ['ผู้ป่วย', p ? `${rx.pet} · ${p.species} · HN ${p.hn} · ${p.weight}` : rx.pet], ['ยา', rx.drug],
        ['ขนาด', `${rx.dose} · ${rx.route} · ${rx.freq} · ${rx.days}`], ['จำนวนจ่าย', rx.qty], ['สั่งโดย', rx.by],
      ],
      warning: [
        allergies.length ? this.i18n.t('ประวัติแพ้ยาและข้อควรระวัง: {0}', { 0: allergies.join(', ') }) : '',
        rx.cds?.override ? this.i18n.t('สั่งโดย override CDS: {0}', { 0: rx.cds.override }) : '',
      ].filter(Boolean).join(' · ') || undefined,
      fields: VERIFY_CHECKS.map(c => ({ name: c.name, label: c.label, type: 'checkbox' as const, validate: (v: string) => (v === 'yes' ? null : 'ต้องยืนยันข้อนี้') })),
      after: isControlled(rx.drug) ? 'ยาควบคุม — ตอนจัดยาต้องมีพยานอีกหนึ่งคน' : undefined,
      confirmLabel: 'ตรวจสอบแล้ว · ส่งจัดยา',
      onConfirm: () => {
        this.store.verifyRx(rx);
        this.ui.toast('ตรวจสอบ {code} แล้ว · ส่งจัดยา', { code: rx.code });
      },
    });
  }

  /** Prepared from a batch: the first to expire unless another is picked, never an expired one; a controlled drug needs a witness */
  prepareRx(rx: Prescription) {
    const first = fefo(rx);
    const controlled = isControlled(rx.drug);
    const fields: DialogField[] = [];
    if (rx.stock.length) {
      fields.push({
        name: 'batch', label: 'Batch (หมดอายุก่อนจ่ายก่อน)', type: 'select', value: first?.[0] ?? rx.stock[0][0],
        options: rx.stock.map(b => ({ value: b[0], label: `${b[0]} · ${this.i18n.t('หมดอายุ')} ${b[1]} · ${this.i18n.t('คงเหลือ')} ${this.i18n.t(b[2])} · ${this.i18n.t(b[3])}` })),
        validate: v => {
          const problem = batchProblem(rx, rx.stock.find(b => b[0] === v)!);
          return problem ? this.i18n.t(problem) : null;
        },
      });
    } else {
      fields.push({ name: 'batch', label: 'Batch', type: 'input', placeholder: 'เช่น B-2408-11' });
    }
    if (controlled) {
      fields.push({
        name: 'witness', label: 'พยาน (ยาควบคุม)', type: 'select', value: '',
        options: [{ value: '', label: 'เลือกพยาน' }, ...witnessesFor(this.store.userName()).map(w => ({ value: w, label: w }))],
        validate: v => (v ? null : 'ยาควบคุมต้องมีพยานอีกหนึ่งคน'),
      });
    }
    fields.push({ name: 'print', label: 'พิมพ์ฉลากยาทันที', type: 'checkbox', value: 'yes', optional: true });
    this.ui.ask({
      title: `จัดยา · ${rx.code}`,
      facts: [['ผู้ป่วย', rx.pet], ['ยา', rx.drug], ['จำนวนจ่าย', rx.qty]],
      warning: controlled ? 'ยาควบคุมตามกฎหมาย — บันทึกพยานและ batch ลงทะเบียนยาควบคุม' : undefined,
      fields,
      after: 'จำนวนที่จ่ายจะหักออกจาก batch ที่เลือก',
      confirmLabel: 'จัดยาแล้ว',
      onConfirm: v => {
        this.store.prepareRx(rx, v['batch'] ?? '', v['witness']);
        if (v['print'] === 'yes') {
          this.printLabel(rx);
        }
        this.ui.toast('จัดยา {code} แล้ว · batch {batch} · รอให้คำแนะนำ', { code: rx.code, batch: rx.batch ?? '—' });
      },
    });
  }

  /** The owner (or whoever came for the pet) is told how to give it and says it back, then takes it */
  handOverRx(rx: Prescription) {
    const p = this.store.patientByPet(rx.pet);
    this.ui.ask({
      title: `ส่งมอบยา · ${rx.code}`,
      facts: [['ยา', rx.drug], ['วิธีใช้', `${rx.dose} · ${rx.route} · ${rx.freq} · ${rx.days}`], ['คำแนะนำ', rx.advice || '—'], ['Batch', rx.batch ?? '—']],
      fields: [
        { name: 'receiver', label: 'ผู้รับยา', type: 'input', value: p ? this.store.owner(p).name : rx.owner },
        { name: 'told', label: 'อธิบายวิธีให้ยา ขนาด ระยะเวลา และผลข้างเคียงที่ต้องสังเกตแล้ว', type: 'checkbox', validate: v => (v === 'yes' ? null : 'ต้องยืนยันข้อนี้') },
        { name: 'teachBack', label: 'ผู้รับทวนวิธีให้ยาได้ถูกต้อง (teach-back)', type: 'checkbox', validate: v => (v === 'yes' ? null : 'ต้องยืนยันข้อนี้') },
      ],
      confirmLabel: 'ส่งมอบยา',
      onConfirm: v => {
        this.store.handOverRx(rx, v['receiver'].trim());
        this.ui.closeSheet();
        this.ui.toast('ส่งมอบ {drug} ให้ {receiver} แล้ว', { drug: rx.drug, receiver: v['receiver'].trim() });
      },
    });
  }

  printLabel(rx: Prescription) {
    const p = this.store.data().patients.find(x => x.pet === rx.pet && this.store.owner(x)?.name === rx.owner);
    printDrugLabel(rx, p, p ? this.store.owner(p) : undefined, (key, vars) => this.i18n.t(key, vars), this.i18n.lang());
    this.store.labelPrinted(rx);
  }

  cosign(rx: Prescription) {
    this.ui.ask({
      title: `เซ็นกำกับคำสั่งวาจา · ${rx.code}`,
      facts: [
        ['ผู้ป่วย', rx.pet], ['ยา', rx.drug], ['ขนาด', `${rx.dose} · ${rx.freq} · ${rx.days}`],
        ['สั่งโดย', rx.orderedBy ?? '—'], ['รับไว้โดย', `${rx.by} · ${rx.orderedAt ?? ''}`],
      ],
      intro: [rx.inpatient ? 'เมื่อเซ็นกำกับ คำสั่งนี้มีผล ส่งเข้า Dispense เพื่อตรวจสอบ และขึ้นบนตารางให้ยาของวอร์ด' : 'เมื่อเซ็นกำกับ คำสั่งนี้มีผลและส่งเข้า Dispense เพื่อตรวจสอบใบสั่งยา'],
      confirmLabel: 'เซ็นกำกับ',
      onConfirm: () => {
        this.store.cosign(rx);
        this.ui.toast('เซ็นกำกับ {code} แล้ว · ส่งเข้า Dispense', { code: rx.code });
      },
    });
  }

  /* The ward (data/ward.ts) */

  /** Takes a pet into a bed; from the ward with no pet given, the pet is picked first */
  admit(given?: Patient) {
    const d = this.store.data();
    const candidates = d.patients.filter(p => !inWard(p) && stageIndex(p) < 4);
    const beds = freeBeds(d);
    const fields: DialogField[] = [];
    if (!given) {
      fields.push({ name: 'pet', label: 'สัตว์ป่วย', type: 'select', options: candidates.map(p => ({ value: String(p.id), label: `${p.pet} · ${p.species} · ${p.reason}` })) });
    }
    fields.push(
      { name: 'bed', label: 'เตียง', type: 'select', options: beds.map(b => ({ value: b, label: `${wardOf(b)?.name ?? ''} · ${b}` })), validate: v => (v ? null : 'ไม่มีเตียงว่าง') },
      { name: 'vet', label: 'สัตวแพทย์เจ้าของไข้', type: 'select', value: given?.vet ?? VETS[0], options: VETS.map(v => ({ value: v, label: v })) },
      { name: 'reason', label: 'เหตุผลที่รับไว้', type: 'input', value: given ? given.reason : '', placeholder: 'เช่น Vomiting · IV fluids and antiemetics' },
      { name: 'obs', label: 'วัดสัญญาณชีพทุก (ชม.)', type: 'select', value: '4', options: OBS_EVERY.map(h => ({ value: String(h), label: `${h} ชม.` })) },
      { name: 'told', label: 'เจ้าของรับทราบค่าห้องพักต่อวันและอนุมัติแล้ว', type: 'checkbox', validate: v => (v === 'yes' ? null : 'ต้องยืนยันข้อนี้') },
    );
    this.ui.ask({
      title: given ? `รับเข้าวอร์ด · ${given.pet}` : 'รับเข้าวอร์ด',
      intro: ['สัตว์จะย้ายไปขั้นหัตถการที่เตียงนั้น ยาที่สั่งให้ในโรงพยาบาลจะขึ้นบนตารางให้ยาของวอร์ด และค่าห้องพักเข้าประมาณการ'],
      warning: beds.length ? undefined : 'ไม่มีเตียงว่าง — ทำความสะอาดเตียงที่ว่างแล้วก่อน',
      fields,
      confirmLabel: 'รับเข้าวอร์ด',
      onConfirm: v => {
        const p = given ?? candidates.find(x => String(x.id) === v['pet']);
        if (!p) {
          return;
        }
        this.store.admit(p, v['bed'], v['vet'], v['reason'].trim() || p.reason, Number(v['obs']));
        this.store.select(p);
        this.ui.toast('รับ {pet} เข้า {bed} แล้ว · {vet}', { pet: p.pet, bed: `${this.i18n.t(wardOf(v['bed'])?.name ?? '')} ${v['bed']}`, vet: this.i18n.t(v['vet']) });
      },
    });
  }

  /** At the cage: the five rights, then what became of the dose; a dose not given needs why, a controlled drug a witness */
  recordDose(rx: Prescription, slot: string) {
    if (!canGive(rx)) {
      this.ui.toast('{code} ยังรอห้องยาตรวจสอบ — ให้ยาไม่ได้', { code: rx.code }, 'info');
      return;
    }
    const p = this.store.patientByPet(rx.pet);
    const controlled = isControlled(rx.drug);
    const fields: DialogField[] = [
      ...FIVE_RIGHTS.map(c => ({ name: c.name, label: c.label, type: 'checkbox' as const, validate: (v: string, all: Record<string, string>) => (v === 'yes' || all['outcome'] !== 'given' ? null : 'ต้องยืนยันข้อนี้') })),
      { name: 'outcome', label: 'ผล', type: 'select', value: 'given', options: DOSE_OUTCOMES.map(o => ({ value: o.value, label: o.label })) },
      {
        name: 'reason', label: 'เหตุผลที่ไม่ได้ให้', type: 'select', value: '', optional: true,
        options: [{ value: '', label: '—' }, ...HOLD_REASONS.map(r => ({ value: r, label: r }))],
        validate: (v, all) => (all['outcome'] === 'given' || v ? null : 'ยาที่ไม่ได้ให้ต้องระบุเหตุผล'),
      },
      { name: 'note', label: 'บันทึกเพิ่มเติม', type: 'input', optional: true, placeholder: 'เช่น อาเจียน 10 นาทีหลังป้อน' },
    ];
    if (controlled) {
      fields.push({
        name: 'witness', label: 'พยาน (ยาควบคุม)', type: 'select', value: '',
        options: [{ value: '', label: 'เลือกพยาน' }, ...witnessesFor(this.store.userName()).map(w => ({ value: w, label: w }))],
        validate: (v, all) => (all['outcome'] !== 'given' || v ? null : 'ยาควบคุมต้องมีพยานอีกหนึ่งคน'),
      });
    }
    this.ui.ask({
      title: `บันทึกการให้ยา · ${rx.drug}`,
      facts: [
        ['ผู้ป่วย', p ? `${rx.pet} · HN ${p.hn} · ${p.admission?.bed ?? ''}` : rx.pet], ['ขนาด', `${rx.dose} · ${rx.route}`],
        ['เวลาที่กำหนด', slot], ['เวลาที่บันทึก', NOW], ['Batch', rx.batch ?? '—'],
      ],
      warning: controlled ? 'ยาควบคุม — การให้ต้องมีพยาน และบันทึกลงทะเบียนยาควบคุม' : undefined,
      fields,
      confirmLabel: 'บันทึก',
      onConfirm: v => {
        const outcome = v['outcome'] as DoseOutcome;
        const reason = outcome === 'given' ? v['note'].trim() : [v['reason'], v['note'].trim()].filter(Boolean).join(' — ');
        this.store.recordDose(rx, slot, outcome, reason || undefined, outcome === 'given' ? v['witness'] : undefined);
        const label = DOSE_OUTCOMES.find(o => o.value === outcome)!.label;
        this.ui.toast('{drug} {slot} · {outcome} · {pet}', { drug: rx.drug, slot, outcome: this.i18n.t(label), pet: rx.pet }, outcome === 'given' ? 'success' : 'info');
      },
    });
  }

  /** The vet ends an order on the sheet; it stays in the record with why */
  stopOrder(rx: Prescription) {
    this.ui.ask({
      title: `หยุดยา · ${rx.drug}`,
      tone: 'danger',
      facts: [['ผู้ป่วย', rx.pet], ['ขนาด', `${rx.dose} · ${rx.route} · ${rx.freq}`], ['สั่งโดย', rx.by]],
      intro: ['ยาจะออกจากตารางให้ยาของวอร์ดตั้งแต่ตอนนี้ ครั้งที่บันทึกไปแล้วยังอยู่ในประวัติ'],
      fields: [{
        name: 'reason', label: this.i18n.t('เหตุผลที่หยุด (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'input', placeholder: 'เช่น เริ่มกินได้แล้ว เปลี่ยนเป็นยากิน',
        validate: v => (reasonCheck(v) ? this.i18n.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
      }],
      confirmLabel: 'หยุดยา',
      onConfirm: v => {
        this.store.stopOrder(rx, v['reason'].trim());
        this.ui.toast('หยุด {drug} ของ {pet} แล้ว', { drug: rx.drug, pet: rx.pet });
      },
    });
  }

  /** A drip, at maintenance for the pet's weight unless the vet said another rate */
  startInfusion(p: Patient) {
    const kg = weightKg(p);
    const suggested = kg ? maintenanceRate(kg) : null;
    this.ui.ask({
      title: `เริ่มสายน้ำเกลือ · ${p.pet}`,
      facts: [['น้ำหนัก', p.weight], ['อัตรา maintenance', suggested ? `${suggested} mL/hr (50 mL/kg/วัน)` : '—']],
      fields: [
        { name: 'fluid', label: 'สารน้ำ', type: 'select', options: FLUIDS.map(f => ({ value: f, label: f })) },
        { name: 'rate', label: 'อัตรา (mL/hr)', type: 'input', value: suggested ? String(suggested) : '', validate: v => (Number(v) > 0 ? null : 'ใส่อัตราเป็นตัวเลขมากกว่า 0') },
      ],
      after: 'ปริมาณที่ให้จะนับจากอัตราและเวลาที่สายเปิดอยู่',
      confirmLabel: 'เริ่มสาย',
      onConfirm: v => {
        this.store.startInfusion(p, v['fluid'], Number(v['rate']));
        this.ui.toast('เริ่ม {fluid} {rate} mL/hr ให้ {pet} แล้ว', { fluid: v['fluid'], rate: v['rate'], pet: p.pet });
      },
    });
  }

  changeRate(line: Infusion) {
    this.ui.ask({
      title: `ปรับอัตรา · ${line.fluid}`,
      fields: [{ name: 'rate', label: 'อัตราใหม่ (mL/hr)', type: 'input', value: String(line.rate), validate: v => (Number(v) > 0 ? null : 'ใส่อัตราเป็นตัวเลขมากกว่า 0') }],
      confirmLabel: 'ปรับอัตรา',
      onConfirm: v => {
        this.store.infusionEvent(line, 'rate', Number(v['rate']));
        this.ui.toast('{fluid} → {rate} mL/hr', { fluid: line.fluid, rate: v['rate'] });
      },
    });
  }

  pauseLine(line: Infusion) {
    this.store.infusionEvent(line, line.status === 'paused' ? 'resume' : 'pause');
    this.ui.toast(line.status === 'paused' ? '{fluid} · พักสาย' : '{fluid} · ให้ต่อ {rate} mL/hr', { fluid: line.fluid, rate: line.rate }, 'info');
  }

  stopLine(line: Infusion, total: number) {
    this.ui.ask({
      title: `หยุดสาย · ${line.fluid}`,
      tone: 'danger',
      facts: [['ให้ไปแล้ว', `${total} mL`], ['อัตราล่าสุด', `${line.rate} mL/hr`]],
      intro: ['สายที่หยุดแล้วเปิดต่อไม่ได้ — ถ้าจะให้ต่อให้เริ่มสายใหม่'],
      confirmLabel: 'หยุดสาย',
      onConfirm: () => {
        this.store.infusionEvent(line, 'stop');
        this.ui.toast('หยุด {fluid} แล้ว · รวม {total} mL', { fluid: line.fluid, total });
      },
    });
  }

  /** A set of obs on the ward */
  takeObs(p: Patient) {
    const num = (v: string) => (/^\d{1,3}(\.\d)?$/.test(v.trim()) ? null : 'ใส่ตัวเลข');
    this.ui.ask({
      title: `บันทึกสัญญาณชีพ · ${p.pet}`,
      facts: [['เตียง', p.admission?.bed ?? '—'], ['วัดทุก', `${p.admission?.obsEvery ?? '—'} ชม.`]],
      fields: [
        { name: 'temp', label: 'อุณหภูมิ (°C)', type: 'input', placeholder: 'เช่น 38.6', validate: num },
        { name: 'hr', label: 'ชีพจร (ครั้ง/นาที)', type: 'input', placeholder: 'เช่น 120', validate: num },
        { name: 'rr', label: 'อัตราหายใจ (ครั้ง/นาที)', type: 'input', placeholder: 'เช่น 28', validate: num },
        { name: 'pain', label: 'คะแนนปวด (0–10)', type: 'select', value: '0', options: Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: String(i) })) },
      ],
      after: 'ค่าที่อยู่นอกช่วงปกติของชนิดสัตว์จะแสดงเป็นสีแดงในแนวโน้ม',
      confirmLabel: 'บันทึก',
      onConfirm: v => {
        this.store.takeObs(p, { temp: v['temp'].trim(), hr: v['hr'].trim(), rr: v['rr'].trim(), pain: v['pain'] });
        this.ui.toast('บันทึกสัญญาณชีพของ {pet} แล้ว', { pet: p.pet });
      },
    });
  }

  /** The nurse writes down what the vet said: a draft until the vet co-signs it on the orders board */
  verbalOrder(p: Patient) {
    this.ui.ask({
      title: `รับคำสั่งวาจา · ${p.pet}`,
      intro: ['คำสั่งที่รับไว้เป็นร่าง ยังไม่มีผลและไม่ขึ้นตารางให้ยาจนกว่าสัตวแพทย์จะเซ็นกำกับ (ภายใน 24 ชม.)'],
      fields: [
        { name: 'vet', label: 'สัตวแพทย์ผู้สั่ง', type: 'select', value: p.admission?.vet ?? p.vet, options: VETS.map(v => ({ value: v, label: v })) },
        { name: 'drug', label: 'ยา', type: 'select', options: FORMULARY.map(d => ({ value: d.name, label: d.name })) },
        { name: 'dose', label: 'ขนาดต่อครั้ง', type: 'input', placeholder: 'เช่น 1/2 เม็ด หรือ 0.3 mL', validate: v => (v.trim() ? null : 'ระบุขนาด') },
        { name: 'freq', label: 'ความถี่', type: 'select', value: RX_FREQS[1], options: RX_FREQS.map(f => ({ value: f, label: f })) },
        { name: 'days', label: 'ระยะเวลา', type: 'select', value: RX_DAYS[0], options: RX_DAYS.map(x => ({ value: x, label: x })) },
        { name: 'readBack', label: 'ทวนคำสั่งให้สัตวแพทย์ฟังและได้รับการยืนยันแล้ว (read-back)', type: 'checkbox', validate: v => (v === 'yes' ? null : 'ต้องทวนคำสั่งก่อนบันทึก') },
      ],
      confirmLabel: 'บันทึกคำสั่งวาจา',
      onConfirm: v => {
        const route = FORMULARY.find(d => d.name === v['drug'])?.route ?? 'รับประทาน';
        const rx = this.store.verbalOrder(p, { drug: v['drug'], dose: v['dose'].trim(), route, freq: v['freq'], days: v['days'], vet: v['vet'], readBack: true });
        this.ui.toast('บันทึกคำสั่งวาจา {code} แล้ว · รอ {vet} เซ็นกำกับ', { code: rx.code, vet: this.i18n.t(v['vet']) });
      },
    });
  }

  /** The pet leaves its bed, once its lines are stopped and its doses recorded */
  leaveWard(p: Patient) {
    const checks = wardChecks(this.store.data(), p);
    const missing = checks.filter(c => !c.ok);
    this.ui.ask({
      title: `ออกจากวอร์ด · ${p.pet}`,
      tone: 'danger',
      facts: checks.map(c => [c.label, c.ok ? '✓' : '✗'] as [string, string]),
      warning: missing.length ? 'ยังออกจากวอร์ดไม่ได้ — ทำรายการที่ยังไม่ครบก่อน' : undefined,
      intro: ['ยาบนตารางให้ยาจะสิ้นสุด เตียงรอทำความสะอาด และสัตว์ย้ายไปจุดจำหน่ายเพื่อปิด encounter และคิดเงิน'],
      fields: [{
        name: 'order', label: 'สัตวแพทย์เจ้าของไข้สั่งให้ออกจากวอร์ดแล้ว', type: 'checkbox',
        validate: v => (missing.length ? 'ทำรายการที่ยังไม่ครบก่อน' : v === 'yes' ? null : 'ต้องยืนยันข้อนี้'),
      }],
      confirmLabel: 'ออกจากวอร์ด',
      onConfirm: () => {
        const bed = p.admission?.bed ?? '';
        this.store.leaveWard(p);
        this.ui.toast('{pet} ออกจาก {bed} แล้ว · ไปจุดจำหน่าย', { pet: p.pet, bed });
      },
    });
  }

  bedCleaned(bed: string) {
    this.store.bedCleaned(bed);
    this.ui.toast('เตียง {bed} พร้อมใช้', { bed });
  }

  /** Today's treatment sheet on paper, for the cage */
  printTreatmentSheet(p: Patient) {
    const d = this.store.data();
    printTreatmentSheet(p, this.store.owner(p), d, (key, vars) => this.i18n.t(key, vars), this.i18n.lang());
  }
}
