/* Small building blocks shared by the workspace's pages and sheets (the design's components/ui.tsx). Their look is in
   clinic.scss, under .clinic. */
import { Component, computed, inject, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck, lucideChevronRight, lucideCircleHelp, lucideMapPin, lucideUserRound } from '@ng-icons/lucide';

import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import {
  ALERT_META, ALERT_ORDER, locOf, STAGE_SLA, STAGES, stageIndex, stageKey, stageMinutes, stageState, stateChipCls, statusOf,
} from '../data/model';
import type { ClinicalAlert, Patient, PetKind } from '../data/types';
import { ClinicI18n, TxPipe } from '../i18n/clinic-i18n';
import { ALERT_ICONS, PET_ICONS } from './icons';

/** The pet's picture: a dog or cat drawing */
@Component({
  selector: 'cl-pet-icon',
  imports: [NgIcon, TxPipe],
  template: `
    <span role="img" class="pet-fallback" [class.pet-lg]="size() === 'lg'" [attr.aria-label]="(kind() === 'dog' ? 'สุนัข' : 'แมว') | tx">
      <ng-icon [svg]="icons[kind()]" aria-hidden="true" />
    </span>
  `,
  host: { class: 'contents' },
})
export class PetIcon {
  readonly kind = input.required<PetKind>();
  readonly size = input<'md' | 'lg'>('md');
  protected readonly icons = PET_ICONS;
}

/** A pet's clinical alerts as small icons, most severe first; the whole alert is the icon's name and tooltip */
@Component({
  selector: 'cl-mini-alerts',
  imports: [NgIcon, TxPipe],
  template: `
    @if (unknown() || sorted().length) {
      <span class="mini-alerts">
        @if (unknown()) {
          <span role="img" class="mini warn" [attr.aria-label]="unknownText | tx" [attr.title]="unknownText | tx">
            <ng-icon [svg]="help" aria-hidden="true" />
          </span>
        }
        @for (alert of sorted(); track $index) {
          <span role="img" class="mini" [class]="'mini ' + meta[alert.type].cls" [attr.aria-label]="text(alert)" [attr.title]="text(alert)">
            <ng-icon [svg]="icons[alert.type]" aria-hidden="true" />
          </span>
        }
      </span>
    } @else if (!blank()) {
      <span class="muted" aria-hidden="true">—</span>
    }
  `,
  host: { class: 'contents' },
})
export class MiniAlerts {
  readonly patient = input.required<Patient>();
  /** Nothing at all when there are no alerts (on cards), rather than a dash (in table cells) */
  readonly blank = input(false);

  private readonly i18n = inject(ClinicI18n);
  protected readonly meta = ALERT_META;
  protected readonly icons = ALERT_ICONS;
  protected readonly help = lucideCircleHelp;
  protected readonly unknownText = 'ยังไม่ทบทวนประวัติแพ้ยา — ระบบไม่ถือว่า "ไม่รู้" คือ "ไม่แพ้"';
  protected readonly unknown = computed(() => !this.patient().allergyReview);
  protected readonly sorted = computed(() =>
    [...this.patient().alerts].sort((a, b) => ALERT_ORDER[ALERT_META[a.type].cls] - ALERT_ORDER[ALERT_META[b.type].cls]));

  protected text(alert: ClinicalAlert): string {
    return this.i18n.t(alert.label) + (alert.detail ? ' — ' + this.i18n.t(alert.detail) : '');
  }
}

/** Five short bars for the visit's stages: done, skipped, the current one in its SLA colour, and those to come */
@Component({
  selector: 'cl-mini-stepper',
  template: `
    <div class="ms" aria-hidden="true">
      @for (stage of stages; track stage.key; let k = $index) {
        <i [class]="cls(k)"></i>
      }
    </div>
  `,
  host: { class: 'contents' },
})
export class MiniStepper {
  readonly patient = input.required<Patient>();
  protected readonly stages = STAGES;

  protected cls(k: number): string {
    const p = this.patient();
    const i = stageIndex(p);
    return k < i ? (p.stages[k].at ? 'on' : 'skip') : k === i ? 'cur ' + stageState(p) : '';
  }
}

