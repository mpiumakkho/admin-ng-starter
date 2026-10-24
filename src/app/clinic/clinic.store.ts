import { computed, inject, Injectable, signal } from '@angular/core';

import { fullName, Session } from '../user-management';

import {
  advanceStage, defaultNote, ENCOUNTER_ORDERS, LAB_VALUES, NOW, nextSeq, ORDER_FLOW, RX_FLOW, SOAP_FIELDS, stageKey, TODAY,
} from './data/model';
import { type PetRecord, registerPet, type RegistrationDraft, sendToQueue } from './data/registration';
import { createSeed } from './data/seed';
import type { AckMethod, ClinicData, EncounterNote, LabResult, Order, Owner, Patient, Prescription, StageKey } from './data/types';

/** What an order is made from: a catalog item or one of the encounter's suggestions */
export interface CatalogItemLike { name: string; kind: string; dept: string; price: string }

/** Who works in the workspace when nobody is signed in, as in tests: the sample vet the design is drawn for */
const SAMPLE_VET = 'น.สพ. นรินทร์';

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim());

/**
 * The clinic's sample data and what the workspace does with it. It lasts as long as the app is open, so a change made
 * on one tab shows on the others and is still there after leaving the workspace and coming back.
 *
 * The records change in place, as in the design; `data` is a signal that tells everyone on every change.
 */
@Injectable({ providedIn: 'root' })
export class ClinicStore {
  private readonly session = inject(Session);
  /** The signed-in person: the name the workspace records on what they do, as in the header */
  readonly userName = computed(() => {
    const me = this.session.user();
    return me ? fullName(me) : SAMPLE_VET;
  });
  readonly data = signal<ClinicData>(createSeed(), { equal: () => false });
  private readonly selectedId = signal(5);

  readonly selected = computed<Patient>(() => {
    const patients = this.data().patients;
    return patients.find(p => p.id === this.selectedId()) ?? patients[0];
  }, { equal: () => false });

  /** The selected patient, or null when the clinic has none (the context rail then waits) */
  readonly selectedOrNull = computed<Patient | null>(() => (this.data().patients.length ? this.selected() : null), { equal: () => false });

  /** Counts on the tabs */
  readonly counts = computed(() => {
    const d = this.data();
    return {
      queue: d.patients.length,
      appointments: d.appointments.filter(a => a.date === TODAY && a.state === 'Confirmed').length,
      encounter: d.patients.filter(p => ['room', 'treatment'].includes(stageKey(p))).length,
      orders: d.orders.filter(o => o.col !== 'Completed' && o.col !== 'Cancelled').length,
      results: d.results.filter(r => !r.ack).length,
      dispense: d.prescriptions.filter(r => !r.verbal && r.col !== 'Ready').length,
      // Nothing waits on the registration tab
      register: 0,
    };
  });

  /** Verbal orders waiting for a vet's co-signature */
  readonly pendingCosign = computed(() => this.data().prescriptions.filter(rx => rx.verbal && !rx.cosignedBy));

  /** Changes the records, then tells everyone */
  mutate(change: (data: ClinicData) => void) {
    change(this.data());
    this.data.set(this.data());
  }

  reset() {
    this.data.set(createSeed());
    this.selectedId.set(5);
  }

  select(p: Patient) {
    this.selectedId.set(p.id);
  }

  /** Selects the pet a row of another list is about (an order, a result, an appointment), when it is in today's clinic */
  selectPet(pet: string, ownerKey?: string) {
    const p = this.data().patients.find(x => x.pet === pet && (!ownerKey || x.ownerKey === ownerKey));
    if (p && p.id !== this.selectedId()) {
      this.select(p);
    }
  }

  owner(p: Patient): Owner {
    return this.data().owners[p.ownerKey];
  }

  patientByPet(pet: string): Patient | undefined {
    return this.data().patients.find(p => p.pet === pet);
  }

  resultsFor(p: Patient): LabResult[] {
    return this.data().results.filter(r => r.pet === p.pet);
  }

  /** Today's note of a patient, made on first use */
  noteFor(p: Patient): EncounterNote {
    return (this.data().encounters[p.id] ??= defaultNote(p));
  }

  /* Queue */

  moveStage(p: Patient, key: StageKey, loc?: string) {
    this.mutate(() => advanceStage(p, key, loc, this.userName()));
  }

  assign(p: Patient, vet: string, nurse: string) {
    this.mutate(() => { p.vet = vet; p.nurse = nurse; });
  }

  toggleTask(p: Patient, task: string, done: boolean) {
    this.mutate(() => { p.tasksDone = done ? [...p.tasksDone, task] : p.tasksDone.filter(t => t !== task); });
  }

  recordWeight(p: Patient, kg: string) {
    this.mutate(() => {
      p.weight = `${kg} kg`;
      p.weightAt = `${TODAY} ${NOW}`;
      const note = this.data().encounters[p.id];
      if (note) {
        note.weight = kg;
      }
    });
  }

