/* Retention: each dataset's policy, what is past its window, and what is held on purpose; purging is the backend's and not enforced yet (GOV-RET-01 quality.retention, M31 · GATED) */
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BackofficeStore } from '../../backoffice.store';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-retention',
  imports: [RouterLink, TxPipe, PageHead],
  template: `
    <bo-page-head [heading]="'นโยบายการเก็บรักษาข้อมูล'" [source]="'GOV-RET-01 · M31 · สถานะการเก็บต่อชุดข้อมูล (อ่านอย่างเดียว) · นโยบายตั้งที่ settings/11 · auto-purge เป็นงานของ backend · สัญญาการออกแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />
    <p class="notice warn">{{ 'การบังคับนโยบายการเก็บยังไม่เปิดใช้งาน: ข้อมูลที่เกินระยะเก็บยังไม่ถูกลบอัตโนมัติ ตัวเลขด้านล่างเป็นข้อมูลตัวอย่าง' | tx }}</p>

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ rows().length }}</span><span class="kpi-label">{{ 'ชุดข้อมูล' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.warn]="past()"><span class="kpi-value">{{ past().toLocaleString('en-US') }}</span><span class="kpi-label">{{ 'เกินระยะเก็บ รอ auto-purge' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ held() }}</span><span class="kpi-label">{{ 'ชุดข้อมูลที่ถูกระงับการลบ' | tx }}</span></div>
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table class="bo-table retention">
          <thead><tr>
            <th scope="col">{{ 'ชุดข้อมูล' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'นโยบายการเก็บ' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'ฐานทางกฎหมาย' | tx }}</th>
            <th scope="col" class="num w-kind">{{ 'จำนวน' | tx }}</th>
            <th scope="col" class="num w-kind">{{ 'เกินระยะเก็บ' | tx }}</th>
            <th scope="col" class="w-status">{{ 'สถานะการลบ' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (d of rows(); track d.id) {
              <tr class="static">
                <td><b>{{ d.dataset | tx }}</b><div class="secondary">{{ d.module | tx }}@if (d.hold) { · <span class="text-danger">{{ 'ระงับการลบ: {why}' | tx: { why: (d.hold | tx) } }}</span>}</div></td>
                <td>{{ d.policy | tx }}</td>
                <td>{{ d.basis | tx }}</td>
                <td class="num">{{ d.records.toLocaleString('en-US') }}</td>
                <td class="num" [class.text-danger]="d.pastWindow">{{ d.pastWindow.toLocaleString('en-US') }}</td>
                <td><span class="chip quiet">GATED</span><div class="secondary">{{ (d.pastWindow ? 'รอ auto-purge' : 'ไม่มีที่ต้องลบ') | tx }}</div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="secondary foot-note">{{ 'แก้นโยบายที่ ตั้งค่าระบบ > นโยบายการเก็บรักษา (settings/11) · บันทึกตรวจสอบเก็บ 7 ปีตามกฎหมาย ดูที่' | tx }} <a class="link" routerLink="/backoffice/quality/audit-integrity">{{ 'ตรวจความถูกต้อง Audit' | tx }}</a></p>
    </div>
  `,
  host: { class: 'page' },
})
export class RetentionComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly rows = computed(() => this.store.data().retention);
  protected readonly past = computed(() => this.rows().reduce((n, d) => n + d.pastWindow, 0));
  protected readonly held = computed(() => this.rows().filter(d => d.hold).length);
}
