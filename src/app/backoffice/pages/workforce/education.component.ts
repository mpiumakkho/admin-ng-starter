/* Continuing education: the CE ledger, each person's hours against the hospital's target, and the certificates behind them (workforce.education, M24 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import type { CeCategory, CeRecord } from '../../data/types';
import { APPROVED_COURSES, catalogCourse, CE_CATEGORY, CE_STATUS, ceProblems, ceReviewBlock, ceSummary, type CeInput, staffOf } from '../../data/workforce';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

const CATEGORIES = Object.keys(CE_CATEGORY) as CeCategory[];

@Component({
  selector: 'bo-education',
  imports: [NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'การศึกษาต่อเนื่องและการอบรม'" [source]="'M24 P2 · หลักสูตรในรายการที่โรงพยาบาลรับรองนับชั่วโมงทันที · หลักสูตรอื่นรอผู้ตรวจที่ไม่ใช่ผู้เข้าอบรมพร้อมใบรับรอง · ต้นแบบก่อนสัญญาหน้าของ M24 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="openCreate()"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'บันทึก CE' | tx }}</button>
    </bo-page-head>

    <div class="panel ce-summary">
      <div class="filter-bar"><b>{{ 'ชั่วโมงปีนี้เทียบเป้าหมาย' | tx }}</b><span class="secondary grow">{{ 'เป้าหมายเป็นของโรงพยาบาล · สัตวแพทย์ 20 · เภสัชกร 15 · พยาบาล 12 ชม./ปี · คนที่เริ่มงานไม่ถึง 3 เดือนยังไม่นับว่าช้า' | tx }}</span></div>
      <ul class="ce-progress">
        @for (s of people(); track s.staff.id) {
          <li>
            <div class="sum-row"><span>{{ s.staff.name | tx }}</span><span [class.text-danger]="s.behind">{{ s.approved }} / {{ s.target }} {{ 'ชม.' | tx }}</span></div>
            <div class="bar" role="img" [attr.aria-label]="('{a} จาก {b} ชั่วโมง' | tx: { a: s.approved, b: s.target })"><span [class.behind]="s.behind" [style.width.%]="s.percent"></span></div>
            @if (s.pending || s.behind) {<div class="secondary">@if (s.pending) {{{ 'รอตรวจ {n} ชม.' | tx: { n: s.pending } }}}@if (s.pending && s.behind) { · }@if (s.behind) {<span class="text-danger">{{ 'ช้ากว่ากำหนดของปี' | tx }}</span>}</div>}
          </li>
        }
      </ul>
    </div>

    <div class="split" [class.with-drawer]="selected() || creating()">
      <div class="panel">
        <div class="filter-bar"><b>{{ 'บันทึก CE' | tx }}</b><span class="secondary grow">{{ 'ปี {y} · ล่าสุดก่อน · รอตรวจ {n}' | tx: { y: year, n: pending() } }}</span></div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead>
              <tr>
                <th scope="col" class="w-due">{{ 'วันที่' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'ผู้เข้าอบรม' | tx }}</th>
                <th scope="col">{{ 'หลักสูตร / ผู้จัด' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ชั่วโมง' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (c of records(); track c.id) {
                <tr tabindex="0" [class.selected]="c.id === selectedId()" [attr.aria-selected]="c.id === selectedId()" (click)="pick(c.id)" (keydown.enter)="pick(c.id)">
                  <td class="num">{{ c.date }}</td>
                  <td>{{ name(c) | tx }}</td>
                  <td>{{ c.course | tx }}<div class="secondary">{{ c.provider | tx }} · {{ CATEGORY[c.category] | tx }}@if (!c.certificate) { · <span class="text-danger">{{ 'ไม่มีใบรับรอง' | tx }}</span>}</div></td>
                  <td class="num">{{ c.hours }}</td>
                  <td><span class="chip" [class]="'chip ' + STATUS[c.status].cls">{{ STATUS[c.status].label | tx }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (creating()) {
        <bo-drawer [heading]="'บันทึก CE'" [sub]="'หลักสูตรในรายการนับทันที'" (closed)="creating.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'ผู้เข้าอบรม' | tx }}
              <select class="ui-input" (change)="set('staffId', $any($event.target).value)">
                @for (s of people(); track s.staff.id) {<option [value]="s.staff.id" [selected]="s.staff.id === form().staffId">{{ s.staff.name | tx }}</option>}
              </select>
            </label>
            <label class="full">{{ 'หลักสูตร' | tx }}
              <input class="ui-input" list="ce-courses" [value]="form().course" (input)="pickCourse($any($event.target).value)" />
              <datalist id="ce-courses">@for (c of catalog; track c.course) {<option [value]="c.course">{{ c.provider }}</option>}</datalist>
            </label>
            @if (listed(); as l) {
              <p class="notice ok full">{{ 'ในรายการที่รับรอง · {p} · {h} ชม.' | tx: { p: (l.provider | tx), h: l.hours } }}</p>
            } @else {
              <label class="full">{{ 'ผู้จัด' | tx }}<input class="ui-input" [value]="form().provider" (input)="set('provider', $any($event.target).value)" /></label>
              <label>{{ 'ชั่วโมง' | tx }}<input class="ui-input" type="number" min="0" step="0.5" [value]="form().hours || ''" (input)="set('hours', +$any($event.target).value)" /></label>
              <label>{{ 'หมวด' | tx }}
                <select class="ui-input" (change)="set('category', $any($event.target).value)">
                  @for (k of categories; track k) {<option [value]="k" [selected]="k === form().category">{{ CATEGORY[k] | tx }}</option>}
                </select>
              </label>
            }
            <label>{{ 'วันที่อบรม' | tx }}<input class="ui-input" type="date" [value]="form().date" (input)="set('date', $any($event.target).value)" /></label>
            <label>{{ 'ใบรับรอง' | tx }}<input class="ui-input" type="file" accept=".pdf,image/*" (change)="set('certificate', fileName($event))" /></label>
          </div>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="creating.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="create()">{{ 'บันทึก CE' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as c) {
        <bo-drawer [heading]="c.id" [sub]="(name(c) | tx) + ' · ' + (STATUS[c.status].label | tx)" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'หลักสูตร' | tx }}</dt><dd>{{ c.course | tx }}</dd>
            <dt>{{ 'ผู้จัด' | tx }}</dt><dd>{{ c.provider | tx }}</dd>
            <dt>{{ 'วันที่' | tx }}</dt><dd>{{ c.date }} · {{ c.hours }} {{ 'ชม.' | tx }} · {{ CATEGORY[c.category] | tx }}</dd>
            <dt>{{ 'ใบรับรอง' | tx }}</dt><dd>{{ c.certificate ?? ('ยังไม่ได้แนบ' | tx) }}</dd>
            <dt>{{ 'บันทึกโดย' | tx }}</dt><dd>{{ c.enteredBy | tx }} · {{ c.enteredAt }}</dd>
            @if (c.reviewedBy) {<dt>{{ 'ตรวจโดย' | tx }}</dt><dd>{{ c.reviewedBy | tx }} · {{ c.reviewedAt }}@if (c.note) { — {{ c.note | tx }}}</dd>}
          </dl>
          @if (c.status === 'pending' && !c.certificate) {
            <label class="field">{{ 'แนบใบรับรอง' | tx }}<input class="ui-input" type="file" accept=".pdf,image/*" (change)="attach(c, $event)" /></label>
          }
          @if (c.status === 'pending' && block(c); as b) {<p class="notice warn">{{ b | tx }}</p>}
          <ng-container foot>
            @if (c.status === 'pending') {
              <button uiButton variant="secondary" size="sm" type="button" (click)="actions.reviewCe(c, 'rejected')">{{ 'ไม่นับชั่วโมง' | tx }}</button>
              <span class="grow"></span>
              <button uiButton size="sm" type="button" [disabled]="!!block(c)" (click)="actions.reviewCe(c, 'approved')">{{ 'นับชั่วโมง' | tx }}</button>
            }
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class EducationComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly STATUS = CE_STATUS;
  protected readonly CATEGORY = CE_CATEGORY;
  protected readonly categories = CATEGORIES;
  protected readonly catalog = APPROVED_COURSES;
  protected readonly year = TODAY.slice(0, 4);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly records = computed(() => this.store.data().ce.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)));
  protected readonly pending = computed(() => this.store.data().ce.filter(c => c.status === 'pending').length);
  protected readonly selected = computed(() => this.store.data().ce.find(c => c.id === this.selectedId()) ?? null);
  protected readonly people = computed(() => ceSummary(this.store.data()));

  protected readonly creating = signal(false);
  protected readonly form = signal<CeInput>(this.blank());
  protected readonly listed = computed(() => catalogCourse(this.form().course.trim()));
  protected readonly problems = computed(() => {
    const f = this.form();
    const l = this.listed();
    return ceProblems(this.store.data(), l ? { ...f, hours: l.hours } : f);
  });

  private blank(): CeInput {
    return { staffId: 'S03', course: '', provider: '', date: TODAY, hours: 0, category: 'clinical' };
  }

  protected name(c: CeRecord) {
    return staffOf(this.store.data(), c.staffId)?.name ?? '—';
  }

  protected block(c: CeRecord) {
    return ceReviewBlock(this.store.data(), c, this.store.userName());
  }

  protected set<K extends keyof CeInput>(key: K, value: CeInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected pickCourse(course: string) {
    this.set('course', course);
  }

  protected fileName(event: Event): string {
    return (event.target as HTMLInputElement).files?.[0]?.name ?? '';
  }

  protected attach(c: CeRecord, event: Event) {
    const file = this.fileName(event);
    if (file) {
      this.actions.attachCertificate(c, file);
    }
  }

  protected pick(id: string) {
    this.creating.set(false);
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected openCreate() {
    this.selectedId.set(null);
    this.creating.set(true);
  }

  protected create() {
    const l = this.listed();
    this.actions.addCe(l ? { ...this.form(), hours: l.hours } : this.form(), record => {
      this.creating.set(false);
      this.form.set(this.blank());
      this.selectedId.set(record.id);
    });
  }
}
