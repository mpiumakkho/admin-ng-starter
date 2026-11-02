/* Import and export history: the jobs across modules, their result and file, read only; a job is re-run where it is owned, and generic import waits for its contract (INT-IEX-01) */
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BackofficeStore } from '../../backoffice.store';
import { JOB_STATUS, type JobStatus, jobs } from '../../data/integrations';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, ModuleTag, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

@Component({
  selector: 'bo-import-export',
  imports: [PagerFoot, RouterLink, TxPipe, PageHead, Drawer, ModuleTag],
  template: `
    <bo-page-head [heading]="'ประวัติการนำเข้าและส่งออก'" [source]="'INT-IEX-01 · M11 accounting_export_log · M31 RoPA · ประวัติอ่านอย่างเดียว ไม่ใช่คิวที่สอง · ส่งออกสำเร็จไม่ได้แปลว่าปลายทางยอมรับ'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <select class="ui-input" [attr.aria-label]="'ประเภท' | tx" (change)="kind.set($any($event.target).value)">
            <option value="">{{ 'ทุกประเภท' | tx }}</option>
            <option value="export">{{ 'ส่งออก' | tx }}</option>
            <option value="import">{{ 'นำเข้า' | tx }}</option>
          </select>
          <select class="ui-input" [attr.aria-label]="'โมดูล' | tx" (change)="module.set($any($event.target).value)">
            <option value="">{{ 'ทุกโมดูล' | tx }}</option>
            <option value="M11">M11</option>
            <option value="M31">M31</option>
          </select>
          <select class="ui-input" [attr.aria-label]="'สถานะ' | tx" (change)="status.set($any($event.target).value)">
            <option value="">{{ 'ทุกสถานะ' | tx }}</option>
            @for (s of statusKeys; track s) {<option [value]="s">{{ JOB_STATUS[s].label | tx }}</option>}
          </select>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table jobs">
            <thead><tr>
              <th scope="col" class="w-at">{{ 'เวลา' | tx }}</th>
              <th scope="col">{{ 'งาน' | tx }}</th>
              <th scope="col" class="w-module">{{ 'โมดูล' | tx }}</th>
              <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              <th scope="col" class="num w-kind">{{ 'ผลลัพธ์' | tx }}</th>
              <th scope="col" class="w-ref">{{ 'ไฟล์ผลลัพธ์' | tx }}</th>
            </tr></thead>
            <tbody>
              @for (j of pager.rows(); track j.id) {
                <tr [class.selected]="j.id === selectedId()" tabindex="0" (click)="pick(j.id)" (keydown.enter)="pick(j.id)" [attr.aria-selected]="j.id === selectedId()">
                  <td class="num">{{ j.at }}</td>
                  <td><b>{{ j.title | tx }}</b><div class="secondary">{{ (j.kind === 'export' ? 'ส่งออก' : 'นำเข้า') | tx }} · {{ j.id }}</div></td>
                  <td><bo-module [code]="j.module" /></td>
                  <td><span class="chip" [class]="'chip ' + JOB_STATUS[j.status].cls">{{ JOB_STATUS[j.status].label | tx }}</span></td>
                  <td class="num">{{ j.result }}</td>
                  <td>{{ j.artifact ?? '—' }}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ 'ไม่มีรายการที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (selected(); as j) {
        <bo-drawer [heading]="j.title" [sub]="j.id" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'สถานะ' | tx }}</dt><dd><span class="chip" [class]="'chip ' + JOB_STATUS[j.status].cls">{{ JOB_STATUS[j.status].label | tx }}</span> · {{ j.result }}</dd>
            <dt>{{ 'เวลา' | tx }}</dt><dd>{{ j.at }} · {{ j.by | tx }}</dd>
            <dt>{{ 'ขอบเขต' | tx }}</dt><dd>{{ j.scope | tx }}</dd>
            <dt>{{ 'ไฟล์ผลลัพธ์' | tx }}</dt><dd>{{ j.artifact ?? ('ส่งผ่าน API ไม่มีไฟล์' | tx) }}</dd>
          </dl>
          @if (j.errors.length) {
            <h3>{{ 'ข้อผิดพลาด' | tx }}</h3>
            <ul class="plain">@for (e of j.errors; track e) {<li class="text-danger">{{ e }}</li>}</ul>
          }
          <p class="secondary">{{ 'การส่งใหม่ทำที่หน้าเจ้าของงาน' | tx }}</p>
          <ng-container foot><a class="link" [routerLink]="j.link">{{ 'เปิดหน้า {page}' | tx: { page: (j.owner | tx) } }}</a></ng-container>
        </bo-drawer>
      }
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'การนำเข้า' | tx }}</b><span class="chip quiet">GATED</span></div>
      <p class="notice warn">{{ 'การนำเข้าทั่วไปยังไม่เปิดใช้งาน: รอสัญญา job log และการรับไฟล์' | tx }}</p>
    </div>
  `,
  host: { class: 'page' },
})
export class ImportExportComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly JOB_STATUS = JOB_STATUS;
  protected readonly statusKeys = Object.keys(JOB_STATUS) as JobStatus[];
  protected readonly kind = signal('');
  protected readonly module = signal('');
  protected readonly status = signal('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly all = computed(() => jobs(this.store.data()));
  protected readonly rows = computed(() => this.all().filter(j => (!this.kind() || j.kind === this.kind()) && (!this.module() || j.module === this.module()) && (!this.status() || j.status === this.status())));
  protected readonly selected = computed(() => this.all().find(j => j.id === this.selectedId()));

  protected pick(id: string) {
    this.selectedId.set(this.selectedId() === id ? null : id);
  }
}
