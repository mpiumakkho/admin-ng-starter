/* Near misses: errors caught before they reached the patient, where in the process they were caught, and what stops them coming back (quality.nearMiss, M12 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { NOW, TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  CATCH_POINT, CATCH_POINTS, CATEGORIES, monthsBack, NEAR_MISS_STATUS, nearMissProblems, type NearMissInput, reporterOf, SAFETY_CATEGORY, SAFETY_PLACES,
} from '../../data/quality';
import type { NearMiss } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

type View = 'open' | 'all';
const BLANK: NearMissInput = { at: `${TODAY}T${NOW}`, category: '', location: '', description: '', caughtAt: '', caughtBy: '', anonymous: false };

@Component({
  selector: 'bo-near-miss',
  imports: [NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'เหตุเกือบพลาด'" [source]="'M12 P2 · ความผิดพลาดที่จับได้ก่อนถึงตัวผู้ป่วย · ทุกรายการต้องมีมาตรการป้องกัน · ยกระดับเป็นอุบัติการณ์ได้เมื่อพบว่าถึงตัวผู้ป่วยหรือเกิดซ้ำ · ต้นแบบก่อนสัญญาหน้าของ M12 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="startRecord()"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'บันทึกเหตุเกือบพลาด' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list" [attr.aria-label]="'จับได้ที่ขั้นตอนใด (12 เดือน)' | tx">
      @for (p of byPoint(); track p.point) {
        <div class="kpi" role="listitem"><span class="kpi-value">{{ p.count }}</span><span class="kpi-label">{{ CATCH_POINT[p.point] | tx }}</span></div>
      }
    </div>

    <div class="split" [class.with-drawer]="selected() || recording()">
      <div class="panel">
        <div class="filter-bar">
          <div class="segmented" role="group" [attr.aria-label]="'มุมมอง' | tx">
            @for (v of views; track v[0]) {<button type="button" [class.active]="view() === v[0]" [attr.aria-pressed]="view() === v[0]" (click)="view.set(v[0])">{{ v[1] | tx }}</button>}
          </div>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table near-miss">
            <thead>
              <tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col">{{ 'เหตุการณ์' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'จับได้ที่' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'ผู้ที่จับได้' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (n of rows(); track n.id) {
                <tr tabindex="0" [class.selected]="n.id === selectedId()" [attr.aria-selected]="n.id === selectedId()" (click)="pick(n.id)" (keydown.enter)="pick(n.id)">
                  <td><b>{{ n.id }}</b><div class="secondary">{{ n.at }}</div></td>
                  <td>{{ n.description | tx }}<div class="secondary">{{ CATEGORY[n.category] | tx }} · {{ n.location | tx }}</div></td>
                  <td>{{ CATCH_POINT[n.caughtAt] | tx }}</td>
                  <td>{{ n.caughtBy | tx }}</td>
                  <td><span class="chip" [class]="'chip ' + STATUS[n.status].cls">{{ STATUS[n.status].label | tx }}</span>@if (n.incidentId) {<div class="secondary">{{ n.incidentId }}</div>}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="5" class="empty">{{ 'ไม่มีเหตุเกือบพลาดในมุมมองนี้' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (recording()) {
        <bo-drawer [heading]="'บันทึกเหตุเกือบพลาด'" [sub]="'ความผิดพลาดที่จับได้ก่อนถึงตัวผู้ป่วย'" (closed)="recording.set(false)">
          <div class="form-grid">
            <label>{{ 'พบเมื่อ' | tx }}<input class="ui-input" type="datetime-local" [value]="form().at" (input)="set('at', $any($event.target).value)" /></label>
            <label>{{ 'ประเภท' | tx }}
              <select class="ui-input" (change)="set('category', $any($event.target).value)">
                <option value="" [selected]="!form().category">{{ 'เลือก' | tx }}</option>
                @for (c of categories; track c) {<option [value]="c" [selected]="c === form().category">{{ CATEGORY[c] | tx }}</option>}
              </select>
            </label>
            <label>{{ 'สถานที่' | tx }}
              <select class="ui-input" (change)="set('location', $any($event.target).value)">
                <option value="" [selected]="!form().location">{{ 'เลือก' | tx }}</option>
                @for (p of places; track p) {<option [value]="p" [selected]="p === form().location">{{ p | tx }}</option>}
              </select>
            </label>
            <label>{{ 'จับได้ที่' | tx }}
              <select class="ui-input" (change)="set('caughtAt', $any($event.target).value)">
                <option value="" [selected]="!form().caughtAt">{{ 'เลือก' | tx }}</option>
                @for (p of points; track p) {<option [value]="p" [selected]="p === form().caughtAt">{{ CATCH_POINT[p] | tx }}</option>}
              </select>
            </label>
            <label class="full">{{ 'ผู้ที่จับได้' | tx }}<input class="ui-input" [value]="form().caughtBy" (input)="set('caughtBy', $any($event.target).value)" /></label>
            <label class="full">{{ 'เกิดอะไรขึ้น' | tx }}<textarea class="ui-input" rows="3" [value]="form().description" (input)="set('description', $any($event.target).value)"></textarea></label>
          </div>
          <label class="check"><input type="checkbox" [checked]="form().anonymous" (change)="set('anonymous', $any($event.target).checked)" />{{ 'ไม่ระบุชื่อผู้รายงาน' | tx }}</label>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="recording.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="record()">{{ 'บันทึก' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as n) {
        <bo-drawer [heading]="n.id" [sub]="(CATCH_POINT[n.caughtAt] | tx) + ' · ' + (n.location | tx)" (closed)="selectedId.set(null)">
          <p>{{ n.description | tx }}</p>
          <dl class="data-grid">
            <dt>{{ 'พบเมื่อ' | tx }}</dt><dd>{{ n.at }}</dd>
            <dt>{{ 'ประเภท' | tx }}</dt><dd>{{ CATEGORY[n.category] | tx }}</dd>
            <dt>{{ 'ผู้ที่จับได้' | tx }}</dt><dd>{{ n.caughtBy | tx }}</dd>
            <dt>{{ 'ผู้รายงาน' | tx }}</dt><dd>{{ reporter(n) | tx }}</dd>
            <dt>{{ 'สถานะ' | tx }}</dt><dd><span class="chip" [class]="'chip ' + STATUS[n.status].cls">{{ STATUS[n.status].label | tx }}</span></dd>
            <dt>{{ 'มาตรการป้องกัน' | tx }}</dt><dd>{{ (n.prevention ?? 'ยังไม่มี') | tx }}</dd>
            @if (n.incidentId) {<dt>{{ 'อุบัติการณ์' | tx }}</dt><dd>{{ n.incidentId }}</dd>}
          </dl>
          <div class="section-title">{{ 'ประวัติ' | tx }}</div>
          <ul class="timeline compact">
            @for (h of n.history; track $index) {<li class="tl"><b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}<div class="secondary">{{ h[0] }} · {{ h[3] | tx }}</div></li>}
          </ul>
          <ng-container foot>
            @if (n.status === 'open') {
              <button uiButton variant="secondary" size="sm" type="button" (click)="actions.escalateNearMiss(n)">{{ 'ยกระดับเป็นอุบัติการณ์ใหม่' | tx }}</button>
              <span class="grow"></span>
              <button uiButton size="sm" type="button" (click)="actions.preventNearMiss(n)">{{ 'บันทึกมาตรการป้องกัน' | tx }}</button>
            } @else {
              <span class="grow"></span>
              <button uiButton variant="secondary" size="sm" type="button" (click)="actions.openRca(n.id, n.description)">{{ 'เปิด RCA' | tx }}</button>
            }
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class NearMissComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly CATCH_POINT = CATCH_POINT;
  protected readonly CATEGORY = SAFETY_CATEGORY;
  protected readonly STATUS = NEAR_MISS_STATUS;
  protected readonly categories = CATEGORIES;
  protected readonly points = CATCH_POINTS;
  protected readonly places = SAFETY_PLACES;
  protected readonly views: [View, string][] = [['open', 'รอมาตรการ'], ['all', 'ทั้งหมด']];

  protected readonly view = signal<View>('open');
  protected readonly selectedId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('id'));
  protected readonly rows = computed(() => this.store.data().nearMisses.filter(n => this.view() === 'all' || n.status === 'open' || n.id === this.selectedId()));
  protected readonly selected = computed(() => this.store.data().nearMisses.find(n => n.id === this.selectedId()) ?? null);
  /** Where in the process errors were caught over the year: the checks that work */
  protected readonly byPoint = computed(() => {
    const from = monthsBack(12)[0];
    const year = this.store.data().nearMisses.filter(n => n.at.slice(0, 7) >= from);
    return CATCH_POINTS.map(point => ({ point, count: year.filter(n => n.caughtAt === point).length }));
  });

  protected readonly recording = signal(false);
  protected readonly form = signal<NearMissInput>({ ...BLANK });
  protected readonly problems = computed(() => nearMissProblems(this.form()));

  protected reporter(n: NearMiss) {
    return reporterOf(n);
  }

  protected pick(id: string) {
    this.recording.set(false);
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected startRecord() {
    this.selectedId.set(null);
    this.form.set({ ...BLANK });
    this.recording.set(true);
  }

  protected set<K extends keyof NearMissInput>(key: K, value: NearMissInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected record() {
    this.actions.recordNearMiss(this.form(), n => {
      this.recording.set(false);
      this.view.set('open');
      this.selectedId.set(n.id);
    });
  }
}
