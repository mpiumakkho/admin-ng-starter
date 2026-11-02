/* LINE CRM: the service messages that wait (reminders, bill links), sent only with the owner's consent, and the log of what went (sales.lineCrm, M15 P1 subset) */
import { Component, computed, inject, signal } from '@angular/core';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { lineSummary, MESSAGE_KIND, MESSAGE_STATUS, outbox, owners } from '../../data/sales';
import type { OutboxItem } from '../../data/sales';
import type { MessageKind } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

const KINDS = Object.keys(MESSAGE_KIND) as MessageKind[];

@Component({
  selector: 'bo-line-crm',
  imports: [PagerFoot, TxPipe, UiButton, PageHead],
  template: `
    @let s = summary();
    <bo-page-head [heading]="'LINE CRM'" [source]="'M15 · ข้อความบริการผ่าน LINE OA · ส่งได้เฉพาะเจ้าของที่เชื่อม LINE และให้ความยินยอมตามวัตถุประสงค์ (M31) · แคมเปญและแต้มสะสมเป็น P2'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" [disabled]="!readyCount()" (click)="actions.sendAll(box())">{{ 'ส่งที่ส่งได้ทั้งหมด ({n})' | tx: { n: readyCount() } }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ s.linked }}/{{ s.owners }}</span><span class="kpi-label">{{ 'เจ้าของที่เชื่อม LINE' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ s.reminder }}</span><span class="kpi-label">{{ 'ยินยอมรับการแจ้งเตือน' | tx }}</span></div>
      <div class="kpi" [class.info]="readyCount()" role="listitem"><span class="kpi-value">{{ readyCount() }}</span><span class="kpi-label">{{ 'รอส่ง · ติดความยินยอม {n}' | tx: { n: box().length - readyCount() } }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ s.today }}</span><span class="kpi-label">{{ 'ส่งวันนี้ · อ่านแล้ว {n}%' | tx: { n: s.readRate } }}</span></div>
      <div class="kpi" [class.danger]="s.failed" role="listitem"><span class="kpi-value">{{ s.failed }}</span><span class="kpi-label">{{ 'ส่งไม่สำเร็จ' | tx }}</span></div>
    </div>

    <div class="record">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar">
            <b>{{ 'รอส่ง' | tx }}</b>
            <select class="ui-input" [attr.aria-label]="'ประเภทข้อความ' | tx" (change)="kind.set($any($event.target).value)">
              <option value="" [selected]="!kind()">{{ 'ทุกประเภท' | tx }}</option>
              @for (k of kinds; track k) {<option [value]="k" [selected]="k === kind()">{{ KIND[k].label | tx }}</option>}
            </select>
            <span class="secondary grow">{{ 'นัดพรุ่งนี้ · วัคซีนครบกำหนดใน 30 วัน · ใบแจ้งหนี้ค้างชำระ' | tx }}</span>
          </div>
          <div class="table-wrap">
            <table class="bo-table outbox">
              <thead>
                <tr>
                  <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'เจ้าของ / สัตว์' | tx }}</th>
                  <th scope="col">{{ 'ข้อความ' | tx }}</th>
                  <th scope="col" class="w-due">{{ 'สำหรับ' | tx }}</th>
                  <th scope="col" class="w-send"><span class="visually-hidden">{{ 'การทำงาน' | tx }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (i of pager.rows(); track i.key) {
                  <tr class="static" [class.blocked]="i.block">
                    <td><span class="chip" [class]="'chip ' + KIND[i.kind].cls">{{ KIND[i.kind].label | tx }}</span></td>
                    <td><b>{{ i.ownerKey }}</b><div class="secondary">{{ i.pet }}</div></td>
                    <td>{{ i.text | tx }}@if (i.retry) {<div class="secondary text-danger">{{ 'ครั้งก่อนส่งไม่สำเร็จ' | tx }} · {{ i.retry.at }}</div>}</td>
                    <td class="num">{{ i.due }}</td>
                    <td>
                      @if (i.block) {<span class="chip quiet">{{ i.block | tx }}</span>}
                      @else {<button uiButton size="sm" variant="secondary" type="button" (click)="actions.sendMessage(i)">{{ (i.retry ? 'ส่งใหม่' : 'ส่ง') | tx }}</button>}
                    </td>
                  </tr>
                } @empty {
                  <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีข้อความรอส่ง' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <bo-pager [pager]="pager" />
        </div>

        <div class="panel">
          <div class="filter-bar"><b>{{ 'ข้อความที่ส่งแล้ว' | tx }}</b><span class="secondary grow">{{ 'service_message_log · ล่าสุดก่อน' | tx }}</span></div>
          <div class="table-wrap">
            <table class="bo-table">
              <thead>
                <tr>
                  <th scope="col" class="w-at">{{ 'เวลา' | tx }}</th>
                  <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'เจ้าของ' | tx }}</th>
                  <th scope="col">{{ 'ข้อความ' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'โดย' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (m of log(); track m.id) {
                  <tr class="static">
                    <td class="num">{{ m.at }}</td>
                    <td><span class="chip" [class]="'chip ' + KIND[m.kind].cls">{{ KIND[m.kind].label | tx }}</span></td>
                    <td>{{ m.ownerKey }}<div class="secondary">{{ m.id }}</div></td>
                    <td>{{ m.text | tx }}@if (m.error) {<div class="secondary text-danger">{{ m.error | tx }}</div>}</td>
                    <td>{{ m.by | tx }}</td>
                    <td><span class="chip" [class]="'chip ' + STATUS[m.status].cls">{{ STATUS[m.status].label | tx }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Who is on LINE and what they agreed to: kept by M31, shown here, changed there -->
      <aside class="record-rail">
        <div class="panel actions">
          <b>{{ 'ความยินยอมของเจ้าของ' | tx }}</b>
          <ul class="consents">
            @for (o of ownerRows(); track o.owner.name) {
              <li>
                <b>{{ o.owner.name }}</b>
                @if (o.link; as l) {
                  <span class="secondary">LINE {{ l.displayName }} · {{ l.consent.version }}</span>
                  <span class="flags">
                    <span class="chip" [class]="'chip ' + (l.consent.service ? 'ok' : 'quiet')">{{ 'บริการ' | tx }} {{ l.consent.service ? '✓' : '✕' }}</span>
                    <span class="chip" [class]="'chip ' + (l.consent.reminder ? 'ok' : 'quiet')">{{ 'แจ้งเตือน' | tx }} {{ l.consent.reminder ? '✓' : '✕' }}</span>
                    <span class="chip" [class]="'chip ' + (l.consent.marketing ? 'ok' : 'quiet')">{{ 'การตลาด' | tx }} {{ l.consent.marketing ? '✓' : '✕' }}</span>
                  </span>
                  @if (l.withdrawn) {<span class="secondary text-danger">{{ 'ถอนความยินยอมการแจ้งเตือนเมื่อ {at}' | tx: { at: l.withdrawn.at } }}</span>}
                } @else {
                  <span class="secondary">{{ 'ไม่ได้เชื่อม LINE · ช่องทางที่เลือก: {prefer}' | tx: { prefer: (o.owner.prefer | tx) } }}</span>
                }
              </li>
            }
          </ul>
          <p class="secondary">{{ 'ความยินยอมบันทึกและถอนที่ M31 (PDPA) · การถอนหยุดข้อความของวัตถุประสงค์นั้นทันที' | tx }}</p>
        </div>
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class LineCrmComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly KIND = MESSAGE_KIND;
  protected readonly STATUS = MESSAGE_STATUS;
  protected readonly kinds = KINDS;
  protected readonly kind = signal<MessageKind | ''>('');
  protected readonly summary = computed(() => lineSummary(this.store.clinic.data(), this.store.data()));
  protected readonly box = computed<OutboxItem[]>(() => outbox(this.store.clinic.data(), this.store.data()));
  protected readonly rows = computed(() => this.box().filter(i => !this.kind() || i.kind === this.kind()));
  protected readonly readyCount = computed(() => this.box().filter(i => !i.block).length);
  protected readonly log = computed(() => this.store.data().messages.slice().sort((a, b) => b.at.localeCompare(a.at)));
  protected readonly ownerRows = computed(() => owners(this.store.clinic.data(), this.store.data()));
}
