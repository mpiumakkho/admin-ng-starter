/*
 * Registering a pet and its owner at the front desk, as SEPH1's registration screen does (seph1-fe,
 * src/screens/Register.tsx): the pet, its owner (one owner, many pets), the owner's address, consent to use the data
 * for treatment; then saved, or saved and sent to today's queue. What it needs from the records and does to them is
 * here, apart from the page, so the Angular and React apps share it.
 */
import { defaultHandoff, NOW, nextSeq, TODAY } from './model';
import type { ClinicData, Owner, Patient, PetKind } from './types';

export const SPECIES: { value: PetKind; label: string }[] = [
  { value: 'dog', label: 'สุนัข' }, { value: 'cat', label: 'แมว' }, { value: 'other', label: 'อื่นๆ' },
];
export const speciesLabel = (kind: PetKind) => SPECIES.find(s => s.value === kind)?.label ?? 'อื่นๆ';

/** The breed catalogue: a breed is picked from it, so the same breed is never written three ways */
export const BREEDS: Record<PetKind, string[]> = {
  dog: [
    'Golden Retriever', 'Labrador Retriever', 'French Bulldog', 'Pomeranian', 'Shih Tzu', 'Poodle', 'Chihuahua', 'Beagle',
    'Siberian Husky', 'Welsh Corgi', 'Thai Ridgeback', 'Bangkaew', 'พันธุ์ผสม',
  ],
  cat: [
    'Persian', 'Scottish Fold', 'British Shorthair', 'American Shorthair', 'Siamese', 'Bengal', 'Maine Coon', 'Ragdoll',
    'Exotic Shorthair', 'Khao Manee', 'Korat', 'พันธุ์ผสม',
  ],
  other: ['กระต่าย', 'หนูแฮมสเตอร์', 'นกแก้ว', 'เต่า', 'เฟอร์เร็ต'],
};

/** Where a newly registered pet goes when it is sent to the queue: the reason on its card, and how urgent */
export const ROUTES = ['คิว OPD (ตรวจทั่วไป)', 'ห้องฉุกเฉิน', 'วัคซีน', 'อาบน้ำ-ตัดขน', 'การเงิน'];
const EMERGENCY_ROUTE = 'ห้องฉุกเฉิน';

/** The owner's title, picked rather than typed; "อื่นๆ" opens a box for any other (ดร., พ.ต.ท.) */
export const TITLES = ['นาย', 'นาง', 'นางสาว'];
export const OTHER_TITLE = 'อื่นๆ';

