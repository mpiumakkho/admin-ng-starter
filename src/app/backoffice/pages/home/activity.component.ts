/* Recent activity: what was done, in order, to pick work up again; read only (ux/menus/01-home.md) */
import { Component, computed, inject, signal } from '@angular/core';

import { BackofficeStore } from '../../backoffice.store';
import { MODULES, type ActivityEntry, type Module } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, ModuleTag, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-activity',
  imports: [TxPipe, PageHead, ModuleTag, Drawer],
  template: `
    <bo-page-head [heading]="'กิจกรรมล่าสุด'" [source]="'จากบันทึกตรวจสอบของ BackOffice ตามสิทธิ์ · อ่านอย่างเดียว ไม่ส่งออก'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <label class="check"><input type="checkbox" [checked]="mine()" (change)="mine.set($any($event.target).checked)" />{{ 'เฉพาะของฉัน' | tx }}</label>
          <select class="ui-input" [attr.aria-label]="'โมดูล' | tx" (change)="module.set($any($event.target).value)">
            <option value="" [selected]="!module()">{{ 'ทุกโมดูล' | tx }}</option>
            @for (m of moduleKeys; track m) {<option [value]="m" [selected]="m === module()">{{ m }} · {{ modules[m].name | tx }}</option>}
          </select>
          <label class="date-field"><span class="visually-hidden">{{ 'ตั้งแต่' | tx }}</span><input class="ui-input" type="date" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
          <span class="secondary">–</span>
          <label class="date-field"><span class="visually-hidden">{{ 'ถึง' | tx }}</span><input class="ui-input" type="date" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table activity">
            <thead>
              <tr>
                <th scope="col" class="w-at">{{ 'เมื่อ' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'โดย' | tx }}</th>
                <th scope="col" class="w-module">{{ 'โมดูล' | tx }}</th>
                <th scope="col">{{ 'การกระทำ' | tx }}</th>
                <th scope="col" class="w-ref">{{ 'รายการ' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (e of rows(); track e.id) {
                <tr [class.selected]="e.id === selected()?.id" (click)="pick(e)" tabindex="0" (keydown.enter)="pick(e)" [attr.aria-selected]="e.id === selected()?.id">
                  <td class="num">{{ e.at }}</td>
                  <td>{{ e.by | tx }}</td>
                  <td><bo-module [code]="e.module" /></td>
                  <td><b>{{ e.action | tx }}</b>@if (e.detail) {<div class="secondary">{{ e.detail | tx }}</div>}</td>
                  <td>{{ e.target }}<div class="secondary">{{ e.ref | tx }}</div></td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีกิจกรรมในช่วงที่เลือก' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (selected(); as e) {
        <bo-drawer [heading]="e.action" [sub]="e.at + ' · ' + e.by" (closed)="selected.set(null)">
          <dl class="data-grid">
            <dt>{{ 'โมดูล' | tx }}</dt><dd><bo-module [code]="e.module" /></dd>
            <dt>{{ 'รายการ' | tx }}</dt><dd>{{ e.target }}</dd>
            <dt>{{ 'อ้างอิง' | tx }}</dt><dd>{{ e.ref | tx }}</dd>
            @if (e.detail) {<dt>{{ 'รายละเอียด' | tx }}</dt><dd>{{ e.detail | tx }}</dd>}
            @if (e.before || e.after) {
              <dt>{{ 'ก่อน' | tx }}</dt><dd>{{ (e.before ?? '—') | tx }}</dd>
              <dt>{{ 'หลัง' | tx }}</dt><dd>{{ (e.after ?? '—') | tx }}</dd>
            }
          </dl>
          <p class="secondary">{{ 'บันทึกนี้แก้ไขไม่ได้ · การส่งออกบันทึกตรวจสอบต้องขออนุมัติในรายการอนุมัติ' | tx }}</p>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class ActivityComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly modules = MODULES;
  protected readonly moduleKeys = Object.keys(MODULES) as Module[];

  protected readonly mine = signal(false);
  protected readonly module = signal<Module | ''>('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly selected = signal<ActivityEntry | null>(null);

  protected readonly rows = computed(() => {
    const me = this.store.userName();
    return this.store.data().activity.filter(e => (!this.mine() || e.by === me) && (!this.module() || e.module === this.module())
      && (!this.from() || e.at >= this.from()) && (!this.to() || e.at.slice(0, 10) <= this.to()));
  });

  protected pick(e: ActivityEntry) {
    this.selected.set(this.selected()?.id === e.id ? null : e);
  }
}
