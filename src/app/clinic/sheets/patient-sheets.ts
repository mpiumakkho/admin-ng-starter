/* The selected patient's sheets: quick view, patient, owner, notes, results, estimate (the design's sheets/index.tsx) */
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowRight, lucideCheck, lucideChevronRight, lucideFileText, lucideTriangleAlert, lucideUserRound } from '@ng-icons/lucide';

import { UiButton } from '../../user-management/ui';
import { ClinicActions } from '../clinic-actions';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { ALERT_META, locOf, STAGES, stageIndex, stageMinutes, statusOf } from '../data/model';
import { CONSENT_TEXT, consentState, nextAppointment, pastVisits, resultsNewestFirst, resultsToReview } from '../data/rail';
import { TxPipe } from '../i18n/clinic-i18n';
import { ALERT_ICONS } from '../shared/icons';
import { PetIcon, VStepper } from '../shared/parts';
import { OpenRow, ResultRow } from './rail-sheets';
import { SheetHead } from './sheet-head';

/** The patient's sections, in the order of the context rail */
export const PATIENT_TABS = [
  { id: 'alerts', label: 'Clinical alerts' }, { id: 'overview', label: 'Patient summary' }, { id: 'problems', label: 'Problem list' },
  { id: 'meds', label: 'Medications' }, { id: 'vaccines', label: 'Vaccines / reminders' }, { id: 'visits', label: 'Visit history' },
  { id: 'docs', label: 'Documents' },
];

const SHARED = [TxPipe, UiButton, SheetHead];