  saveNotes(p: Patient, patientNote: string, clientNote: string) {
    this.mutate(() => {
      p.note = patientNote.trim() || '—';
      this.owner(p).note = clientNote.trim() || '—';
    });
  }

  approveEstimate(p: Patient) {
    this.mutate(() => {
      p.handoff.estimate = { state: 'done', note: `อนุมัติ ${NOW}` };
      if (p.handoff.consent.state === 'todo') {
        p.handoff.consent = { state: 'active', note: 'รอเจ้าของลงนาม' };
      }
    });
  }

  /* Encounter */

  saveNote(p: Patient) {
    this.mutate(() => { this.noteFor(p).savedAt = `${NOW} · ${this.userName()}`; });
  }

  /** Something in S/O/A/P to sign */
  canSign(p: Patient): boolean {
    const n = this.noteFor(p);
    return SOAP_FIELDS.some(k => filled(n[k]));
  }

  signNote(p: Patient) {
    this.mutate(() => {
      const n = this.noteFor(p);
      n.status = 'signed';
      n.signedBy = this.userName();
      n.signedAt = NOW;
      n.savedAt = `${NOW} · ${this.userName()}`;
    });
  }

  closeEncounter(p: Patient) {
    this.mutate(() => {
      const n = this.noteFor(p);
      n.closedBy = this.userName();
      n.closedAt = NOW;
    });
  }

  /** Writes several fields at once; a signed note keeps its S/O/A/P. Returns how many fields changed. */
  applyToNote(p: Patient, fields: Partial<EncounterNote>, mode: 'replace' | 'fill', tag?: string): number {
    let changed = 0;
    this.mutate(() => {
      const n = this.noteFor(p);
      for (const [k, v] of Object.entries(fields) as [keyof EncounterNote, EncounterNote[keyof EncounterNote]][]) {
        if (n.status === 'signed' && SOAP_FIELDS.includes(k)) {
          continue;
        }
        if (mode === 'fill' && filled(n[k])) {
          continue;
        }
        (n as unknown as Record<string, unknown>)[k] = Array.isArray(v) ? [...v] : v;
        changed++;
      }
      if (tag) {
        n.templates = [...n.templates.filter(t => t !== tag), tag];
      }
    });
    return changed;
  }

  /** Sends the encounter's ticked orders: a matching draft is sent, one already sent is skipped */
  sendEncounterOrders(p: Patient, names: string[]): { sent: number; skipped: number } {
    let sent = 0;
    let skipped = 0;
    this.mutate(d => {
      for (const item of ENCOUNTER_ORDERS.filter(o => names.includes(o.name))) {
        const existing = d.orders.find(o => o.pet === p.pet && o.name === item.name && o.col !== 'Cancelled');
        if (existing && existing.col !== 'Draft') {
          skipped++;
          continue;
        }
        if (existing) {
          existing.col = existing.state = 'Accepted';
          existing.trail.push([NOW, `ส่งคำสั่ง · ${existing.dept} รับคำสั่ง`]);
        } else {
          d.orders.push(this.newOrder(d, p, item, 'Routine', 'Accepted'));
        }
        sent++;
      }
    });
    return { sent, skipped };
  }

  /** New orders from the catalog, as drafts or sent */
  createOrders(p: Patient, items: CatalogItemLike[], priority: string, send: boolean): string[] {
    const codes: string[] = [];
    this.mutate(d => {
      for (const item of items) {
        const order = this.newOrder(d, p, item, priority, send ? 'Accepted' : 'Draft');
        d.orders.push(order);
        codes.push(order.code);
      }
    });
    return codes;
  }

  private newOrder(d: ClinicData, p: Patient, item: CatalogItemLike, priority: string, col: string): Order {
    const code = nextSeq(d.orders.map(o => o.code), 'ORD-260924-');
    return {
      id: nextSeq(d.orders.map(o => o.id), 'O'), col, state: col, name: item.name, pet: p.pet, code, kind: item.kind, priority,
      dept: item.dept, by: this.userName(), time: `${TODAY} ${NOW}`, price: item.price,
      trail: col === 'Draft' ? [[NOW, 'สร้างคำสั่ง · ยังไม่ส่ง']] : [[NOW, 'ส่งคำสั่ง'], [NOW, `${item.dept} รับคำสั่ง`]],
    };
  }

  /** The next step of an order; completing a lab or imaging order asks for its finding first (completeOrder) */
  advanceOrder(o: Order) {
    const step = ORDER_FLOW[o.col];
    if (!step) {
      return;
    }
    this.mutate(() => {
      o.col = o.state = step.next;
      o.trail.push([NOW, step.next === 'Accepted' ? `ส่งคำสั่ง · ${o.dept} รับคำสั่ง` : step.next === 'Completed' ? `เสร็จสิ้น · ${this.userName()}` : `กำลังดำเนินการ · ${this.userName()}`]);
    });
  }

