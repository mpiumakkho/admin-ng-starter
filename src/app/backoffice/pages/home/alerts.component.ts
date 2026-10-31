/* Alerts and exceptions: what went wrong across the modules, acknowledged here and settled in the owning workflow (ux/menus/01-home.md) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowUpRight, lucideCheck } from '@ng-icons/lucide';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { EXCEPTION_KIND, exceptionGroups, SEVERITY, severityCounts } from '../../data/home';
import type { BoException, Severity } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { ModuleTag, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-alerts',
  imports: [RouterLink, NgIcon, TxPipe, UiButton, PageHead, ModuleTag],
  template: `
    <bo-page-head [heading]="'การแจ้งเตือนและข้อยกเว้น'" [source]="'การชำระ/ส่งออกไม่สำเร็จ สต็อกต่ำ ใกล้หมดอายุ ใบอนุญาต อุปกรณ์เสีย และความเสี่ยง SLA · รับทราบที่นี่ แก้ไขที่โมดูลเจ้าของ'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      @for (s of severityKeys; track s) {
        <button type="button" class="kpi" [class]="'kpi ' + SEVERITY[s].cls" [class.active]="severity() === s" role="listitem" (click)="severity.set(severity() === s ? '' : s)">
          <span class="kpi-value">{{ counts()[s] }}</span><span class="kpi-label">{{ SEVERITY[s].label | tx }}</span>
        </button>
      }
      <div class="kpi" role="listitem"><span class="kpi-value">{{ acknowledged().length }}</span><span class="kpi-label">{{ 'รับทราบแล้ว' | tx }}</span></div>
    </div>

    <div class="panel groups">
      @for (group of groups(); track group.kind) {
        <section class="group" [attr.aria-label]="EXCEPTION_KIND[group.kind] | tx">
          <div class="section-title"><h2>{{ EXCEPTION_KIND[group.kind] | tx }}<span class="count">{{ group.list.length }}</span></h2></div>
          <div class="table-wrap">
            <table class="bo-table alerts">
              <thead>
                <tr>
                  <th scope="col" class="w-priority">{{ 'ระดับ' | tx }}</th>
                  <th scope="col">{{ 'ข้อยกเว้น' | tx }}</th>
                  <th scope="col" class="w-at">{{ 'เมื่อ' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'จัดการใน' | tx }}</th>
                  <th scope="col" class="w-actions"><span class="visually-hidden">{{ 'การทำงาน' | tx }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (x of group.list; track x.id) {
                  <tr class="static">
                    <td><span class="chip" [class]="'chip ' + SEVERITY[x.severity].cls">{{ SEVERITY[x.severity].label | tx }}</span></td>
                    <td><b>{{ x.title | tx }}</b><div class="secondary">{{ x.detail | tx }}</div><div class="secondary"><bo-module [code]="x.module" /> · {{ x.ref }}</div></td>
                    <td class="num">{{ x.at }}</td>
                    <td>{{ x.source | tx }}</td>
                    <td class="row-actions">
                      @if (x.link) {
                        <a uiButton variant="secondary" size="sm" [routerLink]="x.link">{{ 'เปิด workflow' | tx }}<ng-icon [svg]="icons.open" aria-hidden="true" /></a>
                      }
                      <button uiButton size="sm" type="button" (click)="actions.acknowledge(x)"><ng-icon [svg]="icons.check" aria-hidden="true" />{{ 'รับทราบ' | tx }}</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      } @empty {
        <p class="empty">{{ 'ไม่มีข้อยกเว้นที่ยังไม่รับทราบ' | tx }}</p>
      }

      @if (acknowledged().length) {
        <details class="group">
          <summary><h2>{{ 'รับทราบแล้ว' | tx }}<span class="count">{{ acknowledged().length }}</span></h2></summary>
          <div class="table-wrap">
            <table class="bo-table alerts">
              <thead>
                <tr>
                  <th scope="col" class="w-priority">{{ 'ระดับ' | tx }}</th>
                  <th scope="col">{{ 'ข้อยกเว้น' | tx }}</th>
                  <th scope="col" class="w-at">{{ 'รับทราบเมื่อ' | tx }}</th>
                  <th scope="col">{{ 'สิ่งที่ทำ' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (x of acknowledged(); track x.id) {
                  <tr class="static">
                    <td><span class="chip" [class]="'chip ' + SEVERITY[x.severity].cls">{{ SEVERITY[x.severity].label | tx }}</span></td>
                    <td><b>{{ x.title | tx }}</b><div class="secondary">{{ EXCEPTION_KIND[x.kind] | tx }} · {{ x.ref }}</div></td>
                    <td class="num">{{ x.acknowledgedAt }}<div class="secondary">{{ x.acknowledgedBy | tx }}</div></td>
                    <td>{{ x.note ? (x.note | tx) : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class AlertsComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly SEVERITY = SEVERITY;
  protected readonly EXCEPTION_KIND = EXCEPTION_KIND;
  protected readonly severityKeys = Object.keys(SEVERITY) as Severity[];
  protected readonly icons = { open: lucideArrowUpRight, check: lucideCheck };

  protected readonly severity = signal<Severity | ''>('');
  protected readonly counts = computed(() => severityCounts(this.store.data().exceptions));
  protected readonly groups = computed(() => exceptionGroups(this.store.data().exceptions.filter(x => !this.severity() || x.severity === this.severity())));
  protected readonly acknowledged = computed<BoException[]>(() => this.store.data().exceptions.filter(x => !!x.acknowledgedAt).sort((a, b) => b.acknowledgedAt!.localeCompare(a.acknowledgedAt!)));
}