/* ---- Queue: the visit at a glance ---- */
@Component({
  selector: 'cl-visit-sheet',
  imports: [...SHARED, NgIcon, PetIcon, VStepper],
  template: `
    @let p = store.selected();
    @let o = store.owner(p);
    <cl-sheet-head [heading]="'Quick view · ' + p.pet" [status]="status()"
      [sub]="'{code} · เวลานัด {time} · อยู่ขั้นตอน {stage} มาแล้ว {m} นาที' | tx: { code: p.code, time: p.time, stage: (stage() | tx), m: minutes() }" />
    <div class="sheet-body">
      <div class="section">
        <div class="section-title">
          <h3>{{ 'Clinical alerts' | tx }}</h3>
          @if (p.alerts.length) {
            <button type="button" class="link" (click)="ui.openSheet('patient', { tab: 'alerts' })">{{ 'ดูทั้งหมด' | tx }}</button>
          }
        </div>
        @for (alert of p.alerts; track $index) {
          <div class="safety" [class.warn]="meta[alert.type].cls === 'warn'">
            <b><ng-icon [svg]="alertIcons[alert.type]" aria-hidden="true" />{{ alert.label | tx }}</b>
            @if (alert.detail) {
              <div class="secondary">{{ alert.detail | tx }}</div>
            }
          </div>
        } @empty {
          <div class="safety ok">
            <b><ng-icon [svg]="icons.check" aria-hidden="true" />{{ 'ไม่มี clinical alert' | tx }}</b>
            <div class="secondary">{{ 'ไม่มีประวัติแพ้ที่บันทึก · ทบทวน {0} {1}' | tx: { '0': p.allergyReview?.at ?? '—', '1': ((p.allergyReview?.by ?? '') | tx) } }}</div>
          </div>
        }
      </div>
      <div class="section">
        <div class="section-title">
          <h3>{{ 'ผู้ป่วยและเจ้าของ' | tx }}</h3>
          <button type="button" class="link" (click)="ui.openSheet('owner')">{{ 'Owner sheet' | tx }} <ng-icon [svg]="icons.chevron" aria-hidden="true" /></button>
        </div>
        <div class="person">
          <cl-pet-icon [kind]="p.kind" size="lg" />
          <div><b>{{ p.pet }}</b> <span class="muted">· {{ p.hn }}</span><div class="secondary">{{ p.species | tx }} · {{ p.breed }} · {{ p.sex | tx }} · {{ p.age | tx }} · {{ p.weight }}</div></div>
        </div>
        <div class="person">
          <span class="circle"><ng-icon [svg]="icons.person" aria-hidden="true" /></span>
          <div><b>{{ o.name }}</b><div class="secondary">{{ o.phone }} · {{ o.prefer | tx }}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">
          <h3>{{ 'ขั้นตอนและตำแหน่ง' | tx }}</h3>
          <button type="button" class="link" (click)="actions.moveStage(p)">{{ 'ย้ายขั้นตอน' | tx }}</button>
        </div>
        <cl-vstepper [patient]="p" />
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'Visit' | tx }}</h3></div>
        <dl class="data-grid">
          <dt>{{ 'Chief complaint' | tx }}</dt><dd>{{ p.chief | tx }}</dd>
          <dt>{{ 'Triage' | tx }}</dt><dd><span class="chip" [class]="'chip ' + p.triageCls">{{ p.triage | tx }}</span></dd>
          <dt>{{ 'เวลานัด' | tx }}</dt><dd>{{ p.time }}</dd>
          <dt>{{ 'ตำแหน่งปัจจุบัน' | tx }}</dt><dd>{{ location() | tx }}</dd>
          <dt>{{ 'สัตวแพทย์' | tx }}</dt><dd>{{ p.vet | tx }}</dd>
          <dt>{{ 'พยาบาล' | tx }}</dt><dd>{{ p.nurse | tx }}</dd>
        </dl>
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'Pending tasks' | tx }}</h3></div>
        <div class="kv-list">
          @for (task of p.tasks; track task) {
            <label class="check"><input type="checkbox" [checked]="p.tasksDone.includes(task)" (change)="store.toggleTask(p, task, $any($event.target).checked)" /> {{ task | tx }}</label>
          } @empty {
            <p class="muted">{{ 'ไม่มีงานค้าง' | tx }}</p>
          }
        </div>
      </div>
    </div>
    <div class="sheet-foot">
      <button uiButton variant="secondary" size="sm" type="button" (click)="actions.callOwner(p)">{{ 'โทรหาเจ้าของ' | tx }}</button>
      <button uiButton variant="secondary" size="sm" type="button" (click)="actions.assign(p)">{{ 'Assign' | tx }}</button>
      <button uiButton variant="secondary" size="sm" type="button" (click)="actions.moveStage(p)">{{ 'ย้ายขั้นตอน' | tx }}</button>
      <span class="grow"></span>
      @if (stageIndex(p) > 0) {
        <button uiButton size="sm" type="button" (click)="actions.startEncounter(p)">{{ 'Start encounter' | tx }}</button>
      }
    </div>
  `,
  host: { class: 'contents' },
})
export class VisitSheet {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly actions = inject(ClinicActions);
  protected readonly icons = { check: lucideCheck, chevron: lucideChevronRight, person: lucideUserRound };
  protected readonly meta = ALERT_META;
  protected readonly alertIcons = ALERT_ICONS;
  protected readonly stageIndex = stageIndex;
  protected readonly status = computed(() => statusOf(this.store.selected()));
  protected readonly stage = computed(() => STAGES[stageIndex(this.store.selected())].label);
  protected readonly minutes = computed(() => stageMinutes(this.store.selected()));
  protected readonly location = computed(() => locOf(this.store.selected()));
}

