/*
 * The clinic's printed documents, written in the workspace's language: the drug label that goes on what the owner
 * takes home, the estimate, the consent form, the discharge summary, the medical certificate and the receipt
 * (seph1-fe screens/PrintViews.tsx, FrontDesk.tsx ScreenPrescriptionQR).
 */
import { isControlled } from '../data/dispense';
import type { Estimate } from '../data/estimate';
import { formatDate, TODAY } from '../data/model';
import { baht } from '../data/rail';
import type { Appointment, ClinicData, ConsentRecord, EncounterNote, Invoice, Owner, Patient, Prescription } from '../data/types';
import { DOSE_OUTCOMES, infusedTotal, INFUSION_STATUS, liveLines, marOrders, sheetTimes, slotState, stayDay, wardOf } from '../data/ward';
import { esc, printDocument } from './print';

/** The workspace's translation: a key and its placeholders */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const HOSPITAL = 'SLV — โรงพยาบาลสวนหลวงสัตวแพทย์';

/** The label for one prescription, on 100 × 70 mm label paper */
export function printDrugLabel(rx: Prescription, p: Patient | undefined, owner: Owner | undefined, t: Translate, lang: 'th' | 'en') {
  const row = (label: string, value: string) => `<p><span class="muted">${esc(t(label))}:</span> ${esc(value)}</p>`;
  const batch = rx.stock.find(b => b[0] === rx.batch);
  const body = `
    <div class="head"><h1>${esc(t(HOSPITAL))}</h1><span>${esc(rx.code)}</span></div>
    <p class="big">${esc(rx.pet)}${p ? ` · ${esc(t(p.species))} · ${esc(p.hn)}` : ''}</p>
    ${row('เจ้าของ', owner?.name ?? rx.owner)}
    <div class="box">
      <p class="big">${esc(rx.drug)}</p>
      <p>${esc([t(rx.route), t(rx.dose), t(rx.freq), t(rx.days)].filter(x => x && x !== '—').join(' · '))}</p>
      ${rx.advice ? `<p>${esc(t(rx.advice))}</p>` : ''}
    </div>
    ${row('จำนวนจ่าย', t(rx.qty))}
    ${row('Batch', `${rx.batch ?? '—'}${batch ? ` · ${t('หมดอายุ')} ${batch[1]}` : ''}`)}
    ${row('สั่งโดย', t(rx.by))}
    ${row('วันที่จ่าย', formatDate(TODAY, 'short', lang))}
    <p class="warn">${esc(t(isControlled(rx.drug) ? 'ยาควบคุม · ใช้กับสัตว์ตัวนี้เท่านั้น เก็บให้พ้นมือเด็ก' : 'ใช้กับสัตว์เท่านั้น เก็บให้พ้นมือเด็ก'))}</p>
  `;
  printDocument(`${t('ฉลากยา')} ${rx.code}`, body, { paper: 'label', lang });
}

/** The head of an A4 or A5 page: the hospital, the document's title and number, and who it is about */
function pageHead(title: string, no: string, p: Patient, owner: Owner, t: Translate, lang: 'th' | 'en') {
  return `
    <div class="head"><div><h1>${esc(t(HOSPITAL))}</h1><p class="muted">${esc(t(title))}</p></div>
      <div style="text-align: right"><b>${esc(no)}</b><p class="muted">${esc(formatDate(TODAY, 'long', lang))}</p></div></div>
    <p><b>${esc(p.pet)}</b> · ${esc(t(p.species))} · ${esc(p.breed)} · ${esc(p.hn)} · ${esc(p.weight)}</p>
    <p>${esc(t('เจ้าของ'))}: ${esc(owner.name)} · ${esc(owner.phone)}</p>`;
}
const range = (min: number, max: number) => (min === max ? baht(min) : `${baht(min)} – ${baht(max)}`);

