/* One person: licenses, CE, privileges and shifts in one place, with the IAM account linked and not owned (workforce.staff detail, M24/M14) */
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowLeft, lucideExternalLink } from '@ng-icons/lucide';
import { map } from 'rxjs';

import { TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import type { Privilege } from '../../data/types';
import {
  addDays, CE_STATUS, ceSummary, EMPLOYMENT, LEAVE_STATUS, LEAVE_TYPE, leaveTaken, LICENSE_KIND, LICENSE_STATE, licensesOf, licenseState, PRIVILEGE, PRIVILEGE_CELL, privilegeCell, PRIVILEGES,
  ROLE, SHIFT, STAFF_STATUS, staffOf, weekday, weekOf,
} from '../../data/workforce';
import { TxPipe } from '../../i18n/bo-i18n';

@Component({
  selector: 'bo-staff-detail',
  imports: [RouterLink, NgIcon, TxPipe, UiButton],
  template: `
    @if (member(); as m) {
      <div class="page-head">
        <div class="title-block">
          <a class="link back" routerLink="/backoffice/workforce/staff"><ng-icon [svg]="icons.back" aria-hidden="true" />{{ 'บุคลากรทั้งหมด' | tx }}</a>
          <h1>{{ m.name | tx }} <span class="chip" [class]="'chip ' + STATUS[m.status].cls">{{ STATUS[m.status].label | tx }}</span></h1>
          <div class="subtitle">
            <span>{{ m.id }} · {{ m.position | tx }} · {{ m.department | tx }} · {{ ROLE[m.role].label | tx }}</span>
            <span class="freshness">{{ 'ข้อมูล ณ วันนี้ 11:32' | tx }}</span>
          </div>
        </div>
        <div class="page-actions"><button uiButton variant="secondary" size="sm" type="button" (click)="actions.editStaff(m)">{{ 'แก้ไขข้อมูล' | tx }}</button></div>
      </div>

      <div class="record">
        <div class="record-main">
          <div class="panel">
            <div class="filter-bar"><b>{{ 'ใบอนุญาต' | tx }}</b><span class="secondary grow">{{ 'ตรวจสอบและต่ออายุที่หน้าใบอนุญาต' | tx }}</span><a class="link" routerLink="/backoffice/workforce/credentials">{{ 'ใบอนุญาตและ Credential' | tx }}</a></div>
            <div class="table-wrap">
              <table class="bo-table">
                <thead><tr><th scope="col">{{ 'ชนิด' | tx }}</th><th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th><th scope="col" class="w-due">{{ 'หมดอายุ' | tx }}</th><th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th></tr></thead>
                <tbody>
                  @for (l of licenses(); track l.id) {
                    <tr class="static">
                      <td>{{ KIND[l.kind].label | tx }}<div class="secondary">{{ l.issuer | tx }}</div></td>
                      <td>{{ l.number }}</td>
                      <td class="num">{{ l.expiresAt }}</td>
                      <td><span class="chip" [class]="'chip ' + STATE[state(l)].cls">{{ STATE[state(l)].label | tx }}</span></td>
                    </tr>
                  } @empty {
                    <tr class="static"><td colspan="4" class="empty">{{ 'ตำแหน่งนี้ไม่ต้องมีใบอนุญาต' | tx }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'สิทธิ์วิชาชีพ' | tx }}</b><span class="secondary grow">{{ 'ตามขอบเขตที่โรงพยาบาลกำหนด · ไม่ใช่บทบาทในระบบ' | tx }}</span><a class="link" routerLink="/backoffice/workforce/privileges">{{ 'Scope และ Privilege' | tx }}</a></div>
            <div class="chips-row">
              @for (p of privileges(); track p.key) {
                <span class="chip" [class]="'chip ' + CELL[p.cell].cls" [attr.title]="CELL[p.cell].label | tx">{{ CELL[p.cell].mark }} {{ PRIVILEGE[p.key].label | tx }}</span>
              } @empty {
                <span class="secondary">{{ 'ยังไม่มีสิทธิ์วิชาชีพ' | tx }}</span>
              }
            </div>
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'เวรสองสัปดาห์' | tx }}</b><span class="secondary grow">{{ from }} – {{ to }}</span><a class="link" routerLink="/backoffice/workforce/schedule">{{ 'ตารางเวร' | tx }}</a></div>
            <div class="table-wrap">
              <table class="bo-table">
                <thead><tr><th scope="col" class="w-at">{{ 'วันที่' | tx }}</th><th scope="col">{{ 'เวร' | tx }}</th><th scope="col" class="w-kind">{{ 'จุดงาน' | tx }}</th><th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th></tr></thead>
                <tbody>
                  @for (s of shifts(); track s.id) {
                    <tr class="static">
                      <td>{{ s.date }} · {{ weekday(s.date) | tx }}</td>
                      <td><span class="shift" [class]="'shift ' + s.kind">{{ SHIFT[s.kind].label | tx }}</span> {{ SHIFT[s.kind].time }}</td>
                      <td>{{ s.area }}</td>
                      <td><span class="chip" [class]="'chip ' + (s.status === 'published' ? 'ok' : 'quiet')">{{ (s.status === 'published' ? 'ประกาศแล้ว' : 'ฉบับร่าง') | tx }}</span></td>
                    </tr>
                  } @empty {
                    <tr class="static"><td colspan="4" class="empty">{{ 'ไม่มีเวรในสองสัปดาห์นี้' | tx }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          @if (ce(); as c) {
            <div class="panel">
              <div class="filter-bar"><b>{{ 'CE ปีนี้' | tx }}</b><span class="secondary grow">{{ '{a} / {b} ชม. · รอตรวจ {c} ชม.' | tx: { a: c.approved, b: c.target, c: c.pending } }}</span><a class="link" routerLink="/backoffice/workforce/education">{{ 'Continuing Education' | tx }}</a></div>
              <div class="table-wrap">
                <table class="bo-table">
                  <tbody>
                    @for (r of ceRecords(); track r.id) {
                      <tr class="static"><td class="w-due num">{{ r.date }}</td><td>{{ r.course | tx }}<div class="secondary">{{ r.provider | tx }}</div></td><td class="w-amount num">{{ r.hours }} {{ 'ชม.' | tx }}</td><td class="w-status"><span class="chip" [class]="'chip ' + CE_STATUS[r.status].cls">{{ CE_STATUS[r.status].label | tx }}</span></td></tr>
                    } @empty {
                      <tr class="static"><td class="empty">{{ 'ยังไม่มีบันทึก CE ปีนี้' | tx }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>

        <aside class="record-rail">
          <div class="panel summary">
            <div class="sum-row"><span>{{ 'การจ้าง' | tx }}</span><b>{{ EMPLOYMENT[m.employment] | tx }}</b></div>
            <div class="sum-row"><span>{{ 'ชั่วโมงตามสัญญา' | tx }}</span><b>{{ '{n} ชม./สัปดาห์' | tx: { n: m.weeklyHours } }}</b></div>
            <div class="sum-row"><span>{{ 'เริ่มงาน' | tx }}</span><b>{{ m.startedAt }}</b></div>
            <div class="sum-row"><span>{{ 'โทรศัพท์' | tx }}</span><b>{{ m.phone }}</b></div>
            @for (t of taken(); track t[0]) {<div class="sum-row"><span>{{ LEAVE_TYPE[t[0]] | tx }} {{ 'ปีนี้' | tx }}</span><b>{{ '{n} วัน' | tx: { n: t[1] } }}</b></div>}
          </div>
          <div class="panel actions">
            <b>{{ 'บัญชีผู้ใช้ (IAM)' | tx }}</b>
            @if (m.iamUser) {
              <span>{{ m.iamUser }}</span>
              <a class="link" routerLink="/users"><ng-icon [svg]="icons.external" aria-hidden="true" />{{ 'เปิดใน IAM' | tx }}</a>
            } @else {
              <span class="secondary">{{ 'ยังไม่เชื่อมบัญชีผู้ใช้' | tx }}</span>
            }
            <p class="secondary">{{ 'ทะเบียนบุคลากรไม่ใช่บัญชีผู้ใช้ — การเข้าระบบ บทบาท และสิทธิ์ในระบบจัดการที่ M14 · ตารางเวรไม่ให้บทบาทใด ๆ' | tx }}</p>
          </div>
          @if (leaves().length) {
            <div class="panel actions">
              <b>{{ 'การลา' | tx }}</b>
              @for (l of leaves(); track l.id) {
                <div class="sum-row"><span>{{ LEAVE_TYPE[l.type] | tx }} {{ l.from }}–{{ l.to }}</span><span class="chip" [class]="'chip ' + LEAVE_STATUS[l.status].cls">{{ LEAVE_STATUS[l.status].label | tx }}</span></div>
              }
            </div>
          }
        </aside>
      </div>

      <div class="panel">
        <div class="filter-bar"><b>{{ 'ประวัติ' | tx }}</b><span class="secondary grow">{{ 'จากบันทึกของ M24 · ล่าสุดก่อน' | tx }}</span></div>
        <div class="timeline">
          @for (h of history(); track $index) {
            <div class="tl">{{ h[0] }} · <b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}@if (h[3]) { — {{ h[3] | tx }}}</div>
          } @empty {
            <p class="muted">{{ 'ยังไม่มีประวัติ' | tx }}</p>
          }
        </div>
      </div>
    } @else {
      <div class="panel prompt">{{ 'ไม่พบบุคลากรนี้' | tx }}<div class="secondary"><a class="link" routerLink="/backoffice/workforce/staff">{{ 'บุคลากรทั้งหมด' | tx }}</a></div></div>
    }
  `,
  host: { class: 'page' },
})
export class StaffDetailComponent {
  private readonly store = inject(BackofficeStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly actions = inject(BackofficeActions);
  protected readonly icons = { back: lucideArrowLeft, external: lucideExternalLink };
  protected readonly ROLE = ROLE;
  protected readonly STATUS = STAFF_STATUS;
  protected readonly EMPLOYMENT = EMPLOYMENT;
  protected readonly KIND = LICENSE_KIND;
  protected readonly STATE = LICENSE_STATE;
  protected readonly CELL = PRIVILEGE_CELL;
  protected readonly PRIVILEGE = PRIVILEGE;
  protected readonly SHIFT = SHIFT;
  protected readonly CE_STATUS = CE_STATUS;
  protected readonly LEAVE_TYPE = LEAVE_TYPE;
  protected readonly LEAVE_STATUS = LEAVE_STATUS;
  protected readonly weekday = weekday;
  protected readonly state = licenseState;
  protected readonly from = weekOf(TODAY);
  protected readonly to = addDays(weekOf(TODAY), 13);

  private readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: this.route.snapshot.paramMap.get('id') ?? '' });
  protected readonly member = computed(() => staffOf(this.store.data(), this.id()) ?? null);
  protected readonly licenses = computed(() => licensesOf(this.store.data(), this.id()));
  protected readonly privileges = computed(() => {
    const d = this.store.data();
    return PRIVILEGES.map(key => ({ key, cell: privilegeCell(d, this.id(), key) })).filter((p): p is { key: Privilege; cell: 'granted' | 'at-risk' | 'lapsed' } => ['granted', 'at-risk', 'lapsed'].includes(p.cell));
  });
  protected readonly shifts = computed(() => this.store.data().shifts.filter(s => s.staffId === this.id() && this.from <= s.date && s.date <= this.to)
    .sort((a, b) => a.date.localeCompare(b.date) || SHIFT[a.kind].start - SHIFT[b.kind].start));
  protected readonly ce = computed(() => ceSummary(this.store.data()).find(r => r.staff.id === this.id()) ?? null);
  protected readonly ceRecords = computed(() => this.store.data().ce.filter(c => c.staffId === this.id() && c.date.startsWith(TODAY.slice(0, 4))));
  protected readonly leaves = computed(() => this.store.data().leaves.filter(l => l.staffId === this.id()));
  protected readonly taken = computed(() => Object.entries(leaveTaken(this.store.data(), this.id())) as [keyof typeof LEAVE_TYPE, number][]);
  /** What M24 recorded about the person: the license steps and the back office's own log, newest first */
  protected readonly history = computed<[string, string, string, string][]>(() => {
    const d = this.store.data();
    const m = this.member();
    if (!m) {
      return [];
    }
    const fromLicenses = this.licenses().flatMap(l => l.history.map(h => [h[0], h[1], `${h[2]} · ${l.number}`, h[3]] as [string, string, string, string]));
    const fromLog = d.activity.filter(a => a.module === 'M24' && (a.ref === m.name || a.ref.startsWith(`${m.name} ·`) || a.target === m.id) && !/ใบอนุญาต/.test(a.action))
      .map(a => [a.at, a.by, a.action, a.detail ?? ''] as [string, string, string, string]);
    const privileges = d.privilegeLog.filter(c => c.staffId === m.id).map(c => [c.at, c.by, `${c.action === 'grant' ? 'ให้สิทธิ์' : 'ถอนสิทธิ์'} · ${PRIVILEGE[c.privilege].label}`, c.reason] as [string, string, string, string]);
    return [...fromLicenses, ...privileges, ...fromLog.filter(a => !/สิทธิ์วิชาชีพ/.test(a[2]))].sort((a, b) => b[0].localeCompare(a[0]));
  });
}
