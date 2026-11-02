/* The connectors at a glance: health, backlog and when each was last heard from, the failed deliveries first, and a way into each (INT-OVW-01, COMPOSED) */
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { baht } from '../../../clinic/data/rail';
import { BackofficeStore } from '../../backoffice.store';
import { DOC_TYPE } from '../../data/finance';
import { accountingHealth, connectors, ERROR_CLASS, errorClassOf, HEALTH } from '../../data/integrations';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-integration-overview',
  imports: [RouterLink, TxPipe, PageHead],
  template: `
    @let a = acc();
    <bo-page-head [heading]="'ภาพรวมการเชื่อมต่อระบบ'" [source]="'INT-OVW-01 · COMPOSED · สถานะจากบันทึกการส่งและผลทดสอบของแต่ละ connector · ไม่มีการแก้ไขที่หน้านี้'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <a class="kpi" role="listitem" routerLink="/backoffice/integrations/accounting/queue" [class.danger]="a.failed"><span class="kpi-value">{{ a.failed }}</span><span class="kpi-label">{{ 'รายการส่งบัญชีที่ล้มเหลว' | tx }}</span>@if (a.failed) {<span class="kpi-sub">{{ (a.oldestFailedHours >= 48 ? 'ค้างนานสุด {n} วัน' : 'ค้างนานสุด {n} ชม.') | tx: { n: a.oldestFailedHours >= 48 ? floor(a.oldestFailedHours / 24) : a.oldestFailedHours } }}</span>}</a>
      <a class="kpi" role="listitem" routerLink="/backoffice/integrations/accounting/queue"><span class="kpi-value">{{ a.queued }}</span><span class="kpi-label">{{ 'รอส่ง' | tx }}</span></a>
      <a class="kpi" role="listitem" routerLink="/backoffice/integrations/accounting/config" [class.danger]="a.lastTest?.result === 'auth-failed'"><span class="kpi-value">{{ a.lastTest?.at?.slice(11) ?? '—' }}</span><span class="kpi-label">{{ 'ทดสอบการเชื่อมต่อล่าสุด' | tx }}</span>@if (a.lastTest; as t) {<span class="kpi-sub">{{ (t.result === 'passed' ? 'ผ่าน' : 'ยืนยันตัวตนไม่ผ่าน') | tx }}</span>}</a>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ a.lastSuccess?.slice(11) ?? '—' }}</span><span class="kpi-label">{{ 'ส่งสำเร็จล่าสุด' | tx }}</span><span class="kpi-sub">{{ a.lastSuccess?.slice(0, 10) }}</span></div>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'Connector ที่มีสัญญา' | tx }}</b><span class="secondary grow">{{ 'ตั้งค่าแล้วไม่ได้แปลว่าทำงานปกติ · ทดสอบผ่านไม่ได้แปลว่าการจับคู่ข้อมูลถูกต้อง' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table connectors">
          <thead><tr>
            <th scope="col">{{ 'Connector' }}</th>
            <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
            <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
            <th scope="col" class="w-kind">{{ 'งานค้าง/ล้มเหลว' | tx }}</th>
            <th scope="col" class="w-at">{{ 'ล่าสุด' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'ความพร้อม' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (c of rows(); track c.key) {
              <tr class="static">
                <td><a class="link" [routerLink]="c.link" [attr.aria-label]="('เปิดการเชื่อมต่อ' | tx) + ' ' + c.name">{{ c.name }}</a></td>
                <td>{{ c.kind | tx }}</td>
                <td><span class="chip" [class]="'chip ' + HEALTH[c.health].cls">{{ HEALTH[c.health].label | tx }}</span></td>
                <td>
                  @if (c.backlog.failed) {<span class="text-danger">{{ 'ล้มเหลว {n}' | tx: { n: c.backlog.failed } }}</span>}
                  @if (c.backlog.queued) {<div class="secondary">{{ 'ในคิว {n}' | tx: { n: c.backlog.queued } }}</div>}
                  @if (!c.backlog.failed && !c.backlog.queued) {<span class="secondary">—</span>}
                </td>
                <td class="num">{{ c.observed ?? '—' }}</td>
                <td>{{ c.readiness | tx }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="secondary foot-note">{{ 'การเชื่อมต่อบางประเภทยังไม่อยู่ในขอบเขต' | tx }}</p>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'การส่งข้อมูลบัญชีที่ไม่สำเร็จ' | tx }}</b><span class="secondary grow">{{ 'เก่าสุดก่อน · ส่งใหม่ที่คิวส่งข้อมูลบัญชี' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead><tr>
            <th scope="col" class="w-ref">{{ 'รหัสส่ง' | tx }}</th>
            <th scope="col">{{ 'เอกสารต้นทาง' | tx }}</th>
            <th scope="col" class="w-amount num">{{ 'จำนวนเงิน' | tx }}</th>
            <th scope="col" class="w-kind">{{ 'ประเภทข้อผิดพลาด' | tx }}</th>
            <th scope="col" class="w-at">{{ 'ส่งครั้งแรก' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (x of failed(); track x.id) {
              <tr class="static">
                <td><a class="link" routerLink="/backoffice/integrations/accounting/queue" [queryParams]="{ q: x.id }">{{ x.id }}</a></td>
                <td>{{ x.document }}<div class="secondary">{{ DOC_TYPE[x.docType] | tx }}</div></td>
                <td class="num">{{ baht(x.amount) }}</td>
                <td>{{ ERROR_CLASS[errorClassOf(x.errorCode) ?? 'other'] | tx }}<div class="secondary">{{ x.errorCode }}</div></td>
                <td class="num">{{ x.firstAt }}</td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีการส่งที่ล้มเหลว' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  host: { class: 'page' },
})
export class IntegrationOverviewComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly HEALTH = HEALTH;
  protected readonly ERROR_CLASS = ERROR_CLASS;
  protected readonly DOC_TYPE = DOC_TYPE;
  protected readonly errorClassOf = errorClassOf;
  protected readonly baht = baht;
  protected readonly floor = Math.floor;
  protected readonly acc = computed(() => accountingHealth(this.store.data()));
  protected readonly rows = computed(() => connectors(this.store.data()));
  protected readonly failed = computed(() => this.store.data().accountingExports.filter(x => x.status === 'failed').sort((a, b) => a.firstAt.localeCompare(b.firstAt)));
}