/* ---- The patient's record, by section ---- */
@Component({
  selector: 'cl-patient-sheet',
  imports: [...SHARED, NgIcon, OpenRow],
  template: `
    @let p = store.selected();
    <cl-sheet-head [heading]="p.pet + ' · ' + p.hn" [status]="status()" [sub]="(p.species | tx) + ' · ' + p.breed + ' · ' + (p.sex | tx) + ' · ' + (p.age | tx)"
      [tabs]="tabs" [activeTab]="tab()" />
    <div class="sheet-body">
      @switch (tab()) {
        @case ('alerts') {
          <div class="section">
            <div class="section-title"><h3>{{ 'Clinical alerts' | tx }} ({{ p.alerts.length }})</h3></div>
            @for (alert of p.alerts; track $index) {
              <div class="safety" [class.warn]="meta[alert.type].cls === 'warn'">
                <b><ng-icon [svg]="alertIcons[alert.type]" aria-hidden="true" />{{ alert.label | tx }}</b>
                @if (alert.detail) {
                  <div class="secondary">{{ alert.detail | tx }}</div>
                }
              </div>
              @if (alert.type === 'allergy') {
                <div class="secondary alert-meta">
                  @if (alert.recordedBy) {
                    <span>{{ 'บันทึกโดย' | tx }} {{ alert.recordedBy | tx }}</span>
                  }
                  @if (alert.verifiedBy) {
                    <span class="chip ok"><ng-icon [svg]="icons.check" aria-hidden="true" />{{ 'ยืนยันแล้ว ·' | tx }} {{ alert.verifiedBy | tx }} {{ alert.verifiedAt }}</span>
                  }
                </div>
              }
            } @empty {
              <div class="safety ok">
                <b><ng-icon [svg]="icons.check" aria-hidden="true" />{{ 'ไม่มี clinical alert' | tx }}</b>
                <div class="secondary">{{ 'ยังไม่พบ handling precaution, DNR หรือ isolation' | tx }}</div>
              </div>
            }
            <p class="secondary">{{ 'Alert เหล่านี้แสดงถาวรบน patient banner และในแถวคิว ไม่ถูกซ่อนไว้ใน sheet เท่านั้น' | tx }}</p>
          </div>
        }
        @case ('overview') {
          <div class="section">
            <div class="section-title"><h3>{{ 'ตัวตนผู้ป่วย' | tx }}</h3></div>
            <dl class="data-grid">
              <dt>{{ 'Species' | tx }}</dt><dd>{{ p.species | tx }}</dd>
              <dt>{{ 'Breed' | tx }}</dt><dd>{{ p.breed }}</dd>
              <dt>{{ 'Sex' | tx }}</dt><dd>{{ p.sex | tx }}</dd>
              <dt>{{ 'Age' | tx }}</dt><dd>{{ p.age | tx }}</dd>
              <dt>{{ 'น้ำหนักล่าสุด' | tx }}</dt><dd><b>{{ p.weight }}</b> <span class="muted">{{ '(ชั่ง' | tx }} {{ p.weightAt }})</span></dd>
              <dt>{{ 'Microchip' | tx }}</dt><dd>{{ p.microchip | tx }}</dd>
              <dt>{{ 'Blood type' | tx }}</dt><dd>{{ p.blood | tx }}</dd>
            </dl>
          </div>
          <div class="section">
            <div class="section-title"><h3>{{ 'Visit ปัจจุบัน' | tx }}</h3></div>
            <dl class="data-grid">
              <dt>{{ 'เหตุผลที่มา' | tx }}</dt><dd>{{ p.reason | tx }}</dd>
              <dt>{{ 'Triage' | tx }}</dt><dd><span class="chip" [class]="'chip ' + p.triageCls">{{ p.triage | tx }}</span></dd>
              <dt>{{ 'ตำแหน่งปัจจุบัน' | tx }}</dt><dd>{{ location() | tx }}</dd>
              <dt>{{ 'สัตวแพทย์' | tx }}</dt><dd>{{ p.vet | tx }}</dd>
            </dl>
          </div>
          <div class="section">
            <div class="section-title">
              <h3>{{ 'Patient note' | tx }}</h3>
              <button type="button" class="link" (click)="ui.openSheet('notes')">{{ 'แก้ไข' | tx }}</button>
            </div>
            <p class="sheet-text">{{ p.note === '—' ? ('ไม่มีโน้ต' | tx) : (p.note | tx) }}</p>
          </div>
        }
        @case ('problems') {
          <div class="section">
            <div class="section-title"><h3>{{ 'Problem list' | tx }}</h3></div>
            <div class="kv-list">
              @for (problem of p.problems; track problem[0]) {
                <div class="row-card">
                  <span class="grow"><b>{{ problem[0] | tx }}</b><div class="secondary">{{ problem[1] | tx }}</div></span>
                  <span class="chip" [class]="'chip ' + problem[2]">{{ (problem[2] === 'ok' ? 'Resolved' : problem[2] === 'danger' ? 'Critical' : 'Active') | tx }}</span>
                </div>
              } @empty {
                <p class="muted">{{ 'ยังไม่มี problem ที่บันทึกไว้' | tx }}</p>
              }
            </div>
          </div>
        }
        @case ('meds') {
          <div class="section">
            <div class="section-title"><h3>{{ 'Medications' | tx }}</h3></div>
            <div class="kv-list">
              @for (med of p.meds; track med[0]) {
                <div class="row-card"><span class="grow"><b>{{ med[0] | tx }}</b><div class="secondary">{{ med[1] | tx }}</div></span></div>
              } @empty {
                <p class="muted">{{ 'ไม่มียาที่กำลังใช้' | tx }}</p>
              }
            </div>
          </div>
        }
        @case ('vaccines') {
          <div class="section">
            <div class="section-title"><h3>{{ 'Vaccines / reminders' | tx }}</h3></div>
            <div class="kv-list">
              @for (vaccine of p.vaccines; track vaccine[0]) {
                <div class="row-card">
                  <span class="grow"><b>{{ vaccine[0] }}</b><div class="secondary">{{ vaccine[1] | tx }}</div></span>
                  <span class="chip" [class]="'chip ' + vaccine[2]">{{ (vaccine[2] === 'ok' ? 'Current' : 'Due') | tx }}</span>
                </div>
              }
            </div>
          </div>
        }
        @case ('visits') {
          @let next = nextAppointment();
          <div class="section">
            <div class="section-title"><h3>{{ 'Visit ปัจจุบัน' | tx }}</h3></div>
            <cl-open-row [name]="('วันนี้' | tx) + ' · ' + (p.reason | tx)" [detail]="(p.vet | tx) + ' · ' + (stage() | tx) + ' · ' + p.code" (opened)="ui.openSheet('visit')" />
          </div>
          @if (next) {
            <div class="section">
              <div class="section-title"><h3>{{ 'นัดถัดไป' | tx }}</h3></div>
              <cl-open-row [name]="next.date + ' · ' + next.time + ' · ' + (next.type | tx)" [detail]="(next.provider | tx) + ' · ' + (next.reason | tx)"
                (opened)="ui.openSheet('appointment', { id: next.id })" />
            </div>
          }
          <div class="section">
            <div class="section-title"><h3>{{ 'Visit history' | tx }}</h3></div>
            <div class="kv-list">
              @for (visit of visits(); track visit.date) {
                <cl-open-row [name]="visit.date + ' · ' + (visit.title | tx)" [detail]="visit.vet | tx" (opened)="ui.openSheet('pastVisit', { id: p.id + '/' + visit.date })" />
              } @empty {
                <p class="muted">{{ 'ยังไม่มีประวัติการมารักษา' | tx }}</p>
              }
            </div>
          </div>
        }
        @default {
          <div class="section">
            <div class="section-title"><h3>{{ 'Documents' | tx }}</h3></div>
            <div class="kv-list">
              @for (doc of p.docs; track doc[0]; let index = $index) {
                <cl-open-row [name]="doc[0] | tx" [detail]="doc[1] | tx" (opened)="ui.openSheet('document', { id: p.id + '/' + index })">
                  <ng-icon class="go-icon" [svg]="icons.file" aria-hidden="true" />
                </cl-open-row>
              } @empty {
                <p class="muted">{{ 'ยังไม่มีเอกสาร' | tx }}</p>
              }
            </div>
          </div>
        }
      }
    </div>
    <div class="sheet-foot">
      <!-- What the section adds to, then the page that keeps it -->
      @if (tab() === 'alerts') {
        <button uiButton variant="secondary" size="sm" type="button" (click)="actions.addAlert(p)">{{ 'เพิ่ม alert' | tx }}</button>
      } @else if (tab() === 'problems') {
        <button uiButton variant="secondary" size="sm" type="button" (click)="actions.addProblem(p)">{{ 'เพิ่ม problem' | tx }}</button>
      } @else if (tab() === 'overview') {
        <button uiButton variant="secondary" size="sm" type="button" (click)="actions.recordWeight(p)">{{ 'บันทึกน้ำหนัก' | tx }}</button>
      }
      <span class="grow"></span>
      <button uiButton size="sm" type="button" (click)="goHome()">{{ (home()?.label ?? 'เปิด Encounter') | tx }}<ng-icon [svg]="icons.next" aria-hidden="true" /></button>
    </div>
  `,
  host: { class: 'contents' },
})
export class PatientSheet {
  readonly tab = input('overview');
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly actions = inject(ClinicActions);
  private readonly router = inject(Router);
  protected readonly tabs = PATIENT_TABS;
  protected readonly icons = { check: lucideCheck, file: lucideFileText, next: lucideArrowRight };
  protected readonly meta = ALERT_META;
  protected readonly alertIcons = ALERT_ICONS;
  protected readonly status = computed(() => statusOf(this.store.selected()));
  protected readonly location = computed(() => locOf(this.store.selected()));
  protected readonly stage = computed(() => STAGES[stageIndex(this.store.selected())].label);
  protected readonly visits = computed(() => pastVisits(this.store.selected()));
  protected readonly nextAppointment = computed(() => nextAppointment(this.store.data(), this.store.selected()));

