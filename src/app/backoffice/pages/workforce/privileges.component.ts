/* Scope and clinical privileges: the hospital's own matrix, each grant resting on a usable license, changed with a reason by someone else (workforce.privileges, M24 P2) */
import { Component, computed, inject, signal } from '@angular/core';

import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import type { Privilege, StaffMember, StaffRole } from '../../data/types';
import { LICENSE_KIND, PRIVILEGE, PRIVILEGE_CELL, privilegeCell, privilegeGaps, PRIVILEGES, ROLE, staffOf, type PrivilegeCell } from '../../data/workforce';
import { BoI18n, TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

const CLINICAL: StaffRole[] = ['vet', 'nurse', 'pharmacist'];
const LEGEND: PrivilegeCell[] = ['granted', 'at-risk', 'lapsed', 'none'];

@Component({
  selector: 'bo-privileges',
  imports: [TxPipe, PageHead],
  template: `
    <bo-page-head [heading]="'ขอบเขตและสิทธิ์วิชาชีพ'" [source]="'M24 P2 · ขอบเขตที่โรงพยาบาลกำหนดเอง (ไทยไม่มีระบบรับรองพยาบาลสัตว์) · สิทธิ์อิงใบอนุญาตที่ตรวจสอบแล้ว · ไม่ใช่บทบาทใน IAM และตารางเวรไม่ให้สิทธิ์ · ต้นแบบก่อนสัญญาหน้าของ M24 (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="record ledger">
      <div class="record-main">
        <div class="panel">
          <div class="filter-bar">
            <div class="segmented" role="group" [attr.aria-label]="'บทบาท' | tx">
              <button type="button" [class.active]="!role()" [attr.aria-pressed]="!role()" (click)="role.set('')">{{ 'ทั้งหมด' | tx }}</button>
              @for (r of roles; track r) {<button type="button" [class.active]="role() === r" [attr.aria-pressed]="role() === r" (click)="role.set(r)">{{ ROLE[r].label | tx }}</button>}
            </div>
            <span class="secondary grow">{{ 'กดช่องเพื่อให้หรือถอนสิทธิ์ · ต้องมีเหตุผล · เปลี่ยนสิทธิ์ของตัวเองไม่ได้' | tx }}</span>
          </div>
          <div class="table-wrap">
            <table class="bo-table matrix">
              <thead>
                <tr>
                  <th scope="col">{{ 'ชื่อบุคลากร' | tx }}</th>
                  @for (p of privileges; track p) {<th scope="col" class="priv-col">{{ PRIVILEGE[p].label | tx }}</th>}
                </tr>
              </thead>
              <tbody>
                @for (s of people(); track s.id) {
                  <tr class="static">
                    <th scope="row"><b>{{ s.name | tx }}</b><div class="secondary">{{ ROLE[s.role].label | tx }}</div></th>
                    @for (p of privileges; track p) {
                      @let c = cell(s.id, p);
                      <td class="priv-col">
                        @if (c !== 'n/a') {
                          <button type="button" class="priv" [class]="'priv ' + CELL[c].cls" [attr.aria-label]="(s.name | tx) + ' · ' + (PRIVILEGE[p].label | tx) + ': ' + (CELL[c].label | tx)" [attr.title]="hint(s.id, p, c) | tx" (click)="actions.changePrivilege(s.id, p)">{{ CELL[c].mark }}</button>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="legend">
            @for (l of legend; track l) {<span><span class="priv" [class]="'priv ' + CELL[l].cls" aria-hidden="true">{{ CELL[l].mark }}</span>{{ CELL[l].label | tx }}</span>}
          </div>
        </div>

        <div class="panel">
          <div class="filter-bar"><b>{{ 'สิทธิ์อิงอะไร' | tx }}</b><span class="secondary grow">{{ 'ใบอนุญาตต้องตรวจสอบแล้วและยังไม่หมดอายุ · ใบอนุญาตใช้ไม่ได้ สิทธิ์ถูกระงับโดยผลโดยไม่ต้องถอน' | tx }}</span></div>
          <dl class="data-grid wide">
            @for (p of privileges; track p) {
              <dt>{{ PRIVILEGE[p].label | tx }}</dt>
              <dd>{{ roleList(p) }} · {{ needs(p) }}</dd>
            }
          </dl>
        </div>
      </div>

      <aside class="record-rail">
        <div class="panel actions">
          <b>{{ 'ประวัติการเปลี่ยนสิทธิ์' | tx }}</b>
          <div class="timeline compact">
            @for (c of log(); track c.id) {
              <div class="tl">
                <span class="chip" [class]="'chip ' + (c.action === 'grant' ? 'ok' : 'danger')">{{ (c.action === 'grant' ? 'ให้สิทธิ์' : 'ถอนสิทธิ์') | tx }}</span>
                <b>{{ name(c.staffId) | tx }}</b> · {{ PRIVILEGE[c.privilege].label | tx }}
                <div class="secondary">{{ c.at }} · {{ c.by | tx }} — {{ c.reason | tx }}</div>
              </div>
            }
          </div>
          <p class="secondary">{{ 'บันทึกต่อท้ายเท่านั้น · ผู้มีอำนาจตาม M24 เป็นผู้เปลี่ยน · สิทธิ์ในระบบ (สั่งยา บันทึก) ยังต้องมีบทบาทที่ IAM ให้' | tx }}</p>
        </div>
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class PrivilegesComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly i18n = inject(BoI18n);
  protected readonly ROLE = ROLE;
  protected readonly PRIVILEGE = PRIVILEGE;
  protected readonly CELL = PRIVILEGE_CELL;
  protected readonly privileges = PRIVILEGES;
  protected readonly roles = CLINICAL;
  protected readonly legend = LEGEND;

  protected readonly role = signal<StaffRole | ''>('');
  protected readonly people = computed<StaffMember[]>(() => this.store.data().staff.filter(s => CLINICAL.includes(s.role) && s.status !== 'inactive' && (!this.role() || s.role === this.role())));
  protected readonly log = computed(() => this.store.data().privilegeLog);

  protected cell(staffId: string, p: Privilege) {
    return privilegeCell(this.store.data(), staffId, p);
  }

  /** What the cell rests on, or what it lacks */
  protected hint(staffId: string, p: Privilege, c: PrivilegeCell) {
    return c === 'lapsed' || c === 'none' ? privilegeGaps(this.store.data(), staffId, p)[0] ?? PRIVILEGE_CELL[c].label : PRIVILEGE_CELL[c].label;
  }

  protected name(id: string) {
    return staffOf(this.store.data(), id)?.name ?? id;
  }

  protected roleList(p: Privilege) {
    return PRIVILEGE[p].roles.map(r => this.i18n.t(ROLE[r].label)).join(', ');
  }

  protected needs(p: Privilege) {
    return PRIVILEGE[p].needs.length ? PRIVILEGE[p].needs.map(k => this.i18n.t(LICENSE_KIND[k].label)).join(' + ') : this.i18n.t('ตามขอบเขตที่โรงพยาบาลกำหนด');
  }
}
