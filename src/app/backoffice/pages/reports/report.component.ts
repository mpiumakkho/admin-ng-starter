/* An executive report: its strip, one or two single-series charts, the ranked rows that lead back to their owning pages, and each figure's metric contract (reports.*, COMPOSED) */
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { BackofficeStore } from '../../backoffice.store';
import { SEVERITY } from '../../data/home';
import { CUTOFF, PERIODS, type Bar, report, type ReportKey } from '../../data/reports';
import { TxPipe } from '../../i18n/bo-i18n';
import { ModuleTag, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-report',
  imports: [RouterLink, TxPipe, PageHead, ModuleTag],
  template: `
    @let r = view();
    <bo-page-head [heading]="r.title" [source]="r.source" [freshness]="'ตัดข้อมูล {at}' | tx: { at: cutoff }">
      @if (r.periodic) {
        <div class="segmented" role="group" [attr.aria-label]="'ช่วงเวลา' | tx">
          @for (p of periods; track p[0]) {<button type="button" [class.active]="days() === p[0]" [attr.aria-pressed]="days() === p[0]" (click)="days.set(p[0])">{{ p[1] | tx }}</button>}
        </div>
      }
    </bo-page-head>
    <p class="notice info">{{ 'metric ต้นแบบ ไม่ใช่ตัวเลขทางการ: ทุกตัวเลขมีสูตร แหล่งข้อมูล และข้อจำกัดในส่วนสัญญาตัวชี้วัดด้านล่าง · รายงานไม่ใช่แหล่งบันทึกรายการ แก้ไขที่หน้าต้นทางเท่านั้น' | tx }}</p>

    <div class="kpi-strip" role="list">
      @for (t of r.tiles; track t.label) {
        <a class="kpi" role="listitem" [routerLink]="t.link" [class.danger]="t.tone === 'danger'" [class.warn]="t.tone === 'warn'">
          <span class="kpi-value">{{ t.value }}</span><span class="kpi-label">{{ t.label | tx }}</span>
          @if (t.sub) {<span class="kpi-sub">{{ t.sub | tx }}</span>}
        </a>
      }
    </div>

    <div class="split" [class.pair]="r.charts.length > 1">
      @for (c of r.charts; track c.title) {
        <figure class="panel report-chart">
          <figcaption class="filter-bar"><b>{{ c.title | tx }}</b><span class="secondary grow">{{ c.note | tx }}</span></figcaption>
          @if (max(c.bars); as top) {
            <ul class="hbars">
              @for (b of c.bars; track b.label) {
                <li [attr.title]="(b.label | tx) + ': ' + b.text">
                  <span class="hbar-label">{{ b.label | tx }}</span>
                  <span class="hbar-track" aria-hidden="true"><span class="hbar-fill" [style.width.%]="(b.value / top) * 100"></span></span>
                  <span class="hbar-value">{{ b.text }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="secondary foot-note">{{ 'ไม่มีข้อมูลในช่วงนี้' | tx }}</p>
          }
        </figure>
      }
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ r.rowsTitle | tx }}</b><span class="secondary grow">{{ r.rowsNote | tx }} · {{ '{n} รายการ' | tx: { n: r.rows.length } }}</span></div>
      <div class="table-wrap">
        <table class="bo-table report-rows">
          <thead><tr>
            <th scope="col" class="w-priority">{{ 'ความเร่งด่วน' | tx }}</th>
            <th scope="col" class="w-module">{{ 'โมดูล' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'ประเภท' | tx }}</th>
            <th scope="col">{{ 'รายการ' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (x of r.rows; track $index) {
              <tr class="static">
                <td><span class="chip" [class]="'chip ' + SEVERITY[x.severity].cls">{{ SEVERITY[x.severity].label | tx }}</span></td>
                <td><bo-module [code]="x.module" /></td>
                <td>{{ x.kind | tx }}</td>
                <td><a class="link" [routerLink]="x.link">{{ x.ref | tx }}</a><div class="secondary">{{ x.detail | tx }}</div></td>
              </tr>
            } @empty {
              <tr class="static"><td colspan="4" class="empty">{{ 'ไม่มีรายการที่ต้องตัดสินใจ ณ เวลาตัดข้อมูล' | tx }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <details class="panel metric-contracts">
      <summary><b>{{ 'สัญญาตัวชี้วัด (ต้นแบบ)' | tx }}</b> <span class="secondary">{{ '{n} ตัว · สูตร แหล่งข้อมูล เวลาตัดข้อมูล เจ้าของ และข้อจำกัด' | tx: { n: r.metrics.length } }}</span></summary>
      <div class="table-wrap">
        <table class="bo-table">
          <thead><tr>
            <th scope="col">{{ 'ตัวชี้วัด' | tx }}</th>
            <th scope="col">{{ 'สูตร' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'แหล่งข้อมูล' | tx }}</th>
            <th scope="col" class="w-owner">{{ 'เจ้าของ' | tx }}</th>
            <th scope="col">{{ 'ข้อจำกัด' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (m of r.metrics; track m.label) {
              <tr class="static">
                <td><b>{{ m.label | tx }}</b><div class="secondary">{{ m.cutoff | tx }}</div></td>
                <td>{{ m.formula | tx }}</td>
                <td>{{ m.source | tx }}</td>
                <td>{{ m.owner | tx }}</td>
                <td>{{ m.limitation | tx }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </details>
  `,
  host: { class: 'page' },
})
export class ReportComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly SEVERITY = SEVERITY;
  protected readonly periods = PERIODS;
  protected readonly cutoff = CUTOFF;

  private readonly key = toSignal(inject(ActivatedRoute).data.pipe(map(d => d['report'] as ReportKey)), { initialValue: 'executive' as ReportKey });
  protected readonly days = signal(30);
  protected readonly view = computed(() => report(this.key(), this.store.clinic.data(), this.store.data(), this.days()));

  protected max(list: Bar[]) {
    return Math.max(0, ...list.map(b => b.value));
  }
}
