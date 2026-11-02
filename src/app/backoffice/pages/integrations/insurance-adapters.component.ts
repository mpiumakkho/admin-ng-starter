/* Insurance adapters: no contract yet, so no adapter, only what one needs and where claims are made by hand today (INT-INS-01, M16 P4 · HIDDEN/GATED) */
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BackofficeStore } from '../../backoffice.store';
import { INSURANCE_PREREQS, payers } from '../../data/integrations';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-insurance-adapters',
  imports: [RouterLink, TxPipe, PageHead],
  template: `
    <bo-page-head [heading]="'การเชื่อมต่อบริษัทประกัน'" [source]="'INT-INS-01 · M16 P4 · ไม่มี endpoint และไม่มีสัญญา adapter · การกระทบยอดประกันอยู่ที่การเงิน · สัญญาการออกแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />
    <p class="notice warn">{{ 'ยังไม่มีสัญญาการเชื่อมต่อประกัน หน้านี้ยังไม่เปิดใช้งาน ไม่มีการตั้งค่า ส่งเคลม หรือดู EOB' | tx }}</p>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'สิ่งที่ต้องมีก่อนเปิดใช้' | tx }}</b></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead><tr><th scope="col">{{ 'ข้อกำหนด' | tx }}</th><th scope="col">{{ 'เหตุผล' | tx }}</th><th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th></tr></thead>
          <tbody>
            @for (p of prereqs; track p[0]) {
              <tr class="static"><td>{{ p[0] | tx }}</td><td class="secondary">{{ p[1] | tx }}</td><td><span class="chip quiet">{{ 'ยังไม่มี' | tx }}</span></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'เคลมที่ทำด้วยมือวันนี้' | tx }}</b><span class="secondary grow">{{ 'ส่งเอกสารเองที่หน้าเคลมประกัน ไม่ผ่าน adapter' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead><tr><th scope="col">{{ 'บริษัทประกัน' | tx }}</th><th scope="col" class="num">{{ 'เคลมทั้งหมด' | tx }}</th><th scope="col" class="num">{{ 'ยังไม่ปิด' | tx }}</th></tr></thead>
          <tbody>
            @for (p of payers(); track p.insurer) {
              <tr class="static"><td>{{ p.insurer }}</td><td class="num">{{ p.claims }}</td><td class="num">{{ p.open }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="secondary foot-note"><a class="link" routerLink="/backoffice/sales/claims">{{ 'เปิดเคลมประกัน' | tx }}</a></p>
    </div>
  `,
  host: { class: 'page' },
})
export class InsuranceAdaptersComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly prereqs = INSURANCE_PREREQS;
  protected readonly payers = computed(() => payers(this.store.data()));
}
