/* All complaints: the queue by its answer clock, taken from any channel, triaged, talked through and answered (quality.complaints, M28 P2, TAHSA-13) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  awaitingSignOff, CHANNEL, CHANNELS, complainantOf, COMPLAINT_CATEGORIES, COMPLAINT_CATEGORY, COMPLAINT_SEVERITY, COMPLAINT_STATUS, complaintCounts, complaintProblems,
  complaintTriageDue, type ComplaintInput, isOpen, responseBlock, responseDue, SLA_STATE, slaState, TOPICS,
} from '../../data/quality';
import type { Complaint, ComplaintCategory, ComplaintChannel } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

type View = 'open' | 'all' | 'resolved';
const BLANK: ComplaintInput = { channel: 'line', ownerKey: '', pet: '', anonymous: false, category: 'operational', topic: '', subject: '', description: '' };
const RANK: Record<string, number> = { breached: 0, 'due-soon': 1, triage: 2, 'on-track': 3, met: 4 };

@Component({
  selector: 'bo-complaints',
  imports: [PagerFoot, RouterLink, TxPipe, UiButton, PageHead],
  template: `
    @let c = counts();
    <bo-page-head [heading]="'ข้อร้องเรียนทั้งหมด'" [source]="'M28 P2 · TAHSA-13 · รับทุกช่องทาง · คัดกรองภายใน 4 ชม. · ตอบกลับ รุนแรง 24 ชม. ปานกลาง 72 ชม. ต่ำ 7 วัน · ข้อร้องเรียนรุนแรงผู้อำนวยการลงนาม · ต้นแบบก่อนสัญญาหน้าของ M28 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ c.open }}</span><span class="kpi-label">{{ 'ยังไม่ตอบ' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.warn]="c.new"><span class="kpi-value">{{ c.new }}</span><span class="kpi-label">{{ 'รอคัดกรอง' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.warn]="c.dueSoon"><span class="kpi-value">{{ c.dueSoon }}</span><span class="kpi-label">{{ 'ใกล้ครบกำหนดตอบ' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.danger]="c.breached"><span class="kpi-value">{{ c.breached }}</span><span class="kpi-label">{{ 'เกินกำหนดตอบ' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.danger]="c.severe"><span class="kpi-value">{{ c.severe }}</span><span class="kpi-label">{{ 'ระดับรุนแรง' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.warn]="c.signOff"><span class="kpi-value">{{ c.signOff }}</span><span class="kpi-label">{{ 'รอผู้อำนวยการลงนาม' | tx }}</span></div>
    </div>

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar">
            <div class="segmented" role="group" [attr.aria-label]="'มุมมอง' | tx">
              @for (v of views; track v[0]) {<button type="button" [class.active]="view() === v[0]" [attr.aria-pressed]="view() === v[0]" (click)="view.set(v[0])">{{ v[1] | tx }}</button>}
            </div>
            <select class="ui-input" [attr.aria-label]="'ประเภท' | tx" (change)="category.set($any($event.target).value)">
              <option value="">{{ 'ทุกประเภท' | tx }}</option>
              @for (k of categories; track k) {<option [value]="k">{{ CATEGORY[k] | tx }}</option>}
            </select>
            <select class="ui-input" [attr.aria-label]="'ช่องทางรับเรื่อง' | tx" (change)="channel.set($any($event.target).value)">
              <option value="">{{ 'ทุกช่องทางรับเรื่อง' | tx }}</option>
              @for (k of channels; track k) {<option [value]="k">{{ CHANNEL[k] | tx }}</option>}
            </select>
            <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
          </div>
          <div class="table-wrap">
            <table class="bo-table complaints">
              <thead>
                <tr>
                  <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                  <th scope="col">{{ 'เรื่อง' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'ความรุนแรง' | tx }}</th>
                  <th scope="col" class="w-due">{{ 'ตอบภายใน' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (x of pager.rows(); track x.id) {
                  @let sla = slaOf(x);
                  <tr tabindex="0" [class.selected]="x.id === selectedId()" [attr.aria-selected]="x.id === selectedId()" (click)="pick(x.id)" (keydown.enter)="pick(x.id)">
                    <td><b>{{ x.id }}</b><div class="secondary">{{ x.receivedAt }}</div></td>
                    <td>{{ x.subject | tx }}<div class="secondary">{{ who(x) | tx }}@if (x.pet) { · {{ x.pet }}} · {{ CHANNEL[x.channel] | tx }} · {{ CATEGORY[x.category] | tx }}</div></td>
                    <td>@if (x.severity) {<span class="chip" [class]="'chip ' + SEVERITY[x.severity].cls">{{ SEVERITY[x.severity].label | tx }}</span>} @else {<span class="secondary">—</span>}</td>
                    <td class="num">
                      <span class="chip" [class]="'chip ' + SLA[sla].cls">{{ SLA[sla].label | tx }}</span>
                      <div class="secondary">{{ x.response?.sentAt ?? due(x) }}</div>
                    </td>
                    <td><span class="chip" [class]="'chip ' + STATUS[x.status].cls">{{ STATUS[x.status].label | tx }}</span>@if (x.handler) {<div class="secondary">{{ x.handler | tx }}</div>}</td>
                  </tr>
                } @empty {
                  <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีข้อร้องเรียนในมุมมองนี้' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <bo-pager [pager]="pager" />
        </div>
      </div>

      <aside class="record-rail">
        @if (selected(); as x) {
          @let sla = slaOf(x);
          <div class="panel action-card">
            <b>{{ x.id }} · {{ x.subject | tx }}</b>
            <span class="secondary">{{ who(x) | tx }}@if (x.pet) { · {{ x.pet }}} · {{ CHANNEL[x.channel] | tx }} · {{ x.receivedAt }}</span>
            <div class="sum-row"><span>{{ 'ประเภท / หัวข้อ' | tx }}</span><span>{{ CATEGORY[x.category] | tx }} · {{ x.topic | tx }}</span></div>
            @if (x.severity) {
              <div class="sum-row"><span>{{ 'ความรุนแรง' | tx }}</span><span class="chip" [class]="'chip ' + SEVERITY[x.severity].cls">{{ SEVERITY[x.severity].label | tx }}</span></div>
              <div class="sum-row"><span>{{ 'ผู้รับผิดชอบ' | tx }}</span><b>{{ x.handler | tx }}</b></div>
            }
            <div class="sum-row"><span>{{ (x.severity ? 'ตอบภายใน' : 'คัดกรองภายใน') | tx }}</span><b [class.text-danger]="sla === 'breached'">{{ due(x) }}</b></div>
            @if (signOffPending(x)) {<p class="notice warn">{{ 'คำตอบรอผู้อำนวยการลงนาม' | tx }}</p>}

            <div class="section-title">{{ 'การติดต่อ' | tx }}</div>
            <ul class="timeline compact">
              @for (m of x.communications; track $index) {
                <li class="tl"><b>{{ (m[2] === 'in' ? 'ผู้ร้องเรียน' : 'โรงพยาบาล') | tx }}</b> · {{ m[1] | tx }} · {{ CHANNEL[m[3]] | tx }}<div class="secondary">{{ m[0] }}</div><div>{{ m[4] | tx }}</div></li>
              }
            </ul>

            @if (x.status === 'new') {
              <button uiButton size="sm" type="button" (click)="actions.triageComplaint(x)">{{ 'คัดกรอง' | tx }}</button>
            } @else if (open(x)) {
              <div class="two">
                <button uiButton variant="secondary" size="sm" type="button" (click)="actions.logContact(x)">{{ 'บันทึกการติดต่อ' | tx }}</button>
                @if (signOffPending(x)) {
                  <button uiButton size="sm" type="button" (click)="actions.signOff(x, true)">{{ 'ลงนามคำตอบ' | tx }}</button>
                } @else {
                  <button uiButton size="sm" type="button" [disabled]="!!respondIssue(x)" (click)="actions.respond(x)">{{ (x.severity === 'severe' ? 'ร่างคำตอบ' : 'ตอบกลับ') | tx }}</button>
                }
              </div>
              @if (respondIssue(x); as b) {@if (!signOffPending(x)) {<p class="secondary">{{ b | tx }}</p>}}
            }
            <a class="link" routerLink="/backoffice/quality/investigation" [queryParams]="{ id: x.id }">{{ 'ไปที่การสอบสวน' | tx }}</a>
          </div>
        } @else {
          <div class="panel action-card">
            <b>{{ 'รับข้อร้องเรียน' | tx }}</b>
            <div class="two">
              <label class="field">{{ 'ช่องทางรับเรื่อง' | tx }}
                <select class="ui-input" (change)="set('channel', $any($event.target).value)">
                  @for (k of channels; track k) {<option [value]="k" [selected]="k === form().channel">{{ CHANNEL[k] | tx }}</option>}
                </select>
              </label>
              <label class="field">{{ 'ประเภท' | tx }}
                <select class="ui-input" (change)="set('category', $any($event.target).value)">
                  @for (k of categories; track k) {<option [value]="k" [selected]="k === form().category">{{ CATEGORY[k] | tx }}</option>}
                </select>
              </label>
            </div>
            <label class="check"><input type="checkbox" [checked]="form().anonymous" (change)="set('anonymous', $any($event.target).checked)" />{{ 'บุคลากรร้องเรียนโดยไม่ระบุตัวตน' | tx }}</label>
            @if (!form().anonymous) {
              <div class="two">
                <label class="field">{{ 'ผู้ร้องเรียน' | tx }}
                  <select class="ui-input" (change)="pickOwner($any($event.target).value)">
                    <option value="" [selected]="!form().ownerKey">{{ 'เลือก' | tx }}</option>
                    @for (o of owners(); track o) {<option [value]="o" [selected]="o === form().ownerKey">{{ o }}</option>}
                  </select>
                </label>
                <label class="field">{{ 'สัตว์เลี้ยง' | tx }}
                  <select class="ui-input" [disabled]="!pets().length" (change)="set('pet', $any($event.target).value)">
                    <option value="" [selected]="!form().pet">{{ 'ไม่ระบุ' | tx }}</option>
                    @for (p of pets(); track p) {<option [value]="p" [selected]="p === form().pet">{{ p }}</option>}
                  </select>
                </label>
              </div>
            }
            <label class="field">{{ 'หัวข้อ' | tx }}
              <select class="ui-input" (change)="set('topic', $any($event.target).value)">
                <option value="" [selected]="!form().topic">{{ 'เลือก' | tx }}</option>
                @for (t of topics; track t) {<option [value]="t" [selected]="t === form().topic">{{ t | tx }}</option>}
              </select>
            </label>
            <label class="field">{{ 'เรื่อง' | tx }}<input class="ui-input" [value]="form().subject" (input)="set('subject', $any($event.target).value)" /></label>
            <label class="field">{{ 'รายละเอียดตามที่ผู้ร้องเรียนแจ้ง' | tx }}<textarea class="ui-input" rows="3" [value]="form().description" (input)="set('description', $any($event.target).value)"></textarea></label>
            @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="receive()">{{ 'รับเรื่อง' | tx }}</button>
          </div>
        }
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class ComplaintsComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly CHANNEL = CHANNEL;
  protected readonly CATEGORY = COMPLAINT_CATEGORY;
  protected readonly SEVERITY = COMPLAINT_SEVERITY;
  protected readonly STATUS = COMPLAINT_STATUS;
  protected readonly SLA = SLA_STATE;
  protected readonly channels = CHANNELS;
  protected readonly categories = COMPLAINT_CATEGORIES;
  protected readonly topics = TOPICS;
  protected readonly views: [View, string][] = [['open', 'ยังไม่ตอบ'], ['all', 'ทั้งหมด'], ['resolved', 'ตอบแล้ว']];

  protected readonly counts = computed(() => complaintCounts(this.store.data()));
  protected readonly view = signal<View>('open');
  protected readonly category = signal<ComplaintCategory | ''>('');
  protected readonly channel = signal<ComplaintChannel | ''>('');
  protected readonly selectedId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('id'));
  protected readonly rows = computed(() => {
    const v = this.view();
    return this.store.data().complaints
      .filter(x => (v === 'all' || (v === 'open') === isOpen(x)) && (!this.category() || x.category === this.category()) && (!this.channel() || x.channel === this.channel()))
      .sort((a, b) => (v === 'open' ? RANK[slaState(a)] - RANK[slaState(b)] : 0) || b.receivedAt.localeCompare(a.receivedAt));
  });
  protected readonly selected = computed(() => this.store.data().complaints.find(x => x.id === this.selectedId()) ?? null);

  /** The owners the clinic knows, and their pets, to take a complaint from */
  protected readonly owners = computed(() => Object.keys(this.store.clinic.data().owners).sort());
  protected readonly form = signal<ComplaintInput>({ ...BLANK });
  protected readonly pets = computed(() => (this.store.clinic.data().owners[this.form().ownerKey]?.pets ?? []).map(p => p.split(' · ')[0]));
  protected readonly problems = computed(() => complaintProblems(this.form()));

  protected slaOf(x: Complaint) {
    return slaState(x);
  }

  protected due(x: Complaint) {
    return responseDue(x) ?? complaintTriageDue(x);
  }

  protected who(x: Complaint) {
    return complainantOf(x);
  }

  protected open(x: Complaint) {
    return isOpen(x);
  }

  protected signOffPending(x: Complaint) {
    return awaitingSignOff(x);
  }

  protected respondIssue(x: Complaint) {
    return responseBlock(x);
  }

  protected pick(id: string) {
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected set<K extends keyof ComplaintInput>(key: K, value: ComplaintInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected pickOwner(ownerKey: string) {
    this.form.set({ ...this.form(), ownerKey, pet: '' });
  }

  protected receive() {
    this.actions.receiveComplaint(this.form(), x => {
      this.form.set({ ...BLANK });
      this.view.set('open');
      this.selectedId.set(x.id);
    });
  }
}
