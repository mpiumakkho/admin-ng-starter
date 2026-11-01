/* Safety culture and M&M: the hospital-wide survey by dimension against the round before, and the mortality and morbidity reviews (quality.culture, M12 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { dimensionChange, MM_OUTCOME, mmBlock, mmProblems, type MmInput, responseRate, SURVEY_MIN_RATE, surveyBlock } from '../../data/quality';
import type { MmReview } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

const BLANK: MmInput = { pet: '', outcome: 'complication', eventDate: TODAY, summary: '', presenter: '', reviewDate: TODAY, incidentId: '' };

@Component({
  selector: 'bo-safety-culture',
  imports: [NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'วัฒนธรรมความปลอดภัยและ M&M'" [source]="'M12 P2 · safety_culture_survey ทั้งโรงพยาบาล ร้อยละคำตอบเชิงบวกต่อมิติ · ทบทวนการเสียชีวิตและภาวะแทรกซ้อน · รายละเอียดแบบสำรวจรอสัญญาของ M12 · ต้นแบบก่อนสัญญาหน้าของ M12 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="startMm()"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'นัดทบทวน M&M' | tx }}</button>
    </bo-page-head>

    <div class="split" [class.with-drawer]="scheduling() || selected()">
      <div class="groups">
        @if (survey(); as s) {
          @let rate = rateOf(s);
          <div class="panel">
            <div class="filter-bar">
              <b>{{ 'แบบสำรวจรอบ {round}' | tx: { round: s.round } }}</b>
              <span class="chip" [class]="'chip ' + (s.status === 'open' ? 'info' : 'quiet')">{{ (s.status === 'open' ? 'เปิดรับคำตอบ' : 'ปิดแล้ว') | tx }}</span>
              <span class="secondary grow">{{ s.from }} → {{ s.to }}</span>
              @if (s.status === 'open') {<button uiButton variant="secondary" size="sm" type="button" [disabled]="!!block(s)" (click)="actions.closeSurvey(s)">{{ 'ปิดรอบสำรวจ' | tx }}</button>}
            </div>
            <div class="ce-progress">
              <div class="sum-row"><span>{{ 'ตอบแล้ว {n}/{all} คน' | tx: { n: s.responded, all: s.invited } }}</span><b>{{ rate }}%</b></div>
              <div class="bar" role="img" [attr.aria-label]="'อัตราการตอบ {n}%' | tx: { n: rate }"><span [class.behind]="rate < minRate" [style.width.%]="rate"></span></div>
              <span class="secondary">{{ 'ปิดรอบได้เมื่อตอบถึง {n}%' | tx: { n: minRate } }}</span>
            </div>
            <div class="table-wrap">
              <table class="bo-table culture">
                <thead><tr>
                  <th scope="col">{{ 'มิติ' | tx }}</th>
                  <th scope="col" class="num w-kind">{{ 'เชิงบวก' | tx }}</th>
                  <th scope="col" class="num w-kind">{{ 'รอบก่อน' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'เปลี่ยนแปลง' | tx }}</th>
                </tr></thead>
                <tbody>
                  @for (d of s.dimensions; track d[0]) {
                    @let ch = change(d[0]);
                    <tr class="static">
                      <th scope="row">{{ d[0] | tx }}<div class="bar"><span [class.behind]="d[1] < 50" [style.width.%]="d[1]"></span></div></th>
                      <td class="num"><b [class.text-danger]="d[1] < 50">{{ d[1] }}%</b></td>
                      <td class="num">{{ before(d[0]) ?? '—' }}@if (before(d[0]) !== undefined) {%}</td>
                      <td [class.text-danger]="ch !== null && ch < 0">@if (ch === null) {—} @else {<span>{{ (ch > 0 ? 'เพิ่มขึ้น {n} จุด' : ch < 0 ? 'ลดลง {n} จุด' : 'เท่าเดิม') | tx: { n: abs(ch) } }}</span>}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="secondary foot-note">{{ 'ต่ำกว่า 50% คือมิติที่ต้องปรับปรุง · ผลยังไม่ใช่ข้อสรุปจนกว่าจะปิดรอบ' | tx }}</p>
          </div>
        }

        <div class="panel">
          <div class="filter-bar"><b>{{ 'การทบทวน M&M' | tx }}</b><span class="secondary grow">{{ 'นัดแล้ว {n} · ทบทวนแล้ว {done}' | tx: { n: scheduled(), done: mm().length - scheduled() } }}</span></div>
          <div class="table-wrap">
            <table class="bo-table mm">
              <thead><tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col">{{ 'เคส' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'ผล' | tx }}</th>
                <th scope="col" class="w-due">{{ 'วันประชุม' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              </tr></thead>
              <tbody>
                @for (m of mm(); track m.id) {
                  <tr tabindex="0" [class.selected]="m.id === selectedId()" [attr.aria-selected]="m.id === selectedId()" (click)="pick(m.id)" (keydown.enter)="pick(m.id)">
                    <td><b>{{ m.id }}</b><div class="secondary">{{ m.eventDate }}</div></td>
                    <td><b>{{ m.pet }}</b> · {{ m.summary | tx }}<div class="secondary">{{ 'ผู้นำเสนอ {who}' | tx: { who: (m.presenter | tx) } }}@if (m.incidentId) { · {{ m.incidentId }}}</div></td>
                    <td><span class="chip" [class]="'chip ' + OUTCOME[m.outcome].cls">{{ OUTCOME[m.outcome].label | tx }}</span></td>
                    <td class="num">{{ m.reviewDate }}</td>
                    <td><span class="chip" [class]="'chip ' + (m.status === 'reviewed' ? 'ok' : m.reviewDate <= today ? 'warn' : 'info')">{{ (m.status === 'reviewed' ? 'ทบทวนแล้ว' : m.reviewDate <= today ? 'ถึงวันประชุม' : 'นัดแล้ว') | tx }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      @if (scheduling()) {
        <bo-drawer [heading]="'นัดทบทวน M&M'" [sub]="'การเสียชีวิต ภาวะแทรกซ้อน หรือการกลับมารักษาซ้ำ'" (closed)="scheduling.set(false)">
          <div class="form-grid">
            <label>{{ 'ผู้ป่วย' | tx }}<input class="ui-input" [value]="form().pet" (input)="set('pet', $any($event.target).value)" /></label>
            <label>{{ 'ผล' | tx }}
              <select class="ui-input" (change)="set('outcome', $any($event.target).value)">
                @for (o of outcomes; track o) {<option [value]="o" [selected]="o === form().outcome">{{ OUTCOME[o].label | tx }}</option>}
              </select>
            </label>
            <label>{{ 'วันที่เกิดเหตุ' | tx }}<input class="ui-input" type="date" [value]="form().eventDate" (input)="set('eventDate', $any($event.target).value)" /></label>
            <label>{{ 'วันประชุม' | tx }}<input class="ui-input" type="date" [value]="form().reviewDate" (input)="set('reviewDate', $any($event.target).value)" /></label>
            <label>{{ 'ผู้นำเสนอ' | tx }}<input class="ui-input" [value]="form().presenter" (input)="set('presenter', $any($event.target).value)" /></label>
            <label>{{ 'อุบัติการณ์ (ถ้ามี)' | tx }}<input class="ui-input" [placeholder]="'เช่น INC-2609-002'" [value]="form().incidentId" (input)="set('incidentId', $any($event.target).value.trim().toUpperCase())" /></label>
            <label class="full">{{ 'สรุปเคส' | tx }}<textarea class="ui-input" rows="3" [value]="form().summary" (input)="set('summary', $any($event.target).value)"></textarea></label>
          </div>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="scheduling.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="schedule()">{{ 'นัดทบทวน' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as m) {
        <bo-drawer [heading]="m.id + ' · ' + m.pet" [sub]="OUTCOME[m.outcome].label | tx" (closed)="selectedId.set(null)">
          <p>{{ m.summary | tx }}</p>
          <dl class="data-grid">
            <dt>{{ 'วันที่เกิดเหตุ' | tx }}</dt><dd>{{ m.eventDate }}</dd>
            <dt>{{ 'ผู้นำเสนอ' | tx }}</dt><dd>{{ m.presenter | tx }}</dd>
            <dt>{{ 'วันประชุม' | tx }}</dt><dd>{{ m.reviewDate }}</dd>
            @if (m.incidentId) {<dt>{{ 'อุบัติการณ์' | tx }}</dt><dd>{{ m.incidentId }}</dd>}
            @if (m.status === 'reviewed') {
              <dt>{{ 'ผู้เข้าประชุม' | tx }}</dt><dd>{{ '{n} คน' | tx: { n: m.attendees ?? 0 } }}</dd>
              <dt>{{ 'สิ่งที่เรียนรู้' | tx }}</dt><dd>{{ m.learning | tx }}</dd>
            }
          </dl>
          @if (m.status === 'scheduled' && mmIssue(m); as b) {<p class="secondary">{{ b | tx }}</p>}
          <ng-container foot>
            <span class="grow"></span>
            @if (m.status === 'scheduled') {<button uiButton size="sm" type="button" [disabled]="!!mmIssue(m)" (click)="actions.recordMm(m)">{{ 'บันทึกผลทบทวน' | tx }}</button>}
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class CultureComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly OUTCOME = MM_OUTCOME;
  protected readonly outcomes = Object.keys(MM_OUTCOME) as MmReview['outcome'][];
  protected readonly minRate = SURVEY_MIN_RATE;
  protected readonly today = TODAY;
  protected readonly abs = Math.abs;

  protected readonly survey = computed(() => this.store.data().surveys[0] ?? null);
  private readonly previous = computed(() => this.store.data().surveys[1]);
  protected readonly mm = computed(() => [...this.store.data().mm].sort((a, b) => Number(a.status === 'reviewed') - Number(b.status === 'reviewed') || b.reviewDate.localeCompare(a.reviewDate)));
  protected readonly scheduled = computed(() => this.mm().filter(m => m.status === 'scheduled').length);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.store.data().mm.find(m => m.id === this.selectedId()) ?? null);

  protected readonly scheduling = signal(false);
  protected readonly form = signal<MmInput>({ ...BLANK });
  protected readonly problems = computed(() => mmProblems(this.store.data(), this.form()));

  protected rateOf = responseRate;
  protected block = surveyBlock;
  protected mmIssue = mmBlock;

  protected change(name: string) {
    return dimensionChange(this.survey()!, this.previous(), name);
  }

  protected before(name: string) {
    return this.previous()?.dimensions.find(d => d[0] === name)?.[1];
  }

  protected pick(id: string) {
    this.scheduling.set(false);
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected startMm() {
    this.selectedId.set(null);
    this.form.set({ ...BLANK });
    this.scheduling.set(true);
  }

  protected set<K extends keyof MmInput>(key: K, value: MmInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected schedule() {
    this.actions.scheduleMm(this.form(), () => this.scheduling.set(false));
  }
}
