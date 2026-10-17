import { Component, computed, inject, signal } from '@angular/core';

import { ClinicActions } from '../clinic-actions';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { formatDate, locOf, NOW, STAGES, stageKey, stageMinutes, stageState, statusOf, TODAY, VETS } from '../data/model';
import type { Patient, StageKey } from '../data/types';
import { ClinicI18n, TxPipe } from '../i18n/clinic-i18n';
import { MiniAlerts, MiniStepper, PetIcon, Toolbar } from '../shared/parts';

/**
 * Today's queue: where each pet is in its visit and for how long, with the stages above as filters. A click opens the
 * quick view; a double click, or the quick view's Start encounter, opens the encounter.
 */
@Component({
  selector: 'app-clinic-queue',
  imports: [TxPipe, Toolbar, MiniStepper, MiniAlerts, PetIcon],
  template: `
    <cl-toolbar [heading]="'คิววันนี้' | tx">
      <span subtitle>
        @if (stage(); as filter) {
          {{ 'กรองเฉพาะขั้นตอน' | tx }} <b>{{ stageLabel(filter) | tx }}</b> ·
          <button type="button" class="link" (click)="stage.set(null)">{{ 'ล้างตัวกรอง' | tx }}</button>
        } @else {
          {{ today() }} · {{ 'ข้อมูล ณ เวลา {now} · คลิกแถวเพื่อดู Quick view' | tx: { now: now } }} · {{ 'ดับเบิลคลิกเพื่อเปิด Encounter' | tx }}
        }
      </span>
      <input class="ui-input input search" type="search" [attr.aria-label]="'ค้นหาในคิววันนี้' | tx" [placeholder]="'ค้นหาในคิววันนี้' | tx"
        [value]="query()" (input)="query.set($any($event.target).value)" />
      <select class="ui-input select" [attr.aria-label]="'กรองตามสัตวแพทย์' | tx" (change)="vet.set($any($event.target).value)">
        <option value="" [selected]="!vet()">{{ 'สัตวแพทย์ทุกคน' | tx }}</option>
        @for (name of vets; track name) {
          <option [value]="name" [selected]="name === vet()">{{ name | tx }}</option>
        }
      </select>
    </cl-toolbar>

    <!-- The stages, counted from the queue; each one filters the table -->
    <div class="steps" role="group" [attr.aria-label]="'กรองตามขั้นตอน' | tx">
      @for (step of funnel(); track step.key; let i = $index) {
        <button type="button" [class.on]="stage() === step.key" [attr.aria-pressed]="stage() === step.key" (click)="stage.set(stage() === step.key ? null : step.key)">
          <b>{{ i + 1 }} · {{ step.label | tx }}</b>{{ '{n} ราย' | tx: { n: step.count } }}
          @if (step.stuck) {
            · <span class="stuck">{{ 'ค้างเกินเกณฑ์ {n}' | tx: { n: step.stuck } }}</span>
          }
        </button>
      }
    </div>

    <!-- Desktop and tablet: the table -->
    <div class="table-wrap queue-table" tabindex="0" [attr.aria-label]="'คิววันนี้' | tx" role="region">
      <table>
        <thead>
          <tr>
            <th scope="col" class="col-no">#</th>
            <th scope="col" class="col-time">{{ 'เวลานัด' | tx }}</th>
            <th scope="col" class="col-stage">{{ 'ขั้นตอน / ตำแหน่ง' | tx }}</th>
            <th scope="col" class="col-patient">{{ 'ผู้ป่วย' | tx }}</th>
            <th scope="col" class="col-owner">{{ 'เจ้าของ' | tx }}</th>
            <th scope="col">{{ 'เหตุผลที่มา' | tx }}</th>
            <th scope="col" class="col-vet">{{ 'สัตวแพทย์' | tx }}</th>
            <th scope="col" class="col-safety">{{ 'Safety' | tx }}</th>
          </tr>
        </thead>
        <tbody>
          @for (p of list(); track p.id) {
            @let reason = p.reason.split(' · ');
            <tr [class.selected]="p.id === store.selected().id" tabindex="0"
              [attr.aria-label]="'{pet} · {owner} — Enter เปิด Quick view' | tx: { pet: p.pet, owner: store.owner(p).name }"
              (click)="open(p)" (dblclick)="encounter(p)" (keydown.enter)="open(p)" (keydown.space)="$event.preventDefault(); open(p)">
              <td>{{ p.id }}</td>
              <td><b>{{ p.time }}</b><div class="secondary">{{ 'มาถึง' | tx }} {{ p.stages[0].at || '—' }}</div></td>
              <td>
                <cl-mini-stepper [patient]="p" />
                <div class="ms-now" [class]="'ms-now ' + state(p)">{{ status(p) | tx }} · {{ minutes(p) }} {{ 'น.' | tx }}</div>
                <div class="secondary ellipsis">{{ location(p) | tx }}</div>
              </td>
              <td>
                <div class="patient-cell">
                  <cl-pet-icon [kind]="p.kind" />
                  <span class="cell-text"><span class="primary-text ellipsis">{{ p.pet }}</span><div class="secondary ellipsis">{{ p.code }} · {{ p.breed }}</div></span>
                </div>
              </td>
              <td><div class="ellipsis">{{ store.owner(p).name }}</div><div class="secondary">{{ store.owner(p).phone }}</div></td>
              <td><div class="ellipsis">{{ reason[0] | tx }}</div><div class="secondary ellipsis">{{ (reason[1] || p.chief) | tx }}</div></td>
              <td><div class="ellipsis">{{ p.vet | tx }}</div><div class="secondary ellipsis">{{ p.nurse | tx }}</div></td>
              <td><cl-mini-alerts [patient]="p" /></td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="muted empty-row">{{ emptyText() | tx: { stage: (stage() ? (stageLabel(stage()!) | tx) : '') } }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Phones: cards -->
    <div class="queue-cards">
      @for (p of list(); track p.id) {
        @let reason = p.reason.split(' · ');
        <button type="button" class="q-card" [class.selected]="p.id === store.selected().id" (click)="open(p)">
          <span class="q-card-top">
            <cl-pet-icon [kind]="p.kind" />
            <span class="grow"><span class="primary-text">{{ p.pet }}</span> <span class="muted">#{{ p.id }}</span><span class="secondary ellipsis">{{ p.code }} · {{ p.breed }}</span></span>
            <span class="q-time">{{ p.time }}</span>
          </span>
          <cl-mini-stepper [patient]="p" />
          <span class="ms-now" [class]="'ms-now ' + state(p)">{{ status(p) | tx }} · {{ minutes(p) }} {{ 'น.' | tx }} · <span class="muted">{{ location(p) | tx }}</span></span>
          <span class="q-card-foot">
            <span class="grow secondary ellipsis">{{ reason[0] | tx }} · {{ store.owner(p).name }} · {{ p.vet | tx }}</span>
            <cl-mini-alerts [patient]="p" [blank]="true" />
          </span>
        </button>
      } @empty {
        <p class="muted empty-row">{{ emptyText() | tx: { stage: (stage() ? (stageLabel(stage()!) | tx) : '') } }}</p>
      }
    </div>
  `,
  host: { class: 'workspace' },
})
export class QueueComponent {
  protected readonly store = inject(ClinicStore);
  private readonly ui = inject(ClinicUi);
  private readonly actions = inject(ClinicActions);
  private readonly i18n = inject(ClinicI18n);

