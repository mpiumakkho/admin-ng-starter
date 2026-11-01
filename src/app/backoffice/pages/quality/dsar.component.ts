/* Data subject requests: the worklist of the eight rights against their thirty days, taken in here and worked on their own page (GOV-DSAR-01, M31 · GATED) */
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { daysLeft, DSAR_RIGHT, DSAR_STATUS, dsarFlag, dsarProblems, DUE_FLAG, type DsarInput, isActive, RIGHTS } from '../../data/governance';
import { CHANNEL, CHANNELS } from '../../data/quality';
import type { DsarRequest, DsarRight } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

const BLANK: DsarInput = { right: '', requester: '', ownerKey: '', pets: '', hns: '', channel: 'email', scope: '' };

@Component({
  selector: 'bo-dsar',
  imports: [NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'คำขอใช้สิทธิ์เจ้าของข้อมูล'" [source]="'GOV-DSAR-01 · M31 · 8 สิทธิตาม PDPA · ตอบภายใน 30 วัน (เส้นตายจาก backend) · ยืนยันตัวตนก่อนส่งมอบ · สัญญาการออกแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="intake.set(true)"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'รับคำขอใหม่' | tx }}</button>
    </bo-page-head>
    <p class="notice warn">{{ 'ระบบ PDPA (M31) ยังไม่พร้อม หน้านี้เป็นสัญญาการออกแบบ' | tx }}</p>

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ open().length }}</span><span class="kpi-label">{{ 'เปิดค้าง' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.warn]="near()"><span class="kpi-value">{{ near() }}</span><span class="kpi-label">{{ 'ใกล้ครบ 30 วัน' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.danger]="overdue()"><span class="kpi-value">{{ overdue() }}</span><span class="kpi-label">{{ 'เกินกำหนด' | tx }}</span></div>
    </div>

    <div class="split" [class.with-drawer]="intake()">
      <div class="panel">
        <div class="filter-bar">
          <select class="ui-input" [attr.aria-label]="'สิทธิ์ที่ขอ' | tx" (change)="right.set($any($event.target).value)">
            <option value="">{{ 'ทุกสิทธิ์' | tx }}</option>
            @for (r of rights; track r) {<option [value]="r">{{ RIGHT[r] | tx }}</option>}
          </select>
          <select class="ui-input" [attr.aria-label]="'สถานะ' | tx" (change)="status.set($any($event.target).value)">
            <option value="">{{ 'ทุกสถานะ' | tx }}</option>
            @for (s of statuses; track s) {<option [value]="s">{{ STATUS[s].label | tx }}</option>}
          </select>
          <label class="check"><input type="checkbox" [checked]="nearOnly()" (change)="nearOnly.set($any($event.target).checked)" />{{ 'เฉพาะใกล้ครบกำหนด' | tx }}</label>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table dsar">
            <thead>
              <tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col">{{ 'ผู้ขอ / เจ้าของข้อมูล' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'สิทธิ์ที่ขอ' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                <th scope="col" class="w-due">{{ 'ครบกำหนด (30 วัน)' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                @let f = flag(r);
                <tr tabindex="0" (click)="open$(r)" (keydown.enter)="open$(r)">
                  <td><b>{{ r.id }}</b><div class="secondary">{{ r.receivedAt }}</div></td>
                  <td>{{ r.requester | tx }}<div class="secondary">@if (r.pets.length) {<span>{{ r.pets.join(', ') }} · </span>}{{ CHANNEL[r.channel] | tx }}</div></td>
                  <td>{{ RIGHT[r.right] | tx }}</td>
                  <td><span class="chip" [class]="'chip ' + STATUS[r.status].cls">{{ STATUS[r.status].label | tx }}</span></td>
                  <td class="num">{{ r.statutoryDue }}
                    @if (f) {<div class="secondary" [class.text-danger]="f !== 'ok'">@if (f !== 'ok') {<span aria-hidden="true">⚠ </span>}{{ DUE[f].label | tx }} · {{ 'เหลือ {n} วัน' | tx: { n: left(r) } }}</div>}
                  </td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="5" class="empty">{{ (filtered() ? 'ไม่มีคำขอที่ตรงกับตัวกรอง' : 'ยังไม่มีคำขอ') | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (intake()) {
        <bo-drawer [heading]="'รับคำขอใหม่'" [sub]="'นับ 30 วันตั้งแต่รับคำขอ'" (closed)="intake.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'สิทธิ์ที่ขอ' | tx }}
              <select class="ui-input" (change)="set('right', $any($event.target).value)">
                <option value="" [selected]="!form().right">{{ 'เลือก' | tx }}</option>
                @for (r of rights; track r) {<option [value]="r" [selected]="r === form().right">{{ RIGHT[r] | tx }}</option>}
              </select>
            </label>
            <label>{{ 'ผู้ขอ' | tx }}<input class="ui-input" [value]="form().requester" (input)="set('requester', $any($event.target).value)" /></label>
            <label>{{ 'เจ้าของในทะเบียน' | tx }}
              <select class="ui-input" (change)="set('ownerKey', $any($event.target).value)">
                <option value="" [selected]="!form().ownerKey">{{ 'ไม่พบในทะเบียน' | tx }}</option>
                @for (o of owners(); track o) {<option [value]="o" [selected]="o === form().ownerKey">{{ o }}</option>}
              </select>
            </label>
            <label>{{ 'สัตว์ (คั่นด้วย ,)' | tx }}<input class="ui-input" [value]="form().pets" (input)="set('pets', $any($event.target).value)" /></label>
            <label>{{ 'HN (คั่นด้วย ,)' | tx }}<input class="ui-input" [placeholder]="'เช่น HN-180533' | tx" [value]="form().hns" (input)="set('hns', $any($event.target).value)" /></label>
            <label class="full">{{ 'ช่องทางรับเรื่อง' | tx }}
              <select class="ui-input" (change)="set('channel', $any($event.target).value)">
                @for (c of channels; track c) {<option [value]="c" [selected]="c === form().channel">{{ CHANNEL[c] | tx }}</option>}
              </select>
            </label>
            <label class="full">{{ 'ขอบเขตข้อมูลที่ขอ' | tx }}<textarea class="ui-input" rows="3" [value]="form().scope" (input)="set('scope', $any($event.target).value)"></textarea></label>
          </div>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="intake.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="take()">{{ 'รับคำขอ' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class DsarComponent {
  private readonly store = inject(BackofficeStore);
  private readonly actions = inject(BackofficeActions);
  private readonly router = inject(Router);
  protected readonly plus = lucidePlus;
  protected readonly RIGHT = DSAR_RIGHT;
  protected readonly STATUS = DSAR_STATUS;
  protected readonly DUE = DUE_FLAG;
  protected readonly CHANNEL = CHANNEL;
  protected readonly rights = RIGHTS;
  protected readonly channels = CHANNELS;
  protected readonly statuses = Object.keys(DSAR_STATUS) as DsarRequest['status'][];

  protected readonly right = signal<DsarRight | ''>('');
  protected readonly status = signal<DsarRequest['status'] | ''>('');
  protected readonly nearOnly = signal(false);
  protected readonly filtered = computed(() => !!(this.right() || this.status() || this.nearOnly()));
  protected readonly open = computed(() => this.store.data().dsars.filter(isActive));
  protected readonly near = computed(() => this.open().filter(r => dsarFlag(r) === 'near').length);
  protected readonly overdue = computed(() => this.open().filter(r => dsarFlag(r) === 'overdue').length);
  protected readonly rows = computed(() => this.store.data().dsars
    .filter(r => (!this.right() || r.right === this.right()) && (!this.status() || r.status === this.status()) && (!this.nearOnly() || (dsarFlag(r) ?? 'ok') !== 'ok'))
    .sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || a.statutoryDue.localeCompare(b.statutoryDue)));

  protected readonly intake = signal(false);
  protected readonly form = signal<DsarInput>({ ...BLANK });
  protected readonly problems = computed(() => dsarProblems(this.form()));
  protected readonly owners = computed(() => Object.keys(this.store.clinic.data().owners).sort());

  protected flag(r: DsarRequest) {
    return dsarFlag(r);
  }

  protected left(r: DsarRequest) {
    return daysLeft(r);
  }

  protected open$(r: DsarRequest) {
    this.router.navigate(['/backoffice/quality/dsar', r.id]);
  }

  protected set<K extends keyof DsarInput>(key: K, value: DsarInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected take() {
    this.actions.intakeDsar(this.form(), r => {
      this.intake.set(false);
      this.form.set({ ...BLANK });
      this.router.navigate(['/backoffice/quality/dsar', r.id]);
    });
  }
}
