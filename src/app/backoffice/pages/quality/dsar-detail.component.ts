/* One data subject request: identity first, the data gathered to its scope, delivered and closed, with who touched the record (GOV-DSAR-02, M31 · GATED; access log M13) */
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  accessLog, daysLeft, DSAR_RIGHT, DSAR_SOURCES, DSAR_STATUS, DSAR_STEPS, dsarFlag, DUE_FLAG, EXPORT_STATUS, fulfilBlock, isActive, RESULT, RISK,
} from '../../data/governance';
import { CHANNEL } from '../../data/quality';
import type { DsarRequest } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const ORDER: DsarRequest['status'][] = ['intake', 'verified', 'collecting', 'delivered', 'closed'];

@Component({
  selector: 'bo-dsar-detail',
  imports: [RouterLink, TxPipe, UiButton, PageHead],
  template: `
    @if (request(); as r) {
      @let f = flag(r);
      <bo-page-head [heading]="'รายละเอียดคำขอ DSAR'" [source]="r.id + ' · GOV-DSAR-02 · M31 · ส่งมอบได้เมื่อยืนยันตัวตนแล้วเท่านั้น · สัญญาการออกแบบ (GATED)'">
        <a class="link back" routerLink="/backoffice/quality/dsar">{{ 'กลับไปรายการคำขอ' | tx }}</a>
      </bo-page-head>
      <p class="notice warn">{{ 'ระบบ PDPA (M31) ยังไม่พร้อม หน้านี้เป็นสัญญาการออกแบบ' | tx }}</p>
      @if (f === 'overdue') {<p class="notice danger">{{ 'เกินกำหนด 30 วันแล้ว' | tx }}</p>}

      <div class="record">
        <div class="record-main">
          <div class="panel summary">
            <div class="sum-row"><span>{{ 'สิทธิ์ที่ขอ' | tx }}</span><b>{{ RIGHT[r.right] | tx }}</b></div>
            <div class="sum-row"><span>{{ 'ผู้ขอ' | tx }}</span><span>{{ r.requester | tx }}@if (r.ownerKey) { · {{ 'เจ้าของในทะเบียน' | tx }} {{ r.ownerKey }}}</span></div>
            <div class="sum-row"><span>{{ 'ข้อมูลของ' | tx }}</span><span>{{ r.pets.join(', ') || '—' }}@if (r.hns.length) { · {{ r.hns.join(', ') }}}</span></div>
            <div class="sum-row"><span>{{ 'ช่องทางรับเรื่อง' | tx }}</span><span>{{ CHANNEL[r.channel] | tx }} · {{ r.receivedAt }}</span></div>
            <div class="sum-row"><span>{{ 'ครบกำหนด (30 วัน)' | tx }}</span>
              <b [class.text-danger]="f && f !== 'ok'">{{ r.statutoryDue }}@if (f) { · {{ DUE[f].label | tx }} · {{ 'เหลือ {n} วัน' | tx: { n: left(r) } }}}</b></div>
            <div class="sum-row"><span>{{ 'ขอบเขต' | tx }}</span><span>{{ r.scope | tx }}</span></div>
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'ขั้นตอน' | tx }}</b><span class="chip" [class]="'chip ' + STATUS[r.status].cls">{{ STATUS[r.status].label | tx }}</span></div>
            <ol class="steps" [attr.aria-label]="'ขั้นตอน' | tx">
              @for (s of steps; track s[0]) {
                <li [class.done]="reached(r, s[0])" [class.current]="r.status === s[0]" [attr.aria-current]="r.status === s[0] ? 'step' : null">{{ s[1] | tx }}</li>
              }
            </ol>
            @if (r.identity) {<p class="secondary step-note">{{ 'ยืนยันตัวตนแล้ว: {m} · {by} · {at}' | tx: { m: (r.identity.method | tx), by: (r.identity.by | tx), at: r.identity.at } }}</p>}
            @else if (isActive(r)) {<p class="notice warn step-note">{{ 'ต้องยืนยันตัวตนก่อนส่งมอบข้อมูล' | tx }}</p>}
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'ข้อมูลตามขอบเขต (เท่าที่จำเป็น)' | tx }}</b><span class="secondary grow">{{ 'รวบรวมแล้ว {n} จาก {all} แหล่ง' | tx: { n: r.collected.length, all: sources.length } }}</span></div>
            <div class="table-wrap">
              <table class="bo-table">
                <thead><tr><th scope="col">{{ 'แหล่งข้อมูล' | tx }}</th><th scope="col" class="w-actions">{{ 'สถานะ' | tx }}</th></tr></thead>
                <tbody>
                  @for (s of sources; track s) {
                    <tr class="static">
                      <td>{{ s | tx }}</td>
                      <td>
                        @if (r.collected.includes(s)) {<span class="chip ok">{{ 'รวบรวมแล้ว' | tx }}</span>}
                        @else if (s === 'ประวัติการเข้าถึง' && exportFor(r); as x) {<span class="chip" [class]="'chip ' + EXPORT[x.status].cls">{{ x.id }} · {{ EXPORT[x.status].label | tx }}</span>}
                        @else if (canCollect(r)) {<button uiButton variant="secondary" size="sm" type="button" (click)="actions.collectDsar(r, s)">{{ 'รวบรวม' | tx }}</button>}
                        @else {<span class="secondary">—</span>}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (r.delivery; as dl) {
              <p class="secondary foot-note">{{ 'ส่งมอบแล้ว: {m} · {file} · หมดอายุ {exp}' | tx: { m: (dl.method | tx), file: dl.artifact, exp: dl.expires } }}</p>
            }
            @if (r.outcome) {<p class="foot-note">{{ r.outcome | tx }}</p>}
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'ประวัติ' | tx }}</b></div>
            <ul class="timeline">
              @for (h of history(r); track $index) {<li class="tl"><b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}<div class="secondary">{{ h[0] }} · {{ h[3] | tx }}</div></li>}
            </ul>
          </div>
        </div>

        <aside class="record-rail">
          <div class="panel action-card">
            <b>{{ 'การดำเนินการ' | tx }}</b>
            @if (r.status === 'intake') {
              <button uiButton size="sm" type="button" (click)="actions.verifyIdentity(r)">{{ 'ยืนยันตัวตน' | tx }}</button>
            }
            @if (isActive(r)) {
              @if (block(r); as b) {<p class="secondary">{{ b | tx }}</p>}
              <button uiButton size="sm" type="button" [disabled]="!!block(r)" (click)="actions.fulfilDsar(r)">{{ 'ส่งมอบข้อมูล' | tx }}</button>
              <button uiButton variant="secondary" size="sm" type="button" (click)="actions.closeDsar(r, true)">{{ 'ปฏิเสธคำขอนี้' | tx }}</button>
            } @else if (r.status === 'delivered') {
              <button uiButton size="sm" type="button" (click)="actions.closeDsar(r, false)">{{ 'ปิดคำขอ' | tx }}</button>
            } @else {
              <p class="secondary">{{ 'คำขอนี้ปิดแล้ว' | tx }}</p>
            }
          </div>
          <div class="panel action-card">
            <b>{{ 'ประวัติการเข้าถึงข้อมูล' | tx }}</b>
            <span class="secondary">{{ 'จาก /audit/v1/patients/{hn}/access-log' | tx: { hn: r.hns.join(', ') || '—' } }}</span>
            @for (e of log(r); track e.id) {
              <div class="sum-row access"><span>{{ e.occurredAt }}<br />{{ e.actor | tx }} · {{ e.action }}</span>
                <span class="chip" [class]="'chip ' + (e.result === 'success' ? RISK[e.riskLevel].cls : RESULT[e.result].cls)">{{ (e.result === 'success' ? RISK[e.riskLevel].label : RESULT[e.result].label) | tx }}</span></div>
            } @empty {
              <p class="secondary">{{ 'ไม่มีการเข้าถึงที่บันทึกไว้' | tx }}</p>
            }
            @if (r.hns.length) {<a class="link" routerLink="/backoffice/quality/audit" [queryParams]="{ hn: r.hns[0] }">{{ 'เปิดใน Audit Explorer' | tx }}</a>}
          </div>
        </aside>
      </div>
    } @else {
      <bo-page-head [heading]="'รายละเอียดคำขอ DSAR'" />
      <p class="notice">{{ 'ไม่พบคำขอนี้' | tx }} <a class="link" routerLink="/backoffice/quality/dsar">{{ 'กลับไปรายการคำขอ' | tx }}</a></p>
    }
  `,
  host: { class: 'page' },
})
export class DsarDetailComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly RIGHT = DSAR_RIGHT;
  protected readonly STATUS = DSAR_STATUS;
  protected readonly DUE = DUE_FLAG;
  protected readonly EXPORT = EXPORT_STATUS;
  protected readonly RISK = RISK;
  protected readonly RESULT = RESULT;
  protected readonly CHANNEL = CHANNEL;
  protected readonly steps = DSAR_STEPS;
  protected readonly sources = DSAR_SOURCES;
  protected readonly isActive = isActive;

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('id'))));
  /** The request changes in place, so every change of the data is a change here */
  protected readonly request = computed(() => this.store.data().dsars.find(r => r.id === this.id()) ?? null, { equal: () => false });

  protected flag(r: DsarRequest) {
    return dsarFlag(r);
  }

  protected left(r: DsarRequest) {
    return daysLeft(r);
  }

  protected reached(r: DsarRequest, step: DsarRequest['status']) {
    const at = ORDER.indexOf(r.status === 'rejected' ? 'intake' : r.status);
    return ORDER.indexOf(step) < at || (r.status === 'closed' && step === 'closed');
  }

  protected canCollect(r: DsarRequest) {
    return isActive(r) && r.status !== 'intake';
  }

  protected block(r: DsarRequest) {
    return fulfilBlock(r);
  }

  protected exportFor(r: DsarRequest) {
    return r.exportId ? this.store.data().auditExports.find(x => x.id === r.exportId) : undefined;
  }

  protected log(r: DsarRequest) {
    return accessLog(this.store.data(), r.hns);
  }

  protected history(r: DsarRequest) {
    return [...r.history].reverse();
  }
}
