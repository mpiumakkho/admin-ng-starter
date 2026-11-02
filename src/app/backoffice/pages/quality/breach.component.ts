/* Data breaches: each against its seventy-two hours to notify, recorded here and worked on its own page (GOV-BRC-01, M31 · GATED) */
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { NOW, TODAY } from '../../../clinic/data/model';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { BREACH_SEVERITY, BREACH_STATUS, breachFlag, breachProblems, type BreachInput, DUE_FLAG, notified, owedNotices } from '../../data/governance';
import { hoursLeft } from '../../data/quality';
import type { Breach } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

const BLANK: BreachInput = { title: '', discoveredAt: `${TODAY}T${NOW}`, source: '', description: '', count: '', kinds: '' };

@Component({
  selector: 'bo-breach',
  imports: [PagerFoot, NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    <bo-page-head [heading]="'เหตุละเมิดข้อมูล'" [source]="'GOV-BRC-01 · M31 · แจ้ง สคส. ภายใน 72 ชม. นับจากพบเหตุ (เส้นตายจาก backend) · ระดับความรุนแรงกำหนดว่าต้องแจ้งใคร · สัญญาการออกแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="reporting.set(true)"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'บันทึกเหตุใหม่' | tx }}</button>
    </bo-page-head>
    <p class="notice warn">{{ 'ระบบ PDPA (M31) ยังไม่พร้อม หน้านี้เป็นสัญญาการออกแบบ' | tx }}</p>

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ open().length }}</span><span class="kpi-label">{{ 'เปิดค้าง' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.danger]="near()"><span class="kpi-value">{{ near() }}</span><span class="kpi-label">{{ 'ใกล้ครบ 72 ชม.' | tx }}</span></div>
      <div class="kpi" role="listitem" [class.warn]="unnotified()"><span class="kpi-value">{{ unnotified() }}</span><span class="kpi-label">{{ 'ยังไม่แจ้ง สคส.' | tx }}</span></div>
    </div>

    <div class="split" [class.with-drawer]="reporting()">
      <div class="panel">
        <div class="filter-bar">
          <label class="check"><input type="checkbox" [checked]="nearOnly()" (change)="nearOnly.set($any($event.target).checked)" />{{ 'เฉพาะใกล้ครบกำหนด' | tx }}</label>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table breaches">
            <thead><tr>
              <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
              <th scope="col">{{ 'เหตุ' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'ความรุนแรง' | tx }}</th>
              <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              <th scope="col" class="w-due">{{ 'ครบกำหนดแจ้ง (72 ชม.)' | tx }}</th>
              <th scope="col" class="w-kind">{{ 'แจ้ง สคส. แล้ว' | tx }}</th>
            </tr></thead>
            <tbody>
              @for (b of pager.rows(); track b.id) {
                @let f = flag(b);
                <tr tabindex="0" (click)="open$(b)" (keydown.enter)="open$(b)">
                  <td><b>{{ b.id }}</b><div class="secondary">{{ b.discoveredAt }}</div></td>
                  <td>{{ b.title | tx }}<div class="secondary">{{ 'กระทบ {n} ราย' | tx: { n: b.affected.count } }} · {{ b.source | tx }}</div></td>
                  <td>@if (b.severity) {<span class="chip" [class]="'chip ' + SEVERITY[b.severity].cls">{{ SEVERITY[b.severity].label | tx }}</span>} @else {<span class="secondary">{{ 'ยังไม่ประเมิน' | tx }}</span>}</td>
                  <td><span class="chip" [class]="'chip ' + STATUS[b.status].cls">{{ STATUS[b.status].label | tx }}</span></td>
                  <td class="num">{{ b.statutoryDue }}@if (f) {<div class="secondary" [class.text-danger]="f !== 'ok'">@if (f !== 'ok') {<span aria-hidden="true">⚠ </span>}{{ DUE[f].label | tx }} · {{ 'เหลือ {n} ชม.' | tx: { n: hours(b) } }}</div>}</td>
                  <td>{{ (pdpc(b) ? 'แจ้งแล้ว' : b.severity === 'low' ? 'ไม่ต้องแจ้ง' : 'ยังไม่แจ้ง') | tx }}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="6" class="empty">{{ (nearOnly() ? 'ไม่มีเหตุที่ใกล้ครบกำหนด' : 'ยังไม่มีเหตุที่บันทึกไว้ ซึ่งไม่ได้แปลว่าไม่มีความเสี่ยง') | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (reporting()) {
        <bo-drawer [heading]="'บันทึกเหตุใหม่'" [sub]="'นับ 72 ชม. ตั้งแต่พบเหตุ'" (closed)="reporting.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'ชื่อเหตุ' | tx }}<input class="ui-input" [value]="form().title" (input)="set('title', $any($event.target).value)" /></label>
            <label>{{ 'พบเมื่อ' | tx }}<input class="ui-input" type="datetime-local" [value]="form().discoveredAt" (input)="set('discoveredAt', $any($event.target).value)" /></label>
            <label>{{ 'แหล่งที่พบ' | tx }}<input class="ui-input" [value]="form().source" (input)="set('source', $any($event.target).value)" /></label>
            <label>{{ 'ผู้ได้รับผลกระทบ (ประมาณ)' | tx }}<input class="ui-input" inputmode="numeric" [value]="form().count" (input)="set('count', $any($event.target).value)" /></label>
            <label>{{ 'ประเภทข้อมูล (คั่นด้วย ,)' | tx }}<input class="ui-input" [value]="form().kinds" (input)="set('kinds', $any($event.target).value)" /></label>
            <label class="full">{{ 'เกิดอะไรขึ้น' | tx }}<textarea class="ui-input" rows="3" [value]="form().description" (input)="set('description', $any($event.target).value)"></textarea></label>
          </div>
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="reporting.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="report()">{{ 'บันทึกเหตุ' | tx }}</button>
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class BreachComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  private readonly actions = inject(BackofficeActions);
  private readonly router = inject(Router);
  protected readonly plus = lucidePlus;
  protected readonly SEVERITY = BREACH_SEVERITY;
  protected readonly STATUS = BREACH_STATUS;
  protected readonly DUE = DUE_FLAG;

  protected readonly nearOnly = signal(false);
  protected readonly open = computed(() => this.store.data().breaches.filter(b => b.status !== 'closed'));
  protected readonly near = computed(() => this.open().filter(b => (breachFlag(b) ?? 'ok') !== 'ok').length);
  protected readonly unnotified = computed(() => this.open().filter(b => owedNotices(b).includes('pdpc')).length);
  protected readonly rows = computed(() => this.store.data().breaches.filter(b => !this.nearOnly() || (breachFlag(b) ?? 'ok') !== 'ok')
    .sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed') || a.statutoryDue.localeCompare(b.statutoryDue)));

  protected readonly reporting = signal(false);
  protected readonly form = signal<BreachInput>({ ...BLANK });
  protected readonly problems = computed(() => breachProblems(this.form()));

  protected flag(b: Breach) {
    return breachFlag(b);
  }

  protected hours(b: Breach) {
    return Math.max(0, Math.floor(hoursLeft(b.statutoryDue)));
  }

  protected pdpc(b: Breach) {
    return notified(b, 'pdpc');
  }

  protected open$(b: Breach) {
    this.router.navigate(['/backoffice/quality/breach', b.id]);
  }

  protected set<K extends keyof BreachInput>(key: K, value: BreachInput[K]) {
    this.form.set({ ...this.form(), [key]: value });
  }

  protected report() {
    this.actions.reportBreach(this.form(), b => {
      this.reporting.set(false);
      this.form.set({ ...BLANK });
      this.router.navigate(['/backoffice/quality/breach', b.id]);
    });
  }
}