/** The estimate, on A5, for the owner to take or sign */
export function printEstimate(e: Estimate, p: Patient, owner: Owner, t: Translate, lang: 'th' | 'en') {
  const rows = e.lines.map(l => `<tr><td>${esc(t(l[0]))}</td><td class="num">${esc(t(l[1]))}</td><td class="num">${esc(range(l[2], l[3]))}</td></tr>`).join('');
  const body = `${pageHead('ประมาณการค่าใช้จ่าย', e.no, p, owner, t, lang)}
    <table><thead><tr><th>${esc(t('รายการ'))}</th><th class="num">${esc(t('จำนวน'))}</th><th class="num">${esc(t('ราคา'))}</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><th colspan="2">${esc(t('รวม'))}</th><th class="num">${esc(range(e.min, e.max))}</th></tr></tfoot></table>
    <p class="muted">${esc(t('ประมาณการนี้มีอายุ 7 วัน ค่าใช้จ่ายจริงอาจต่างไปตามอาการ โรงพยาบาลจะแจ้งก่อนหากเกิน'))}</p>
    <div class="sign"><div>${esc(t('ผู้อนุมัติ'))}</div><div>${esc(t('เจ้าหน้าที่'))}</div></div>`;
  printDocument(`${t('ประมาณการค่าใช้จ่าย')} ${e.no}`, body, { paper: 'a5', lang });
}

/** The signed consent form, on A4, with the signature drawn on the screen */
export function printConsent(c: ConsentRecord, p: Patient, owner: Owner, t: Translate, lang: 'th' | 'en') {
  const items = c.items.length ? c.items.map(i => `<li>${esc(t(i))}</li>`).join('') : `<li>${esc(t('ตรวจรักษาทั่วไป'))}</li>`;
  const signature = c.signature ? `<img src="${esc(c.signature)}" alt="" style="height: 70px">` : `<p class="muted">${esc(t('ลงนามบนกระดาษ — เก็บฉบับจริงในแฟ้ม'))}</p>`;
  const body = `${pageHead('ใบยินยอมการรักษา', c.estimateNo, p, owner, t, lang)}
    <h2>${esc(t('การรักษาที่ยินยอม'))}</h2><ul>${items}</ul>
    <p>${esc(t('ประมาณการ {0} · {1}', { 0: c.estimateNo, 1: range(c.min, c.max) }))}</p>
    <h2>${esc(t('ข้อตกลง'))}</h2>
    <ul>
      <li>${esc(t('สัตวแพทย์อธิบายวิธีรักษา ทางเลือก และความเสี่ยง รวมถึงความเสี่ยงของยาซึมและยาสลบแล้ว'))}</li>
      <li>${esc(t('รับทราบค่าใช้จ่ายตามประมาณการ และโรงพยาบาลจะแจ้งก่อนหากเกิน'))}</li>
      <li><b>${esc(t(c.cpr ? 'ยินยอมให้ช่วยชีวิตเมื่อหัวใจหยุดเต้น (CPR)' : 'ไม่ทำ CPR (DNR)'))}</b></li>
    </ul>
    <div class="box">${signature}
      <p>${esc(c.signer)} · ${esc(t(c.relation))} · ${esc(formatDate(TODAY, 'short', lang))} ${esc(c.at)}</p>
      <p class="muted">${esc(t('พยาน'))}: ${esc(t(c.witness))}</p></div>`;
  printDocument(`${t('ใบยินยอมการรักษา')} ${p.pet}`, body, { paper: 'a4', lang });
}

/** What the owner sees after a heading, or a dash */
const para = (text: string, t: Translate) => `<p>${esc(text.trim() ? t(text) : '—')}</p>`;