  /** Where the section's data is kept: the encounter, the appointments (vaccine recalls) or today's queue (the visits) */
  protected readonly home = computed(() =>
    this.tab() === 'vaccines' ? { label: 'เปิดนัดหมาย', path: '/clinic/appointments' } : this.tab() === 'visits' ? { label: 'เปิดคิววันนี้', path: '/clinic/queue' } : null);

  protected goHome() {
    const home = this.home();
    if (home) {
      this.ui.closeSheet();
      this.router.navigate([home.path]);
    } else {
      this.actions.startEncounter(this.store.selected());
    }
  }
}

/* ---- The owner ---- */
@Component({
  selector: 'cl-owner-sheet',
  imports: [...SHARED, NgIcon],
  template: `
    @let p = store.selected();
    @let o = store.owner(p);
    <cl-sheet-head [heading]="('เจ้าของ' | tx) + ' · ' + o.name" [sub]="'{0} สัตว์ในครอบครัว · {1}' | tx: { '0': o.pets.length, '1': o.badges.length ? o.badges.join(' · ') : ('ไม่มี badge' | tx) }"
      [tabs]="tabs" [activeTab]="tab()" />
    <div class="sheet-body">
      @switch (tab()) {
        @case ('contact') {
          <div class="section">
            <div class="section-title"><h3>{{ 'ข้อมูลติดต่อ' | tx }}</h3></div>
            <dl class="data-grid">
              <dt>{{ 'เบอร์หลัก' | tx }}</dt><dd>{{ o.phone }}</dd>
              <dt>{{ 'เบอร์สำรอง' | tx }}</dt><dd>{{ o.phone2 }}</dd>
              <dt>{{ 'อีเมล' | tx }}</dt><dd>{{ o.email }}</dd>
              <dt>LINE</dt><dd>{{ o.line }}</dd>
              <dt>{{ 'ช่องทางที่ต้องการ' | tx }}</dt><dd><span class="chip quiet">{{ o.prefer | tx }}</span></dd>
            </dl>
          </div>
          <div class="section">
            <div class="section-title"><h3>{{ 'Co-owner / ผู้มีสิทธิ์ตัดสินใจ' | tx }}</h3></div>
            <p class="sheet-text">{{ o.coOwner === '—' ? ('ไม่ได้บันทึก' | tx) : (o.coOwner | tx) }}</p>
          </div>
          <div class="section">
            <div class="section-title"><h3>{{ 'ที่อยู่' | tx }}</h3></div>
            <p class="sheet-text">{{ o.address }}</p>
          </div>
          <div class="section">
            <div class="section-title"><h3>{{ 'Client notes' | tx }}</h3></div>
            @if (o.note === '—') {
              <p class="muted">{{ 'ไม่มีโน้ต' | tx }}</p>
            } @else {
              <div class="safety warn"><b>{{ 'โน้ตเจ้าของ' | tx }}</b><div class="secondary">{{ o.note | tx }}</div></div>
            }
          </div>
        }
        @case ('pets') {
          <div class="section">
            <div class="section-title"><h3>{{ 'สัตว์ในครอบครัว' | tx }}</h3></div>
            <div class="kv-list">
              @for (pet of o.pets; track pet) {
                @let today = patientFor(pet);
                <div class="row-card">
                  <span class="grow"><b>{{ pet.split('·')[0].trim() }}</b><div class="secondary">{{ pet | tx }}</div></span>
                  @if (today) {
                    <button uiButton variant="secondary" size="sm" type="button" (click)="openPet(today)">{{ 'เปิด' | tx }}</button>
                  } @else {
                    <span class="chip none">{{ 'ไม่ได้มาวันนี้' | tx }}</span>
                  }
                </div>
              }
            </div>
          </div>
        }
        @case ('history') {
          <div class="section">
            <div class="section-title"><h3>{{ 'ประวัติการนัดหมาย' | tx }}</h3></div>
            <div class="timeline">
              @for (appt of o.appts; track $index) {
                <div class="tl"><b>{{ appt[0] }} — {{ appt[1] | tx }}</b><div class="secondary">{{ appt[2] | tx }}</div></div>
              } @empty {
                <p class="muted">{{ 'ยังไม่มีนัดหมาย' | tx }}</p>
              }
            </div>
          </div>
        }
        @default {
          @let consent = consentState(o);
          <div class="section">
            <div class="section-title">
              <h3>{{ 'Consent' | tx }}</h3>
              <span class="chip" [class]="'chip ' + (consent === 'valid' ? 'ok' : 'danger')">{{ consentText[consent] | tx }}</span>
            </div>
            <p class="sheet-text">{{ o.consent === '—' ? ('ยังไม่ได้ลงนามใบยินยอมการรักษา' | tx) : (o.consent | tx) }}</p>
          </div>
          <div class="section">
            <div class="section-title"><h3>{{ 'PDPA' | tx }}</h3></div>
            <p class="sheet-text">{{ o.pdpa | tx }}</p>
          </div>
          <div class="section">
            <div class="section-title"><h3>{{ 'ประกัน' | tx }}</h3></div>
            <p class="sheet-text">{{ o.insurance | tx }}</p>
          </div>
        }
      }
    </div>
    <div class="sheet-foot">
      <button uiButton variant="secondary" size="sm" type="button" (click)="actions.callOwner(p)">{{ 'โทร' | tx }}</button>
      <button uiButton variant="secondary" size="sm" type="button" (click)="message()">{{ 'ส่งข้อความ' | tx }}</button>
      <span class="grow"></span>
      <button uiButton size="sm" type="button" (click)="actions.openInRegistry(p)">{{ 'เปิดในทะเบียน' | tx }}<ng-icon [svg]="next" aria-hidden="true" /></button>
    </div>
  `,
  host: { class: 'contents' },
})
export class OwnerSheet {
  readonly tab = input('contact');
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly actions = inject(ClinicActions);
  protected readonly tabs = [
    { id: 'contact', label: 'ติดต่อ' }, { id: 'pets', label: 'สัตว์' }, { id: 'history', label: 'นัดหมาย' }, { id: 'consent', label: 'Consent / PDPA' },
  ];
  protected readonly consentState = consentState;
  protected readonly consentText = CONSENT_TEXT;
  protected readonly next = lucideArrowRight;

