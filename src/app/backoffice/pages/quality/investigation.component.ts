/* Complaint investigation: the cases being looked into, what was found and what it rests on, the RCA it may open in M12, the answer and its sign-off, and the trail (quality.investigation, M28 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  awaitingSignOff, CHANNEL, complainantOf, COMPLAINT_SEVERITY, COMPLAINT_STATUS, escalateBlock, INCIDENT_STATUS, NEAR_MISS_STATUS, RCA_STATUS, responseBlock, responseDue, SLA_STATE,
  signOffBlock, slaState,
} from '../../data/quality';
import type { Complaint } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-investigation',
  imports: [PagerFoot, RouterLink, TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'การสอบสวนข้อร้องเรียน'" [source]="'M28 P2 · สอบสวนเป็นขั้นตอนพร้อมบันทึกตรวจสอบ · เชื่อม RCA ของ M12 · ข้อร้องเรียนรุนแรงผู้อำนวยการลงนามคำตอบ ผู้ร่างลงนามเองไม่ได้ · ต้นแบบก่อนสัญญาหน้าของ M28 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar"><b>{{ 'อยู่ระหว่างสอบสวน' | tx }}</b><span class="secondary grow">{{ '{n} รายการ · รุนแรงและใกล้ครบกำหนดก่อน' | tx: { n: rows().length } }}</span></div>
          <div class="table-wrap">
            <table class="bo-table complaints">
              <thead>
                <tr>
                  <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                  <th scope="col">{{ 'เรื่อง' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'ความรุนแรง' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'ผลสอบสวน' | tx }}</th>
                  <th scope="col" class="w-due">{{ 'ตอบภายใน' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (x of pager.rows(); track x.id) {
                  @let sla = slaOf(x);
                  <tr tabindex="0" [class.selected]="x.id === selected()?.id" [attr.aria-selected]="x.id === selected()?.id" (click)="picked.set(x.id)" (keydown.enter)="picked.set(x.id)">
                    <td><b>{{ x.id }}</b><div class="secondary">{{ x.handler | tx }}</div></td>
                    <td>{{ x.subject | tx }}<div class="secondary">{{ who(x) | tx }}@if (x.links.length) { · {{ x.links.join(', ') }}}</div></td>
                    <td><span class="chip" [class]="'chip ' + SEVERITY[x.severity!].cls">{{ SEVERITY[x.severity!].label | tx }}</span></td>
                    <td>{{ (signOffPending(x) ? 'รอลงนาม' : x.findings ? 'บันทึกผลแล้ว' : 'ยังไม่บันทึก') | tx }}</td>
                    <td class="num"><span class="chip" [class]="'chip ' + SLA[sla].cls">{{ SLA[sla].label | tx }}</span><div class="secondary">{{ due(x) }}</div></td>
                  </tr>
                } @empty {
                  <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีข้อร้องเรียนที่อยู่ระหว่างสอบสวน' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <bo-pager [pager]="pager" />
        </div>
      </div>

      <aside class="record-rail">
        @if (selected(); as x) {
          <div class="panel action-card">
            <b>{{ x.id }} · {{ x.subject | tx }}</b>
            <span class="secondary">{{ who(x) | tx }}@if (x.pet) { · {{ x.pet }}} · {{ CHANNEL[x.channel] | tx }} · {{ STATUS[x.status].label | tx }}</span>

            <div class="section-title">{{ '1. สิ่งที่ผู้ร้องเรียนแจ้ง' | tx }}</div>
            <p>{{ x.description | tx }}</p>

            <div class="section-title">{{ '2. ผลสอบสวน' | tx }}</div>
            <p [class.secondary]="!x.findings">{{ (x.findings ?? 'ยังไม่บันทึกผลสอบสวน') | tx }}</p>
            @if (!x.response?.sentAt) {<button uiButton variant="secondary" size="sm" type="button" (click)="actions.recordFindings(x)">{{ (x.findings ? 'แก้ผลสอบสวน' : 'บันทึกผลสอบสวน') | tx }}</button>}

            <div class="section-title">{{ '3. เชื่อมโยงความปลอดภัย (M12)' | tx }}</div>
            @for (l of links(x); track l.id) {
              <div class="sum-row"><a class="link" [routerLink]="l.path" [queryParams]="{ id: l.id }">{{ l.id }}</a><span class="chip" [class]="'chip ' + l.cls">{{ l.label | tx }}</span></div>
            } @empty {
              <p class="secondary">{{ 'ยังไม่เชื่อมกับเหตุเกือบพลาด อุบัติการณ์ หรือ RCA' | tx }}</p>
            }
            @if (!hasRca(x)) {
              <button uiButton variant="secondary" size="sm" type="button" (click)="actions.openRca(x.id, x.subject)">{{ 'เปิด RCA' | tx }}</button>
              @if (x.severity === 'severe') {<p class="secondary">{{ 'ข้อร้องเรียนรุนแรงขออนุมัติเปิด RCA ได้ที่รายการอนุมัติ หรือเปิดที่นี่' | tx }}</p>}
            }

            <div class="section-title">{{ '4. คำตอบ' | tx }}</div>
            @if (x.response; as r) {
              <p>{{ r.text | tx }}</p>
              <div class="sum-row"><span>{{ 'ร่างโดย' | tx }}</span><span>{{ r.draftedBy | tx }} · {{ r.draftedAt }}</span></div>
              @if (r.signedOffBy) {<div class="sum-row"><span>{{ 'ลงนามโดย' | tx }}</span><span>{{ r.signedOffBy | tx }} · {{ r.signedOffAt }}</span></div>}
              @if (r.sentAt) {<div class="sum-row"><span>{{ 'ส่งคำตอบเมื่อ' | tx }}</span><span>{{ r.sentAt }}</span></div>}
            }
            @if (signOffPending(x)) {
              @if (signIssue(x); as b) {<p class="secondary">{{ b | tx }}</p>}
              <div class="two">
                <button uiButton variant="secondary" size="sm" type="button" [disabled]="!!signIssue(x)" (click)="actions.signOff(x, false)">{{ 'ส่งกลับไปแก้' | tx }}</button>
                <button uiButton size="sm" type="button" [disabled]="!!signIssue(x)" (click)="actions.signOff(x, true)">{{ 'ลงนามและส่ง' | tx }}</button>
              </div>
            } @else if (!x.response) {
              @if (respondIssue(x); as b) {<p class="secondary">{{ b | tx }}</p>}
              <button uiButton size="sm" type="button" [disabled]="!!respondIssue(x)" (click)="actions.respond(x)">{{ (x.severity === 'severe' ? 'ร่างคำตอบ' : 'ตอบกลับ') | tx }}</button>
            }

            <div class="section-title">{{ '5. หน่วยงานกำกับ' | tx }}</div>
            @if (x.escalation; as e) {
              <p>{{ 'ส่งถึง{body}เมื่อ {at}' | tx: { body: (e.body | tx), at: e.at } }}<span class="secondary"> · {{ e.reason | tx }}</span></p>
            } @else {
              <button uiButton variant="secondary" size="sm" type="button" [disabled]="!!escalateIssue(x)" (click)="actions.escalateComplaint(x)">{{ 'ส่งหน่วยงานกำกับ' | tx }}</button>
              @if (escalateIssue(x); as b) {<p class="secondary">{{ b | tx }}</p>}
            }

            <div class="section-title">{{ 'บันทึกตรวจสอบการสอบสวน' | tx }}</div>
            <ul class="timeline compact">
              @for (h of x.history; track $index) {<li class="tl"><b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}<div class="secondary">{{ h[0] }} · {{ h[3] | tx }}</div></li>}
            </ul>
          </div>
        } @else {
          <div class="panel action-card"><p class="secondary">{{ 'เลือกข้อร้องเรียนในตารางเพื่อสอบสวน' | tx }}</p></div>
        }
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class InvestigationComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly CHANNEL = CHANNEL;
  protected readonly SEVERITY = COMPLAINT_SEVERITY;
  protected readonly STATUS = COMPLAINT_STATUS;
  protected readonly SLA = SLA_STATE;

  protected readonly picked = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('id'));
  /** Triaged and not yet answered, and the one asked for by its number whatever its state */
  protected readonly rows = computed(() => {
    const rank = { severe: 0, moderate: 1, low: 2 };
    return this.store.data().complaints.filter(x => ((x.status === 'triaged' || x.status === 'investigating') && x.severity) || x.id === this.picked())
      .sort((a, b) => rank[a.severity ?? 'low'] - rank[b.severity ?? 'low'] || (responseDue(a) ?? '').localeCompare(responseDue(b) ?? ''));
  });
  protected readonly selected = computed(() => this.store.data().complaints.find(x => x.id === this.picked()) ?? this.rows()[0] ?? null);

  protected slaOf(x: Complaint) {
    return slaState(x);
  }

  protected due(x: Complaint) {
    return responseDue(x) ?? '—';
  }

  protected who(x: Complaint) {
    return complainantOf(x);
  }

  protected signOffPending(x: Complaint) {
    return awaitingSignOff(x);
  }

  protected respondIssue(x: Complaint) {
    return responseBlock(x);
  }

  protected signIssue(x: Complaint) {
    return signOffBlock(x, this.store.userName());
  }

  protected escalateIssue(x: Complaint) {
    return escalateBlock(x);
  }

  protected hasRca(x: Complaint) {
    return x.links.some(l => l.startsWith('RCA-'));
  }

  /** What the complaint is linked to in M12, with where each stands */
  protected links(x: Complaint) {
    const d = this.store.data();
    return x.links.map(id => {
      const n = d.nearMisses.find(r => r.id === id);
      if (n) {
        return { id, path: '/backoffice/quality/near-miss', ...NEAR_MISS_STATUS[n.status] };
      }
      const i = d.incidents.find(r => r.id === id);
      if (i) {
        return { id, path: '/backoffice/quality/incidents', ...INCIDENT_STATUS[i.status] };
      }
      const r = d.rcas.find(a => a.id === id);
      return { id, path: '/backoffice/quality/rca', ...(r ? RCA_STATUS[r.status] : { label: '—', cls: 'quiet' }) };
    });
  }
}
