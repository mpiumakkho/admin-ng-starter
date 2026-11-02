/* Service contracts: who covers which devices for what, until when, and what lapses when one ends (assets.contracts, M22 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { active, addMonths, CONTRACT_KIND, CONTRACT_STATE, contractProblems, type ContractInput, contractState, type ContractState, equipmentOf, retireImpact } from '../../data/assets';
import { daysUntil } from '../../data/home';
import type { ContractKind, ServiceContract } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

const STRIP: ContractState[] = ['expired', 'd30', 'd60', 'd90', 'active'];
/** The work a contract covers, as the pages name it */
const COVER = { pm: 'PM', calibration: 'สอบเทียบ', repair: 'ซ่อม' };
const baht = (n: number) => `฿${n.toLocaleString('en-US')}`;
const BLANK: ContractInput = { vendor: '', contact: '', kind: 'repair', from: TODAY, to: addMonths(TODAY, 12), annualFee: '', responseHours: '8', equipmentIds: [] };

@Component({
  selector: 'bo-contracts',
  imports: [PagerFoot, RouterLink, NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    @let c = counts();
    <bo-page-head [heading]="'สัญญาบริการอุปกรณ์'" [source]="'M22 P2 · ผู้ให้บริการ ขอบเขต และวันหมดอายุ 30/60/90 วัน · อุปกรณ์ critical ต้องมีสัญญาซ่อมที่มีผล · ค่าบริการเป็นข้อมูลติดตาม ไม่ใช่การตั้งหนี้ · ต้นแบบก่อนสัญญาหน้าของ M22 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="openCreate()"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'บันทึกสัญญา' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      @for (s of strip; track s) {
        <button type="button" class="kpi" role="listitem" [class.active]="filter() === s" [class.danger]="(s === 'expired' || s === 'd30') && c[s]" [class.warn]="s === 'd60' && c[s]" (click)="toggle(s)">
          <span class="kpi-value">{{ c[s] }}</span><span class="kpi-label">{{ STATE[s].label | tx }}</span>
        </button>
      }
      <div class="kpi" role="listitem"><span class="kpi-value">{{ fmt(fees()) }}</span><span class="kpi-label">{{ 'ค่าบริการต่อปีของสัญญาที่มีผล' | tx }}</span></div>
    </div>

    <div class="split" [class.with-drawer]="selected() || creating()">
      <div class="panel">
        <div class="filter-bar">
          <label class="check"><input type="checkbox" [checked]="showRetired()" (change)="showRetired.set($any($event.target).checked)" />{{ 'แสดงสัญญาที่ยกเลิกแล้ว' | tx }}</label>
          <span class="secondary grow">{{ '{n} รายการ · เรียงตามวันสิ้นสุด' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table contracts">
            <thead>
              <tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col">{{ 'ผู้ให้บริการ' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'ขอบเขต' | tx }}</th>
                <th scope="col" class="w-due">{{ 'สิ้นสุด' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ต่อปี' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'อุปกรณ์' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (k of pager.rows(); track k.id) {
                <tr tabindex="0" [class.selected]="k.id === selectedId()" [attr.aria-selected]="k.id === selectedId()" (click)="pick(k.id)" (keydown.enter)="pick(k.id)">
                  <td><b>{{ k.id }}</b></td>
                  <td>{{ k.vendor | tx }}<div class="secondary">{{ k.contact | tx }}</div></td>
                  <td>{{ KIND[k.kind].label | tx }}<div class="secondary">{{ 'ตอบสนอง {n} ชม.' | tx: { n: k.responseHours } }}</div></td>
                  <td class="num">{{ k.to }}@if (state(k) !== 'retired') {<div class="secondary" [class.text-danger]="days(k) <= 30">{{ days(k) < 0 ? ('หมดอายุแล้ว {n} วัน' | tx: { n: -days(k) }) : ('{n} วัน' | tx: { n: days(k) }) }}</div>}</td>
                  <td class="num">{{ fmt(k.annualFee) }}</td>
                  <td class="num">{{ k.equipmentIds.length }}</td>
                  <td><span class="chip" [class]="'chip ' + STATE[state(k)].cls">{{ STATE[state(k)].label | tx }}</span></td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="7" class="empty">{{ 'ไม่มีสัญญาที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (creating()) {
        <bo-drawer [heading]="'บันทึกสัญญา'" [sub]="'ผู้ให้บริการ ขอบเขต และอุปกรณ์ในสัญญา'" (closed)="creating.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'ผู้ให้บริการ' | tx }}<input class="ui-input" [value]="form().vendor" (input)="set('vendor', $any($event.target).value)" /></label>
            <label class="full">{{ 'ผู้ติดต่อ' | tx }}<input class="ui-input" [placeholder]="'ชื่อ · โทรศัพท์' | tx" [value]="form().contact" (input)="set('contact', $any($event.target).value)" /></label>
            <label>{{ 'ขอบเขต' | tx }}
              <select class="ui-input" (change)="set('kind', $any($event.target).value)">
                @for (k of kinds; track k) {<option [value]="k" [selected]="k === form().kind">{{ KIND[k].label | tx }}</option>}
              </select>
            </label>
            <label>{{ 'ตอบสนอง (ชม.)' | tx }}<input class="ui-input" inputmode="numeric" [value]="form().responseHours" (input)="set('responseHours', $any($event.target).value)" /></label>
            <label>{{ 'เริ่ม' | tx }}<input class="ui-input" type="date" [value]="form().from" (input)="set('from', $any($event.target).value)" /></label>
            <label>{{ 'สิ้นสุด' | tx }}<input class="ui-input" type="date" [value]="form().to" (input)="set('to', $any($event.target).value)" /></label>
            <label class="full">{{ 'ค่าบริการต่อปี (บาท)' | tx }}<input class="ui-input" inputmode="decimal" [value]="form().annualFee" (input)="set('annualFee', $any($event.target).value)" /></label>
          </div>
          <fieldset class="pick-list">
            <legend>{{ 'อุปกรณ์ในสัญญา' | tx }}</legend>
            @for (e of devices(); track e.id) {
              <label class="check"><input type="checkbox" [checked]="form().equipmentIds.includes(e.id)" (change)="toggleDevice(e.id)" />{{ e.name | tx }} <span class="secondary">{{ e.id }}</span></label>
            }
          </fieldset>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="creating.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="create()">{{ 'บันทึกสัญญา' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as k) {
        <bo-drawer [heading]="k.id + ' · ' + (k.vendor | tx)" [sub]="(KIND[k.kind].label | tx) + ' · ' + k.from + ' → ' + k.to" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'ผู้ติดต่อ' | tx }}</dt><dd>{{ k.contact | tx }}</dd>
            <dt>{{ 'ครอบคลุม' | tx }}</dt><dd>{{ covers(k) | tx }}</dd>
            <dt>{{ 'ค่าบริการต่อปี' | tx }}</dt><dd>{{ fmt(k.annualFee) }}</dd>
            <dt>{{ 'สถานะ' | tx }}</dt><dd><span class="chip" [class]="'chip ' + STATE[state(k)].cls">{{ STATE[state(k)].label | tx }}</span></dd>
          </dl>
          @if (state(k) === 'expired' && uncovered(k).length) {
            <p class="notice danger">{{ 'สัญญาหมดอายุแล้ว — อุปกรณ์เหล่านี้ไม่มีสัญญาซ่อม: {list}' | tx: { list: uncoveredNames(k) } }}</p>
          }
          <div class="section-title">{{ 'อุปกรณ์ในสัญญา' | tx }}</div>
          <div class="table-wrap">
            <table class="bo-table">
              <tbody>
                @for (id of k.equipmentIds; track id) {
                  <tr class="static"><td><a class="link" [routerLink]="['/backoffice/assets/equipment', id]">{{ name(id) | tx }}</a><div class="secondary">{{ id }}</div></td></tr>
                } @empty {
                  <tr class="static"><td class="empty">{{ 'ไม่มีอุปกรณ์ในสัญญา' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="timeline">
            @for (h of k.history; track $index) {
              <div class="tl">{{ h[0] }} · <b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}@if (h[3]) { — {{ h[3] | tx }}}</div>
            }
          </div>
          <ng-container foot>
            @if (k.status === 'active') {
              <button uiButton variant="danger-soft" size="sm" type="button" (click)="actions.retireContract(k)">{{ 'ยกเลิกสัญญา' | tx }}</button>
              <span class="grow"></span>
              <button uiButton size="sm" type="button" (click)="actions.renewContract(k)">{{ 'ต่อสัญญา' | tx }}</button>
            }
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class ContractsComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly STATE = CONTRACT_STATE;
  protected readonly KIND = CONTRACT_KIND;
  protected readonly strip = STRIP;
  protected readonly kinds = Object.keys(CONTRACT_KIND) as ContractKind[];
  protected readonly fmt = baht;
  protected readonly state = contractState;

  protected readonly filter = signal<ContractState | ''>('');
  protected readonly showRetired = signal(false);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly counts = computed(() => {
    const out = { expired: 0, d30: 0, d60: 0, d90: 0, active: 0, retired: 0 };
    for (const c of this.store.data().contracts) {
      out[contractState(c)]++;
    }
    return out;
  });
  protected readonly fees = computed(() => this.store.data().contracts.filter(c => ['d30', 'd60', 'd90', 'active'].includes(contractState(c))).reduce((n, c) => n + c.annualFee, 0));
  protected readonly rows = computed(() => this.store.data().contracts
    .filter(c => (this.filter() ? contractState(c) === this.filter() : this.showRetired() || c.status === 'active'))
    .sort((a, b) => a.to.localeCompare(b.to)));
  protected readonly selected = computed(() => this.store.data().contracts.find(c => c.id === this.selectedId()) ?? null);

  protected readonly creating = signal(false);
  protected readonly form = signal<ContractInput>({ ...BLANK, equipmentIds: [] });
  protected readonly devices = computed(() => active(this.store.data()));
  protected readonly problems = computed(() => contractProblems(this.store.data(), this.form()));

  protected days(c: ServiceContract) {
    return daysUntil(c.to);
  }

  protected name(id: string) {
    return equipmentOf(this.store.data(), id)?.name ?? id;
  }

  protected covers(c: ServiceContract) {
    return CONTRACT_KIND[c.kind].covers.map(w => COVER[w]).join(' · ');
  }

  protected uncovered(c: ServiceContract) {
    return retireImpact(this.store.data(), c);
  }

  protected uncoveredNames(c: ServiceContract) {
    return this.uncovered(c).map(e => e.id).join(', ');
  }

  protected toggle(s: ContractState) {
    this.filter.set(this.filter() === s ? '' : s);
  }

  protected pick(id: string) {
    this.creating.set(false);
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected openCreate() {
    this.selectedId.set(null);
    this.creating.set(true);
  }

  protected set<K extends keyof ContractInput>(key: K, value: ContractInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected toggleDevice(id: string) {
    const ids = this.form().equipmentIds;
    this.set('equipmentIds', ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  protected create() {
    this.actions.addContract(this.form(), c => {
      this.creating.set(false);
      this.form.set({ ...BLANK, equipmentIds: [] });
      this.filter.set('');
      this.selectedId.set(c.id);
    });
  }
}