  protected patientFor(pet: string) {
    const code = (pet.split('·').pop() || '').trim();
    return this.store.data().patients.find(p => p.code === code);
  }

  protected openPet(p: ReturnType<OwnerSheet['patientFor']>) {
    if (p) {
      this.store.select(p);
      this.ui.openSheet('patient', { tab: 'overview' });
    }
  }

  protected message() {
    const p = this.store.selected();
    this.actions.sendMessage(p, 'ข้อความจากโรงพยาบาล', `เรียนคุณ ${this.store.owner(p).name}\n`);
  }
}

/* ---- Notes ---- */
@Component({
  selector: 'cl-notes-sheet',
  imports: [...SHARED],
  template: `
    @let p = store.selected();
    <cl-sheet-head [heading]="'Notes · ' + p.pet" [sub]="'Patient note และ Client note ของ {0}' | tx: { '0': store.owner(p).name }" />
    <div class="sheet-body">
      <div class="section">
        <div class="section-title"><h3><label for="clinic-patient-note">{{ 'Patient note' | tx }}</label></h3></div>
        <textarea class="ui-input" id="clinic-patient-note" rows="4" [value]="patientNote()" (input)="patientNote.set($any($event.target).value)"></textarea>
      </div>
      <div class="section">
        <div class="section-title"><h3><label for="clinic-client-note">{{ 'Client note' | tx }}</label></h3></div>
        <textarea class="ui-input" id="clinic-client-note" rows="4" [value]="clientNote()" (input)="clientNote.set($any($event.target).value)"></textarea>
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'บันทึกล่าสุด' | tx }}</h3></div>
        <div class="timeline">
          <div class="tl"><b>2026-09-24 10:12</b><div class="secondary">{{ 'พ.ส. ณิชา — เจ้าของแจ้งว่าอาการแย่ลงหลังเดินขึ้นบันได' | tx }}</div></div>
          <div class="tl"><b>2026-09-11</b><div class="secondary">{{ 'น.สพ. นรินทร์ — นัดติดตามอาการขาหลัง' | tx }}</div></div>
        </div>
      </div>
    </div>
    <div class="sheet-foot">
      <span class="grow"></span>
      <button uiButton size="sm" type="button" (click)="save()">{{ 'บันทึกโน้ต' | tx }}</button>
    </div>
  `,
  host: { class: 'contents' },
})
export class NotesSheet {
  protected readonly store = inject(ClinicStore);
  private readonly ui = inject(ClinicUi);
  protected readonly patientNote = linkedSignal(() => { const n = this.store.selected().note; return n === '—' ? '' : n; });
  protected readonly clientNote = linkedSignal(() => { const n = this.store.owner(this.store.selected()).note; return n === '—' ? '' : n; });

