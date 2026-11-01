/* Licenses and credentials: verification and expiry at 30/60/90 days, renewed into a fresh check (workforce.credentials, M24 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { daysUntil } from '../../data/home';
import type { License, LicenseKind } from '../../data/types';
import {
  canVerify, expiryCounts, LICENSE_KIND, LICENSE_STATE, licenseProblems, licenseState, type LicenseInput, type LicenseState, ROLE, staffOf,
} from '../../data/workforce';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

const STRIP: LicenseState[] = ['expired', 'd30', 'd60', 'd90', 'pending'];
const KINDS = Object.keys(LICENSE_KIND) as LicenseKind[];

@Component({
  selector: 'bo-credentials',
  imports: [NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    @let c = counts();
    <bo-page-head [heading]="'ใบอนุญาตและคุณสมบัติวิชาชีพ'" [source]="'M24 P2 · ติดตามการตรวจสอบและวันหมดอายุ 30/60/90 วัน · ไทยไม่มีระบบรับรองพยาบาลสัตว์ โรงพยาบาลกำหนดขอบเขตเอง · ต้นแบบก่อนสัญญาหน้าของ M24 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="openCreate()"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'บันทึกใบอนุญาต' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      @for (s of strip; track s) {
        <button type="button" class="kpi" role="listitem" [class.active]="filter() === s" [class.danger]="(s === 'expired' || s === 'd30') && c[s]" [class.warn]="(s === 'd60' || s === 'pending') && c[s]" (click)="toggle(s)">
          <span class="kpi-value">{{ c[s] }}</span><span class="kpi-label">{{ STATE[s].label | tx }}</span>
        </button>
      }
    </div>

    <div class="split" [class.with-drawer]="selected() || creating()">
      <div class="panel">
        <div class="filter-bar">
          <select class="ui-input" [attr.aria-label]="'ชนิด' | tx" (change)="kind.set($any($event.target).value)">
            <option value="" [selected]="!kind()">{{ 'ทุกชนิด' | tx }}</option>
            @for (k of kinds; track k) {<option [value]="k" [selected]="k === kind()">{{ KIND[k].label | tx }}</option>}
          </select>
          <span class="secondary grow">{{ '{n} รายการ · เรียงตามวันหมดอายุ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table credentials">
            <thead>
              <tr>
                <th scope="col" class="w-owner">{{ 'ผู้ถือ' | tx }}</th>
                <th scope="col">{{ 'ชนิด' | tx }}</th>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col" class="w-due">{{ 'หมดอายุ' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'เหลือเวลา' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (l of rows(); track l.id) {
                <tr tabindex="0" [class.selected]="l.id === selectedId()" [attr.aria-selected]="l.id === selectedId()" (click)="pick(l.id)" (keydown.enter)="pick(l.id)">
                  <td><b>{{ holder(l) | tx }}</b><div class="secondary">{{ role(l) | tx }}</div></td>
                  <td>{{ KIND[l.kind].label | tx }}<div class="secondary">{{ l.issuer | tx }}</div></td>
                  <td>{{ l.number }}</td>
                  <td class="num">{{ l.expiresAt }}</td>
                  <td class="num" [class.text-danger]="days(l) <= 30">{{ days(l) < 0 ? ('หมดอายุแล้ว {n} วัน' | tx: { n: -days(l) }) : ('{n} วัน' | tx: { n: days(l) }) }}</td>
                  <td><span class="chip" [class]="'chip ' + STATE[state(l)].cls">{{ STATE[state(l)].label | tx }}</span></td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ 'ไม่มีใบอนุญาตที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (creating()) {
        <bo-drawer [heading]="'บันทึกใบอนุญาต'" [sub]="'รอตรวจสอบกับผู้ออกก่อนใช้'" (closed)="creating.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'ชื่อบุคลากร' | tx }}
              <select class="ui-input" (change)="pickStaff($any($event.target).value)">
                @for (s of holders(); track s.id) {<option [value]="s.id" [selected]="s.id === form().staffId">{{ s.name | tx }} · {{ ROLE[s.role].label | tx }}</option>}
              </select>
            </label>
            <label class="full">{{ 'ชนิด' | tx }}
              <select class="ui-input" (change)="pickKind($any($event.target).value)">
                @for (k of kindsFor(); track k) {<option [value]="k" [selected]="k === form().kind">{{ KIND[k].label | tx }}</option>}
              </select>
            </label>
            <label>{{ 'เลขที่' | tx }}<input class="ui-input" [value]="form().number" (input)="set('number', $any($event.target).value)" /></label>
            <label>{{ 'ผู้ออก' | tx }}<input class="ui-input" [value]="form().issuer" (input)="set('issuer', $any($event.target).value)" /></label>
            <label>{{ 'วันออก' | tx }}<input class="ui-input" type="date" [value]="form().issuedAt" (input)="set('issuedAt', $any($event.target).value)" /></label>
            <label>{{ 'วันหมดอายุ' | tx }}<input class="ui-input" type="date" [value]="form().expiresAt" (input)="set('expiresAt', $any($event.target).value)" /></label>
          </div>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="creating.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="create()">{{ 'บันทึกใบอนุญาต' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as l) {
        <bo-drawer [heading]="l.number" [sub]="(holder(l) | tx) + ' · ' + (KIND[l.kind].label | tx)" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'ผู้ออก' | tx }}</dt><dd>{{ l.issuer | tx }}</dd>
            <dt>{{ 'ใช้ได้' | tx }}</dt><dd>{{ l.issuedAt }} → {{ l.expiresAt }}</dd>
            <dt>{{ 'สถานะ' | tx }}</dt><dd><span class="chip" [class]="'chip ' + STATE[state(l)].cls">{{ STATE[state(l)].label | tx }}</span></dd>
            <dt>{{ 'ตรวจสอบ' | tx }}</dt><dd>{{ l.verifiedBy ? (l.verifiedBy | tx) + ' · ' + l.verifiedAt : ('ยังไม่ได้ตรวจสอบ' | tx) }}</dd>
          </dl>
          @if (l.kind === 'vet-license' && state(l) !== 'valid') {
            <p class="notice warn">{{ 'สัตวแพทย์ที่ใบอนุญาตยังไม่ได้ตรวจสอบหรือหมดอายุ จัดเวรตรวจและรับเวร on-call ไม่ได้ และสิทธิ์ที่อิงใบอนุญาตนี้ถูกระงับโดยผล' | tx }}</p>
          }
          <div class="timeline">
            @for (h of l.history; track $index) {
              <div class="tl">{{ h[0] }} · <b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}@if (h[3]) { — {{ h[3] | tx }}}</div>
            }
          </div>
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.renewLicense(l)">{{ 'บันทึกการต่ออายุ' | tx }}</button>
            <span class="grow"></span>
            @if (l.verification === 'pending') {
              <button uiButton size="sm" type="button" [disabled]="!verifiable(l)" (click)="actions.verifyLicense(l)">{{ 'ตรวจสอบแล้ว' | tx }}</button>
            }
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class CredentialsComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly STATE = LICENSE_STATE;
  protected readonly KIND = LICENSE_KIND;
  protected readonly ROLE = ROLE;
  protected readonly strip = STRIP;
  protected readonly kinds = KINDS;
  protected readonly state = licenseState;

  protected readonly filter = signal<LicenseState | ''>('');
  protected readonly kind = signal<LicenseKind | ''>('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly counts = computed(() => expiryCounts(this.store.data()));
  protected readonly rows = computed(() => this.store.data().licenses
    .filter(l => (!this.filter() || licenseState(l) === this.filter()) && (!this.kind() || l.kind === this.kind()))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)));
  protected readonly selected = computed(() => this.store.data().licenses.find(l => l.id === this.selectedId()) ?? null);

  protected readonly creating = signal(false);
  protected readonly holders = computed(() => this.store.data().staff.filter(s => KINDS.some(k => LICENSE_KIND[k].roles.includes(s.role))));
  protected readonly form = signal<LicenseInput>({ staffId: 'S04', kind: 'controlled-license', number: '', issuer: '', issuedAt: TODAY, expiresAt: '' });
  protected readonly kindsFor = computed(() => {
    const role = staffOf(this.store.data(), this.form().staffId)?.role;
    return KINDS.filter(k => role && LICENSE_KIND[k].roles.includes(role));
  });
  protected readonly problems = computed(() => licenseProblems(this.store.data(), this.form()));

  protected days(l: License) {
    return daysUntil(l.expiresAt);
  }

  protected holder(l: License) {
    return staffOf(this.store.data(), l.staffId)?.name ?? '—';
  }

  protected role(l: License) {
    const s = staffOf(this.store.data(), l.staffId);
    return s ? s.position : '';
  }

  protected verifiable(l: License) {
    return canVerify(this.store.data(), l, this.store.userName());
  }

  protected toggle(s: LicenseState) {
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

  protected set<K extends keyof LicenseInput>(key: K, value: LicenseInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected pickStaff(id: string) {
    const role = staffOf(this.store.data(), id)?.role;
    const kind = KINDS.find(k => role && LICENSE_KIND[k].roles.includes(role)) ?? this.form().kind;
    this.form.set({ ...this.form(), staffId: id, kind, issuer: '' });
  }

  protected pickKind(kind: LicenseKind) {
    this.form.set({ ...this.form(), kind, issuer: '' });
  }

  protected create() {
    this.actions.addLicense(this.form(), license => {
      this.creating.set(false);
      this.form.set({ ...this.form(), number: '', expiresAt: '' });
      this.filter.set('');
      this.selectedId.set(license.id);
    });
  }
}
