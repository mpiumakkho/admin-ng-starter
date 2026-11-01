/* Incident reports: the worklist by severity and triage clock, reported under a name or none, triaged, analysed and closed (quality.incidents, M12 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { NOW, TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  ANONYMOUS, CATEGORIES, closeBlock, HARM, HARM_LEVELS, INCIDENT_STATUS, incidentProblems, type IncidentInput, needsRca, RCA_STATUS, rcaOf, reporterOf, SAFETY_CATEGORY, SAFETY_PLACES,
  triageDue, triageLate, triageProblems, type TriageInput,
} from '../../data/quality';
import type { Incident, SafetyCategory } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

type View = 'open' | 'all' | 'closed';
const BLANK: IncidentInput = { at: `${TODAY}T${NOW}`, category: '', location: '', pet: '', description: '', immediateAction: '', harm: '1', anonymous: false };

@Component({
  selector: 'bo-incidents',
  imports: [NgIcon, RouterLink, TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'รายงานอุบัติการณ์'" [source]="'M12 P2 · รายงานได้โดยไม่ระบุตัวตน · คัดกรองภายใน 24 ชม. เมื่ออันตรายรุนแรงขึ้นไป 72 ชม. สำหรับระดับอื่น · อันตรายรุนแรงขึ้นไปต้องมี RCA ก่อนปิด · ต้นแบบก่อนสัญญาหน้าของ M12 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="startReport()"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'แจ้งอุบัติการณ์' | tx }}</button>
    </bo-page-head>

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar">
            <div class="segmented" role="group" [attr.aria-label]="'มุมมอง' | tx">
              @for (v of views; track v[0]) {<button type="button" [class.active]="view() === v[0]" [attr.aria-pressed]="view() === v[0]" (click)="view.set(v[0])">{{ v[1] | tx }}</button>}
            </div>
            <select class="ui-input" [attr.aria-label]="'ประเภท' | tx" (change)="category.set($any($event.target).value)">
              <option value="">{{ 'ทุกประเภท' | tx }}</option>
              @for (c of categories; track c) {<option [value]="c">{{ CATEGORY[c] | tx }}</option>}
            </select>
            <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
          </div>
          <div class="table-wrap">
            <table class="bo-table incidents">
              <thead>
                <tr>
                  <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                  <th scope="col">{{ 'เหตุการณ์' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'ระดับอันตราย' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (i of rows(); track i.id) {
                  <tr tabindex="0" [class.selected]="i.id === selectedId()" [attr.aria-selected]="i.id === selectedId()" (click)="pick(i.id)" (keydown.enter)="pick(i.id)">
                    <td><b>{{ i.id }}</b><div class="secondary">{{ i.at }}</div></td>
                    <td>{{ i.description | tx }}<div class="secondary">{{ i.location | tx }}@if (i.pet) { · {{ i.pet }}} · {{ reporter(i) | tx }}</div></td>
                    <td>{{ CATEGORY[i.category] | tx }}</td>
                    <td><span class="chip" [class]="'chip ' + HARM[i.harm].cls">{{ HARM[i.harm].label | tx }}</span></td>
                    <td>
                      <span class="chip" [class]="'chip ' + STATUS[i.status].cls">{{ STATUS[i.status].label | tx }}</span>
                      @if (i.status === 'reported') {<div class="secondary" [class.text-danger]="late(i)">{{ (late(i) ? 'เกินกำหนดคัดกรอง' : 'คัดกรองภายใน {due}') | tx: { due: due(i) } }}</div>}
                      @else if (i.rcaId) {<div class="secondary">{{ i.rcaId }}</div>}
                    </td>
                  </tr>
                } @empty {
                  <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีอุบัติการณ์ในมุมมองนี้' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <aside class="record-rail">
        @if (reporting()) {
          <div class="panel action-card">
            <b>{{ 'แจ้งอุบัติการณ์' | tx }}</b>
            <div class="two">
              <label class="field">{{ 'เกิดเมื่อ' | tx }}<input class="ui-input" type="datetime-local" [value]="form().at" (input)="set('at', $any($event.target).value)" /></label>
              <label class="field">{{ 'ประเภท' | tx }}
                <select class="ui-input" (change)="set('category', $any($event.target).value)">
                  <option value="" [selected]="!form().category">{{ 'เลือก' | tx }}</option>
                  @for (c of categories; track c) {<option [value]="c" [selected]="c === form().category">{{ CATEGORY[c] | tx }}</option>}
                </select>
              </label>
            </div>
            <div class="two">
              <label class="field">{{ 'สถานที่' | tx }}
                <select class="ui-input" (change)="set('location', $any($event.target).value)">
                  <option value="" [selected]="!form().location">{{ 'เลือก' | tx }}</option>
                  @for (p of places; track p) {<option [value]="p" [selected]="p === form().location">{{ p | tx }}</option>}
                </select>
              </label>
              <label class="field">{{ 'ผู้ป่วย (ถ้ามี)' | tx }}<input class="ui-input" [value]="form().pet" (input)="set('pet', $any($event.target).value)" /></label>
            </div>
            <label class="field">{{ 'เกิดอะไรขึ้น' | tx }}<textarea class="ui-input" rows="3" [value]="form().description" (input)="set('description', $any($event.target).value)"></textarea></label>
            <label class="field">{{ 'สิ่งที่ทำทันที' | tx }}<textarea class="ui-input" rows="2" [value]="form().immediateAction" (input)="set('immediateAction', $any($event.target).value)"></textarea></label>
            <label class="field">{{ 'ระดับอันตราย' | tx }}
              <select class="ui-input" (change)="set('harm', $any($event.target).value)">
                @for (h of harms; track h) {<option [value]="h" [selected]="String(h) === form().harm">{{ h }} · {{ HARM[h].label | tx }}</option>}
              </select>
            </label>
            <label class="check"><input type="checkbox" [checked]="form().anonymous" (change)="set('anonymous', $any($event.target).checked)" />{{ 'ไม่ระบุชื่อผู้รายงาน' | tx }}</label>
            @if (form().anonymous) {<p class="secondary">{{ 'ระบบไม่เก็บชื่อผู้รายงานไว้ทั้งในรายงานและบันทึกตรวจสอบ' | tx }}</p>}
            @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
            <div class="two">
              <button uiButton variant="secondary" size="sm" type="button" (click)="reporting.set(false)">{{ 'ยกเลิก' | tx }}</button>
              <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="report()">{{ 'ส่งรายงาน' | tx }}</button>
            </div>
          </div>
        } @else if (selected(); as i) {
          @let rca = rcaFor(i);
          <div class="panel action-card">
            <b>{{ i.id }} · {{ CATEGORY[i.category] | tx }}</b>
            <span class="secondary">{{ i.location | tx }}@if (i.pet) { · {{ i.pet }}} · {{ 'เกิดเมื่อ {at}' | tx: { at: i.at } }}</span>
            <p>{{ i.description | tx }}</p>
            <div class="sum-row"><span>{{ 'สิ่งที่ทำทันที' | tx }}</span><span>{{ i.immediateAction | tx }}</span></div>
            <div class="sum-row"><span>{{ 'ผู้รายงาน' | tx }}</span><b>{{ reporter(i) | tx }}</b></div>
            <div class="sum-row"><span>{{ 'ระดับอันตราย' | tx }}</span><span class="chip" [class]="'chip ' + HARM[i.harm].cls">{{ HARM[i.harm].label | tx }}</span></div>
            @if (i.source) {<div class="sum-row"><span>{{ 'ที่มา' | tx }}</span><b>{{ i.source }}</b></div>}
            @if (i.owner) {<div class="sum-row"><span>{{ 'ผู้รับผิดชอบ' | tx }}</span><b>{{ i.owner | tx }}</b></div>}

            @if (i.status === 'reported') {
              <div class="section-title">{{ 'คัดกรอง' | tx }}</div>
              <p class="secondary" [class.text-danger]="late(i)">{{ (late(i) ? 'เกินกำหนดคัดกรอง ({due})' : 'คัดกรองภายใน {due}') | tx: { due: due(i) } }}</p>
              <div class="two">
                <label class="field">{{ 'ระดับอันตราย' | tx }}
                  <select class="ui-input" (change)="setTriage('harm', $any($event.target).value)">
                    @for (h of harms; track h) {<option [value]="h" [selected]="String(h) === triage().harm">{{ h }} · {{ HARM[h].label | tx }}</option>}
                  </select>
                </label>
                <label class="field">{{ 'ผู้รับผิดชอบ' | tx }}<input class="ui-input" [value]="triage().owner" (input)="setTriage('owner', $any($event.target).value)" /></label>
              </div>
              <label class="field">{{ 'เหตุผลการคัดกรอง' | tx }}<textarea class="ui-input" rows="2" [value]="triage().note" (input)="setTriage('note', $any($event.target).value)"></textarea></label>
              @if (triageIssues().length) {<ul class="problems">@for (p of triageIssues(); track p) {<li>{{ p | tx }}</li>}</ul>}
              <button uiButton size="sm" type="button" [disabled]="triageIssues().length > 0" (click)="saveTriage(i)">{{ 'บันทึกการคัดกรอง' | tx }}</button>
            } @else if (i.status === 'triaged') {
              <div class="section-title">{{ 'RCA' | tx }}</div>
              @if (rca) {
                <div class="sum-row"><a class="link" routerLink="/backoffice/quality/rca" [queryParams]="{ id: rca.id }">{{ rca.id }}</a><span class="chip" [class]="'chip ' + RCA_STATUS[rca.status].cls">{{ RCA_STATUS[rca.status].label | tx }}</span></div>
              } @else {
                <p class="secondary" [class.text-danger]="needsRca(i)">{{ (needsRca(i) ? 'อันตรายระดับรุนแรงขึ้นไปต้องมี RCA ก่อนปิด' : 'ยังไม่มี RCA') | tx }}</p>
                <button uiButton variant="secondary" size="sm" type="button" (click)="actions.openRca(i.id, i.description)">{{ 'เปิด RCA' | tx }}</button>
              }
              @if (block(i); as b) {<p class="secondary">{{ b | tx }}</p>}
              <button uiButton size="sm" type="button" [disabled]="!!block(i)" (click)="actions.closeIncident(i)">{{ 'ปิดอุบัติการณ์' | tx }}</button>
            } @else {
              <div class="sum-row"><span>{{ 'ปิดเมื่อ' | tx }}</span><b>{{ i.closedAt }}</b></div>
              <p class="secondary">{{ i.outcome | tx }}</p>
            }

            <div class="section-title">{{ 'ประวัติ' | tx }}</div>
            <ul class="timeline compact">
              @for (h of i.history; track $index) {<li class="tl"><b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}<div class="secondary">{{ h[0] }} · {{ h[3] | tx }}</div></li>}
            </ul>
          </div>
        } @else {
          <div class="panel action-card">
            <b>{{ 'ต้องคัดกรองก่อน' | tx }}</b>
            @for (i of waiting(); track i.id) {
              <button type="button" class="sum-row link-row" (click)="pick(i.id)"><span>{{ i.id }} · {{ HARM[i.harm].label | tx }}</span><span [class.text-danger]="late(i)">{{ (late(i) ? 'เกินกำหนดคัดกรอง' : due(i)) | tx }}</span></button>
            } @empty {
              <p class="secondary ok-text">{{ 'ไม่มีอุบัติการณ์รอคัดกรอง' | tx }}</p>
            }
            <p class="secondary">{{ 'เลือกรายการในตารางเพื่อคัดกรอง เปิด RCA หรือปิด' | tx }}</p>
          </div>
        }
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class IncidentsComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly String = String;
  protected readonly HARM = HARM;
  protected readonly STATUS = INCIDENT_STATUS;
  protected readonly CATEGORY = SAFETY_CATEGORY;
  protected readonly RCA_STATUS = RCA_STATUS;
  protected readonly ANONYMOUS = ANONYMOUS;
  protected readonly categories = CATEGORIES;
  protected readonly places = SAFETY_PLACES;
  protected readonly harms = HARM_LEVELS;
  protected readonly needsRca = needsRca;
  protected readonly views: [View, string][] = [['open', 'ยังไม่ปิด'], ['all', 'ทั้งหมด'], ['closed', 'ปิดแล้ว']];

  protected readonly view = signal<View>('open');
  protected readonly category = signal<SafetyCategory | ''>('');
  protected readonly selectedId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('id'));
  protected readonly rows = computed(() => {
    const v = this.view();
    return this.store.data().incidents.filter(i => (v === 'all' || (v === 'closed') === (i.status === 'closed')) && (!this.category() || i.category === this.category()))
      .sort((a, b) => Number(triageLate(b)) - Number(triageLate(a)) || b.harm - a.harm || b.at.localeCompare(a.at));
  });
  protected readonly waiting = computed(() => this.store.data().incidents.filter(i => i.status === 'reported').sort((a, b) => triageDue(a).localeCompare(triageDue(b))));
  protected readonly selected = computed(() => this.store.data().incidents.find(i => i.id === this.selectedId()) ?? null);

  protected readonly reporting = signal(false);
  protected readonly form = signal<IncidentInput>({ ...BLANK });
  protected readonly problems = computed(() => incidentProblems(this.form()));
  protected readonly triage = signal<TriageInput>({ harm: '1', owner: '', note: '' });
  protected readonly triageIssues = computed(() => (this.selected() ? triageProblems(this.selected()!, this.triage()) : []));

  protected reporter(i: Incident) {
    return reporterOf(i);
  }

  protected late(i: Incident) {
    return triageLate(i);
  }

  protected due(i: Incident) {
    return triageDue(i);
  }

  protected rcaFor(i: Incident) {
    return rcaOf(this.store.data(), i.rcaId);
  }

  protected block(i: Incident) {
    return closeBlock(this.store.data(), i);
  }

  protected pick(id: string) {
    this.reporting.set(false);
    const i = this.store.data().incidents.find(x => x.id === id);
    this.triage.set({ harm: String(i?.harm ?? 1), owner: '', note: '' });
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected startReport() {
    this.selectedId.set(null);
    this.form.set({ ...BLANK });
    this.reporting.set(true);
  }

  protected set<K extends keyof IncidentInput>(key: K, value: IncidentInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected setTriage<K extends keyof TriageInput>(key: K, value: TriageInput[K]) {
    this.triage.set({ ...this.triage(), [key]: value });
  }

  protected report() {
    this.actions.reportIncident(this.form(), i => {
      this.reporting.set(false);
      this.view.set('open');
      this.pick(i.id);
    });
  }

  protected saveTriage(i: Incident) {
    this.actions.triageIncident(i, this.triage());
  }
}