/** The 77 provinces, Bangkok first, as [Thai, English]: picked from the list, so one province is never written two ways */
export const PROVINCES: [th: string, en: string][] = [
  ['กรุงเทพมหานคร', 'Bangkok'], ['กระบี่', 'Krabi'], ['กาญจนบุรี', 'Kanchanaburi'], ['กาฬสินธุ์', 'Kalasin'],
  ['กำแพงเพชร', 'Kamphaeng Phet'], ['ขอนแก่น', 'Khon Kaen'], ['จันทบุรี', 'Chanthaburi'], ['ฉะเชิงเทรา', 'Chachoengsao'],
  ['ชลบุรี', 'Chon Buri'], ['ชัยนาท', 'Chai Nat'], ['ชัยภูมิ', 'Chaiyaphum'], ['ชุมพร', 'Chumphon'], ['เชียงราย', 'Chiang Rai'],
  ['เชียงใหม่', 'Chiang Mai'], ['ตรัง', 'Trang'], ['ตราด', 'Trat'], ['ตาก', 'Tak'], ['นครนายก', 'Nakhon Nayok'],
  ['นครปฐม', 'Nakhon Pathom'], ['นครพนม', 'Nakhon Phanom'], ['นครราชสีมา', 'Nakhon Ratchasima'],
  ['นครศรีธรรมราช', 'Nakhon Si Thammarat'], ['นครสวรรค์', 'Nakhon Sawan'], ['นนทบุรี', 'Nonthaburi'], ['นราธิวาส', 'Narathiwat'],
  ['น่าน', 'Nan'], ['บึงกาฬ', 'Bueng Kan'], ['บุรีรัมย์', 'Buri Ram'], ['ปทุมธานี', 'Pathum Thani'],
  ['ประจวบคีรีขันธ์', 'Prachuap Khiri Khan'], ['ปราจีนบุรี', 'Prachin Buri'], ['ปัตตานี', 'Pattani'],
  ['พระนครศรีอยุธยา', 'Phra Nakhon Si Ayutthaya'], ['พะเยา', 'Phayao'], ['พังงา', 'Phangnga'], ['พัทลุง', 'Phatthalung'],
  ['พิจิตร', 'Phichit'], ['พิษณุโลก', 'Phitsanulok'], ['เพชรบุรี', 'Phetchaburi'], ['เพชรบูรณ์', 'Phetchabun'], ['แพร่', 'Phrae'],
  ['ภูเก็ต', 'Phuket'], ['มหาสารคาม', 'Maha Sarakham'], ['มุกดาหาร', 'Mukdahan'], ['แม่ฮ่องสอน', 'Mae Hong Son'],
  ['ยโสธร', 'Yasothon'], ['ยะลา', 'Yala'], ['ร้อยเอ็ด', 'Roi Et'], ['ระนอง', 'Ranong'], ['ระยอง', 'Rayong'],
  ['ราชบุรี', 'Ratchaburi'], ['ลพบุรี', 'Lop Buri'], ['ลำปาง', 'Lampang'], ['ลำพูน', 'Lamphun'], ['เลย', 'Loei'],
  ['ศรีสะเกษ', 'Si Sa Ket'], ['สกลนคร', 'Sakon Nakhon'], ['สงขลา', 'Songkhla'], ['สตูล', 'Satun'], ['สมุทรปราการ', 'Samut Prakan'],
  ['สมุทรสงคราม', 'Samut Songkhram'], ['สมุทรสาคร', 'Samut Sakhon'], ['สระแก้ว', 'Sa Kaeo'], ['สระบุรี', 'Saraburi'],
  ['สิงห์บุรี', 'Sing Buri'], ['สุโขทัย', 'Sukhothai'], ['สุพรรณบุรี', 'Suphan Buri'], ['สุราษฎร์ธานี', 'Surat Thani'],
  ['สุรินทร์', 'Surin'], ['หนองคาย', 'Nong Khai'], ['หนองบัวลำภู', 'Nong Bua Lam Phu'], ['อ่างทอง', 'Ang Thong'],
  ['อำนาจเจริญ', 'Amnat Charoen'], ['อุดรธานี', 'Udon Thani'], ['อุตรดิตถ์', 'Uttaradit'], ['อุทัยธานี', 'Uthai Thani'],
  ['อุบลราชธานี', 'Ubon Ratchathani'],
];