/** The discharge summary, on A4: what was found, the drugs to give at home, what to watch for and the follow-up */
export function printDischarge(p: Patient, owner: Owner, n: EncounterNote, rxs: Prescription[], followUp: Appointment | undefined, no: string,
  t: Translate, lang: 'th' | 'en') {
  const meds = rxs.length
    ? `<table><thead><tr><th>${esc(t('ยา'))}</th><th>${esc(t('วิธีใช้'))}</th><th class="num">${esc(t('จำนวน'))}</th></tr></thead><tbody>${rxs.map(rx =>
      `<tr><td>${esc(rx.drug)}</td><td>${esc([t(rx.route), t(rx.dose), t(rx.freq), t(rx.days)].filter(x => x && x !== '—').join(' · '))}${rx.advice ? `<br><span class="muted">${esc(t(rx.advice))}</span>` : ''}</td><td class="num">${esc(t(rx.qty))}</td></tr>`).join('')}</tbody></table>`
    : `<p>—</p>`;
  const next = followUp
    ? `<p><b>${esc(formatDate(followUp.date, 'long', lang))} · ${esc(followUp.slot)}</b> · ${esc(t(followUp.provider))} · ${esc(t(followUp.room))}</p><p class="muted">${esc(t(followUp.reason))}</p>`
    : para(n.followup, t);
  const body = `${pageHead('สรุปการจำหน่าย', no, p, owner, t, lang)}
    <h2>${esc(t('สรุปการวินิจฉัย'))}</h2>${para(n.summary || n.dx, t)}
    <h2>${esc(t('ยากลับบ้าน'))}</h2>${meds}
    <h2>${esc(t('การดูแลที่บ้าน'))}</h2>${para(n.home, t)}
    <h2>${esc(t('อาหารและการจำกัดกิจกรรม'))}</h2>${para(n.restrict, t)}
    <div class="box"><b>${esc(t('กลับมาพบสัตวแพทย์ทันทีหาก'))}</b>${para(n.warning, t)}</div>
    <h2>${esc(t('นัดติดตาม'))}</h2>${next}
    <div class="sign"><div>${esc(t(p.vet))}<br><span class="muted">${esc(t('สัตวแพทย์ผู้รักษา'))}</span></div><div>${esc(owner.name)}<br><span class="muted">${esc(t('ผู้รับเอกสาร'))}</span></div></div>`;
  printDocument(`${t('สรุปการจำหน่าย')} ${p.pet}`, body, { paper: 'a4', lang });
}

/** What a medical certificate is for */
export const CERTIFICATE_PURPOSES = ['ประกอบการเคลมประกันสัตว์เลี้ยง', 'ประกอบการเดินทาง', 'ประกอบการลางานของเจ้าของ', 'อื่นๆ'];

/** A medical certificate of today's examination, on A5, signed by the vet */
export function printCertificate(p: Patient, owner: Owner, c: { purpose: string; finding: string; remark: string; vet: string }, no: string,
  t: Translate, lang: 'th' | 'en') {
  const body = `${pageHead('ใบรับรองแพทย์', no, p, owner, t, lang)}
    <p>${esc(t('ขอรับรองว่าได้ตรวจสัตว์ข้างต้นเมื่อ {0}', { 0: formatDate(TODAY, 'long', lang) }))}</p>
    <h2>${esc(t('ผลการตรวจ'))}</h2>${para(c.finding, t)}
    ${c.remark ? `<h2>${esc(t('ความเห็นของสัตวแพทย์'))}</h2>${para(c.remark, t)}` : ''}
    <p class="muted">${esc(t('ใช้เพื่อ'))}: ${esc(t(c.purpose))}</p>
    <div class="sign"><div>${esc(t(c.vet))}<br><span class="muted">${esc(t('สัตวแพทย์ผู้ตรวจ · เลขที่ใบอนุญาต'))} ____________</span></div></div>`;
  printDocument(`${t('ใบรับรองแพทย์')} ${p.pet}`, body, { paper: 'a5', lang });
}

