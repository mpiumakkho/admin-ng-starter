/* The consent registry: coverage per purpose, every grant and withdrawal by owner, LINE's read from its link (GOV-CNS-01, M31 · GATED) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { CONSENT_PURPOSE, CONSENT_STATUS, CONSENT_VERSION, consentLedger, coverage, PURPOSES, withdrawBlock } from '../../data/governance';
import type { ConsentGrant, ConsentPurpose } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

const CHANNELS = ['แบบฟอร์มที่โรงพยาบาล', 'LINE', 'อีเมล'];

@Component({
  selector: 'bo-consent',
  imports: [PagerFoot, NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'ทะเบียนความยินยอม'" [source]="'GOV-CNS-01 · M31 · consent_grant ต่อเจ้าของและวัตถุประสงค์ · ความยินยอมของ LINE อ่านจาก LINE CRM (M15) · แก้แบบฟอร์มที่ settings/10 · สัญญาการออกแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="recording.set(true)"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'บันทึกความยินยอม' | tx }}</button>
    </bo-page-head>
    <p class="notice warn">{{ 'ระบบ PDPA (M31) ยังไม่พร้อม ความครอบคลุมนับจากข้อมูลตัวอย่างในเครื่อง ไม่ใช่ /consent/summary' | tx }}</p>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'ความครอบคลุมตามวัตถุประสงค์' | tx }}</b><span class="secondary grow">{{ 'แบบฟอร์มฉบับใช้งาน {v}' | tx: { v: version } }}</span></div>
      <div class="table-wrap">
        <table class="bo-table coverage">
          <thead><tr>
            <th scope="col">{{ 'วัตถุประสงค์' | tx }}</th>
            <th scope="col" class="num w-kind">{{ 'ให้ความยินยอม' | tx }}</th>
            <th scope="col" class="num w-kind">{{ 'ทั้งหมด' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'ความครอบคลุม' | tx }}</th>
            <th scope="col" class="w-kind">{{ 'บังคับ' | tx }}</th>
            <th scope="col" class="w-kind">{{ 'เวอร์ชัน' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (c of cover(); track c.purpose) {
              <tr class="static">
                <td>{{ PURPOSE[c.purpose].label | tx }}<div class="secondary">{{ PURPOSE[c.purpose].source | tx }}@if (c.withdrawn) { · {{ 'ถอนแล้ว {n}' | tx: { n: c.withdrawn } }}}</div></td>
                <td class="num">{{ c.granted }}</td>
                <td class="num">{{ c.total }}</td>
                <td><div class="sum-row"><b>{{ c.percent }}%</b></div><div class="bar" role="img" [attr.aria-label]="c.percent + '%'"><span [style.width.%]="c.percent"></span></div></td>
                <td>{{ (PURPOSE[c.purpose].required ? 'บังคับเมื่อเชื่อม LINE' : 'ไม่บังคับ') | tx }}</td>
                <td>{{ c.versions.join(', ') }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="split" [class.with-drawer]="recording()">
      <div class="panel">
        <div class="filter-bar">
          <input class="ui-input search" type="search" [attr.aria-label]="'ค้นหาเจ้าของ' | tx" [placeholder]="'ค้นหาเจ้าของ' | tx" (input)="query.set($any($event.target).value)" />
          <select class="ui-input" [attr.aria-label]="'วัตถุประสงค์' | tx" (change)="purpose.set($any($event.target).value)">
            <option value="">{{ 'ทุกวัตถุประสงค์' | tx }}</option>
            @for (p of purposes; track p) {<option [value]="p">{{ PURPOSE[p].label | tx }}</option>}
          </select>
          <select class="ui-input" [attr.aria-label]="'สถานะ' | tx" (change)="status.set($any($event.target).value)">
            <option value="">{{ 'ทุกสถานะ' | tx }}</option>
            @for (s of statuses; track s) {<option [value]="s">{{ STATUS[s].label | tx }}</option>}
          </select>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table consents-ledger">
            <thead><tr>
              <th scope="col">{{ 'เจ้าของข้อมูล' | tx }}</th>
              <th scope="col">{{ 'วัตถุประสงค์' | tx }}</th>
              <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'เวอร์ชัน' | tx }}</th>
              <th scope="col" class="w-at">{{ 'ให้เมื่อ / ถอนเมื่อ' | tx }}</th>
              <th scope="col" class="w-send"><span class="visually-hidden">{{ 'การดำเนินการ' | tx }}</span></th>
            </tr></thead>
            <tbody>
              @for (g of pager.rows(); track g.id) {
                <tr class="static">
                  <td><b>{{ g.ownerKey }}</b><div class="secondary">{{ g.channel | tx }}</div></td>
                  <td>{{ PURPOSE[g.purpose].label | tx }}</td>
                  <td><span class="chip" [class]="'chip ' + STATUS[g.status].cls">{{ STATUS[g.status].label | tx }}</span></td>
                  <td>{{ g.version }}</td>
                  <td class="num">{{ g.withdrawnAt ?? g.at }}</td>
                  <td>@if (g.status === 'granted' && !blocked(g)) {<button uiButton variant="secondary" size="sm" type="button" (click)="actions.withdrawConsent(g)">{{ 'ถอนความยินยอม' | tx }}</button>}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ 'ไม่มีความยินยอมที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (recording()) {
        <bo-drawer [heading]="'บันทึกความยินยอม'" [sub]="'ความยินยอมที่ M31 เก็บเอง · LINE บันทึกที่ LINE CRM'" (closed)="recording.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'เจ้าของข้อมูล' | tx }}
              <select class="ui-input" (change)="owner.set($any($event.target).value)">
                <option value="" [selected]="!owner()">{{ 'เลือก' | tx }}</option>
                @for (o of owners(); track o) {<option [value]="o" [selected]="o === owner()">{{ o }}</option>}
              </select>
            </label>
            <label class="full">{{ 'วัตถุประสงค์' | tx }}
              <select class="ui-input" (change)="own.set($any($event.target).value)">
                @for (p of ownPurposes; track p) {<option [value]="p" [selected]="p === own()">{{ PURPOSE[p].label | tx }}</option>}
              </select>
            </label>
            <label>{{ 'การตัดสินใจ' | tx }}
              <select class="ui-input" (change)="granted.set($any($event.target).value === 'yes')">
                <option value="yes" [selected]="granted()">{{ 'ยินยอม' | tx }}</option>
                <option value="no" [selected]="!granted()">{{ 'ไม่ยินยอม' | tx }}</option>
              </select>
            </label>
            <label>{{ 'ช่องทาง' | tx }}
              <select class="ui-input" (change)="channel.set($any($event.target).value)">
                @for (c of channels; track c) {<option [value]="c" [selected]="c === channel()">{{ c | tx }}</option>}
              </select>
            </label>
          </div>
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="recording.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="!owner()" (click)="record()">{{ 'บันทึก' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class ConsentComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly PURPOSE = CONSENT_PURPOSE;
  protected readonly STATUS = CONSENT_STATUS;
  protected readonly version = CONSENT_VERSION;
  protected readonly purposes = PURPOSES;
  protected readonly ownPurposes: ('insurance' | 'case-study')[] = ['insurance', 'case-study'];
  protected readonly statuses = Object.keys(CONSENT_STATUS) as ConsentGrant['status'][];
  protected readonly channels = CHANNELS;

  protected readonly cover = computed(() => coverage(this.store.data()));
  protected readonly query = signal('');
  protected readonly purpose = signal<ConsentPurpose | ''>('');
  protected readonly status = signal<ConsentGrant['status'] | ''>('');
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return consentLedger(this.store.data()).filter(g => (!q || g.ownerKey.toLowerCase().includes(q)) && (!this.purpose() || g.purpose === this.purpose()) && (!this.status() || g.status === this.status()));
  });

  protected readonly recording = signal(false);
  protected readonly owners = computed(() => Object.keys(this.store.clinic.data().owners).sort());
  protected readonly owner = signal('');
  protected readonly own = signal<'insurance' | 'case-study'>('insurance');
  protected readonly granted = signal(true);
  protected readonly channel = signal(CHANNELS[0]);

  protected blocked(g: ConsentGrant) {
    return withdrawBlock(g);
  }

  protected record() {
    this.actions.recordConsent(this.owner(), this.own(), this.granted(), this.channel(), () => {
      this.recording.set(false);
      this.owner.set('');
    });
  }
}