/* The owner's address: two tabs, each a record of its own; the current one is saved, else the registered one */
export type AddressKind = 'current' | 'house';
export interface Address {
  place: string; landmark: string; no: string; moo: string; soi: string; road: string;
  tambon: string; amphoe: string; province: string; zip: string;
}
export const ADDRESS_TABS: { id: AddressKind; label: string }[] = [
  { id: 'current', label: 'ปัจจุบัน' }, { id: 'house', label: 'ทะเบียนบ้าน' },
];
export const emptyAddress = (): Address => ({ place: '', landmark: '', no: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', zip: '' });
export const emptyAddresses = (): Record<AddressKind, Address> => ({ current: emptyAddress(), house: emptyAddress() });

/** The tab that will be saved: the first whose area is whole (subdistrict, district, province, postcode) */
export function savedAddressKind(all: Record<AddressKind, Address>): AddressKind | null {
  const whole = (a: Address) => !!(a.tambon.trim() && a.amphoe.trim() && a.province.trim() && a.zip.trim());
  return whole(all.current) ? 'current' : whole(all.house) ? 'house' : null;
}

function addressText(a: Address): string {
  const street = [a.no.trim(), a.moo.trim() && `หมู่ ${a.moo.trim()}`, a.soi.trim() && `ซ.${a.soi.trim()}`, a.road.trim() && `ถ.${a.road.trim()}`]
    .filter(Boolean).join(' ');
  const place = [a.place.trim(), a.landmark.trim()].filter(Boolean).join(' · ');
  const area = [a.tambon, a.amphoe, a.province, a.zip].map(v => v.trim()).filter(Boolean).join(' ');
  return [street, place, area].filter(Boolean).join(' · ');
}

/**
 * One line for the form, "123/4 หมู่ 5 ซ.ลาดพร้าว 1 · บางกะปิ ห้วยขวาง กรุงเทพฯ 10310": the tab that will be saved, else
 * any tab with something in it, so a half-typed address shows on the form and not only in its sheet
 */
export function addressSummary(all: Record<AddressKind, Address>): string {
  const kind = savedAddressKind(all) ?? ADDRESS_TABS.map(t => t.id).find(k => Object.values(all[k]).some(v => v.trim()));
  return kind ? addressText(all[kind]) : '';
}

/** Years, months and days lived, borrowing from the month before; null for a date that is not one, or in the future */
export function ageFromIso(iso: string, now = new Date(TODAY + 'T12:00:00')): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return null;
  }
  const [by, bm, bd] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const dob = new Date(by, bm - 1, bd);
  if (Number.isNaN(dob.getTime()) || dob.getMonth() !== bm - 1 || dob > now) {
    return null;
  }
  let y = now.getFullYear() - by;
  let m = now.getMonth() - (bm - 1);
  let d = now.getDate() - bd;
  if (d < 0) {
    m -= 1;
    d += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return { y, m, d };
}

export type Sex = 'm' | 'f' | 'u';

/** What the form holds */
export interface RegistrationDraft {
  pet: string; microchip: string; kind: PetKind;
  /** From the catalogue; text typed without picking one is not a breed */
  breed: string;
  color: string; sex: Sex; neutered: boolean;
  /** ISO date of birth; known, or the owner's guess */
  dob: string; dobKnown: boolean;
  /** How to handle the pet safely: "กัด", "ต้องใส่ปลอกปาก" */
  caution: string;
  /** An owner already on file, picked from the search; null for a new owner */
  ownerKey: string | null;
  title: string; first: string; last: string; phone: string; mobile: string; email: string; thaiId: string;
  addresses: Record<AddressKind, Address>;
  /** Consent to use the data for treatment: the lawful basis for keeping the record, so it is required */
  pdpa: boolean;
}

export const emptyDraft = (): RegistrationDraft => ({
  pet: '', microchip: '', kind: 'dog', breed: '', color: '', sex: 'm', neutered: false, dob: '', dobKnown: true, caution: '',
  ownerKey: null, title: '', first: '', last: '', phone: '', mobile: '', email: '', thaiId: '', addresses: emptyAddresses(), pdpa: true,
});

export const ownerFullName = (d: Pick<RegistrationDraft, 'title' | 'first' | 'last'>) =>
  [d.title.trim(), d.first.trim(), d.last.trim()].filter(Boolean).join(' ');

/** The required fields still empty, by their labels */
export function missingFields(d: RegistrationDraft): string[] {
  return [
    !d.pet.trim() && 'ชื่อสัตว์',
    !d.first.trim() && 'ชื่อเจ้าของ',
    !d.phone.trim() && 'เบอร์โทร',
    !d.pdpa && 'ความยินยอม PDPA',
  ].filter((label): label is string => !!label);
}

const digits = (s: string) => s.replace(/\D/g, '');

/** A pet on file: today's patients, and the other pets of the owners, which are on file but not in the queue */
export interface PetRecord { pet: string; code: string; hn: string; kind: PetKind; ownerKey: string; patient?: Patient }

export function petRecords(data: ClinicData): PetRecord[] {
  const records: PetRecord[] = data.patients.map(p => ({ pet: p.pet, code: p.code, hn: p.hn, kind: p.kind, ownerKey: p.ownerKey, patient: p }));
  for (const [key, owner] of Object.entries(data.owners)) {
    for (const entry of owner.pets) {
      const [pet, species, code] = entry.split(' · ');
      if (code && !records.some(r => r.code === code)) {
        records.push({ pet, code, hn: '—', kind: SPECIES.find(s => s.label === species)?.value ?? 'other', ownerKey: key });
      }
    }
  }
  return records;
}

/** Records whose HN, code, name, owner or owner's phone hold the query; from two characters */
export function searchPets(data: ClinicData, query: string): PetRecord[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return [];
  }
  const phone = digits(q);
  return petRecords(data).filter(r => {
    const owner = data.owners[r.ownerKey];
    return [r.pet, r.code, r.hn, owner?.name ?? ''].some(v => v.toLowerCase().includes(q))
      || (phone.length >= 3 && digits(owner?.phone ?? '').includes(phone));
  }).slice(0, 8);
}

/** Owners whose name, phone, email or pets hold the query */
export function searchOwners(data: ClinicData, query: string): [key: string, owner: Owner][] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const phone = digits(q);
  return Object.entries(data.owners).filter(([, o]) =>
    [o.name, o.email, o.thaiId ?? '', ...o.pets].some(v => v.toLowerCase().includes(q))
    || (phone.length >= 3 && [o.phone, o.phone2, o.thaiId ?? ''].some(v => digits(v).includes(phone))));
}

