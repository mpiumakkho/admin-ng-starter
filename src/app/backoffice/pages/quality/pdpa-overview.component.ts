/* The DPO's dashboard: the statutory clocks of requests and breaches, the case queues, and how fresh the policies and records are (quality.pdpa, M31 P1 · GATED) */
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { BackofficeStore } from '../../backoffice.store';
import { BREACH_STATUS, breachFlag, CONSENT_VERSION, daysLeft, dpoCounts, DSAR_RIGHT, DSAR_STATUS, dsarFlag, DUE_FLAG, isActive, owedNotices } from '../../data/governance';
import { hoursLeft } from '../../data/quality';
import type { Breach, DsarRequest } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

type Case = { kind: 'dsar'; due: string; item: DsarRequest } | { kind: 'breach'; due: string; item: Breach };

@Component({
  selector: 'bo-pdpa-overview',
  imports: [RouterLink, TxPipe, PageHead],
  template: `
    @let c = counts();
    <bo-page-head [heading]="'ภาพรวมการคุ้มครองข้อมูลส่วนบุคคล'" [source]="'M31 P1 · DSAR 30 วัน · เหตุละเมิด 72 ชม. · ความยินยอม การเก็บรักษา และ RoPA · เส้นตายกำหนดโดย backend · สัญญาการออกแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />
    <p class="notice warn">{{ 'ระบบ PDPA (M31) ยังไม่พร้อม หน้านี้เป็นสัญญาการออกแบบ ตัวเลขทั้งหมดมาจากข้อมูลตัวอย่าง ไม่ใช่ /pdpa/v1/dashboard' | tx }}</p>

    <div class="kpi-strip" role="list">
      <a class="kpi" role="listitem" routerLink="/backoffice/quality/dsar" [class.warn]="c.dsarNear" [class.danger]="c.dsarOverdue">
        <span class="kpi-value">{{ c.dsarOpen }}</span><span class="kpi-label">{{ 'คำขอ DSAR ที่เปิดอยู่' | tx }}</span>
        @if (c.dsarNear || c.dsarOverdue) {<span class="kpi-sub">{{ 'ใกล้ครบ 30 วัน {n} · เกินกำหนด {o}' | tx: { n: c.dsarNear, o: c.dsarOverdue } }}</span>}
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/quality/breach" [class.danger]="c.breachNear">
        <span class="kpi-value">{{ c.breachOpen }}</span><span class="kpi-label">{{ 'เหตุละเมิดที่ยังไม่ปิด' | tx }}</span>
        @if (c.breachNear) {<span class="kpi-sub text-danger">{{ 'ใกล้ครบ 72 ชม. {n}' | tx: { n: c.breachNear } }}</span>}
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/quality/breach" [class.warn]="c.unnotified">
        <span class="kpi-value">{{ c.unnotified }}</span><span class="kpi-label">{{ 'ยังไม่แจ้ง สคส.' | tx }}</span>
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/quality/consent">
        <span class="kpi-value">{{ c.withdrawn30 }}</span><span class="kpi-label">{{ 'ถอนความยินยอม 30 วัน' | tx }}</span>
      </a>
      <a class="kpi" role="listitem" routerLink="/backoffice/quality/audit-exports" [class.warn]="c.exportsPending">
        <span class="kpi-value">{{ c.exportsPending }}</span><span class="kpi-label">{{ 'คำขอส่งออก Audit รออนุมัติ' | tx }}</span>
      </a>
    </div>

    <div class="split pair">
      <div class="panel">
        <div class="filter-bar"><b>{{ 'คำขอและเหตุที่ต้องทำ' | tx }}</b><span class="secondary grow">{{ '{n} รายการ · ใกล้เส้นตายก่อน' | tx: { n: cases().length } }}</span></div>
        <div class="table-wrap">
          <table class="bo-table dpo-cases">
            <thead><tr><th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th><th scope="col">{{ 'เรื่อง' | tx }}</th><th scope="col" class="w-due">{{ 'เส้นตาย' | tx }}</th><th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th></tr></thead>
            <tbody>
              @for (x of cases(); track x.item.id) {
                <tr tabindex="0" (click)="open(x)" (keydown.enter)="open(x)">
                  <td><b>{{ x.item.id }}</b></td>
                  @if (x.kind === 'dsar') {
                    @let f = dsarFlag(x.item);
                    <td>{{ DSAR_RIGHT[x.item.right] | tx }}<div class="secondary">{{ x.item.requester | tx }}</div></td>
                    <td class="num">{{ x.item.statutoryDue }}<div class="secondary" [class.text-danger]="f !== 'ok'">{{ 'เหลือ {n} วัน' | tx: { n: daysLeft(x.item) } }}</div></td>
                    <td><span class="chip" [class]="'chip ' + DSAR_STATUS[x.item.status].cls">{{ DSAR_STATUS[x.item.status].label | tx }}</span>@if (f && f !== 'ok') {<div class="secondary text-danger">{{ DUE_FLAG[f].label | tx }}</div>}</td>
                  } @else {
                    @let f = breachFlag(x.item);
                    <td>{{ x.item.title | tx }}<div class="secondary">{{ 'เหตุละเมิด · กระทบ {n} ราย' | tx: { n: x.item.affected.count } }}</div></td>
                    <td class="num">{{ x.item.statutoryDue }}@if (f) {<div class="secondary" [class.text-danger]="f !== 'ok'">{{ 'เหลือ {n} ชม.' | tx: { n: hours(x.item) } }}</div>}</td>
                    <td><span class="chip" [class]="'chip ' + BREACH_STATUS[x.item.status].cls">{{ BREACH_STATUS[x.item.status].label | tx }}</span>@if (owed(x.item)) {<div class="secondary">{{ 'ต้องแจ้ง {n} ราย' | tx: { n: owed(x.item) } }}</div>}</td>
                  }
                </tr>
              } @empty {
                <tr class="static"><td colspan="4" class="empty">{{ 'ไม่มีคำขอหรือเหตุที่เปิดอยู่ในข้อมูลตัวอย่าง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="filter-bar"><b>{{ 'ความทันสมัยของนโยบายและบันทึก' | tx }}</b></div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead><tr><th scope="col">{{ 'รายการ' | tx }}</th><th scope="col" class="w-due">{{ 'ล่าสุด' | tx }}</th><th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th></tr></thead>
            <tbody>
              <tr class="static"><td>{{ 'แบบฟอร์มความยินยอม (settings/10)' | tx }}</td><td>{{ version }}</td><td><span class="chip quiet">{{ 'GATED' }}</span></td></tr>
              <tr class="static"><td>{{ 'RoPA ที่สร้างล่าสุด' | tx }}</td><td>{{ lastRopa()?.at ?? '—' }}</td><td><a class="link" routerLink="/backoffice/quality/ropa">{{ 'เปิด RoPA' | tx }}</a></td></tr>
              <tr class="static"><td>{{ 'กิจกรรมใน RoPA ที่ไม่ได้ทบทวนเกิน 1 ปี' | tx }}</td><td class="num">{{ c.ropaStale }}</td>
                <td><span class="chip" [class]="'chip ' + (c.ropaStale ? 'warn' : 'ok')">{{ (c.ropaStale ? 'ต้องทบทวน' : 'ทันสมัย') | tx }}</span></td></tr>
              <tr class="static"><td>{{ 'ข้อมูลที่เกินระยะเก็บ (รอ auto-purge)' | tx }}</td><td class="num">{{ c.pastWindow.toLocaleString('en-US') }}</td>
                <td><a class="link" routerLink="/backoffice/quality/retention">{{ 'การเก็บข้อมูล' | tx }}</a></td></tr>
              <tr class="static"><td>{{ 'การโอนข้ามประเทศที่รอประเมิน' | tx }}</td><td class="num">{{ pendingTransfers() }}</td>
                <td><span class="chip" [class]="'chip ' + (pendingTransfers() ? 'warn' : 'ok')">{{ (pendingTransfers() ? 'รอประเมิน' : 'ประเมินแล้ว') | tx }}</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  host: { class: 'page' },
})
export class PdpaOverviewComponent {
  private readonly store = inject(BackofficeStore);
  private readonly router = inject(Router);
  protected readonly DSAR_RIGHT = DSAR_RIGHT;
  protected readonly DSAR_STATUS = DSAR_STATUS;
  protected readonly BREACH_STATUS = BREACH_STATUS;
  protected readonly DUE_FLAG = DUE_FLAG;
  protected readonly version = CONSENT_VERSION;
  protected readonly dsarFlag = dsarFlag;
  protected readonly breachFlag = breachFlag;
  protected readonly daysLeft = daysLeft;

  protected readonly counts = computed(() => dpoCounts(this.store.data()));
  protected readonly cases = computed(() => {
    const d = this.store.data();
    const rows: Case[] = [
      ...d.dsars.filter(isActive).map(item => ({ kind: 'dsar' as const, due: `${item.statutoryDue} 23:59`, item })),
      ...d.breaches.filter(b => b.status !== 'closed').map(item => ({ kind: 'breach' as const, due: item.statutoryDue, item })),
    ];
    return rows.sort((a, b) => a.due.localeCompare(b.due));
  });
  protected readonly lastRopa = computed(() => this.store.data().ropaExports[0]);
  protected readonly pendingTransfers = computed(() => this.store.data().crossBorder.filter(c => c.status === 'pending').length);

  protected hours(b: Breach) {
    return Math.max(0, Math.floor(hoursLeft(b.statutoryDue)));
  }

  protected owed(b: Breach) {
    return owedNotices(b).length;
  }

  protected open(x: Case) {
    this.router.navigate([x.kind === 'dsar' ? '/backoffice/quality/dsar' : '/backoffice/quality/breach', x.item.id]);
  }
}