/** Today's treatment sheet, on A4 landscape, for the cage: every drug against its times, what was given, and the drips */
export function printTreatmentSheet(p: Patient, owner: Owner, data: ClinicData, t: Translate, lang: 'th' | 'en') {
  const a = p.admission!;
  const orders = marOrders(data, p);
  const times = sheetTimes(orders);
  const cell = (rx: Prescription, slot: string) => {
    if (!rx.marTimes?.includes(slot)) {
      return '<td class="num">—</td>';
    }
    const state = slotState(rx, slot);
    const dose = rx.doses?.find(d => d.slot === slot);
    if (!dose) {
      return `<td class="num">${state === 'late' ? `<b>${esc(t('ช้า'))}</b>` : '☐'}</td>`;
    }
    const label = DOSE_OUTCOMES.find(o => o.value === dose.outcome)!.label;
    return `<td class="num">${esc(t(label))}<br><span class="muted">${esc(dose.at)} ${esc(t(dose.by))}</span></td>`;
  };
  const rows = orders.map(rx => `<tr><td><b>${esc(rx.drug)}</b>${isControlled(rx.drug) ? ` <span class="warn">CTRL</span>` : ''}<br><span class="muted">${esc(t(rx.dose))} · ${esc(t(rx.route))} · ${esc(t(rx.freq))}</span></td>${times.map(s => cell(rx, s)).join('')}</tr>`).join('');
  const lines = liveLines(a).map(l => `<tr><td>${esc(l.fluid)}</td><td>${esc(l.route)}</td><td class="num">${esc(l.rate)} mL/hr</td><td class="num">${esc(infusedTotal(l))} mL</td><td>${esc(t(INFUSION_STATUS[l.status].label))}</td></tr>`).join('');
  const body = `${pageHead('ตารางให้ยาและการรักษา (MAR)', `${wardOf(a.bed)?.name ?? ''} · ${a.bed}`, p, owner, t, lang)}
    <p>${esc(t('รับไว้'))}: ${esc(a.at)} · ${esc(t(a.vet))} · ${esc(t(a.reason))} · ${esc(t('วันที่ {n} ของการรักษา', { n: stayDay(a) }))}</p>
    ${p.alerts.length ? `<div class="box"><b>${esc(t('Clinical alerts'))}:</b> ${esc(p.alerts.map(x => t(x.label)).join(' · '))}</div>` : ''}
    <h2>${esc(t('ยา'))}</h2>
    <table><thead><tr><th>${esc(t('ยา'))}</th>${times.map(s => `<th class="num">${esc(s)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${times.length + 1}">—</td></tr>`}</tbody></table>
    <h2>${esc(t('สายน้ำเกลือ'))}</h2>
    <table><thead><tr><th>${esc(t('สารน้ำ'))}</th><th>${esc(t('ทาง'))}</th><th class="num">${esc(t('อัตรา'))}</th><th class="num">${esc(t('ให้แล้ว'))}</th><th>${esc(t('สถานะ'))}</th></tr></thead><tbody>${lines || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
    <p class="muted">${esc(t('พิมพ์เมื่อ {0} — บันทึกในระบบเป็นหลัก กระดาษใช้ที่กรงเท่านั้น', { 0: formatDate(TODAY, 'short', lang) }))}</p>`;
  printDocument(`MAR ${p.pet}`, body, { paper: 'a4', lang, css: '@page { size: A4 landscape; }' });
}

/** The receipt for what has been paid on an invoice, on A5 */
export function printReceipt(i: Invoice, owner: Owner | undefined, t: Translate, lang: 'th' | 'en') {
  const rows = i.items.map(item => `<tr><td>${esc(t(item[0]))}</td><td class="num">${esc(baht(item[1]))}</td></tr>`).join('');
  const paid = (i.payments ?? []).map(x => `<tr><td>${esc(x[0])} · ${esc(t(x[2]))}</td><td class="num">${esc(baht(x[1]))}</td></tr>`).join('');
  const body = `
    <div class="head"><div><h1>${esc(t(HOSPITAL))}</h1><p class="muted">${esc(t('ใบเสร็จรับเงิน'))}</p></div>
      <div style="text-align: right"><b>${esc(i.no)}</b><p class="muted">${esc(formatDate(TODAY, 'long', lang))}</p></div></div>
    <p>${esc(t('ได้รับเงินจาก'))}: ${esc(owner?.name ?? i.ownerKey)} · ${esc(i.pet)} · ${esc(t(i.title))}</p>
    <table><tbody>${rows}</tbody><tfoot><tr><th>${esc(t('รวม'))}</th><th class="num">${esc(baht(i.total))}</th></tr></tfoot></table>
    <h2>${esc(t('การชำระ'))}</h2><table><tbody>${paid}</tbody>
      <tfoot><tr><th>${esc(t('ชำระแล้ว'))}</th><th class="num">${esc(baht(i.paid))}</th></tr><tr><th>${esc(t('คงค้าง'))}</th><th class="num">${esc(baht(i.total - i.paid))}</th></tr></tfoot></table>
    <div class="sign"><div>${esc(t('ผู้รับเงิน'))}</div></div>`;
  printDocument(`${t('ใบเสร็จรับเงิน')} ${i.no}`, body, { paper: 'a5', lang });
}
