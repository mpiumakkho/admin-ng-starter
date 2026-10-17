import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowRight, lucideCheck, lucideChevronRight, lucideCopy, lucideFileText, lucideLock, lucidePenLine, lucidePlus, lucideSparkles } from '@ng-icons/lucide';

import { UiButton, UiDialog, UiDialogFooter } from '../../user-management/ui';
import { ClinicActions } from '../clinic-actions';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import {
  ALERT_META, ENCOUNTER_ORDERS, ENCOUNTER_STEPS, HANDOFF, locOf, NoteTemplate, OPTIONS, SIGNED_STEPS, STAGES, stageIndex, stageMinutes,
  suggestTemplate, TEMPLATE_FIELD_LABELS, TEMPLATES, TRIAGE,
} from '../data/model';
import type { EncounterNote } from '../data/types';
import { ClinicI18n, TxPipe } from '../i18n/clinic-i18n';
import { ALERT_ICONS } from '../shared/icons';
import { PatientBanner } from '../shared/parts';

type TextField = Exclude<keyof EncounterNote, 'ros' | 'templates' | 'savedAt' | 'status' | 'signedBy' | 'signedAt' | 'closedBy' | 'closedAt'>;

/**
 * The encounter of the selected patient (L2): the patient banner, the note step by step on the left, and along the
 * bottom what the visit still has to hand over. A signature locks S/O/A/P; closing the encounter locks all of it.
 */
@Component({
  selector: 'app-clinic-encounter',
  imports: [NgTemplateOutlet, NgIcon, TxPipe, UiButton, UiDialog, UiDialogFooter, PatientBanner],
  templateUrl: './encounter.component.html',
  styleUrl: './encounter.component.scss',
  host: { class: 'workspace encounter-ws' },
})
export class EncounterComponent {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly actions = inject(ClinicActions);
  private readonly i18n = inject(ClinicI18n);
  private readonly router = inject(Router);

  protected readonly icons = {
    template: lucideFileText, ai: lucideSparkles, sign: lucidePenLine, lock: lucideLock, next: lucideArrowRight, check: lucideCheck,
    chevron: lucideChevronRight, plus: lucidePlus, copy: lucideCopy,
  };
  protected readonly steps = ENCOUNTER_STEPS;
  protected readonly options = OPTIONS;
  protected readonly triage = TRIAGE;
  protected readonly handoffSteps = HANDOFF;
  protected readonly encounterOrders = ENCOUNTER_ORDERS;
  protected readonly meta = ALERT_META;
  protected readonly alertIcons = ALERT_ICONS;

  protected readonly step = signal(2);
  protected readonly soapTab = signal(0);

  protected readonly patient = computed(() => this.store.selected(), { equal: () => false });
  protected readonly note = computed(() => this.store.noteFor(this.patient()), { equal: () => false });
  protected readonly signed = computed(() => this.note().status === 'signed');
  protected readonly closed = computed(() => !!this.note().closedAt);
  protected readonly canEdit = computed(() => !this.closed() && !(this.signed() && SIGNED_STEPS.has(this.step())));
  protected readonly last = computed(() => this.step() === ENCOUNTER_STEPS.length - 1);

  protected readonly where = computed(() => {
    const p = this.patient();
    return {
      location: locOf(p), stage: STAGES[stageIndex(p)].label, minutes: stageMinutes(p),
    };
  });
  protected readonly suggested = computed(() => suggestTemplate(this.patient()));

  protected readonly handoffDone = computed(() => HANDOFF.filter(h => this.patient().handoff[h.key].state === 'done').length);

  /* Orders step */
  protected readonly picked = signal(new Set(ENCOUNTER_ORDERS.filter(o => o.checked).map(o => o.name)));
  protected orderState(name: string): string | undefined {
    const p = this.patient();
    return this.store.data().orders.find(o => o.pet === p.pet && o.name === name && o.col !== 'Cancelled')?.state;
  }

  /* Medication step */
  protected readonly prescriptions = computed(() => this.store.data().prescriptions.filter(rx => rx.pet === this.patient().pet));
  protected readonly olderMeds = computed(() => this.patient().meds.filter(m => !this.prescriptions().some(rx => rx.drug === m[0])));
  protected readonly drugAlerts = computed(() => this.patient().alerts.filter(a => a.type === 'allergy' || a.type === 'drug'));

  /* Templates and the AI summary */
  protected readonly templatesOpen = signal(false);
  protected readonly templates = TEMPLATES;
  protected readonly templateId = signal('');
  protected readonly template = computed(() => TEMPLATES.find(t => t.id === this.templateId()) ?? this.suggested() ?? TEMPLATES[0]);
  protected readonly summaryOpen = signal(false);

  protected value(key: TextField): string {
    return this.note()[key];
  }

  /** Typing writes into the note; leaving the field tells everyone (commit) */
  protected write(key: TextField, value: string) {
    this.note()[key] = value;
  }

  protected commit() {
    this.store.mutate(() => undefined);
  }

  protected choose(key: TextField, value: string) {
    this.note()[key] = value;
    this.commit();
  }

  protected toggleRos(system: string, on: boolean) {
    const n = this.note();
    n.ros = on ? [...n.ros, system] : n.ros.filter(r => r !== system);
    this.commit();
  }

  protected save() {
    this.store.saveNote(this.patient());
    this.ui.toast('บันทึก Encounter ของ {pet} แล้ว', { pet: this.patient().pet });
  }