/** The form filled from an owner on file: their names, phones, email and ID; their address stays as it is on file */
export function draftFromOwner(draft: RegistrationDraft, key: string, owner: Owner): RegistrationDraft {
  const [first, ...rest] = owner.name.trim().split(/\s+/);
  const value = (v: string) => (v === '—' ? '' : v);
  return {
    ...draft, ownerKey: key, title: '', first: first ?? '', last: rest.join(' '), phone: value(owner.phone), mobile: value(owner.phone2),
    email: value(owner.email), thaiId: owner.thaiId ?? '', addresses: emptyAddresses(),
  };
}

/** The form filled from a pet on file, and its owner */
export function draftFromRecord(data: ClinicData, r: PetRecord): RegistrationDraft {
  const p = r.patient;
  const owner = data.owners[r.ownerKey];
  const base: RegistrationDraft = { ...emptyDraft(), pet: r.pet, kind: r.kind };
  const filled = owner ? draftFromOwner(base, r.ownerKey, owner) : base;
  if (!p) {
    return filled;
  }
  const value = (v: string) => (v === '—' ? '' : v);
  return {
    ...filled, microchip: value(p.microchip), breed: BREEDS[p.kind].includes(p.breed) ? p.breed : '',
    sex: p.sex.startsWith('ผู้') ? 'm' : p.sex.startsWith('เมีย') ? 'f' : 'u', neutered: p.sex.includes('ทำหมัน'), caution: value(p.note),
  };
}

/** A pet already on file that registering this one would copy */
export interface Duplicate { record: PetRecord; owner: string; reasons: string[] }

/**
 * Two checks before a new record, as SEPH1's registry makes them: the same microchip, or the same Thai ID with the
 * same pet name, is the same animal and blocks the save (`exact`); the same name and kind with the same owner or the
 * same phone is probably the same animal and asks first (`probable`).
 */
export function findDuplicates(data: ClinicData, d: RegistrationDraft): { exact?: Duplicate & { field: string }; probable: Duplicate[] } {
  const records = petRecords(data);
  const ownerName = (r: PetRecord) => data.owners[r.ownerKey]?.name ?? '—';
  const chip = digits(d.microchip);
  const byChip = chip.length >= 9 ? records.find(r => r.patient && digits(r.patient.microchip) === chip) : undefined;
  if (byChip) {
    return { exact: { record: byChip, owner: ownerName(byChip), reasons: [], field: 'Microchip' }, probable: [] };
  }
  const id = digits(d.thaiId);
  const name = d.pet.trim().toLowerCase();
  const byId = id.length === 13 ? records.find(r => digits(data.owners[r.ownerKey]?.thaiId ?? '') === id && r.pet.toLowerCase() === name) : undefined;
  if (byId) {
    return { exact: { record: byId, owner: ownerName(byId), reasons: [], field: 'Thai ID' }, probable: [] };
  }
  const phone = digits(d.phone);
  const probable = records.filter(r => r.pet.toLowerCase() === name && r.kind === d.kind).flatMap(r => {
    const owner = data.owners[r.ownerKey];
    const reasons = [
      d.ownerKey === r.ownerKey && 'เจ้าของคนเดียวกัน',
      phone.length >= 9 && owner && [owner.phone, owner.phone2].some(v => digits(v) === phone) && 'เบอร์โทรเดียวกัน',
    ].filter((reason): reason is string => !!reason);
    return reasons.length ? [{ record: r, owner: ownerName(r), reasons: ['ชื่อและชนิดเดียวกัน', ...reasons] }] : [];
  });
  return { probable };
}

function sexText(d: RegistrationDraft): string {
  const sex = d.sex === 'm' ? 'ผู้' : d.sex === 'f' ? 'เมีย' : 'ไม่ทราบเพศ';
  return d.neutered ? `${sex} (ทำหมัน)` : sex;
}

function ageText(d: RegistrationDraft): string {
  const age = ageFromIso(d.dob);
  if (!age) {
    return '—';
  }
  const text = age.y ? `${age.y} ปี ${age.m} เดือน` : age.m ? `${age.m} เดือน ${age.d} วัน` : `${age.d} วัน`;
  return d.dobKnown ? text : `ประมาณ ${text}`;
}

/**
 * Saves the pet, and the owner when they are new, on file; with a route, also sends the pet to today's queue, arrived
 * now. Returns the pet's code, its HN, and its place in the queue when it was sent there. A force-create reason, which
 * only an administrator gives past a probable duplicate, is kept on the pet's note.
 */