/** The visit's stages one under another, with who and where, and how long in the current one */
@Component({
  selector: 'cl-vstepper',
  imports: [TxPipe],
  template: `
    <ol class="vstep">
      @for (stage of stages; track stage.key; let k = $index) {
        <li [class]="cls(k)">
          <b>{{ stage.label | tx }}</b>
          @if (k === current()) {
            <span class="chip" [class]="'chip ' + chipCls()">
              {{ 'อยู่มา {m} น.' | tx: { m: minutes() } }}@if (state() !== 'ok') { · {{ 'เกณฑ์ {sla} น.' | tx: { sla: sla() } }}}
            </span>
          }
          <div class="secondary">{{ when(k) }}</div>
        </li>
      }
    </ol>
  `,
  host: { class: 'contents' },
})
export class VStepper {
  readonly patient = input.required<Patient>();

  private readonly i18n = inject(ClinicI18n);
  protected readonly stages = STAGES;
  protected readonly current = computed(() => stageIndex(this.patient()));
  protected readonly state = computed(() => stageState(this.patient()));
  protected readonly chipCls = computed(() => stateChipCls(this.state()));
  protected readonly minutes = computed(() => stageMinutes(this.patient()));
  protected readonly sla = computed(() => STAGE_SLA[stageKey(this.patient())]);

  protected cls(k: number): string {
    const p = this.patient();
    const i = this.current();
    return k < i ? (p.stages[k].at ? 'done' : 'skip') : k === i ? 'cur ' + this.state() : 'todo';
  }

  protected when(k: number): string {
    const s = this.patient().stages[k];
    if (s.at) {
      return [s.at, s.by && this.i18n.t(s.by), s.loc && this.i18n.t(s.loc)].filter(Boolean).join(' · ');
    }
    return this.i18n.t(k < this.current() ? 'ข้ามขั้นตอนนี้' : 'ยังไม่ถึงขั้นตอนนี้');
  }
}

/** Where the pet is now and for how long, in the colour of its SLA */
@Component({
  selector: 'cl-stage-chip',
  imports: [NgIcon, TxPipe],
  template: `
    <span class="chip" [class]="'chip ' + cls()">
      <ng-icon [svg]="pin" aria-hidden="true" />{{ location() | tx }} · {{ minutes() }} {{ 'น.' | tx }}
    </span>
  `,
  host: { class: 'contents' },
})
export class StageChip {
  readonly patient = input.required<Patient>();
  protected readonly pin = lucideMapPin;
  protected readonly location = computed(() => locOf(this.patient()));
  protected readonly minutes = computed(() => stageMinutes(this.patient()));
  protected readonly cls = computed(() => {
    const st = stageState(this.patient());
    return st === 'late' ? 'danger' : st === 'warn' ? 'warn' : 'quiet';
  });
}

/** The visit's status: waiting, checked in, in room… */
@Component({
  selector: 'cl-status',
  imports: [TxPipe],
  template: `<span class="status" [class]="'status ' + badge().cls">{{ badge().text | tx }}</span>`,
  host: { class: 'contents' },
})
export class StatusBadge {
  readonly patient = input.required<Patient>();
  protected readonly badge = computed(() => statusOf(this.patient()));
}

/** A pet's clinical alerts as chips that carry their text, on the patient banner */
@Component({
  selector: 'cl-safety-chips',
  imports: [NgIcon, TxPipe],
  template: `
    @if (!patient().alerts.length && patient().allergyReview) {
      <span class="chip ok"><ng-icon [svg]="check" aria-hidden="true" />{{ 'ไม่มี clinical alert' | tx }}</span>
    }
    @if (!patient().allergyReview) {
      <button type="button" class="chip warn" (click)="opened.emit()"><ng-icon [svg]="help" aria-hidden="true" />{{ 'ยังไม่ทบทวนประวัติแพ้ยา' | tx }}</button>
    }
    @for (alert of patient().alerts; track $index) {
      <button type="button" class="chip" [class]="'chip ' + meta[alert.type].cls" [attr.title]="alert.detail ? (alert.detail | tx) : null" (click)="opened.emit()">
        <ng-icon [svg]="icons[alert.type]" aria-hidden="true" />{{ alert.label | tx }}
      </button>
    }
  `,
  host: { class: 'contents' },
})
export class SafetyChips {
  readonly patient = input.required<Patient>();
  readonly opened = output();
  protected readonly meta = ALERT_META;
  protected readonly icons = ALERT_ICONS;
  protected readonly check = lucideCheck;
  protected readonly help = lucideCircleHelp;
}

