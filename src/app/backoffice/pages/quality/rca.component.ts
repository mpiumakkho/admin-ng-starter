/* Root cause analysis: five whys at least, the cause they reach, actions with owners and dates, approved by someone outside the team (quality.rca, M12 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { actionProblems, approveBlock, NOTE_MIN, RCA_STATUS, rcaSource, submitProblems, WHY_MIN, whyProblem } from '../../data/quality';
import type { Rca, RcaAction } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const BLANK_ACTION = { text: '', owner: '', due: '' };

@Component({
  selector: 'bo-rca',
  imports: [RouterLink, TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'การวิเคราะห์สาเหตุราก'" [source]="'M12 P2 · ถามทำไมอย่างน้อย 5 ข้อ · มาตรการต้องมีผู้รับผิดชอบและกำหนดเสร็จ · ผู้อนุมัติต้องไม่ใช่ทีมวิเคราะห์ · ต้นแบบก่อนสัญญาหน้าของ M12 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="panel">
      <div class="table-wrap">
        <table class="bo-table rca-list">
          <thead>
            <tr>
              <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
              <th scope="col">{{ 'เรื่อง' | tx }}</th>
              <th scope="col" class="w-kind num">{{ 'ทำไม' | tx }}</th>
              <th scope="col" class="w-kind num">{{ 'มาตรการ' | tx }}</th>
              <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rcas(); track r.id) {
              <tr tabindex="0" [class.selected]="r.id === selected()?.id" [attr.aria-selected]="r.id === selected()?.id" (click)="pick(r.id)" (keydown.enter)="pick(r.id)">
                <td><b>{{ r.id }}</b><div class="secondary">{{ r.source }}</div></td>
                <td>{{ r.title | tx }}<div class="secondary">{{ r.team.join(', ') | tx }}</div></td>
                <td class="num" [class.text-danger]="r.whys.length < WHY_MIN">{{ r.whys.length }}/{{ WHY_MIN }}</td>
                <td class="num">{{ done(r) }}/{{ r.actions.length }}@if (late(r).length) {<div class="secondary text-danger">{{ 'เกินกำหนด {n}' | tx: { n: late(r).length } }}</div>}</td>
                <td><span class="chip" [class]="'chip ' + STATUS[r.status].cls">{{ STATUS[r.status].label | tx }}</span></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as r) {
      @let src = source(r);
      @let open = r.status === 'open';
      <div class="record">
        <div class="record-main">
          <div class="panel rca-work">
            <div class="filter-bar">
              <b>{{ r.id }} · {{ r.title | tx }}</b>
              <span class="grow"></span>
              @if (src) {<a class="link" [routerLink]="src.link" [queryParams]="{ id: r.source }">{{ src.kind | tx }} {{ r.source }}</a>}
            </div>
            @if (src) {<p class="secondary rca-source">{{ src.title | tx }}</p>}
            @if (r.note && open) {<p class="notice warn">{{ 'ผู้อนุมัติส่งกลับ: {note}' | tx: { note: (r.note | tx) } }}</p>}

            <div class="section-title">{{ 'ทำไม (อย่างน้อย {n} ข้อ)' | tx: { n: WHY_MIN } }}</div>
            <ol class="whys">
              @for (w of r.whys; track $index) {<li><span class="why-n">{{ 'ทำไมข้อ {n}' | tx: { n: $index + 1 } }}</span>{{ w | tx }}</li>}
            </ol>
            @if (open) {
              <div class="rca-add">
                <input class="ui-input grow" [attr.aria-label]="'ทำไมข้อ {n}' | tx: { n: r.whys.length + 1 }" [placeholder]="'ทำไมข้อ {n} — ตอบว่าทำไมข้อก่อนหน้าจึงเกิด' | tx: { n: r.whys.length + 1 }" [value]="why()" (input)="why.set($any($event.target).value)" />
                <button uiButton variant="secondary" size="sm" type="button" [disabled]="!!whyIssue()" (click)="addWhy(r)">{{ 'เพิ่ม' | tx }}</button>
              </div>
            }

            <div class="section-title">{{ 'สาเหตุราก' | tx }}</div>
            @if (open) {
              <textarea class="ui-input" rows="2" [attr.aria-label]="'สาเหตุราก' | tx" [value]="root() ?? r.rootCause" (input)="root.set($any($event.target).value)"></textarea>
              <div class="rca-add"><span class="secondary grow">{{ 'สาเหตุที่แก้แล้วจะไม่เกิดซ้ำ ไม่ใช่ตัวบุคคล' | tx }}</span>
                <button uiButton variant="secondary" size="sm" type="button" [disabled]="!rootChanged(r)" (click)="saveRoot(r)">{{ 'บันทึกสาเหตุราก' | tx }}</button></div>
            } @else {
              <p>{{ r.rootCause | tx }}</p>
            }

            <div class="section-title">{{ 'มาตรการ' | tx }}</div>
            <div class="table-wrap">
              <table class="bo-table">
                <thead><tr><th scope="col">{{ 'มาตรการ' | tx }}</th><th scope="col" class="w-owner">{{ 'ผู้รับผิดชอบ' | tx }}</th><th scope="col" class="w-due">{{ 'กำหนดเสร็จ' | tx }}</th><th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th></tr></thead>
                <tbody>
                  @for (a of r.actions; track $index) {
                    <tr class="static">
                      <td>{{ a.text | tx }}</td>
                      <td>{{ a.owner | tx }}</td>
                      <td class="num" [class.text-danger]="isLate(a)">{{ a.due }}</td>
                      <td>
                        @if (a.doneAt) {<span class="chip ok">{{ 'เสร็จ {date}' | tx: { date: a.doneAt } }}</span>}
                        @else if (r.status === 'approved') {<button uiButton variant="secondary" size="sm" type="button" (click)="actions.completeRcaAction(r, a)">{{ 'บันทึกว่าเสร็จ' | tx }}</button>}
                        @else {<span class="chip quiet">{{ 'รออนุมัติ RCA' | tx }}</span>}
                      </td>
                    </tr>
                  } @empty {
                    <tr class="static"><td colspan="4" class="empty">{{ 'ยังไม่มีมาตรการ' | tx }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
            @if (open) {
              <div class="form-grid rca-action">
                <label class="full">{{ 'มาตรการใหม่' | tx }}<input class="ui-input" [value]="action().text" (input)="setAction('text', $any($event.target).value)" /></label>
                <label>{{ 'ผู้รับผิดชอบ' | tx }}<input class="ui-input" [value]="action().owner" (input)="setAction('owner', $any($event.target).value)" /></label>
                <label>{{ 'กำหนดเสร็จ' | tx }}<input class="ui-input" type="date" [min]="today" [value]="action().due" (input)="setAction('due', $any($event.target).value)" /></label>
              </div>
              @if (actionTouched() && actionIssues().length) {<ul class="problems">@for (p of actionIssues(); track p) {<li>{{ p | tx }}</li>}</ul>}
              <div class="rca-add"><span class="grow"></span><button uiButton variant="secondary" size="sm" type="button" [disabled]="actionIssues().length > 0" (click)="addAction(r)">{{ 'เพิ่มมาตรการ' | tx }}</button></div>
            }
          </div>
        </div>

        <aside class="record-rail">
          <div class="panel action-card">
            <div class="sum-row"><b>{{ 'สถานะ' | tx }}</b><span class="chip" [class]="'chip ' + STATUS[r.status].cls">{{ STATUS[r.status].label | tx }}</span></div>
            <div class="sum-row"><span>{{ 'ทีมวิเคราะห์' | tx }}</span><span>{{ r.team.join(', ') | tx }}</span></div>
            <div class="sum-row"><span>{{ 'เปิดโดย' | tx }}</span><span>{{ r.openedBy | tx }} · {{ r.openedAt }}</span></div>
            @if (r.submittedBy) {<div class="sum-row"><span>{{ 'ส่งโดย' | tx }}</span><span>{{ r.submittedBy | tx }} · {{ r.submittedAt }}</span></div>}
            @if (r.approvedBy) {<div class="sum-row"><span>{{ 'อนุมัติโดย' | tx }}</span><span>{{ r.approvedBy | tx }} · {{ r.approvedAt }}</span></div>}
            @if (open) {
              @if (missing(r).length) {<ul class="checks">@for (p of missing(r); track p) {<li>{{ p | tx }}</li>}</ul>}
              <button uiButton size="sm" type="button" [disabled]="missing(r).length > 0" (click)="actions.submitRca(r)">{{ 'ส่งอนุมัติ' | tx }}</button>
            } @else if (r.status === 'review') {
              @if (approveIssue(r); as b) {<p class="secondary">{{ b | tx }}</p>}
              <div class="two">
                <button uiButton variant="secondary" size="sm" type="button" [disabled]="!!approveIssue(r)" (click)="actions.decideRca(r, false)">{{ 'ส่งกลับ' | tx }}</button>
                <button uiButton size="sm" type="button" [disabled]="!!approveIssue(r)" (click)="actions.decideRca(r, true)">{{ 'อนุมัติ' | tx }}</button>
              </div>
            } @else if (r.note) {
              <p class="secondary">{{ r.note | tx }}</p>
            }
            <div class="section-title">{{ 'ประวัติ' | tx }}</div>
            <ul class="timeline compact">
              @for (h of history(r); track $index) {<li class="tl"><b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}<div class="secondary">{{ h[0] }} · {{ h[3] | tx }}</div></li>}
            </ul>
          </div>
        </aside>
      </div>
    }
  `,
  host: { class: 'page' },
})
export class RcaComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly STATUS = RCA_STATUS;
  protected readonly WHY_MIN = WHY_MIN;
  protected readonly today = TODAY;

  private readonly picked = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('id'));
  protected readonly rcas = computed(() => {
    const rank = { review: 0, open: 1, approved: 2 };
    return [...this.store.data().rcas].sort((a, b) => rank[a.status] - rank[b.status] || b.openedAt.localeCompare(a.openedAt));
  });
  protected readonly selected = computed(() => this.store.data().rcas.find(r => r.id === this.picked()) ?? this.rcas()[0] ?? null);

  protected readonly why = signal('');
  protected readonly whyIssue = computed(() => whyProblem(this.why()));
  protected readonly root = signal<string | null>(null);
  protected readonly action = signal({ ...BLANK_ACTION });
  protected readonly actionTouched = computed(() => Object.values(this.action()).some(v => v));
  protected readonly actionIssues = computed(() => actionProblems(this.action()));

  protected source(r: Rca) {
    return rcaSource(this.store.data(), r.source);
  }

  protected done(r: Rca) {
    return r.actions.filter(a => a.doneAt).length;
  }

  protected isLate(a: RcaAction) {
    return !a.doneAt && a.due < TODAY;
  }

  protected late(r: Rca) {
    return r.status === 'approved' ? r.actions.filter(a => this.isLate(a)) : [];
  }

  protected missing(r: Rca) {
    return submitProblems(r);
  }

  protected approveIssue(r: Rca) {
    return approveBlock(r, this.store.userName());
  }

  protected history(r: Rca) {
    return [...r.history].reverse();
  }

  protected rootChanged(r: Rca) {
    const v = this.root();
    return v !== null && v.trim() !== r.rootCause && v.trim().length >= NOTE_MIN;
  }

  protected pick(id: string) {
    this.picked.set(id);
    this.why.set('');
    this.root.set(null);
    this.action.set({ ...BLANK_ACTION });
  }

  protected addWhy(r: Rca) {
    this.store.addWhy(r, this.why());
    this.why.set('');
  }

  protected saveRoot(r: Rca) {
    this.store.setRootCause(r, this.root()!);
    this.root.set(null);
  }

  protected setAction(key: keyof typeof BLANK_ACTION, value: string) {
    this.action.set({ ...this.action(), [key]: value });
  }

  protected addAction(r: Rca) {
    this.store.addRcaAction(r, this.action());
    this.action.set({ ...BLANK_ACTION });
  }
}