  protected readonly now = NOW;
  protected readonly vets = VETS;
  protected readonly query = signal('');
  protected readonly vet = signal('');
  protected readonly stage = signal<StageKey | null>(null);

  protected readonly today = computed(() => formatDate(TODAY, 'long', this.i18n.lang()));

  protected readonly list = computed(() => {
    const d = this.store.data();
    const needle = this.query().trim().toLowerCase();
    return d.patients.filter(p => {
      const owner = d.owners[p.ownerKey];
      return (!needle || [p.pet, p.code, p.hn, owner.name, owner.phone, p.reason, p.vet].join(' ').toLowerCase().includes(needle))
        && (!this.vet() || p.vet === this.vet())
        && (!this.stage() || stageKey(p) === this.stage());
    });
  });

  protected readonly funnel = computed(() => {
    const patients = this.store.data().patients;
    return STAGES.map(s => {
      const inStage = patients.filter(p => stageKey(p) === s.key);
      return { key: s.key, label: s.label, count: inStage.length, stuck: inStage.filter(p => stageState(p) !== 'ok').length };
    });
  });

  protected readonly emptyText = computed(() => (this.stage() ? 'ไม่มีผู้ป่วยในขั้นตอน {stage}' : 'ไม่พบรายการที่ตรงกับคำค้น'));

  protected readonly state = stageState;
  protected readonly minutes = stageMinutes;
  protected readonly location = locOf;
  protected status(p: Patient) {
    return statusOf(p).text;
  }

  protected stageLabel(key: StageKey) {
    return STAGES.find(s => s.key === key)?.label ?? '';
  }

  // A click opens the quick view a moment later, so a double click opens only the encounter
  private clickTimer: ReturnType<typeof setTimeout> | undefined;

  protected open(p: Patient) {
    clearTimeout(this.clickTimer);
    this.clickTimer = setTimeout(() => {
      this.store.select(p);
      this.ui.openSheet('visit');
    }, 170);
  }

  protected encounter(p: Patient) {
    clearTimeout(this.clickTimer);
    this.actions.startEncounter(p);
  }
}
