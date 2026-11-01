/* The staff directory: who works here and where each stands, with the credential and shift risks beside them (workforce.staff, M24 P2) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import type { StaffMember, StaffRole } from '../../data/types';
import {
  DEPARTMENTS, EMPLOYMENT, LICENSE_KIND, LICENSE_STATE, licensesOf, licenseState, ROLE, STAFF_STATUS, staffProblems, staffRows, type StaffInput, type StaffRow,
} from '../../data/workforce';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';

const ROLES = Object.keys(ROLE) as StaffRole[];
const EMPLOYMENTS = Object.keys(EMPLOYMENT) as StaffMember['employment'][];

@Component({
  selector: 'bo-staff',
  imports: [NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    @let k = kpis();
    <bo-page-head [heading]="'บุคลากรทั้งหมด'" [source]="'M24 P2 · ทะเบียนบุคลากรและสถานะการปฏิบัติงาน · ไม่ใช่บัญชีผู้ใช้ (M14 IAM) · ไม่มีเงินเดือนหรือสัญญาจ้าง · ต้นแบบก่อนสัญญาหน้าของ M24 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="openCreate()"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'เพิ่มบุคลากร' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ k.active }}</span><span class="kpi-label">{{ 'ปฏิบัติงาน · ทั้งหมด {n}' | tx: { n: k.total } }}</span></div>
      <div class="kpi" [class.warn]="k.leave" role="listitem"><span class="kpi-value">{{ k.leave }}</span><span class="kpi-label">{{ 'ลาวันนี้' | tx }}</span></div>
      <div class="kpi" [class.danger]="k.credential" role="listitem"><span class="kpi-value">{{ k.credential }}</span><span class="kpi-label">{{ 'ใบอนุญาตต้องจัดการ' | tx }}</span></div>
      <div class="kpi" [class.warn]="k.conflicts" role="listitem"><span class="kpi-value">{{ k.conflicts }}</span><span class="kpi-label">{{ 'มีความขัดแย้งในเวรสัปดาห์นี้' | tx }}</span></div>
    </div>

    <div class="split" [class.with-drawer]="selected() || creating()">
      <div class="panel">
        <div class="filter-bar">
          <input class="ui-input search" type="search" [attr.aria-label]="'ค้นหาชื่อหรือตำแหน่ง' | tx" [placeholder]="'ค้นหาชื่อหรือตำแหน่ง' | tx" [value]="query()" (input)="query.set($any($event.target).value)" />
          <select class="ui-input" [attr.aria-label]="'บทบาท' | tx" (change)="role.set($any($event.target).value)">
            <option value="" [selected]="!role()">{{ 'ทุกบทบาท' | tx }}</option>
            @for (r of roles; track r) {<option [value]="r" [selected]="r === role()">{{ ROLE[r].label | tx }}</option>}
          </select>
          <span class="secondary grow">{{ '{n} คน' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table staff">
            <thead>
              <tr>
                <th scope="col">{{ 'ชื่อ / ตำแหน่ง' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'บทบาท' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'แผนก' | tx }}</th>
                <th scope="col" class="w-status">{{ 'ใบอนุญาต' | tx }}</th>
                <th scope="col" class="w-status">{{ 'เวรสัปดาห์นี้' | tx }}</th>
                <th scope="col" class="w-owner">IAM</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.staff.id) {
                <tr tabindex="0" [class.selected]="r.staff.id === selectedId()" [attr.aria-selected]="r.staff.id === selectedId()" (click)="pick(r.staff.id)" (keydown.enter)="pick(r.staff.id)">
                  <td><b>{{ r.staff.name | tx }}</b><div class="secondary">{{ r.staff.position | tx }} · {{ EMPLOYMENT[r.staff.employment] | tx }}</div></td>
                  <td><span class="chip" [class]="'chip ' + ROLE[r.staff.role].cls">{{ ROLE[r.staff.role].label | tx }}</span></td>
                  <td>{{ r.staff.department | tx }}</td>
                  <td>
                    @if (r.credential) {<span class="chip" [class]="'chip ' + STATE[r.credential].cls">{{ STATE[r.credential].label | tx }}</span>}
                    @else {<span class="secondary">{{ 'ไม่ต้องมี' | tx }}</span>}
                  </td>
                  <td>
                    @if (r.onLeaveToday) {<span class="chip warn">{{ 'ลาวันนี้' | tx }}</span>}
                    @else if (r.shifts) {<span>{{ '{n} เวร' | tx: { n: r.shifts } }}</span>}
                    @else {<span class="secondary">—</span>}
                    @if (r.conflicts) {<div class="secondary text-danger">{{ 'ขัดแย้ง {n}' | tx: { n: r.conflicts } }}</div>}
                  </td>
                  <td>@if (r.staff.iamUser) {<span class="secondary">{{ r.staff.iamUser }}</span>} @else {<span class="secondary">{{ 'ยังไม่เชื่อม' | tx }}</span>}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ 'ไม่พบบุคลากรที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (creating()) {
        <bo-drawer [heading]="'เพิ่มบุคลากร'" [sub]="'ทะเบียนบุคลากร · บัญชีผู้ใช้สร้างแยกที่ IAM'" (closed)="creating.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'ชื่อที่ใช้ในโรงพยาบาล' | tx }}<input class="ui-input" [value]="form().name" (input)="set('name', $any($event.target).value)" placeholder="น.สพ. / สพ.ญ. / พ.ส. …" /></label>
            <label>{{ 'บทบาท' | tx }}
              <select class="ui-input" (change)="set('role', $any($event.target).value)">
                @for (r of roles; track r) {<option [value]="r" [selected]="r === form().role">{{ ROLE[r].label | tx }}</option>}
              </select>
            </label>
            <label>{{ 'ตำแหน่งงาน' | tx }}<input class="ui-input" [value]="form().position" (input)="set('position', $any($event.target).value)" /></label>
            <label>{{ 'แผนก' | tx }}
              <select class="ui-input" (change)="set('department', $any($event.target).value)">
                @for (d of departments; track d) {<option [value]="d" [selected]="d === form().department">{{ d | tx }}</option>}
              </select>
            </label>
            <label>{{ 'การจ้าง' | tx }}
              <select class="ui-input" (change)="set('employment', $any($event.target).value)">
                @for (e of employments; track e) {<option [value]="e" [selected]="e === form().employment">{{ EMPLOYMENT[e] | tx }}</option>}
              </select>
            </label>
            <label>{{ 'โทรศัพท์' | tx }}<input class="ui-input" [value]="form().phone" (input)="set('phone', $any($event.target).value)" /></label>
            <label>{{ 'วันเริ่มงาน' | tx }}<input class="ui-input" type="date" [value]="form().startedAt" (input)="set('startedAt', $any($event.target).value)" /></label>
          </div>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="creating.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="create()">{{ 'เพิ่มบุคลากร' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as r) {
        <bo-drawer [heading]="r.staff.name" [sub]="(r.staff.position | tx) + ' · ' + (STATUS[r.staff.status].label | tx)" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'บทบาท' | tx }}</dt><dd>{{ ROLE[r.staff.role].label | tx }} · {{ r.staff.department | tx }}</dd>
            <dt>{{ 'การจ้าง' | tx }}</dt><dd>{{ EMPLOYMENT[r.staff.employment] | tx }} · {{ '{n} ชม./สัปดาห์' | tx: { n: r.staff.weeklyHours } }}</dd>
            <dt>{{ 'เริ่มงาน' | tx }}</dt><dd>{{ r.staff.startedAt }}</dd>
            <dt>{{ 'โทรศัพท์' | tx }}</dt><dd>{{ r.staff.phone }}</dd>
            <dt>IAM</dt><dd>{{ r.staff.iamUser ?? ('ยังไม่เชื่อมบัญชีผู้ใช้' | tx) }}</dd>
          </dl>
          <div class="section-title">{{ 'ใบอนุญาต' | tx }}</div>
          @for (l of licenses(); track l.id) {
            <div class="sum-row"><span>{{ KIND[l.kind].label | tx }}<div class="secondary">{{ l.number }} · {{ 'หมดอายุ' | tx }} {{ l.expiresAt }}</div></span><span class="chip" [class]="'chip ' + STATE[state(l)].cls">{{ STATE[state(l)].label | tx }}</span></div>
          } @empty {
            <p class="secondary">{{ 'ตำแหน่งนี้ไม่ต้องมีใบอนุญาต' | tx }}</p>
          }
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.editStaff(r.staff)">{{ 'แก้ไขข้อมูล' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" (click)="actions.openStaff(r.staff.id)">{{ 'เปิดหน้ารายละเอียด' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class StaffComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly plus = lucidePlus;
  protected readonly ROLE = ROLE;
  protected readonly EMPLOYMENT = EMPLOYMENT;
  protected readonly STATUS = STAFF_STATUS;
  protected readonly STATE = LICENSE_STATE;
  protected readonly KIND = LICENSE_KIND;
  protected readonly roles = ROLES;
  protected readonly employments = EMPLOYMENTS;
  protected readonly departments = DEPARTMENTS;

  protected readonly query = signal('');
  protected readonly role = signal<StaffRole | ''>('');
  protected readonly selectedId = signal<string | null>(null);
  private readonly all = computed(() => staffRows(this.store.data()));
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.all().filter(r => (!this.role() || r.staff.role === this.role()) && (!q || `${r.staff.name} ${r.staff.position} ${r.staff.department}`.toLowerCase().includes(q)));
  });
  protected readonly kpis = computed(() => {
    const rows = this.all();
    return {
      total: rows.length, active: rows.filter(r => r.staff.status === 'active').length, leave: rows.filter(r => r.onLeaveToday).length,
      credential: rows.filter(r => r.credential && ['expired', 'pending', 'd30'].includes(r.credential)).length, conflicts: rows.filter(r => r.conflicts).length,
    };
  });
  protected readonly selected = computed<StaffRow | null>(() => this.all().find(r => r.staff.id === this.selectedId()) ?? null);
  protected readonly licenses = computed(() => (this.selectedId() ? licensesOf(this.store.data(), this.selectedId()!) : []));
  protected readonly state = licenseState;

  protected readonly creating = signal(false);
  protected readonly form = signal<StaffInput>(this.blank());
  protected readonly problems = computed(() => staffProblems(this.store.data(), this.form()));

  private blank(): StaffInput {
    return { name: '', role: 'nurse', position: '', department: 'Ward', employment: 'full-time', phone: '', startedAt: TODAY };
  }

  protected set<K extends keyof StaffInput>(key: K, value: StaffInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected pick(id: string) {
    this.creating.set(false);
    this.selectedId.set(this.selectedId() === id ? null : id);
  }

  protected openCreate() {
    this.selectedId.set(null);
    this.creating.set(true);
  }

  protected create() {
    this.actions.addStaff(this.form(), member => {
      this.creating.set(false);
      this.form.set(this.blank());
      this.selectedId.set(member.id);
    });
  }
}