  protected save() {
    const p = this.store.selected();
    this.store.saveNotes(p, this.patientNote(), this.clientNote());
    this.ui.toast('บันทึกโน้ตของ {pet} แล้ว', { pet: p.pet });
  }
}

/* ---- The patient's results, from every visit, newest first ---- */
@Component({
  selector: 'cl-results-preview-sheet',
  imports: [...SHARED, NgIcon, ResultRow],
  template: `
    @let p = store.selected();
    @let results = all();
    <cl-sheet-head [heading]="('ผลตรวจ' | tx) + ' · ' + p.pet" [sub]="'{0} รายการ · {1} รายการผิดปกติรอรับทราบ' | tx: { '0': results.length, '1': review() }" />
    <div class="sheet-body">
      <div class="section">
        <div class="section-title"><h3>{{ 'ผลตรวจทั้งหมด ใหม่สุดก่อน' | tx }}</h3></div>
        <div class="kv-list">
          @for (r of results; track r.id) {
            <cl-result-row [r]="r" />
          } @empty {
            <p class="muted">{{ 'ยังไม่มีผลตรวจ' | tx }}</p>
          }
        </div>
      </div>
    </div>
    <div class="sheet-foot">
      <span class="grow"></span>
      <button uiButton size="sm" type="button" (click)="inbox()">{{ 'เปิด Results inbox' | tx }}<ng-icon [svg]="next" aria-hidden="true" /></button>
    </div>
  `,
  host: { class: 'contents' },
})
export class ResultsPreviewSheet {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  private readonly router = inject(Router);
  protected readonly next = lucideArrowRight;
  protected readonly all = computed(() => resultsNewestFirst(this.store.data(), this.store.selected()));
  protected readonly review = computed(() => resultsToReview(this.store.data(), this.store.selected()).length);