/** A column of a board, with its count; an empty one says so */
@Component({
  selector: 'cl-column',
  imports: [TxPipe],
  template: `
    <section class="column" [attr.aria-label]="name() | tx">
      <h3>{{ name() | tx }}<span class="count">{{ count() }}</span></h3>
      @if (count() === 0) {
        <p class="col-empty">{{ (empty() || 'ไม่มีรายการใน {name}') | tx: { name: (name() | tx) } }}</p>
      }
      <ng-content />
    </section>
  `,
  host: { class: 'contents' },
})
export class BoardColumn {
  readonly name = input.required<string>();
  readonly count = input.required<number>();
  readonly empty = input('');
}

/** A card on a board: its title, a status chip, two lines about it, and safety icons at the end of the last line */
@Component({
  selector: 'cl-task',
  imports: [TxPipe],
  template: `
    <div class="task" role="button" tabindex="0" (click)="opened.emit()" (keydown.enter)="open($event)" (keydown.space)="open($event)">
      <div class="task-head">
        <h4>{{ title() }}</h4>
        @if (status(); as status) {
          <span class="chip" [class]="'chip ' + status.cls">{{ status.text | tx }}</span>
        }
      </div>
      <div class="task-meta">
        <div class="task-meta-text">{{ line1() }}<br />{{ line2() }}</div>
        <div class="task-alerts"><ng-content /></div>
      </div>
    </div>
  `,
  host: { class: 'contents' },
})
export class TaskCard {
  readonly title = input.required<string>();
  readonly line1 = input('');
  readonly line2 = input('');
  readonly status = input<{ text: string; cls: string } | null>(null);
  readonly opened = output();

  protected open(event: Event) {
    event.preventDefault();
    this.opened.emit();
  }
}

/** The bar at the top of a page: its title and what it is for, then its controls */
@Component({
  selector: 'cl-toolbar',
  template: `
    <div class="toolbar">
      <div class="title-block">
        <h1>{{ heading() }}</h1>
        <div class="subtitle"><ng-content select="[subtitle]" /></div>
      </div>
      <ng-content />
    </div>
  `,
  host: { class: 'contents' },
})
export class Toolbar {
  readonly heading = input.required<string>();
}

/** Who the pet is and what must never be missed about it, always in view on the encounter (L1) */
@Component({
  selector: 'cl-patient-banner',
  imports: [NgIcon, TxPipe, PetIcon, StatusBadge, StageChip, SafetyChips],
  template: `
    @let p = store.selected();
    @let o = store.owner(p);
    <div class="patient-banner">
      <button type="button" class="pat-btn" [attr.title]="'เปิด Patient sheet' | tx" (click)="ui.openSheet('patient', { tab: 'overview' })">
        <cl-pet-icon [kind]="p.kind" size="lg" />
        <span class="pat-text">
          <span class="pat-name">
            {{ p.pet }}<span class="hn">{{ p.hn }} · {{ p.code }}</span>
            <cl-status [patient]="p" />
            <cl-stage-chip [patient]="p" />
            @if (p.triage !== 'Routine') {
              <span class="chip" [class]="'chip ' + p.triageCls">{{ p.triage | tx }}</span>
            }
          </span>
          <span class="secondary">
            {{ p.species | tx }} · {{ p.breed }} · {{ p.sex | tx }} · {{ p.age | tx }} · <b>{{ p.weight }}</b>
            <span class="weighed"> ({{ 'ชั่ง' | tx }} {{ p.weightAt }})</span>
          </span>
        </span>
        <ng-icon class="caret" [svg]="chevron" aria-hidden="true" />
      </button>
      <div class="safety-strip">
        <cl-safety-chips [patient]="p" (opened)="ui.openSheet('patient', { tab: 'alerts' })" />
      </div>
      <button type="button" class="owner-btn" [attr.title]="'เปิด Owner sheet' | tx" (click)="ui.openSheet('owner')">
        <span class="circle"><ng-icon [svg]="person" aria-hidden="true" /></span>
        <span class="owner-text">
          <span class="owner-line">
            {{ o.name }}
            @for (badge of o.badges; track badge) {
              <span class="chip quiet">{{ badge | tx }}</span>
            }
          </span>
          <span class="secondary">{{ o.phone }} · {{ o.pets.length }} {{ 'สัตว์' | tx }}</span>
        </span>
        <ng-icon class="caret" [svg]="chevron" aria-hidden="true" />
      </button>
    </div>
  `,
  host: { class: 'contents' },
})
export class PatientBanner {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly chevron = lucideChevronRight;
  protected readonly person = lucideUserRound;
}
