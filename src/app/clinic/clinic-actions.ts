import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { ClinicUi } from './clinic-ui';
import { ClinicStore } from './clinic.store';
import {
  ACK_METHODS, CRITICAL_RULE, drugConflict, FORMULARY, LOCATIONS, NOW, NURSES, ORDER_FLOW, REASON_MIN, RX_DAYS, RX_FREQS, STAGES, stageIndex,
  TRIAGE, VETS,
} from './data/model';
import { draftFromRecord, petRecords } from './data/registration';
import type { AckMethod, AlertType, LabResult, Order, Patient, Prescription, StageKey } from './data/types';
import { ClinicI18n } from './i18n/clinic-i18n';
import { RegistrationForm } from './registration-form';

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

  closeEncounter(p: Patient) {
    this.ui.ask({
      title: `ปิด encounter · ${p.pet}`,
      tone: 'danger',
      intro: ['เมื่อปิด เวชระเบียนของ visit นี้ทั้งชุด (Intake, Vitals, SOAP, A&P, Orders, Medication, Discharge) จะล็อกและสั่งยาเพิ่มไม่ได้ · ย้อนกลับไม่ได้'],
      confirmLabel: 'ปิด encounter',
      onConfirm: () => {
        this.store.closeEncounter(p);
        this.ui.toast('ปิด encounter แล้ว — เวชระเบียนถูกล็อก');
      },
    });
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

  /** A new prescription; a drug that runs into the patient's allergy or drug caution is refused (drug safety check) */
  prescribe(p: Patient) {
    this.ui.ask({
      title: `สั่งยาใหม่ · ${p.pet}`,
      intro: ['ระบบตรวจกับ clinical alert ของผู้ป่วยก่อนสั่งทุกครั้ง · ยาที่ขัดกับประวัติแพ้ยาหรือข้อควรระวังจะสั่งไม่ได้'],
      fields: [
        {
          name: 'drug', label: 'ยา', type: 'select', options: FORMULARY.map(d => ({ value: d.name, label: d.name })),
          validate: v => {
            const conflict = drugConflict(p, FORMULARY.find(d => d.name === v)!);
            return conflict ? this.i18n.t('ขัดกับ clinical alert: {0} — สั่งไม่ได้', { 0: this.i18n.t(conflict) }) : null;
          },
        },
        { name: 'dose', label: 'ขนาด', type: 'input', placeholder: 'เช่น 1 เม็ด' },
        { name: 'freq', label: 'ความถี่', type: 'select', value: 'วันละ 2 ครั้ง', options: RX_FREQS.map(f => ({ value: f, label: f })) },
        { name: 'days', label: 'ระยะเวลา', type: 'select', value: '5 วัน', options: RX_DAYS.map(d => ({ value: d, label: d })) },
        { name: 'qty', label: 'จำนวนจ่าย', type: 'input', placeholder: 'เช่น 10 เม็ด' },
        { name: 'advice', label: 'คำแนะนำสำหรับเจ้าของ', type: 'textarea', optional: true },
      ],
      confirmLabel: 'สั่งยา',
      onConfirm: v => {
        const drug = FORMULARY.find(d => d.name === v['drug'])!;
        const rx = this.store.prescribe(p, drug.name, drug.route, v['dose'].trim(), v['freq'], v['days'], v['qty'].trim(), v['advice'].trim());
        this.ui.toast('สั่ง {drug} ให้ {pet} แล้ว · {code} ส่งห้องยาตรวจสอบ', { drug: drug.name, pet: p.pet, code: rx.code });
      },
    });
  }

  cosign(rx: Prescription) {
    this.ui.ask({
      title: `เซ็นกำกับคำสั่งวาจา · ${rx.code}`,
      facts: [['ผู้ป่วย', rx.pet], ['ยา', rx.drug], ['ขนาด', `${rx.dose} · ${rx.freq} · ${rx.days}`], ['รับไว้โดย', `${rx.by} · ${rx.orderedAt ?? ''}`]],
      intro: ['เมื่อเซ็นกำกับ คำสั่งนี้มีผลและส่งเข้า Dispense เพื่อตรวจสอบใบสั่งยา'],
      confirmLabel: 'เซ็นกำกับ',
      onConfirm: () => {
        this.store.cosign(rx);
        this.ui.toast('เซ็นกำกับ {code} แล้ว · ส่งเข้า Dispense', { code: rx.code });
      },
    });
  }
}
