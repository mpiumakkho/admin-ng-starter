/* Medication inventory: every drug's stock as the shelf has it, what is below its reorder point, and when it was last counted (INV-STK-01) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck } from '@ng-icons/lucide';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { CONTROL_SYSTEM, EXPIRY_BUCKETS, locationsOf, LOT_STATE, stockList } from '../../data/inventory';
import type { ExpiryBucket, StockItem } from '../../data/inventory';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-stock',
  imports: [PagerFoot, RouterLink, NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'คลังยา'" [source]="'M06 · คงเหลือ จุดสั่งเติม และการนับล่าสุดเป็นของระบบ ไม่คำนวณใหม่ในหน้านี้ · ปรับสต็อกได้ผ่านการรับเข้าและการนับเท่านั้น'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ all().length }}</span><span class="kpi-label">{{ 'รายการยาในทะเบียน' | tx }}</span></div>
      <button type="button" class="kpi" [class.warn]="low() > 0" [class.active]="lowOnly()" role="listitem" (click)="lowOnly.set(!lowOnly())"><span class="kpi-value">{{ low() }}</span><span class="kpi-label">{{ 'ต่ำกว่าจุดสั่งเติม' | tx }}</span></button>
      <button type="button" class="kpi" [class.active]="controlledOnly()" role="listitem" (click)="controlledOnly.set(!controlledOnly())"><span class="kpi-value">{{ controlled() }}</span><span class="kpi-label">{{ 'ยาควบคุม' | tx }}</span></button>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ lots() }}</span><span class="kpi-label">{{ 'lot ที่มีของ' | tx }}</span></div>
    </div>

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <input class="ui-input search" type="search" [placeholder]="'ค้นหายาหรือรหัส' | tx" [attr.aria-label]="'ค้นหายา' | tx" [value]="q()" (input)="q.set($any($event.target).value)" />
          <select class="ui-input" [attr.aria-label]="'ตำแหน่งจัดเก็บ' | tx" (change)="location.set($any($event.target).value)">
            <option value="" [selected]="!location()">{{ 'ทุกตำแหน่ง' | tx }}</option>
            @for (l of locations(); track l) {<option [value]="l" [selected]="l === location()">{{ l | tx }}</option>}
          </select>
          <label class="check"><input type="checkbox" [checked]="lowOnly()" (change)="lowOnly.set($any($event.target).checked)" />{{ 'ต่ำกว่าจุดสั่งเติม' | tx }}</label>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table stock">
            <thead>
              <tr>
                <th scope="col">{{ 'รายการยา' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'คงเหลือ' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'จุดสั่งเติม' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะสต็อก' | tx }}</th>
                <th scope="col" class="w-at">{{ 'นับล่าสุด' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'ควบคุม' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (i of pager.rows(); track i.drug.id) {
                <tr tabindex="0" [class.selected]="i.drug.id === selectedId()" [attr.aria-selected]="i.drug.id === selectedId()" (click)="pick(i)" (keydown.enter)="pick(i)">
                  <td><b>{{ i.drug.name }}</b><div class="secondary">{{ i.drug.id }} · {{ i.drug.form | tx }} · {{ i.location | tx }}</div></td>
                  <td class="num" [class.text-danger]="i.isLow">{{ i.onHand ?? '—' }} {{ i.drug.unit | tx }}</td>
                  <td class="num">{{ i.drug.reorderThreshold }}</td>
                  <td>
                    @if (i.isLow) {<span class="chip danger"><ng-icon [svg]="icons.alert" aria-hidden="true" /> {{ 'ต่ำกว่าจุดเติม' | tx }}</span>}
                    @else {<span class="chip ok"><ng-icon [svg]="icons.ok" aria-hidden="true" /> {{ 'พอใช้' | tx }}</span>}
                  </td>
                  <td class="num">{{ i.drug.lastCountAt ?? '—' }}@if (i.drug.lastCountBy) {<div class="secondary">{{ i.drug.lastCountBy | tx }}</div>}</td>
                  <td>@if (i.controlled) {<span class="chip" [class]="'chip ' + CONTROL[i.drug.classSystem].cls">{{ CONTROL[i.drug.classSystem].short | tx }} {{ i.drug.category }}</span>} @else {<span class="muted">—</span>}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ (filtered() ? 'ไม่มีรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีรายการยาในทะเบียน') | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (selected(); as i) {
        <bo-drawer [heading]="i.drug.name" [sub]="i.drug.id + ' · ' + i.drug.form + ' · ' + i.location" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'คงเหลือ' | tx }}</dt><dd [class.text-danger]="i.isLow">{{ i.onHand ?? '—' }} {{ i.drug.unit | tx }} · {{ (i.isLow ? 'ต่ำกว่าจุดเติม' : 'พอใช้') | tx }}</dd>
            <dt>{{ 'จุดสั่งเติม' | tx }}</dt><dd>{{ i.drug.reorderThreshold }} {{ i.drug.unit | tx }}</dd>
            <dt>{{ 'นับล่าสุด' | tx }}</dt><dd>{{ i.drug.lastCountAt ? i.drug.lastCountAt + ' · ' + (i.drug.lastCountBy | tx) : ('ยังไม่เคยนับ' | tx) }}</dd>
            <dt>{{ 'หมดอายุถัดไป' | tx }}</dt><dd>@if (i.nearest; as n) {{{ n.expiry }} · <span class="chip" [class]="'chip ' + bucket(n.bucket).cls">{{ bucket(n.bucket).label | tx }}</span>} @else {—}</dd>
            <dt>{{ 'ควบคุม' | tx }}</dt><dd>{{ CONTROL[i.drug.classSystem].label | tx }}@if (i.controlled) { · {{ 'ประเภท' | tx }} {{ i.drug.category }} · {{ (i.drug.requiresWitnessDispense ? 'เบิกต้องมีพยาน' : 'เบิกไม่ต้องมีพยาน') | tx }}}</dd>
          </dl>
          <p class="secondary">{{ 'Lot ทั้งหมด' | tx }} · {{ 'ข้อมูล lot เป็นตัวอย่าง — Read API ของ lot ยังไม่อนุมัติ (GATED)' | tx }}</p>
          <table class="mini-lines">
            <thead><tr><th>Lot</th><th>{{ 'วันหมดอายุ' | tx }}</th><th class="num">{{ 'คงเหลือ' | tx }}</th><th>{{ 'สถานะ' | tx }}</th></tr></thead>
            <tbody>
              @for (l of i.lots; track l.lot) {
                <tr><td>{{ l.lot }}<div class="secondary">{{ l.location | tx }}</div></td><td>{{ l.expiry }}</td><td class="num">{{ l.qty ?? '—' }}</td><td><span class="chip" [class]="'chip ' + LOT_STATE[l.state].cls">{{ LOT_STATE[l.state].label | tx }}</span></td></tr>
              } @empty {
                <tr><td colspan="4" class="muted">{{ 'ยังไม่มี lot ในคลัง' | tx }}</td></tr>
              }
            </tbody>
          </table>
          <ng-container foot>
            @if (i.isLow) {<a class="link" routerLink="/backoffice/inventory/reorder">{{ 'ไปรายการต้องเติม' | tx }}</a>}
            <span class="grow"></span>
            <button uiButton size="sm" type="button" (click)="actions.openItem(i.drug.id)">{{ 'เปิดรายการยา' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class StockComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly route = inject(ActivatedRoute);
  protected readonly icons = { alert: lucideCircleAlert, ok: lucideCircleCheck };
  protected readonly CONTROL = CONTROL_SYSTEM;
  protected readonly LOT_STATE = LOT_STATE;

  protected readonly q = signal('');
  protected readonly location = signal('');
  protected readonly lowOnly = signal(this.route.snapshot.queryParamMap.get('low') === '1');
  protected readonly controlledOnly = signal(false);
  protected readonly selectedId = signal<string | null>(null);

  protected readonly all = this.store.stock;
  protected readonly low = computed(() => this.all().filter(i => i.isLow).length);
  protected readonly controlled = computed(() => this.all().filter(i => i.controlled).length);
  protected readonly lots = computed(() => this.all().flatMap(i => i.lots).filter(l => (l.qty ?? 0) > 0).length);
  protected readonly locations = computed(() => locationsOf(this.all()));
  protected readonly filtered = computed(() => !!(this.q() || this.location() || this.lowOnly() || this.controlledOnly()));
  protected readonly rows = computed(() => stockList(this.all(), { q: this.q(), location: this.location(), lowOnly: this.lowOnly(), controlledOnly: this.controlledOnly() }));
  protected readonly selected = computed(() => this.all().find(i => i.drug.id === this.selectedId()) ?? null);

  protected pick(i: StockItem) {
    this.selectedId.set(this.selectedId() === i.drug.id ? null : i.drug.id);
  }

  protected bucket(key: ExpiryBucket) {
    return EXPIRY_BUCKETS.find(b => b.key === key)!;
  }
}
