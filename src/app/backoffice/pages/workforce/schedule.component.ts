/* The staff schedule: a week of shifts per person, with the conflict and coverage checks beside it, assigned as drafts and published together (workforce.schedule, M24 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import type { Area, Shift, ShiftKind, StaffMember } from '../../data/types';
import {
  addDays, AREAS, coverage, daysOf, gaps, LEAVE_TYPE, onLeave, previewShift, ROLE, SCHEDULED_ROLES, SHIFT, SHIFT_KINDS, type ShiftInput, staffOf, weekConflicts, weekday, weekOf, weekStatus,
} from '../../data/workforce';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const THIS_WEEK = weekOf(TODAY);
const WEEKS = [THIS_WEEK, addDays(THIS_WEEK, 7)];

@Component({
  selector: 'bo-schedule',
  imports: [NgIcon, TxPipe, UiButton, PageHead],
  template: `
    @let k = kpis();
    <bo-page-head [heading]="'ตารางเวรบุคลากร'" [source]="'M24 P2 · เช้า 08–16 · บ่าย 12–20 · ดึก 20–08 · จัดเป็นฉบับร่างแล้วประกาศทั้งสัปดาห์ · ตารางเวรไม่ให้บทบาทหรือสิทธิ์วิชาชีพ · ต้นแบบก่อนสัญญาหน้าของ M24 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" [disabled]="status() !== 'draft'" (click)="actions.publishWeek(week())">{{ 'ประกาศตารางเวร' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ k.shifts }}</span><span class="kpi-label">{{ 'เวรทั้งหมด · ฉบับร่าง {n}' | tx: { n: k.drafts } }}</span></div>
      <div class="kpi" [class.danger]="k.hard" role="listitem"><span class="kpi-value">{{ k.hard }}</span><span class="kpi-label">{{ 'ความขัดแย้งที่ต้องแก้' | tx }}</span></div>
      <div class="kpi" [class.warn]="k.soft" role="listitem"><span class="kpi-value">{{ k.soft }}</span><span class="kpi-label">{{ 'คำเตือน' | tx }}</span></div>
      <div class="kpi" [class.danger]="k.gaps" role="listitem"><span class="kpi-value">{{ k.gaps }}</span><span class="kpi-label">{{ 'เวรที่คนไม่ครบขั้นต่ำ' | tx }}</span></div>
    </div>

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar">
            <div class="segmented" role="group" [attr.aria-label]="'สัปดาห์' | tx">
              @for (w of weeks; track w) {<button type="button" [class.active]="w === week()" [attr.aria-pressed]="w === week()" (click)="selectWeek(w)">{{ label(w) }}</button>}
            </div>
            <span class="chip" [class]="'chip ' + (status() === 'published' ? 'ok' : 'warn')">{{ (status() === 'published' ? 'ประกาศแล้ว' : 'ฉบับร่าง') | tx }}</span>
            <span class="secondary grow">{{ 'กดเวรเพื่อยกเลิก · กด + เพื่อจัดเวรในแถบข้าง' | tx }}</span>
          </div>
          <div class="table-wrap">
            <table class="bo-table roster">
              <thead>
                <tr>
                  <th scope="col" class="who">{{ 'ชื่อบุคลากร' | tx }}</th>
                  @for (d of days(); track d) {
                    <th scope="col" [class.today]="d === today" [class.short]="shortOn(d)">{{ weekday(d) | tx }} {{ d.slice(8) }}@if (shortOn(d)) {<div class="text-danger">{{ 'คนไม่ครบ' | tx }}</div>}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (g of groups(); track g.role) {
                  <tr class="static group"><th scope="rowgroup" [attr.colspan]="8">{{ ROLE[g.role].label | tx }}</th></tr>
                  @for (s of g.people; track s.id) {
                    <tr class="static">
                      <th scope="row" class="who"><b>{{ s.name | tx }}</b><div class="secondary">{{ hours(s) }} {{ 'ชม.' | tx }} / {{ s.weeklyHours }}</div></th>
                      @for (d of days(); track d) {
                        <td [class.conflict]="conflictOn(s.id, d)" [class.today]="d === today">
                          @if (leaveOn(s.id, d); as l) {<span class="chip" [class]="'chip ' + (l.status === 'approved' ? 'warn' : 'quiet')">{{ (l.status === 'approved' ? 'ลา' : 'ขอลา') | tx }}</span>}
                          @for (x of shiftsOn(s.id, d); track x.id) {
                            <button type="button" class="shift" [class]="'shift ' + x.kind + (x.status === 'draft' ? ' draft' : '')" [attr.aria-label]="(s.name | tx) + ' ' + d + ' ' + (('เวร' + SHIFT[x.kind].label) | tx) + ' · ' + ('ยกเลิกเวร' | tx)" [attr.title]="SHIFT[x.kind].time + ' · ' + x.area" (click)="actions.removeShift(x)">{{ SHIFT[x.kind].short | tx }}</button>
                          }
                          <button type="button" class="add" [class.picked]="form().staffId === s.id && form().date === d" [attr.aria-label]="('จัดเวร {name} {date}' | tx: { name: (s.name | tx), date: d })" (click)="pickCell(s, d)"><ng-icon [svg]="plus" aria-hidden="true" /></button>
                        </td>
                      }
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          <div class="legend">
            @for (kind of kinds; track kind) {<span><span class="shift" [class]="'shift ' + kind" aria-hidden="true">{{ SHIFT[kind].short | tx }}</span>{{ SHIFT[kind].label | tx }} {{ SHIFT[kind].time }}</span>}
            <span><span class="shift draft morning" aria-hidden="true">{{ SHIFT.morning.short | tx }}</span>{{ 'ฉบับร่าง' | tx }}</span>
          </div>
        </div>
      </div>

      <aside class="record-rail">
        <div class="panel action-card">
          <b>{{ 'จัดเวร' | tx }}</b>
          <label class="field">{{ 'ชื่อบุคลากร' | tx }}
            <select class="ui-input" (change)="set('staffId', $any($event.target).value)">
              @for (s of scheduled(); track s.id) {<option [value]="s.id" [selected]="s.id === form().staffId">{{ s.name | tx }}</option>}
            </select>
          </label>
          <div class="two">
            <label class="field">{{ 'วันที่' | tx }}
              <select class="ui-input" (change)="set('date', $any($event.target).value)">
                @for (d of days(); track d) {<option [value]="d" [selected]="d === form().date">{{ weekday(d) | tx }} {{ d }}</option>}
              </select>
            </label>
            <label class="field">{{ 'เวร' | tx }}
              <select class="ui-input" (change)="set('kind', $any($event.target).value)">
                @for (kind of kinds; track kind) {<option [value]="kind" [selected]="kind === form().kind">{{ SHIFT[kind].label | tx }} {{ SHIFT[kind].time }}</option>}
              </select>
            </label>
          </div>
          <label class="field">{{ 'จุดงาน' | tx }}
            <select class="ui-input" (change)="set('area', $any($event.target).value)">
              @for (a of areas; track a) {<option [value]="a" [selected]="a === form().area">{{ a }}</option>}
            </select>
          </label>
          @if (preview().length) {
            <ul class="checks">
              @for (c of preview(); track $index) {<li [class.hard]="c.hard">{{ c.text | tx }}</li>}
            </ul>
          } @else {
            <p class="secondary ok-text">{{ 'ไม่ขัดแย้งกับเวรอื่น การลา หรือใบอนุญาต' | tx }}</p>
          }
          <button uiButton size="sm" type="button" [disabled]="blocked()" (click)="assign()">{{ 'จัดเวร (ฉบับร่าง)' | tx }}</button>
        </div>

        <div class="panel actions">
          <b>{{ 'เวรที่คนไม่ครบขั้นต่ำ' | tx }}</b>
          @for (g of short(); track $index) {
            <div class="sum-row"><span>{{ weekday(g.date) | tx }} {{ g.date }} · {{ SHIFT[g.kind].label | tx }}</span><span class="text-danger">{{ ROLE[g.role].label | tx }} {{ g.have }}/{{ g.need }}</span></div>
          } @empty {
            <p class="secondary ok-text">{{ 'คนครบทุกเวร' | tx }}</p>
          }
          <p class="secondary">{{ 'ขั้นต่ำวันธรรมดา: เช้า สัตวแพทย์ 2 พยาบาล 2 เภสัชกร 1 · บ่าย สัตวแพทย์ 1 พยาบาล 1 · ดึก พยาบาล 1 · วันหยุดลดลง · กลางคืนสัตวแพทย์อยู่เวร on-call' | tx }}</p>
        </div>

        <div class="panel actions">
          <b>{{ 'ความขัดแย้งและคำเตือน' | tx }}</b>
          @for (c of conflicts(); track $index) {
            <div class="conflict-row" [class.hard]="c.hard"><b>{{ name(c.staffId) | tx }}</b> · {{ c.date }}<div>{{ c.text | tx }}</div></div>
          } @empty {
            <p class="secondary ok-text">{{ 'ไม่มีความขัดแย้ง' | tx }}</p>
          }
        </div>
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class ScheduleComponent {
  private readonly store = inject(BackofficeStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly ROLE = ROLE;
  protected readonly SHIFT = SHIFT;
  protected readonly LEAVE_TYPE = LEAVE_TYPE;
  protected readonly kinds = SHIFT_KINDS;
  protected readonly areas = AREAS;
  protected readonly weeks = WEEKS;
  protected readonly today = TODAY;
  protected readonly weekday = weekday;

  protected readonly week = signal(WEEKS.includes(this.route.snapshot.queryParamMap.get('week') ?? '') ? this.route.snapshot.queryParamMap.get('week')! : THIS_WEEK);
  protected readonly days = computed(() => daysOf(this.week()));
  protected readonly status = computed(() => weekStatus(this.store.data(), this.week()));
  protected readonly scheduled = computed(() => this.store.data().staff.filter(s => SCHEDULED_ROLES.includes(s.role) && s.status !== 'inactive'));
  protected readonly groups = computed(() => SCHEDULED_ROLES.map(role => ({ role, people: this.scheduled().filter(s => s.role === role) })).filter(g => g.people.length));
  protected readonly conflicts = computed(() => weekConflicts(this.store.data(), this.week()).sort((a, b) => Number(b.hard) - Number(a.hard) || a.date.localeCompare(b.date)));
  protected readonly short = computed(() => gaps(coverage(this.store.data(), this.week())));
  protected readonly kpis = computed(() => {
    const shifts = this.store.data().shifts.filter(s => this.days().includes(s.date));
    return {
      shifts: shifts.length, drafts: shifts.filter(s => s.status === 'draft').length,
      hard: this.conflicts().filter(c => c.hard).length, soft: this.conflicts().filter(c => !c.hard).length, gaps: this.short().length,
    };
  });

  protected readonly form = signal<ShiftInput>({ staffId: 'S05', date: addDays(this.week(), 5), kind: 'night', area: 'Ward' });
  protected readonly preview = computed(() => previewShift(this.store.data(), this.form()));
  protected readonly blocked = computed(() => this.preview().some(c => c.hard));

  protected label(monday: string) {
    return `${monday.slice(8)}/${monday.slice(5, 7)} – ${addDays(monday, 6).slice(8)}/${addDays(monday, 6).slice(5, 7)}`;
  }

  protected selectWeek(monday: string) {
    this.week.set(monday);
    if (!daysOf(monday).includes(this.form().date)) {
      this.set('date', monday);
    }
  }

  protected shiftsOn(staffId: string, date: string): Shift[] {
    return this.store.data().shifts.filter(s => s.staffId === staffId && s.date === date).sort((a, b) => SHIFT[a.kind].start - SHIFT[b.kind].start);
  }

  protected leaveOn(staffId: string, date: string) {
    return onLeave(this.store.data(), staffId, date, ['approved', 'pending']);
  }

  protected conflictOn(staffId: string, date: string) {
    return this.conflicts().some(c => c.staffId === staffId && c.date === date && c.hard);
  }

  protected shortOn(date: string) {
    return this.short().some(g => g.date === date);
  }

  protected hours(s: StaffMember) {
    return this.store.data().shifts.filter(x => x.staffId === s.id && this.days().includes(x.date)).reduce((n, x) => n + SHIFT[x.kind].end - SHIFT[x.kind].start, 0);
  }

  protected name(id: string) {
    return staffOf(this.store.data(), id)?.name ?? id;
  }

  protected set<K extends keyof ShiftInput>(key: K, value: ShiftInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  /** The cell's person and day go to the form, with the area they usually work and the shift the day misses, if any */
  protected pickCell(s: StaffMember, date: string) {
    const missing = this.short().find(g => g.date === date && g.role === s.role);
    const usual = this.store.data().shifts.find(x => x.staffId === s.id)?.area ?? (s.department as Area);
    this.form.set({ staffId: s.id, date, kind: (missing?.kind ?? this.form().kind) as ShiftKind, area: AREAS.includes(usual) ? usual : 'OPD' });
  }

  protected assign() {
    this.actions.assignShift(this.form());
  }
}