  protected inbox() {
    this.ui.closeSheet();
    this.router.navigate(['/clinic/results']);
  }
}

/* ---- The estimate the owner approves before treatment ---- */
@Component({
  selector: 'cl-estimate-sheet',
  imports: [...SHARED],
  template: `
    @let p = store.selected();
    @let o = store.owner(p);
    @let approved = p.handoff.estimate.state === 'done';
    <cl-sheet-head [heading]="'Estimate · ' + p.pet" [status]="approved ? { text: 'อนุมัติแล้ว', cls: 'checked' } : { text: 'รออนุมัติ', cls: 'waiting' }"
      [sub]="'EST-260924-05 · {0} · ต้องอนุมัติก่อนเริ่มหัตถการ' | tx: { '0': o.name }" />
    <div class="sheet-body">
      <div class="section">
        <div class="section-title"><h3>{{ 'รายการประมาณการ' | tx }}</h3></div>
        <table class="mini-table">
          <thead><tr><th scope="col">{{ 'รายการ' | tx }}</th><th scope="col" class="num">{{ 'จำนวน' | tx }}</th><th scope="col" class="num">{{ 'ต่ำสุด' | tx }}</th><th scope="col" class="num">{{ 'สูงสุด' | tx }}</th></tr></thead>
          <tbody>
            @for (line of lines; track line[0]) {
              <tr><td>{{ line[0] | tx }}</td><td class="num">{{ line[1] }}</td><td class="num">{{ line[2] }}</td><td class="num">{{ line[3] }}</td></tr>
            }
          </tbody>
        </table>
        <div class="summary-line total"><span>{{ 'รวม' | tx }}</span><span>฿2,920 – ฿3,220</span></div>
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'เงื่อนไข' | tx }}</h3></div>
        <dl class="data-grid">
          <dt>{{ 'ผู้อนุมัติ' | tx }}</dt><dd>{{ o.name }}</dd>
          <dt>{{ 'ช่องทางส่ง' | tx }}</dt><dd>{{ o.prefer | tx }}</dd>
          <dt>{{ 'อายุประมาณการ' | tx }}</dt><dd>{{ '7 วัน' | tx }}</dd>
        </dl>
      </div>
    </div>
    <div class="sheet-foot">
      <button uiButton variant="secondary" size="sm" type="button" (click)="send()">{{ 'ส่งให้เจ้าของ' | tx }}</button>
      <span class="grow"></span>
      <button uiButton size="sm" type="button" [disabled]="approved" (click)="approve()">{{ 'อนุมัติ' | tx }}</button>
    </div>
  `,
  host: { class: 'contents' },
})
export class EstimateSheet {
  protected readonly store = inject(ClinicStore);
  private readonly ui = inject(ClinicUi);
  private readonly actions = inject(ClinicActions);
  protected readonly lines = [
    ['Consultation — General', 1, '฿450', '฿450'], ['CBC + Blood chemistry', 1, '฿1,250', '฿1,250'],
    ['Right hind limb X-ray (2 views)', 1, '฿900', '฿1,200'], ['Carprofen 25 mg', 10, '฿320', '฿320'],
  ] as const;

  protected approve() {
    this.store.approveEstimate(this.store.selected());
    this.ui.toast('บันทึกการอนุมัติประมาณการแล้ว');
  }

  protected send() {
    const p = this.store.selected();
    const o = this.store.owner(p);
    this.actions.sendMessage(p, 'ประมาณการค่าใช้จ่าย',
      `เรียนคุณ ${o.name}\nประมาณการค่าใช้จ่ายของ ${p.pet} อยู่ที่ ฿2,920 – ฿3,220 (มีอายุ 7 วัน)\nกรุณาตรวจสอบและยืนยันการอนุมัติกับเจ้าหน้าที่`,
      channel => this.store.mutate(() => {
        if (p.handoff.estimate.state !== 'done') {
          p.handoff.estimate = { state: 'active', note: `ส่งทาง ${channel} แล้ว` };
        }
      }));
  }
}
