/* The audit explorer: one of three indexed shapes in a bounded window, the immutable events, and one event's protected detail (GOV-AUD-01, M13 · /audit/v1/events) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeStore } from '../../backoffice.store';
import { accessLog, type AuditQuery, queryEvents, queryProblem, RANGE_DAYS, RELAY, RESULT, RISK, RISKS, SHAPE, SHAPES } from '../../data/governance';
import type { AuditEvent } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-audit-explorer',
  imports: [PagerFoot, RouterLink, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'ค้นประวัติ Audit'" [source]="'GOV-AUD-01 · M13 · GET /audit/v1/events · ค้นได้ 3 รูปแบบตาม index · เหตุการณ์แก้หรือลบไม่ได้ · ระดับความเสี่ยงจาก backend · ไม่มีคอลัมน์ IP'" [freshness]="'นำเข้าล่าสุด {at}' | tx: { at: relay.lastIngest }" />
    <p class="notice info">{{ 'ข้อมูล audit อาจยังไม่ครบ (อยู่ระหว่างนำเข้า) · relay ล่าช้าประมาณ {n} นาที' | tx: { n: relay.lagMinutes } }}</p>

    <div class="panel">
      <div class="filter-bar audit-query">
        <div class="segmented" role="group" [attr.aria-label]="'รูปแบบการค้น' | tx">
          @for (s of shapes; track s) {<button type="button" [class.active]="draft().shape === s" [attr.aria-pressed]="draft().shape === s" (click)="set('shape', s)">{{ SHAPE[s] | tx }}</button>}
        </div>
        @if (draft().shape !== 'tenant') {
          <input class="ui-input" [attr.aria-label]="(draft().shape === 'patient' ? 'HN' : 'ผู้ใช้งาน') | tx" [placeholder]="(draft().shape === 'patient' ? 'เช่น HN-180533' : 'ชื่อผู้ใช้งาน') | tx" [value]="draft().value" (input)="set('value', $any($event.target).value)" />
        }
        <select class="ui-input" [attr.aria-label]="'ช่วงเวลา' | tx" (change)="set('days', +$any($event.target).value)">
          @for (n of ranges; track n) {<option [value]="n" [selected]="n === draft().days">{{ (n === 1 ? 'วันนี้' : '{n} วันล่าสุด') | tx: { n: n } }}</option>}
        </select>
        <select class="ui-input" [attr.aria-label]="'การกระทำ' | tx" (change)="set('action', $any($event.target).value)">
          <option value="">{{ 'ทุกการกระทำ' | tx }}</option>
          @for (a of actionsList(); track a) {<option [value]="a" [selected]="a === draft().action">{{ a }}</option>}
        </select>
        <select class="ui-input" [attr.aria-label]="'ระดับความเสี่ยง' | tx" (change)="set('risk', $any($event.target).value)">
          <option value="">{{ 'ทุกระดับความเสี่ยง' | tx }}</option>
          @for (r of risks; track r) {<option [value]="r" [selected]="r === draft().risk">{{ RISK[r].label | tx }}</option>}
        </select>
        <select class="ui-input" [attr.aria-label]="'ผลลัพธ์' | tx" (change)="set('result', $any($event.target).value)">
          <option value="">{{ 'ทุกผลลัพธ์' | tx }}</option>
          @for (r of results; track r) {<option [value]="r" [selected]="r === draft().result">{{ RESULT[r].label | tx }}</option>}
        </select>
        <button uiButton size="sm" type="button" [disabled]="!!problem()" (click)="run()">{{ 'ค้นหา' | tx }}</button>
      </div>
      @if (problem(); as p) {<p class="secondary foot-note">{{ p | tx }}</p>}
      <div class="filter-bar">
        <span class="secondary grow">{{ '{n} เหตุการณ์ · {shape}{value} · {range}' | tx: { n: rows().length, shape: (SHAPE[query().shape] | tx), value: query().value ? ' ' + query().value : '', range: (rangeLabel() | tx: { n: query().days }) } }}</span>
        @if (query().shape === 'patient') {<span class="secondary">{{ 'การค้นตามผู้ป่วยถูกบันทึกในบันทึกตรวจสอบ' | tx }}</span>}
        <a class="link" routerLink="/backoffice/quality/audit-exports">{{ 'ขอส่งออก' | tx }}</a>
      </div>
    </div>

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="table-wrap">
          <table class="bo-table audit">
            <thead><tr>
              <th scope="col" class="w-at">{{ 'เวลา' | tx }}</th>
              <th scope="col" class="w-owner">{{ 'ผู้กระทำ / บทบาท' | tx }}</th>
              <th scope="col">{{ 'การกระทำ' | tx }}</th>
              <th scope="col">{{ 'รายการ (ประเภท/รหัส)' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'ผลลัพธ์' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'ระดับความเสี่ยง' | tx }}</th>
            </tr></thead>
            <tbody>
              @for (e of pager.rows(); track e.id) {
                <tr tabindex="0" [class.selected]="e.id === selectedId()" [attr.aria-selected]="e.id === selectedId()" (click)="pick(e.id)" (keydown.enter)="pick(e.id)">
                  <td class="num">{{ e.occurredAt }}</td>
                  <td>{{ e.actor | tx }}<div class="secondary">{{ e.actorRole }}</div></td>
                  <td><code>{{ e.action }}</code></td>
                  <td>{{ e.entityType }} · {{ e.entityId }}@if (e.patientId) {<div class="secondary">{{ 'ข้อมูลผู้ป่วย {hn}' | tx: { hn: e.patientId } }}</div>}</td>
                  <td><span class="chip" [class]="'chip ' + RESULT[e.result].cls">{{ RESULT[e.result].label | tx }}</span></td>
                  <td><span class="chip" [class]="'chip ' + RISK[e.riskLevel].cls">{{ RISK[e.riskLevel].label | tx }}</span></td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ 'ไม่มีเหตุการณ์ในขอบเขตนี้ ซึ่งไม่ได้แปลว่าไม่มีเหตุผิดปกติ' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (selected(); as e) {
        <bo-drawer [heading]="e.action" [sub]="e.id + ' · ' + e.occurredAt" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'ผู้กระทำ' | tx }}</dt><dd>{{ e.actor | tx }} · {{ e.actorRole }}</dd>
            <dt>{{ 'รายการที่ถูกกระทำ' | tx }}</dt><dd>{{ e.entityType }} · {{ e.entityId }}</dd>
            <dt>{{ 'ผลลัพธ์' | tx }}</dt><dd><span class="chip" [class]="'chip ' + RESULT[e.result].cls">{{ RESULT[e.result].label | tx }}</span></dd>
            <dt>{{ 'ระดับความเสี่ยง' | tx }}</dt><dd><span class="chip" [class]="'chip ' + RISK[e.riskLevel].cls">{{ RISK[e.riskLevel].label | tx }}</span></dd>
            <dt>request_id</dt><dd><code>{{ e.requestId }}</code></dd>
            <dt>event_hash</dt><dd><code>{{ e.eventHash }}</code> · {{ (e.hashCheck === 'verified' ? 'ตรวจแล้วถูกต้อง' : 'ไม่ตรงกับ hash') | tx }}</dd>
            <dt>{{ 'ผู้ป่วย' | tx }}</dt><dd>{{ e.patientId ?? ('ไม่เกี่ยวกับผู้ป่วย' | tx) }}</dd>
          </dl>
          @if (e.patientId) {
            <div class="section-title">{{ 'ประวัติการเข้าถึงของ {hn}' | tx: { hn: e.patientId } }}</div>
            <ul class="timeline compact">
              @for (x of log(e.patientId); track x.id) {<li class="tl"><b>{{ x.action }}</b> · {{ x.actor | tx }}<div class="secondary">{{ x.occurredAt }} · {{ RESULT[x.result].label | tx }}</div></li>}
            </ul>
          }
          <p class="secondary">{{ 'เหตุการณ์ใน audit แก้ ลบ หรือปิดไม่ได้' | tx }}</p>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class AuditExplorerComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly SHAPE = SHAPE;
  protected readonly RISK = RISK;
  protected readonly RESULT = RESULT;
  protected readonly relay = RELAY;
  protected readonly shapes = SHAPES;
  protected readonly ranges = RANGE_DAYS;
  protected readonly risks = RISKS;
  protected readonly results = Object.keys(RESULT) as AuditEvent['result'][];

  private readonly hn = inject(ActivatedRoute).snapshot.queryParamMap.get('hn');
  private readonly start: AuditQuery = { shape: this.hn ? 'patient' : 'tenant', value: this.hn ?? '', days: 30, action: '', risk: '', result: '' };
  /** What is being typed, and the query last run: a patient query runs only on Search, as it is itself audited */
  protected readonly draft = signal<AuditQuery>({ ...this.start });
  protected readonly query = signal<AuditQuery>({ ...this.start });
  protected readonly problem = computed(() => queryProblem(this.draft()));
  protected readonly rows = computed(() => queryEvents(this.store.data(), this.query()));
  protected readonly actionsList = computed(() => [...new Set(this.store.data().auditEvents.map(e => e.action))].sort());
  protected readonly rangeLabel = computed(() => (this.query().days === 1 ? 'วันนี้' : '{n} วันล่าสุด'));
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.store.data().auditEvents.find(e => e.id === this.selectedId()) ?? null);

  constructor() {
    if (this.hn) {
      this.store.queryPatient(this.hn);
    }
  }

  protected set<K extends keyof AuditQuery>(key: K, value: AuditQuery[K]) {
    this.draft.set({ ...this.draft(), [key]: value, ...(key === 'shape' ? { value: '' } : {}) } as AuditQuery);
  }

  protected run() {
    const q = { ...this.draft() };
    if (q.shape === 'patient') {
      this.store.queryPatient(q.value);
    }
    this.query.set(q);
    this.selectedId.set(null);
  }

  protected log(hn: string) {
    return accessLog(this.store.data(), [hn]);
  }

  protected pick(id: string) {
    this.selectedId.set(this.selectedId() === id ? null : id);
  }
}
