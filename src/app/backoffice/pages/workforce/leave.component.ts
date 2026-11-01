/* Leave and time off: the requests, what each takes off the schedule, and a decision by someone other than the person asking (workforce.leave, M24 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import type { LeaveRequest, LeaveType } from '../../data/types';
import {
  addDays, daysOf, LEAVE_STATUS, LEAVE_TYPE, leaveBlock, leaveDays, leaveImpact, leaveProblems, type LeaveInput, onLeave, ROLE, SHIFT, staffOf, weekday, weekOf,
} from '../../data/workforce';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const TYPES = Object.keys(LEAVE_TYPE) as LeaveType[];
const FROM = weekOf(TODAY);

@Component({
  selector: 'bo-leave',
  imports: [RouterLink, TxPipe, UiButton, PageHead],
  template: `
    @let k = kpis();
    <bo-page-head [heading]="'การลาและวันหยุด'" [source]="'M24 P2 · คำขอลาและผลต่อจำนวนคนในเวร · ผู้ขอตัดสินคำขอของตัวเองไม่ได้ · การอนุมัติไม่ลบเวร ตารางเวรแสดงเวรที่ต้องหาคนแทน · ต้นแบบก่อนสัญญาหน้าของ M24 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" variant="secondary" type="button" (click)="selectedId.set(null)">{{ 'ยื่นคำขอลา' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      <div class="kpi" [class.warn]="k.pending" role="listitem"><span class="kpi-value">{{ k.pending }}</span><span class="kpi-label">{{ 'รออนุมัติ' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ k.today }}</span><span class="kpi-label">{{ 'ลาวันนี้ (อนุมัติแล้ว)' | tx }}</span></div>
      <div class="kpi" [class.danger]="k.gaps" role="listitem"><span class="kpi-value">{{ k.gaps }}</span><span class="kpi-label">{{ 'เวรที่จะคนไม่ครบถ้าอนุมัติทั้งหมด' | tx }}</span></div>
    </div>

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar"><b>{{ 'คำขอลา' | tx }}</b><span class="secondary grow">{{ 'รออนุมัติก่อน แล้วตามวันที่ยื่น' | tx }}</span></div>
          <div class="table-wrap">
            <table class="bo-table">
              <thead>
                <tr>
                  <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'ผู้ขอ' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
                  <th scope="col" class="w-at">{{ 'ช่วง' | tx }}</th>
                  <th scope="col">{{ 'เหตุผล' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (l of rows(); track l.id) {
                  <tr tabindex="0" [class.selected]="l.id === selectedId()" [attr.aria-selected]="l.id === selectedId()" (click)="pick(l.id)" (keydown.enter)="pick(l.id)">
                    <td><b>{{ l.id }}</b><div class="secondary">{{ l.requestedAt }}</div></td>
                    <td>{{ name(l) | tx }}<div class="secondary">{{ role(l) | tx }}</div></td>
                    <td>{{ TYPE[l.type] | tx }}</td>
                    <td class="num">{{ l.from }}@if (l.to !== l.from) {<div>– {{ l.to }}</div>}<div class="secondary">{{ '{n} วัน' | tx: { n: days(l) } }}</div></td>
                    <td>{{ l.reason | tx }}</td>
                    <td><span class="chip" [class]="'chip ' + STATUS[l.status].cls">{{ STATUS[l.status].label | tx }}</span>@if (l.status === 'pending' && impactOf(l).gaps.length) {<div class="secondary text-danger">{{ 'กระทบ {n} เวร' | tx: { n: impactOf(l).gaps.length } }}</div>}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <div class="filter-bar"><b>{{ 'ปฏิทินสองสัปดาห์' | tx }}</b><span class="secondary grow">{{ 'คนที่ลาแต่ละวัน · สีเข้มคืออนุมัติแล้ว' | tx }}</span></div>
          <div class="leave-cal">
            @for (d of calendar(); track d.date) {
              <div class="day" [class.today]="d.date === today" [class.picked]="d.picked">
                <div class="secondary">{{ weekday(d.date) | tx }} {{ d.date.slice(8) }}</div>
                @for (p of d.people; track p.id) {<span class="chip" [class]="'chip ' + (p.status === 'approved' ? 'warn' : 'quiet')">{{ p.name | tx }}</span>}
              </div>
            }
          </div>
        </div>
      </div>

      <aside class="record-rail">
        @if (selected(); as l) {
          @let impact = impactOf(l);
          <div class="panel action-card">
            <b>{{ l.id }} · {{ name(l) | tx }}</b>
            <span class="secondary">{{ TYPE[l.type] | tx }} · {{ l.from }} – {{ l.to }} · {{ '{n} วัน' | tx: { n: days(l) } }}</span>
            <div class="section-title">{{ 'เวรที่กระทบ' | tx }}</div>
            @for (s of impact.shifts; track s.id) {
              <div class="sum-row"><span>{{ weekday(s.date) | tx }} {{ s.date }} · {{ SHIFT[s.kind].label | tx }}</span><span [class.text-danger]="isGap(impact, s.date, s.kind)">{{ (isGap(impact, s.date, s.kind) ? 'คนจะไม่ครบ' : 'ยังพอ') | tx }}</span></div>
            } @empty {
              <p class="secondary ok-text">{{ 'ไม่มีเวรในช่วงนี้' | tx }}</p>
            }
            @if (impact.gaps.length && l.status === 'pending') {<p class="notice warn">{{ 'ถ้าอนุมัติ ต้องจัดคนแทน {n} เวรในตารางเวร' | tx: { n: impact.gaps.length } }}</p>}
            @if (l.status === 'pending') {
              @if (block(l); as b) {<p class="notice info">{{ b | tx }}</p>}
              <div class="two">
                <button uiButton variant="secondary" size="sm" type="button" [disabled]="!!block(l)" (click)="actions.decideLeave(l, 'rejected')">{{ 'ปฏิเสธการลา' | tx }}</button>
                <button uiButton size="sm" type="button" [disabled]="!!block(l)" (click)="actions.decideLeave(l, 'approved')">{{ 'อนุมัติ' | tx }}</button>
              </div>
            } @else {
              <p class="secondary">{{ STATUS[l.status].label | tx }} · {{ l.decidedBy | tx }} · {{ l.decidedAt }}@if (l.decisionNote) { — {{ l.decisionNote | tx }}}</p>
            }
            @if (impact.shifts.length) {<a class="link" routerLink="/backoffice/workforce/schedule" [queryParams]="{ week: weekOf(l.from) }">{{ 'เปิดตารางเวรสัปดาห์นั้น' | tx }}</a>}
          </div>
        } @else {
          <div class="panel action-card">
            <b>{{ 'ยื่นคำขอลา' | tx }}</b>
            <label class="field">{{ 'ชื่อบุคลากร' | tx }}
              <select class="ui-input" (change)="set('staffId', $any($event.target).value)">
                @for (s of people(); track s.id) {<option [value]="s.id" [selected]="s.id === form().staffId">{{ s.name | tx }}</option>}
              </select>
            </label>
            <label class="field">{{ 'ประเภท' | tx }}
              <select class="ui-input" (change)="set('type', $any($event.target).value)">
                @for (t of types; track t) {<option [value]="t" [selected]="t === form().type">{{ TYPE[t] | tx }}</option>}
              </select>
            </label>
            <div class="two">
              <label class="field">{{ 'ตั้งแต่' | tx }}<input class="ui-input" type="date" [value]="form().from" (input)="set('from', $any($event.target).value)" /></label>
              <label class="field">{{ 'ถึง' | tx }}<input class="ui-input" type="date" [value]="form().to" (input)="set('to', $any($event.target).value)" /></label>
            </div>
            <label class="field">{{ 'เหตุผล' | tx }}<textarea class="ui-input" rows="2" [value]="form().reason" (input)="set('reason', $any($event.target).value)"></textarea></label>
            @if (!problems().length) {
              @let impact = impactOf(form());
              <p class="secondary" [class.text-danger]="impact.gaps.length">{{ 'กระทบ {n} เวร · คนจะไม่ครบ {m} เวร' | tx: { n: impact.shifts.length, m: impact.gaps.length } }}</p>
            }
            @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="submit()">{{ 'ยื่นคำขอ' | tx }}</button>
          </div>
        }
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class LeaveComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly TYPE = LEAVE_TYPE;
  protected readonly STATUS = LEAVE_STATUS;
  protected readonly SHIFT = SHIFT;
  protected readonly types = TYPES;
  protected readonly today = TODAY;
  protected readonly weekday = weekday;
  protected readonly weekOf = weekOf;

  protected readonly selectedId = signal<string | null>('LV-2609-08');
  protected readonly rows = computed(() => this.store.data().leaves.slice().sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.requestedAt.localeCompare(a.requestedAt)));
  protected readonly selected = computed(() => this.store.data().leaves.find(l => l.id === this.selectedId()) ?? null);
  protected readonly people = computed(() => this.store.data().staff.filter(s => s.status !== 'inactive'));
  protected readonly kpis = computed(() => {
    const d = this.store.data();
    const pending = d.leaves.filter(l => l.status === 'pending');
    return {
      pending: pending.length, today: d.staff.filter(s => onLeave(d, s.id, TODAY)).length,
      gaps: new Set(pending.flatMap(l => leaveImpact(d, l).gaps.map(g => `${g.date}:${g.kind}:${g.role}`))).size,
    };
  });
  /** Two weeks from this Monday, with who is off each day */
  protected readonly calendar = computed(() => {
    const d = this.store.data();
    const picked = this.selected();
    return [...daysOf(FROM), ...daysOf(addDays(FROM, 7))].map(date => ({
      date, picked: !!picked && picked.from <= date && date <= picked.to,
      people: d.leaves.filter(l => l.status !== 'rejected' && l.from <= date && date <= l.to).map(l => ({ id: l.id, name: staffOf(d, l.staffId)?.name ?? '', status: l.status })),
    }));
  });

  protected readonly form = signal<LeaveInput>({ staffId: 'S14', type: 'personal', from: addDays(TODAY, 7), to: addDays(TODAY, 7), reason: '' });
  protected readonly problems = computed(() => leaveProblems(this.store.data(), this.form()));

  protected name(l: LeaveRequest) {
    return staffOf(this.store.data(), l.staffId)?.name ?? '—';
  }

  protected role(l: LeaveRequest) {
    const s = staffOf(this.store.data(), l.staffId);
    return s ? ROLE[s.role].label : '';
  }

  protected days(l: LeaveRequest) {
    return leaveDays(l);
  }

  protected impactOf(l: Pick<LeaveRequest, 'staffId' | 'from' | 'to'>) {
    return leaveImpact(this.store.data(), l);
  }

  protected isGap(impact: ReturnType<typeof leaveImpact>, date: string, kind: string) {
    return impact.gaps.some(g => g.date === date && g.kind === kind);
  }

  protected block(l: LeaveRequest) {
    return leaveBlock(this.store.data(), l, this.store.userName());
  }

  protected pick(id: string) {
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected set<K extends keyof LeaveInput>(key: K, value: LeaveInput[K]) {
    const next = { ...this.form(), [key]: value };
    if (key === 'from' && next.to < next.from) {
      next.to = next.from;
    }
    this.form.set(next);
  }

  protected submit() {
    this.actions.requestLeave(this.form(), leave => {
      this.form.set({ ...this.form(), reason: '' });
      this.selectedId.set(leave.id);
    });
  }
}
