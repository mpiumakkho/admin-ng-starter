/* One breach: assessed, the notices its severity needs sent within 72 hours, and closed — a high one by the Director (GOV-BRC-02, M31 · GATED) */
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { BREACH_SEVERITY, BREACH_STATUS, BREACH_STEPS, breachFlag, closeBreachBlock, DUE_FLAG, notified, notifyBlock, NOTIFY_TO, owedNotices } from '../../data/governance';
import { hoursLeft } from '../../data/quality';
import type { Breach } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const ORDER: Breach['status'][] = ['open', 'assessed', 'notified', 'closed'];

@Component({
  selector: 'bo-breach-detail',
  imports: [RouterLink, TxPipe, UiButton, PageHead],
  template: `
    @if (breach(); as b) {
      @let f = flag(b);
      <bo-page-head [heading]="'รายละเอียดเหตุละเมิด'" [source]="b.id + ' · GOV-BRC-02 · M31 · แจ้งก่อนปิดตามระดับความรุนแรง · เหตุรุนแรงผู้อำนวยการลงนามปิด · สัญญาการออกแบบ (GATED)'">
        <a class="link back" routerLink="/backoffice/quality/breach">{{ 'กลับไปรายการเหตุ' | tx }}</a>
      </bo-page-head>
      <p class="notice warn">{{ 'ระบบ PDPA (M31) ยังไม่พร้อม หน้านี้เป็นสัญญาการออกแบบ' | tx }}</p>
      @if (f === 'overdue') {<p class="notice danger">{{ 'เกิน 72 ชม. แล้วและยังแจ้งไม่ครบ' | tx }}</p>}
      @else if (f === 'near') {<p class="notice danger">{{ 'เหลือ {n} ชม. ก่อนครบ 72 ชม.' | tx: { n: hours(b) } }}</p>}

      <div class="record">
        <div class="record-main">
          <div class="panel summary">
            <div class="sum-row"><span>{{ 'เหตุ' | tx }}</span><b>{{ b.title | tx }}</b></div>
            <div class="sum-row"><span>{{ 'พบเมื่อ' | tx }}</span><span>{{ b.discoveredAt }} · {{ b.reportedBy | tx }} · {{ b.source | tx }}</span></div>
            <div class="sum-row"><span>{{ 'ครบกำหนดแจ้ง (72 ชม.)' | tx }}</span><b [class.text-danger]="f && f !== 'ok'">{{ b.statutoryDue }}@if (f) { · {{ DUE[f].label | tx }}}</b></div>
            <div class="sum-row"><span>{{ 'ความรุนแรง' | tx }}</span>@if (b.severity) {<span class="chip" [class]="'chip ' + SEVERITY[b.severity].cls">{{ SEVERITY[b.severity].label | tx }}</span>} @else {<span class="secondary">{{ 'ยังไม่ประเมิน' | tx }}</span>}</div>
            <p>{{ b.description | tx }}</p>
            @if (b.assessment; as a) {<p class="secondary">{{ 'DPIA: {t}' | tx: { t: (a.dpia | tx) } }} · {{ a.by | tx }} · {{ a.at }}</p>}
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'ขั้นตอน' | tx }}</b><span class="chip" [class]="'chip ' + STATUS[b.status].cls">{{ STATUS[b.status].label | tx }}</span></div>
            <ol class="steps" [attr.aria-label]="'ขั้นตอน' | tx">
              @for (s of steps; track s[0]) {<li [class.done]="reached(b, s[0])" [class.current]="b.status === s[0]" [attr.aria-current]="b.status === s[0] ? 'step' : null">{{ s[1] | tx }}</li>}
            </ol>
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'ผู้ได้รับผลกระทบ (เท่าที่จำเป็น)' | tx }}</b></div>
            <div class="summary">
              <div class="sum-row"><span>{{ 'จำนวนคน' | tx }}</span><b>{{ '{n} คน' | tx: { n: b.affected.count } }}</b></div>
              <div class="sum-row"><span>{{ 'ประเภทข้อมูล' | tx }}</span><span>{{ kinds(b) | tx }}</span></div>
              <p class="secondary">{{ 'รายชื่อเจ้าของข้อมูลไม่แสดงที่นี่ เปิดได้เฉพาะผู้มีสิทธิ์ pii:full' | tx }}</p>
            </div>
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'ประวัติ' | tx }}</b></div>
            <ul class="timeline">
              @for (h of history(b); track $index) {<li class="tl"><b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}<div class="secondary">{{ h[0] }} · {{ h[3] | tx }}</div></li>}
            </ul>
          </div>
        </div>

        <aside class="record-rail">
          <div class="panel action-card">
            <b>{{ 'การดำเนินการ' | tx }}</b>
            @if (b.status === 'open') {
              <button uiButton size="sm" type="button" (click)="actions.assessBreach(b)">{{ 'ประเมินความรุนแรง' | tx }}</button>
            }
            <div class="section-title">{{ 'การแจ้งเหตุ' | tx }}</div>
            @for (to of targets; track to) {
              <div class="sum-row">
                <span>{{ NOTIFY_TO[to] | tx }}</span>
                @if (sent(b, to); as n) {<span class="chip ok">{{ 'แจ้งแล้ว {at}' | tx: { at: n[1] } }}</span>}
                @else if (owes(b, to)) {<button uiButton variant="secondary" size="sm" type="button" [disabled]="!!notifyIssue(b, to)" (click)="actions.notifyBreach(b, to)">{{ 'แจ้งเหตุ' | tx }}</button>}
                @else {<span class="secondary">{{ (b.severity ? 'ไม่ต้องแจ้ง' : 'รอประเมิน') | tx }}</span>}
              </div>
            }
            @if (b.status !== 'closed') {
              @if (closeIssue(b); as c) {<p class="secondary">{{ c | tx }}</p>}
              <button uiButton size="sm" type="button" [disabled]="!!closeIssue(b)" (click)="actions.closeBreach(b)">{{ (b.severity === 'high' ? 'ลงนามปิดเหตุ' : 'ปิดเหตุ') | tx }}</button>
            } @else {
              <div class="sum-row"><span>{{ 'ปิดเมื่อ' | tx }}</span><b>{{ b.closedAt }}</b></div>
              @if (b.signOff; as s) {<div class="sum-row"><span>{{ 'ลงนามโดย' | tx }}</span><b>{{ s.by | tx }}</b></div>}
              <p class="secondary">{{ b.outcome | tx }}</p>
            }
          </div>
        </aside>
      </div>
    } @else {
      <bo-page-head [heading]="'รายละเอียดเหตุละเมิด'" />
      <p class="notice">{{ 'ไม่พบเหตุนี้' | tx }} <a class="link" routerLink="/backoffice/quality/breach">{{ 'กลับไปรายการเหตุ' | tx }}</a></p>
    }
  `,
  host: { class: 'page' },
})
export class BreachDetailComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly SEVERITY = BREACH_SEVERITY;
  protected readonly STATUS = BREACH_STATUS;
  protected readonly DUE = DUE_FLAG;
  protected readonly NOTIFY_TO = NOTIFY_TO;
  protected readonly steps = BREACH_STEPS;
  protected readonly targets: ('pdpc' | 'subjects')[] = ['pdpc', 'subjects'];

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('id'))));
  /** The breach changes in place, so every change of the data is a change here */
  protected readonly breach = computed(() => this.store.data().breaches.find(b => b.id === this.id()) ?? null, { equal: () => false });

  protected flag(b: Breach) {
    return breachFlag(b);
  }

  protected hours(b: Breach) {
    return Math.max(0, Math.floor(hoursLeft(b.statutoryDue)));
  }

  protected reached(b: Breach, step: Breach['status']) {
    return ORDER.indexOf(step) < ORDER.indexOf(b.status) || (b.status === 'closed' && step === 'closed');
  }

  protected kinds(b: Breach) {
    return b.affected.kinds.join(', ') || '—';
  }

  protected sent(b: Breach, to: 'pdpc' | 'subjects') {
    return notified(b, to) ? b.notifications.find(n => n[0] === to) : undefined;
  }

  protected owes(b: Breach, to: 'pdpc' | 'subjects') {
    return owedNotices(b).includes(to);
  }

  protected notifyIssue(b: Breach, to: 'pdpc' | 'subjects') {
    return notifyBlock(b, to);
  }

  protected closeIssue(b: Breach) {
    return closeBreachBlock(b, this.store.userName());
  }

  protected history(b: Breach) {
    return [...b.history].reverse();
  }
}