export function registerPet(data: ClinicData, d: RegistrationDraft, options: { route: string | null; by: string; forceReason?: string }):
  { code: string; hn: string; patient: Patient | null } {
  const name = ownerFullName(d);
  let key = d.ownerKey;
  if (!key || !data.owners[key]) {
    key = name;
    for (let n = 2; data.owners[key]; n++) {
      key = `${name} (${n})`;
    }
    const savedKind = savedAddressKind(d.addresses);
    data.owners[key] = {
      name, phone: d.phone.trim(), phone2: d.mobile.trim() || '—', email: d.email.trim() || '—', line: '—', coOwner: '—',
      address: savedKind ? addressText(d.addresses[savedKind]) : '—', consent: '—', pdpa: d.pdpa ? `ยินยอม · ${TODAY}` : 'ไม่ยินยอม',
      prefer: 'โทรศัพท์', badges: [], pets: [], note: '—', insurance: '—', appts: [], thaiId: digits(d.thaiId) || undefined,
    };
  } else {
    const owner = data.owners[key];
    const savedKind = savedAddressKind(d.addresses);
    if (savedKind) {
      owner.address = addressText(d.addresses[savedKind]);
    }
    owner.phone = d.phone.trim() || owner.phone;
    owner.phone2 = d.mobile.trim() || owner.phone2;
    owner.email = d.email.trim() || owner.email;
    owner.thaiId = digits(d.thaiId) || owner.thaiId;
  }
  const owner = data.owners[key];
  const records = petRecords(data);
  const code = nextSeq(records.map(r => r.code), 'V');
  const hn = nextSeq(records.map(r => r.hn), 'HN-');
  owner.pets.push(`${d.pet.trim()} · ${speciesLabel(d.kind)} · ${code}`);

  if (!options.route) {
    return { code, hn, patient: null };
  }
  const caution = d.caution.trim();
  const emergency = options.route === EMERGENCY_ROUTE;
  const stages: Patient['stages'] = [
    { key: 'arrival', at: NOW, by: options.by, loc: 'Reception' },
    { key: 'checkin', at: null }, { key: 'room', at: null }, { key: 'treatment', at: null }, { key: 'discharge', at: null },
  ];
  const patient: Patient = {
    id: Math.max(0, ...data.patients.map(p => p.id)) + 1, time: NOW, pet: d.pet.trim(), kind: d.kind, code, hn,
    species: speciesLabel(d.kind), breed: d.breed || '—', sex: sexText(d), age: ageText(d), weight: '—', weightAt: '—',
    microchip: digits(d.microchip) || '—', blood: '—', ownerKey: key,
    reason: options.route, chief: '—', triage: emergency ? 'Emergency' : 'Routine', triageCls: emergency ? 'danger' : 'ok',
    vet: '—', nurse: '—', stages,
    alerts: caution ? [{ type: 'handling', label: `Handling · ${caution}`, recordedBy: options.by }] : [],
    tasks: [], tasksDone: [], problems: [], meds: [], vaccines: [], visits: [],
    docs: options.forceReason ? [[`สร้างระเบียนใหม่แม้อาจซ้ำ · ${options.by}`, options.forceReason]] : [],
    note: caution || '—', handoff: defaultHandoff({ stages }),
  };
  data.patients.push(patient);
  return { code, hn, patient };
}

/** Sends a pet already on file, but not in today's queue, to the queue */
export function sendToQueue(data: ClinicData, r: PetRecord, route: string, by: string): Patient {
  // As registerPet makes a patient, keeping the pet's code and owner rather than filing it again
  const emergency = route === EMERGENCY_ROUTE;
  const stages: Patient['stages'] = [
    { key: 'arrival', at: NOW, by, loc: 'Reception' },
    { key: 'checkin', at: null }, { key: 'room', at: null }, { key: 'treatment', at: null }, { key: 'discharge', at: null },
  ];
  const patient: Patient = {
    id: Math.max(0, ...data.patients.map(p => p.id)) + 1, time: NOW, pet: r.pet, kind: r.kind, code: r.code,
    hn: r.hn !== '—' ? r.hn : nextSeq(petRecords(data).map(x => x.hn), 'HN-'),
    species: speciesLabel(r.kind), breed: '—', sex: '—', age: '—', weight: '—', weightAt: '—', microchip: '—', blood: '—',
    ownerKey: r.ownerKey, reason: route, chief: '—', triage: emergency ? 'Emergency' : 'Routine', triageCls: emergency ? 'danger' : 'ok',
    vet: '—', nurse: '—', stages, alerts: [], tasks: [], tasksDone: [], problems: [], meds: [], vaccines: [], visits: [], docs: [],
    note: '—', handoff: defaultHandoff({ stages }),
  };
  data.patients.push(patient);
  return patient;
}