  /** Closes an order with its finding; the result goes to the results inbox */
  completeOrder(o: Order, finding: string, note: string): boolean {
    const critical = finding.startsWith('วิกฤต');
    this.mutate(d => {
      o.col = o.state = 'Completed';
      o.trail.push([NOW, `รายงานผล · ${finding} · ${this.userName()}`]);
      const values: LabResult['values'] = o.kind.startsWith('Lab')
        ? (LAB_VALUES[o.name] ?? [['ผลตรวจ', note || 'ดูรายงานแนบ', '—', 0]]).map(v => [...v] as LabResult['values'][number])
        : [['Findings', note || finding, '—', finding === 'ปกติ' ? 0 : 1]];
      if (finding !== 'ปกติ' && values[0]) {
        values[0][3] = 1;
      }
      d.results.push({
        id: nextSeq(d.results.map(r => r.id), 'R'), col: critical ? 'Critical' : 'New', name: o.name, pet: o.pet, status: 'Final',
        time: `${TODAY} ${NOW}`, by: o.by, flag: critical ? 'critical' : '', ack: false, values, interp: note,
      });
    });
    return critical;
  }

  cancelOrder(o: Order, reason: string) {
    this.mutate(() => {
      o.col = o.state = 'Cancelled';
      o.trail.push([NOW, `ยกเลิก · ${reason} · ${this.userName()}`]);
    });
  }

  /* Results */

  acknowledge(r: LabResult, method: AckMethod, readBack: boolean, note: string) {
    this.mutate(() => {
      r.ack = true;
      r.ackMethod = method;
      r.ackReadBack = readBack;
      r.ackBy = this.userName();
      r.ackAt = NOW;
      r.ackNote = note.trim() || undefined;
      if (r.col === 'Critical' || r.col === 'New') {
        r.col = 'Reviewed';
      }
    });
  }

  interpret(r: LabResult, text: string) {
    this.mutate(() => { r.interp = `${text.trim()} — ${this.userName()} ${NOW}`; });
  }

  /** Sent to the owner; a critical value goes only once a clinician has acknowledged it */
  markSent(r: LabResult) {
    this.mutate(() => { if (r.ack) { r.col = 'Sent to owner'; } });
  }

  /* Registration */

  /** Files a pet, and its owner when they are new; with a route, sends the pet to today's queue (data/registration.ts) */
  register(draft: RegistrationDraft, route: string | null, forceReason?: string) {
    let result!: ReturnType<typeof registerPet>;
    this.mutate(d => { result = registerPet(d, draft, { route, by: this.userName(), forceReason }); });
    if (result.patient) {
      this.select(result.patient);
    }
    return result;
  }

  /** Sends a pet on file, not in today's queue yet, to the queue */
  queuePet(record: PetRecord, route: string): Patient {
    let p!: Patient;
    this.mutate(d => { p = sendToQueue(d, record, route, this.userName()); });
    this.select(p);
    return p;
  }

  /* Prescriptions */

  /** A new prescription from the encounter; it goes to the pharmacy to verify */
  prescribe(p: Patient, drug: string, route: string, dose: string, freq: string, days: string, qty: string, advice: string): Prescription {
    let rx!: Prescription;
    this.mutate(d => {
      rx = {
        id: nextSeq(d.prescriptions.map(x => x.id), 'X'), col: 'Verify', state: 'Verify', code: nextSeq(d.prescriptions.map(x => x.code), 'RX-260924-'),
        pet: p.pet, owner: this.owner(p).name, by: this.userName(), drug, dose, route, freq, days, qty, advice,
        stock: [], history: [[`${TODAY} ${NOW}`, `สั่งยา · ${this.userName()}`]],
      };
      d.prescriptions.push(rx);
      if (!p.meds.some(m => m[0] === drug)) {
        p.meds.push([drug, `${dose} · ${freq} · ${days} · เริ่มวันนี้`]);
      }
      if (p.handoff.dispense.state === 'todo') {
        p.handoff.dispense = { state: 'active', note: 'รอตรวจสอบใบสั่งยา' };
      }
    });
    return rx;
  }

  cosign(rx: Prescription) {
    this.mutate(() => {
      rx.cosignedBy = this.userName();
      rx.cosignedAt = NOW;
      rx.verbal = false;
      rx.col = rx.state = 'Verify';
      rx.history.unshift([`${TODAY} ${NOW}`, `เซ็นกำกับคำสั่งวาจา · ${this.userName()}`]);
      const p = this.patientByPet(rx.pet);
      if (p && !p.meds.some(m => m[0] === rx.drug)) {
        p.meds.push([rx.drug, `${rx.dose} · ${rx.freq} · ${rx.days}`]);
      }
    });
  }

  advanceRx(rx: Prescription) {
    const step = RX_FLOW[rx.col];
    if (step) {
      this.mutate(() => {
        rx.col = rx.state = step.next;
        rx.history.unshift([`${TODAY} ${NOW}`, `${step.label} · ${this.userName()}`]);
      });
    }
  }
}
