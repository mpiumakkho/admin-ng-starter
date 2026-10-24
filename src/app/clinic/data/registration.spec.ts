import {
  addressSummary, ageFromIso, draftFromRecord, emptyAddresses, emptyDraft, findDuplicates, missingFields, petRecords, PROVINCES, registerPet,
  type RegistrationDraft, savedAddressKind, searchOwners, searchPets, sendToQueue,
} from './registration';
import { createSeed } from './seed';

const draft = (changes: Partial<RegistrationDraft>): RegistrationDraft => ({ ...emptyDraft(), ...changes });

describe('registration', () => {
  it('works out an age from the date of birth, borrowing from the month before, and refuses a date that is not one', () => {
    const now = new Date('2026-09-24T12:00:00');
    expect(ageFromIso('2024-03-10', now)).toEqual({ y: 2, m: 6, d: 14 });
    expect(ageFromIso('2026-08-31', now)).toEqual({ y: 0, m: 0, d: 24 });
    expect(ageFromIso('2026-02-31', now)).toBeNull();
    expect(ageFromIso('2027-01-01', now)).toBeNull();
    expect(ageFromIso('', now)).toBeNull();
  });

  it('saves the current address once its area is whole, else the registered one, and shows whatever was typed', () => {
    const all = emptyAddresses();
    all.current = { ...all.current, no: '123/4', moo: '5', soi: 'ลาดพร้าว 1', tambon: 'บางกะปิ' };
    expect(savedAddressKind(all)).toBeNull();
    expect(addressSummary(all)).toBe('123/4 หมู่ 5 ซ.ลาดพร้าว 1 · บางกะปิ');
    all.house = { ...all.house, tambon: 'สวนหลวง', amphoe: 'สวนหลวง', province: 'กรุงเทพฯ', zip: '10250' };
    expect(savedAddressKind(all)).toBe('house');
    all.current = { ...all.current, amphoe: 'ห้วยขวาง', province: 'กรุงเทพฯ', zip: '10310' };
    expect(savedAddressKind(all)).toBe('current');
  });

  it('asks for the pet, the owner, a phone and consent', () => {
    expect(missingFields(emptyDraft())).toEqual(['ชื่อสัตว์', 'ชื่อเจ้าของ', 'เบอร์โทร']);
    expect(missingFields(draft({ pet: 'Lucky', first: 'Pim', phone: '0890000000', pdpa: false }))).toEqual(['ความยินยอม PDPA']);
  });

  it('lists the 77 provinces once each, Bangkok first', () => {
    expect(PROVINCES).toHaveLength(77);
    expect(new Set(PROVINCES.map(([th]) => th)).size).toBe(77);
    expect(PROVINCES[0]).toEqual(['กรุงเทพมหานคร', 'Bangkok']);
  });

  it('finds pets on file, in the queue or not, by HN, code, name, owner or phone', () => {
    const data = createSeed();
    expect(searchPets(data, 'L')).toEqual([]);
    expect(searchPets(data, 'HN-190412').map(r => r.pet)).toEqual(['Luna']);
    // Kiki is Somsak's other cat: on file, not in today's queue
    const kiki = searchPets(data, 'kiki')[0];
    expect(kiki).toMatchObject({ pet: 'Kiki', code: 'V123401', kind: 'cat', ownerKey: 'Somsak W.' });
    expect(kiki.patient).toBeUndefined();
    expect(searchPets(data, '081-234-5678').map(r => r.pet)).toEqual(expect.arrayContaining(['Luna', 'Kiki']));
    expect(searchOwners(data, 'somsak').map(([key]) => key)).toEqual(['Somsak W.']);
    expect(draftFromRecord(data, kiki)).toMatchObject({ pet: 'Kiki', kind: 'cat', ownerKey: 'Somsak W.', first: 'Somsak', last: 'W.', phone: '081-234-5678' });
  });

  it('stops the same microchip, and asks about the same name and kind of the same owner or phone', () => {
    const data = createSeed();
    const luna = data.patients.find(p => p.pet === 'Luna')!;
    expect(findDuplicates(data, draft({ pet: 'Other', microchip: luna.microchip })).exact).toMatchObject({ field: 'Microchip', record: { pet: 'Luna' } });
    const probable = findDuplicates(data, draft({ pet: 'kiki', kind: 'cat', ownerKey: 'Somsak W.' })).probable;
    expect(probable.map(c => [c.record.pet, c.reasons])).toEqual([['Kiki', ['ชื่อและชนิดเดียวกัน', 'เจ้าของคนเดียวกัน']]]);
    expect(findDuplicates(data, draft({ pet: 'Kiki', kind: 'cat', phone: '081 234 5678' })).probable[0].reasons).toContain('เบอร์โทรเดียวกัน');
    expect(findDuplicates(data, draft({ pet: 'Kiki', kind: 'dog', ownerKey: 'Somsak W.' })).probable).toEqual([]);
  });

  it('files a new owner and pet, and sends the pet to the queue when it has a route', () => {
    const data = createSeed();
    const before = data.patients.length;
    const filed = registerPet(data, draft({ pet: 'Taohu', kind: 'cat', first: 'Pim', last: 'S.', phone: '0895550101' }), { route: null, by: 'พ.ส. ณิชา' });
    expect(filed.patient).toBeNull();
    expect(data.patients).toHaveLength(before);
    expect(data.owners['Pim S.']).toMatchObject({ phone: '0895550101', pets: [`Taohu · แมว · ${filed.code}`], pdpa: 'ยินยอม · 2026-09-24' });

    const queued = registerPet(data, draft({ pet: 'Bua', kind: 'dog', ownerKey: 'Pim S.', first: 'Pim', last: 'S.', phone: '0895550101', caution: 'กัด' }),
      { route: 'ห้องฉุกเฉิน', by: 'พ.ส. ณิชา' });
    expect(queued.code).not.toBe(filed.code);
    expect(queued.patient).toMatchObject({
      pet: 'Bua', ownerKey: 'Pim S.', reason: 'ห้องฉุกเฉิน', triage: 'Emergency', triageCls: 'danger', time: '11:32',
      alerts: [{ type: 'handling', label: 'Handling · กัด', recordedBy: 'พ.ส. ณิชา' }],
    });
    expect(queued.patient!.stages[0]).toEqual({ key: 'arrival', at: '11:32', by: 'พ.ส. ณิชา', loc: 'Reception' });
    expect(data.owners['Pim S.'].pets).toHaveLength(2);
    expect(petRecords(data).filter(r => r.ownerKey === 'Pim S.').map(r => r.pet)).toEqual(['Bua', 'Taohu']);
  });

  it('sends a pet on file to the queue with its own code', () => {
    const data = createSeed();
    const kiki = searchPets(data, 'kiki')[0];
    const p = sendToQueue(data, kiki, 'วัคซีน', 'พ.ส. ณิชา');
    expect(p).toMatchObject({ pet: 'Kiki', code: 'V123401', ownerKey: 'Somsak W.', reason: 'วัคซีน', triage: 'Routine' });
    expect(searchPets(data, 'kiki')[0].patient).toBe(p);
  });
});
