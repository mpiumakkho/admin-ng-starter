/*
 * Sending the pet home: what has to be done first, the follow-up visit, and the bill for the day (seph1-docs M02
 * discharge planning; seph1-fe Chart.tsx OrdersTab "discharge", LiveBillingPanel). Text is kept in its source language
 * and translated where it shows.
 */
import { openPrescriptions } from './dispense';
import { CONSULTATION, priceRange } from './estimate';
import { addDays, FORMULARY, nextSeq, TODAY } from './model';
import type { Appointment, ClinicData, EncounterNote, Invoice, Patient } from './types';
import { bedCharge, inWard } from './ward';

/** Today's encounter of a patient: E-260924-05 */
export const encounterNo = (p: Patient) => `E-${TODAY.slice(2).replace(/-/g, '')}-${String(p.id).padStart(2, '0')}`;

/** The follow-up choice as a number of days; "after the results" starts at three */
const FOLLOW_UP_DAYS: Record<string, number> = { 'นัดติดตาม 3 วัน': 3, 'นัดติดตาม 7 วัน': 7, 'นัดติดตาม 14 วัน': 14, 'นัดตามผลตรวจ': 3 };
export const needsFollowUp = (choice: string) => choice in FOLLOW_UP_DAYS;
export const followUpDate = (choice: string) => addDays(TODAY, FOLLOW_UP_DAYS[choice] ?? 7);

/** How the discharge papers reach the owner */
export const DISCHARGE_CHANNELS = ['LINE', 'SMS', 'Email', 'พิมพ์อย่างเดียว'];

/** The follow-up booked from this visit, if any */
export const followUpOf = (data: ClinicData, n: EncounterNote): Appointment | undefined =>
  n.followupAt ? data.appointments.find(a => a.id === n.followupAt) : undefined;

/** A follow-up visit with the pet's vet, in the room it was seen in today */
export function followUpAppointment(data: ClinicData, p: Patient, date: string, slot: string, reason: string): Appointment {
  const owner = data.owners[p.ownerKey];
  const room = p.stages.find(s => s.key === 'room')?.loc ?? 'Exam Room 1';
  return {
    id: nextSeq(data.appointments.map(a => a.id), 'A'), slot, date, time: slot.slice(0, 5), pet: p.pet, kind: p.kind, breed: p.breed,
    owner: owner.name, phone: owner.phone, type: 'Recheck', reason, provider: p.vet, room, dur: '20 นาที', state: 'Confirmed',
    deposit: '—', est: `฿${CONSULTATION[2]}`, prev: [TODAY, `${p.reason} · ${p.vet}`], reminders: [['SMS 24 ชม. ก่อนนัด', 'warn']],
  };
}

/** One thing to settle before discharge; a required one stops it */
export interface DischargeCheck { label: string; ok: boolean; required: boolean }

export function dischargeChecks(data: ClinicData, p: Patient, n: EncounterNote): DischargeCheck[] {
  const waiting = openPrescriptions(data, p).length;
  return [
    { label: 'ลงนาม SOAP แล้ว', ok: n.status === 'signed', required: true },
    { label: 'มีสรุปการวินิจฉัย', ok: !!(n.summary.trim() || n.dx.trim()), required: true },
    { label: 'มีคำแนะนำการดูแลที่บ้าน', ok: !!n.home.trim(), required: true },
    { label: 'จองนัดติดตามแล้ว', ok: !needsFollowUp(n.followup) || !!n.followupAt, required: true },
    { label: waiting ? `ยาที่ยังไม่ได้ส่งมอบ ${waiting} รายการ` : 'ส่งมอบยาครบแล้ว', ok: !waiting, required: false },
    { label: 'เจ้าของลงนามใบยินยอมแล้ว', ok: !!p.consentForm, required: false },
    ...(p.admission ? [{ label: 'ออกจากวอร์ดแล้ว', ok: !inWard(p), required: true }] : []),
  ];
}

/** The day's bill: the consultation, the orders carried out or under way, and the drugs prescribed */
export function visitInvoice(data: ClinicData, p: Patient): Invoice {
  const owner = data.owners[p.ownerKey];
  const items: Invoice['items'] = [[CONSULTATION[0], CONSULTATION[2]]];
  for (const o of data.orders.filter(x => x.pet === p.pet && x.time.startsWith(TODAY) && !['Cancelled', 'Draft'].includes(x.col))) {
    items.push([o.name, priceRange(o.price)[0]]);
  }
  for (const rx of data.prescriptions.filter(x => x.pet === p.pet && x.owner === owner.name && !(x.verbal && !x.cosignedBy))) {
    const drug = FORMULARY.find(d => d.name === rx.drug);
    const n = Number.parseFloat(rx.qty) || 1;
    if (drug) {
      items.push([`${rx.drug} · ${rx.qty}`, drug.unit === 'หยด' ? drug.price : Math.round(drug.price * n)]);
    }
  }
  if (p.admission) {
    items.push(bedCharge(p.admission));
  }
  const month = TODAY.slice(2, 4) + TODAY.slice(5, 7);
  return {
    id: nextSeq(data.invoices.map(i => i.id), 'I'), no: nextSeq(data.invoices.map(i => i.no), `INV-${month}-0`), ownerKey: p.ownerKey,
    pet: p.pet, date: TODAY, title: `${p.admission ? 'IPD stay' : 'OPD visit'} · ${encounterNo(p)}`, items, total: items.reduce((sum, i) => sum + i[1], 0), paid: 0,
  };
}

/** How the owner pays */
export const PAYMENT_METHODS = ['เงินสด', 'โอนเงิน', 'บัตรเครดิต', 'QR PromptPay'];
