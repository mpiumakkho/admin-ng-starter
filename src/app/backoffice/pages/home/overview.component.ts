/* The work overview: everything that waits in every module, the most pressing first (ux/menus/01-home.md) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowUpRight } from '@ng-icons/lucide';

import { UiButton } from '../../../user-management/ui';
import { BackofficeStore } from '../../backoffice.store';
import { daysUntil, PRIORITY, STATUS, workload } from '../../data/home';
import { MODULES, type Module, type WorkItem } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, ModuleTag, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-overview',
  imports: [RouterLink, NgIcon, TxPipe, UiButton, PageHead, ModuleTag, Drawer],
  template: `
    <bo-page-head [heading]="'ภาพรวมงาน'" [source]="'รวมจาก M11 M06 M22 M24 M28 M31 ตามสิทธิ์ · เปิดรายการต้นทางเพื่อแก้ไข'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <!-- How much waits, by module -->
    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ items().length }}</span><span class="kpi-label">{{ 'รายการทั้งหมด' | tx }}</span></div>
      <div class="kpi danger" role="listitem"><span class="kpi-value">{{ critical() }}</span><span class="kpi-label">{{ 'วิกฤต' | tx }}</span></div>
      @for (w of load(); track w.module) {
        <button type="button" class="kpi" [class.active]="module() === w.module" role="listitem" (click)="module.set(module() === w.module ? '' : w.module)">
          <span class="kpi-value">{{ w.count }}@if (w.critical) {<span class="kpi-sub danger">{{ w.critical }}</span>}</span>
          <span class="kpi-label">{{ w.module }} · {{ modules[w.module].name | tx }}</span>
        </button>
      }
    </div>

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <input class="ui-input search" type="search" [placeholder]="'ค้นหาชื่อ รหัส หรือรายละเอียด' | tx" [attr.aria-label]="'ค้นหา' | tx" [value]="q()" (input)="q.set($any($event.target).value)" />
          <select class="ui-input" [attr.aria-label]="'โมดูล' | tx" (change)="module.set($any($event.target).value)">
            <option value="" [selected]="!module()">{{ 'ทุกโมดูล' | tx }}</option>
            @for (m of moduleKeys; track m) {<option [value]="m" [selected]="m === module()">{{ m }} · {{ modules[m].name | tx }}</option>}
          </select>
          <select class="ui-input" [attr.aria-label]="'สถานะ' | tx" (change)="status.set($any($event.target).value)">
            <option value="" [selected]="!status()">{{ 'ทุกสถานะ' | tx }}</option>
            @for (s of statusKeys; track s) {<option [value]="s" [selected]="s === status()">{{ STATUS[s].label | tx }}</option>}
          </select>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table worklist">
            <thead>
              <tr>
                <th scope="col" class="w-priority">{{ 'ความเร่งด่วน' | tx }}</th>
                <th scope="col" class="w-module">{{ 'โมดูล' | tx }}</th>
                <th scope="col">{{ 'งาน' | tx }}</th>
                <th scope="col" class="w-due">{{ 'กำหนด' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'ผู้รับผิดชอบ' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (item of rows(); track item.id) {
                <tr [class.selected]="item.id === selected()?.id" (click)="pick(item)" tabindex="0" (keydown.enter)="pick(item)" [attr.aria-selected]="item.id === selected()?.id">
                  <td><span class="chip" [class]="'chip ' + PRIORITY[item.priority].cls">{{ PRIORITY[item.priority].label | tx }}</span></td>
                  <td><bo-module [code]="item.module" /></td>
                  <td><b>{{ item.title | tx }}</b><div class="secondary">{{ item.kind | tx }} · {{ item.ref }}</div></td>
                  <td class="num" [class.text-danger]="daysUntil(item.due) < 0">{{ dueText(item.due) | tx: { n: absDays(item.due) } }}</td>
                  <td>{{ item.owner | tx }}</td>
                  <td><span class="chip" [class]="'chip ' + STATUS[item.status].cls">{{ STATUS[item.status].label | tx }}</span></td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ 'ไม่มีงานที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (selected(); as item) {
        <bo-drawer [heading]="item.title" [sub]="item.kind + ' · ' + item.ref" (closed)="selected.set(null)">
          <dl class="data-grid">
            <dt>{{ 'โมดูล' | tx }}</dt><dd><bo-module [code]="item.module" /></dd>
            <dt>{{ 'ความเร่งด่วน' | tx }}</dt><dd><span class="chip" [class]="'chip ' + PRIORITY[item.priority].cls">{{ PRIORITY[item.priority].label | tx }}</span></dd>
            <dt>{{ 'กำหนด' | tx }}</dt><dd>{{ item.due }} · {{ dueText(item.due) | tx: { n: absDays(item.due) } }}</dd>
            <dt>{{ 'ผู้รับผิดชอบ' | tx }}</dt><dd>{{ item.owner | tx }}</dd>
            <dt>{{ 'สถานะ' | tx }}</dt><dd>{{ STATUS[item.status].label | tx }}</dd>
            <dt>{{ 'รายละเอียด' | tx }}</dt><dd>{{ item.detail | tx }}</dd>
          </dl>
          <p class="secondary">{{ 'หน้านี้รวมงานจากหลายโมดูล — การแก้ไขทำที่รายการต้นทางในโมดูลเจ้าของเท่านั้น' | tx }}</p>
          <ng-container foot>
            @if (item.link) {
              <a uiButton size="sm" [routerLink]="item.link">{{ 'เปิดรายการต้นทาง' | tx }}<ng-icon [svg]="open" aria-hidden="true" /></a>
            } @else {
              <span class="secondary">{{ 'หน้าของโมดูลนี้ยังไม่เปิดใช้ใน BackOffice' | tx }}</span>
            }
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class OverviewComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly PRIORITY = PRIORITY;
  protected readonly STATUS = STATUS;
  protected readonly modules = MODULES;
  protected readonly moduleKeys = Object.keys(MODULES) as Module[];
  protected readonly statusKeys = Object.keys(STATUS) as WorkItem['status'][];
  protected readonly daysUntil = daysUntil;
  protected readonly open = lucideArrowUpRight;

  protected readonly q = signal('');
  protected readonly module = signal<Module | ''>('');
  protected readonly status = signal<WorkItem['status'] | ''>('');
  protected readonly selected = signal<WorkItem | null>(null);

  protected readonly items = this.store.worklist;
  protected readonly critical = computed(() => this.items().filter(i => i.priority === 'critical').length);
  protected readonly load = computed(() => workload(this.items()));
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.items().filter(i => (!this.module() || i.module === this.module()) && (!this.status() || i.status === this.status())
      && (!q || `${i.title} ${i.detail} ${i.ref} ${i.kind}`.toLowerCase().includes(q)));
  });

  protected pick(item: WorkItem) {
    this.selected.set(this.selected()?.id === item.id ? null : item);
  }

  protected absDays(due: string) {
    return Math.abs(daysUntil(due));
  }

  protected dueText(due: string): string {
    const d = daysUntil(due);
    return d < 0 ? 'เกินกำหนด {n} วัน' : d === 0 ? 'วันนี้' : 'อีก {n} วัน';
  }
}
