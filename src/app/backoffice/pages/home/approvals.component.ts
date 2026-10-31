/* The approval queue: requests a canonical rule needs a decision on, each decided by its owning module's rule (ux/menus/01-home.md) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCircleCheck, lucideCircleX } from '@ng-icons/lucide';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { ageDays, APPROVAL_KIND, APPROVAL_STATUS, approvalAging, canDecide } from '../../data/home';
import type { Approval } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, ModuleTag, PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-approvals',
  imports: [NgIcon, TxPipe, UiButton, PageHead, ModuleTag, Drawer],
  template: `
    <bo-page-head [heading]="'รายการอนุมัติ'" [source]="'คืนเงิน ส่วนลด ส่งออกบันทึกตรวจสอบ ข้อร้องเรียนรุนแรง สิทธิ์ชั่วคราว · ตัดสินได้เฉพาะตามกฎของโมดูลเจ้าของ'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="kpi-strip" role="list">
      <div class="kpi" role="listitem"><span class="kpi-value">{{ aging().pending }}</span><span class="kpi-label">{{ 'รออนุมัติ' | tx }}</span></div>
      <div class="kpi" [class.warn]="aging().overDay" role="listitem"><span class="kpi-value">{{ aging().overDay }}</span><span class="kpi-label">{{ 'รอเกิน 1 วัน' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ aging().oldest }}</span><span class="kpi-label">{{ 'รอนานสุด (วัน)' | tx }}</span></div>
      <div class="kpi" role="listitem"><span class="kpi-value">{{ decidedToday() }}</span><span class="kpi-label">{{ 'ตัดสินวันนี้' | tx }}</span></div>
    </div>

    <div class="split" [class.with-drawer]="selected()">
      <div class="panel">
        <div class="filter-bar">
          <div class="segmented" role="group" [attr.aria-label]="'สถานะ' | tx">
            @for (s of statusKeys; track s) {
              <button type="button" [class.active]="status() === s" [attr.aria-pressed]="status() === s" (click)="status.set(s)">{{ APPROVAL_STATUS[s].label | tx }}</button>
            }
            <button type="button" [class.active]="status() === ''" [attr.aria-pressed]="status() === ''" (click)="status.set('')">{{ 'ทั้งหมด' | tx }}</button>
          </div>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table approvals">
            <thead>
              <tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
                <th scope="col">{{ 'คำขอ' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'จำนวนเงิน' | tx }}</th>
                <th scope="col" class="w-owner">{{ 'ขอโดย' | tx }}</th>
                <th scope="col" class="w-due">{{ 'รอมาแล้ว' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (a of rows(); track a.id) {
                <tr [class.selected]="a.id === selected()?.id" (click)="pick(a)" tabindex="0" (keydown.enter)="pick(a)" [attr.aria-selected]="a.id === selected()?.id">
                  <td><b>{{ a.ref }}</b><div class="secondary"><bo-module [code]="a.module" /></div></td>
                  <td>{{ APPROVAL_KIND[a.kind] | tx }}</td>
                  <td><b>{{ a.title | tx }}</b><div class="secondary">{{ a.detail | tx }}</div></td>
                  <td class="num">{{ a.amount ? '฿' + a.amount.toLocaleString('en-US') : '—' }}</td>
                  <td>{{ a.requestedBy | tx }}<div class="secondary">{{ a.requestedAt }}</div></td>
                  <td class="num" [class.text-danger]="a.status === 'pending' && ageDays(a.requestedAt) >= 1">{{ '{n} วัน' | tx: { n: ageDays(a.requestedAt) } }}</td>
                  <td><span class="chip" [class]="'chip ' + APPROVAL_STATUS[a.status].cls">{{ APPROVAL_STATUS[a.status].label | tx }}</span></td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="7" class="empty">{{ 'ไม่มีคำขอในสถานะนี้' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (selected(); as a) {
        <bo-drawer [heading]="a.title" [sub]="APPROVAL_KIND[a.kind] + ' · ' + a.ref" (closed)="selected.set(null)">
          <dl class="data-grid">
            <dt>{{ 'โมดูล' | tx }}</dt><dd><bo-module [code]="a.module" /></dd>
            <dt>{{ 'ขอโดย' | tx }}</dt><dd>{{ a.requestedBy | tx }} · {{ a.requestedAt }}</dd>
            <dt>{{ 'ผู้มีสิทธิ์ตัดสิน' | tx }}</dt><dd>{{ a.approver | tx }}</dd>
            @if (a.amount) {<dt>{{ 'จำนวนเงิน' | tx }}</dt><dd class="num-left">฿{{ a.amount.toLocaleString('en-US') }}</dd>}
            <dt>{{ 'เหตุผลที่ขอ' | tx }}</dt><dd>{{ a.reason | tx }}</dd>
          </dl>
          <h3>{{ 'หลักฐานประกอบ' | tx }}</h3>
          <dl class="data-grid">
            @for (e of a.evidence; track $index) {<dt>{{ e[0] | tx }}</dt><dd>{{ e[1] | tx }}</dd>}
          </dl>
          @if (a.status !== 'pending') {
            <div class="decision" [class]="'decision ' + APPROVAL_STATUS[a.status].cls">
              <b>{{ APPROVAL_STATUS[a.status].label | tx }}</b> · {{ a.decidedBy | tx }} · {{ a.decidedAt }}
              <p>{{ a.decision | tx }}</p>
            </div>
          } @else if (!canDecide(a, store.userName())) {
            <p class="secondary">{{ 'คุณเป็นผู้ขอรายการนี้ จึงตัดสินเองไม่ได้ (การแยกหน้าที่)' | tx }}</p>
          }
          <ng-container foot>
            @if (a.status === 'pending') {
              <button uiButton variant="danger" size="sm" type="button" [disabled]="!canDecide(a, store.userName())" (click)="actions.decide(a, 'rejected')">
                <ng-icon [svg]="icons.reject" aria-hidden="true" />{{ 'ปฏิเสธ' | tx }}
              </button>
              <span class="grow"></span>
              <button uiButton size="sm" type="button" [disabled]="!canDecide(a, store.userName())" (click)="actions.decide(a, 'approved')">
                <ng-icon [svg]="icons.approve" aria-hidden="true" />{{ 'อนุมัติ' | tx }}
              </button>
            }
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class ApprovalsComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  protected readonly APPROVAL_KIND = APPROVAL_KIND;
  protected readonly APPROVAL_STATUS = APPROVAL_STATUS;
  protected readonly statusKeys = Object.keys(APPROVAL_STATUS) as Approval['status'][];
  protected readonly ageDays = ageDays;
  protected readonly canDecide = canDecide;
  protected readonly icons = { approve: lucideCircleCheck, reject: lucideCircleX };

  protected readonly status = signal<Approval['status'] | ''>('pending');
  protected readonly selected = signal<Approval | null>(null);
  protected readonly aging = computed(() => approvalAging(this.store.data().approvals));
  protected readonly decidedToday = computed(() => this.store.data().approvals.filter(a => a.decidedAt?.startsWith('2026-09-24')).length);
  protected readonly rows = computed(() => this.store.data().approvals.filter(a => !this.status() || a.status === this.status()));

  protected pick(a: Approval) {
    this.selected.set(this.selected()?.id === a.id ? null : a);
  }
}