  /** Saves, then the next step; from the last one the visit goes on to the pharmacy */
  protected next() {
    if (this.canEdit()) {
      this.store.saveNote(this.patient());
    }
    if (!this.last()) {
      this.step.update(s => s + 1);
      this.ui.toast('บันทึกและไปขั้นตอนถัดไป');
    } else {
      this.router.navigate(['/clinic/dispense']);
      this.ui.toast('ส่งต่อไปยัง Dispense แล้ว');
    }
  }

  protected sendOrders() {
    const p = this.patient();
    const { sent, skipped } = this.store.sendEncounterOrders(p, [...this.picked()]);
    const parts = [sent && this.i18n.t('ส่ง {0} รายการ', { 0: sent }), skipped && this.i18n.t('ข้าม {0} รายการที่ส่งแล้ว', { 0: skipped })].filter(Boolean);
    this.ui.toast(parts.length ? `${p.pet} · ${parts.join(' · ')}` : 'ไม่มีรายการที่เลือก');
  }

  protected toggleOrder(name: string) {
    this.picked.update(set => {
      const next = new Set(set);
      if (!next.delete(name)) {
        next.add(name);
      }
      return next;
    });
  }

  protected openTemplates() {
    this.templateId.set(this.suggested()?.id ?? TEMPLATES[0].id);
    this.templatesOpen.set(true);
  }

  protected templateFields(tpl: NoteTemplate): [string, string][] {
    return (Object.entries(tpl.fields) as [keyof EncounterNote, unknown][]).map(([k, v]) => [
      TEMPLATE_FIELD_LABELS[k] ?? k,
      Array.isArray(v) ? (v.length ? v.map(s => this.i18n.t(String(s))).join(', ') : this.i18n.t('(ล้างค่า)')) : this.i18n.t(String(v)),
    ]);
  }

  protected applyTemplate(mode: 'replace' | 'fill') {
    const tpl = this.template();
    const changed = this.store.applyToNote(this.patient(), tpl.fields, mode, tpl.name);
    this.templatesOpen.set(false);
    this.ui.toast(changed ? 'ใช้เทมเพลต "{0}" · {1} ช่อง' : 'ทุกช่องมีข้อมูลแล้ว ไม่ได้เติมเพิ่ม', { 0: this.i18n.t(tpl.name), 1: changed });
  }

  /* The AI summary: put together from the record and the note, no model is called */
  protected readonly summary = computed(() => {
    const p = this.patient();
    const n = this.note();
    const results = this.store.resultsFor(p);
    return {
      alerts: p.alerts.map(a => a.label),
      problems: p.problems.filter(x => x[2] !== 'ok').map(x => x[0]),
      meds: p.meds.map(m => m[0]),
      abnormal: results.flatMap(r => r.values.filter(v => v[3]).map(v => `${r.name}: ${v[0]} ${v[1]} (${v[2]})`)),
      vaccines: p.vaccines.filter(v => v[2] !== 'ok').map(v => `${v[0]} · ${v[1]}`),
      visits: p.visits.slice(0, 3).map(v => `${v[0]} · ${v[1]}`),
      soap: [
        ['S', [n.chief, n.hpi].filter(Boolean).join(' · ')],
        ['O', [n.general, n.msk, n.cardio].filter(Boolean).join(' · ') || [n.temp && `T ${n.temp} °C`, n.hr && `HR ${n.hr}`, n.rr && `RR ${n.rr}`].filter(Boolean).join(' · ')],
        ['A', n.dx || p.problems.filter(x => x[2] !== 'ok').map(x => x[0]).join(', ')],
        ['P', n.plan],
      ] as [string, string][],
    };
  });

  protected acceptAssessment() {
    const p = this.patient();
    const s = this.summary();
    const changed = this.store.applyToNote(p, { dx: s.soap[2][1], ddx: s.problems.join('\n') }, 'fill');
    this.summaryOpen.set(false);
    this.ui.toast(changed ? 'เติม Assessment จากสรุป {0} ช่อง' : 'ทุกช่องมีข้อมูลแล้ว ไม่ได้เติมเพิ่ม', { 0: changed });
  }

  protected async copySummary() {
    const s = this.summary();
    const t = (x: string) => this.i18n.t(x);
    const text = [
      `${this.patient().pet} · ${this.patient().hn}`,
      `${t('Clinical alerts')}: ${s.alerts.map(t).join(', ') || '—'}`,
      `${t('Problem list')}: ${s.problems.map(t).join(', ') || '—'}`,
      `${t('Medications')}: ${s.meds.join(', ') || '—'}`,
      `${t('ผลตรวจผิดปกติ')}: ${s.abnormal.join(', ') || '—'}`,
      ...s.soap.map(([k, v]) => `${k}: ${t(v) || '—'}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.ui.toast('คัดลอกสรุปแล้ว');
    } catch {
      this.ui.toast('คัดลอกไม่ได้ — เบราว์เซอร์ไม่อนุญาต', undefined, 'error');
    }
  }

  protected share() {
    const p = this.patient();
    const n = this.note();
    const o = this.store.owner(p);
    this.actions.sendMessage(p, 'เอกสารจำหน่าย', `เรียนคุณ ${o.name}\n${p.pet}: ${n.summary || n.dx || '—'}\n${n.home}\n${n.followup}`, () => this.store.mutate(() => {
      p.handoff.discharge = { state: 'done', note: 'ส่งเอกสารจำหน่ายแล้ว' };
    }));
  }

  protected openDispense() {
    this.router.navigate(['/clinic/dispense']);
  }
}
