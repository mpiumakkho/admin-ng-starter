/* Insurance claims: claims and pre-authorisations tracked by hand from the form to the money, until the insurers' APIs (sales.insuranceClaims, M16 P1) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus, lucidePrinter } from '@ng-icons/lucide';

import { baht } from '../../../clinic/data/rail';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { CLAIM_KIND, CLAIM_STATUS, claimableInvoices, claimEstimate, claimProblems, claimSummary, eobVariance, INSURERS, isOverdue, policyOf } from '../../data/sales';
import type { ClaimInput } from '../../data/sales';
import type { Claim, ClaimStatus, Insurer } from '../../data/types';
import { TxPipe } from '../../i18n/bo-i18n';
import { Drawer, PageHead } from '../../shared/parts';
import { Pager, PagerFoot } from '../../shared/pager';

const STATUS_KEYS = Object.keys(CLAIM_STATUS) as ClaimStatus[];

@Component({
  selector: 'bo-claims',
  imports: [PagerFoot, NgIcon, TxPipe, UiButton, PageHead, Drawer],
  template: `
    @let s = summary();
    <bo-page-head [heading]="'การเคลมประกันสัตว์เลี้ยง'" [source]="'M16 P1 · ออกเอกสารตามแบบของบริษัทประกัน ส่งเอง และบันทึกสถานะ · การส่งผ่าน API ของ Falcon MSIG Roojai เป็น P4'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'">
      <button uiButton size="sm" type="button" (click)="openCreate()"><ng-icon [svg]="icons.plus" aria-hidden="true" />{{ 'สร้างเคลม' | tx }}</button>
    </bo-page-head>

    <div class="kpi-strip" role="list">
      <button type="button" class="kpi" [class.active]="status() === 'draft'" role="listitem" (click)="toggle('draft')"><span class="kpi-value">{{ s.drafts }}</span><span class="kpi-label">{{ 'ยังไม่ส่ง' | tx }}</span></button>
      <button type="button" class="kpi" [class.warn]="s.waiting.count" [class.active]="status() === 'submitted'" role="listitem" (click)="toggle('submitted')"><span class="kpi-value">{{ baht(s.waiting.amount) }}</span><span class="kpi-label">{{ 'ส่งแล้ว รอผล · {n} · เกิน 14 วัน {m}' | tx: { n: s.waiting.count, m: s.overdue } }}</span></button>
      <button type="button" class="kpi" [class.active]="status() === 'approved'" role="listitem" (click)="toggle('approved')"><span class="kpi-value">{{ baht(s.approved.amount) }}</span><span class="kpi-label">{{ 'อนุมัติแล้ว รอรับเงิน · {n}' | tx: { n: s.approved.count } }}</span></button>
      <button type="button" class="kpi" [class.active]="status() === 'reimbursed'" role="listitem" (click)="toggle('reimbursed')"><span class="kpi-value">{{ baht(s.reimbursed) }}</span><span class="kpi-label">{{ 'ได้รับเงินแล้ว' | tx }}</span></button>
      <button type="button" class="kpi" [class.danger]="s.rejected" [class.active]="status() === 'rejected'" role="listitem" (click)="toggle('rejected')"><span class="kpi-value">{{ s.rejected }}</span><span class="kpi-label">{{ 'ปฏิเสธ' | tx }}</span></button>
    </div>

    <div class="split" [class.with-drawer]="selected() || creating()">
      <div class="panel">
        <div class="filter-bar">
          <select class="ui-input" [attr.aria-label]="'บริษัทประกัน' | tx" (change)="insurer.set($any($event.target).value)">
            <option value="" [selected]="!insurer()">{{ 'ทุกบริษัท' | tx }}</option>
            @for (x of insurers; track x) {<option [value]="x" [selected]="x === insurer()">{{ x }}</option>}
          </select>
          <select class="ui-input" [attr.aria-label]="'สถานะ' | tx" (change)="status.set($any($event.target).value)">
            <option value="" [selected]="!status()">{{ 'ทุกสถานะ' | tx }}</option>
            @for (k of statusKeys; track k) {<option [value]="k" [selected]="k === status()">{{ STATUS[k].label | tx }}</option>}
          </select>
          <span class="secondary grow">{{ '{n} รายการ' | tx: { n: rows().length } }}</span>
        </div>
        <div class="table-wrap">
          <table class="bo-table">
            <thead>
              <tr>
                <th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th>
                <th scope="col" class="w-kind">{{ 'บริษัทประกัน' | tx }}</th>
                <th scope="col">{{ 'เจ้าของ / สัตว์' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ยอดเคลม' | tx }}</th>
                <th scope="col" class="w-amount num">{{ 'ยอดอนุมัติ' | tx }}</th>
                <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                <th scope="col" class="w-at">{{ 'ล่าสุด' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (c of pager.rows(); track c.id) {
                <tr tabindex="0" [class.selected]="c.id === selectedId()" [attr.aria-selected]="c.id === selectedId()" (click)="pick(c)" (keydown.enter)="pick(c)">
                  <td><b>{{ c.id }}</b><div class="secondary">{{ KIND[c.kind] | tx }}</div></td>
                  <td>{{ c.insurer }}<div class="secondary">{{ policyNo(c) }}</div></td>
                  <td>{{ c.ownerKey }}<div class="secondary">{{ c.pet }} · {{ c.diagnosis | tx }}</div></td>
                  <td class="num">{{ baht(c.amount) }}</td>
                  <td class="num">{{ c.approvedAmount === undefined ? '—' : baht(c.approvedAmount) }}</td>
                  <td><span class="chip" [class]="'chip ' + STATUS[c.status].cls">{{ STATUS[c.status].label | tx }}</span>@if (overdue(c)) {<div class="secondary text-danger">{{ 'เกิน 14 วัน — ติดตาม' | tx }}</div>}</td>
                  <td class="num">{{ c.log[c.log.length - 1][0] }}</td>
                </tr>
              } @empty {
                <tr class="static"><td colspan="7" class="empty">{{ 'ไม่มีเคลมที่ตรงกับตัวกรอง' | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <bo-pager [pager]="pager" />
      </div>

      @if (creating()) {
        <bo-drawer [heading]="'สร้างเคลม'" [sub]="'ฉบับร่าง · ออกเอกสารแล้วจึงส่ง'" (closed)="creating.set(false)">
          <div class="form-grid">
            <label class="full">{{ 'กรมธรรม์' | tx }}
              <select class="ui-input" (change)="pickPolicy($any($event.target).value)">
                @for (p of policies(); track p.id) {<option [value]="p.id" [selected]="p.id === policyId()">{{ p.insurer }} · {{ p.policyNo }} · {{ p.ownerKey }} · {{ p.pet }}</option>}
              </select>
            </label>
            <div class="full segmented" role="group" [attr.aria-label]="'ประเภท' | tx">
              <button type="button" [class.active]="kind() === 'claim'" [attr.aria-pressed]="kind() === 'claim'" (click)="kind.set('claim')">{{ KIND.claim | tx }}</button>
              <button type="button" [class.active]="kind() === 'pre-auth'" [attr.aria-pressed]="kind() === 'pre-auth'" (click)="kind.set('pre-auth')">{{ KIND['pre-auth'] | tx }}</button>
            </div>
            @if (kind() === 'claim') {
              <label class="full">{{ 'เลขที่ใบแจ้งหนี้' | tx }}
                <select class="ui-input" (change)="pickInvoice($any($event.target).value)">
                  <option value="" [selected]="!invoiceId()">{{ '— เลือกใบแจ้งหนี้ —' | tx }}</option>
                  @for (i of invoices(); track i.id) {<option [value]="i.id" [selected]="i.id === invoiceId()">{{ i.no }} · {{ i.title | tx }} · {{ baht(i.total) }}</option>}
                </select>
              </label>
            }
            <label class="full">{{ 'การวินิจฉัย' | tx }}<input class="ui-input" [value]="diagnosis()" (input)="diagnosis.set($any($event.target).value)" /></label>
            <label>{{ 'จำนวนเงิน (บาท)' | tx }}<input class="ui-input" type="number" min="0" [value]="amount()" (input)="amount.set($any($event.target).value)" /></label>
          </div>
          @if (policy(); as p) {
            <dl class="data-grid">
              <dt>{{ 'วงเงินคงเหลือ' | tx }}</dt><dd>{{ baht(p.remaining) }} / {{ baht(p.limit) }}</dd>
              <dt>{{ 'ค่าเสียหายส่วนแรก' | tx }}</dt><dd>{{ baht(p.deductible) }} · {{ 'ร่วมจ่าย' | tx }} {{ p.copay * 100 }}%</dd>
              <dt>{{ 'คุ้มครองถึง' | tx }}</dt><dd>{{ p.validTo }}</dd>
              @if (estimate() !== null) {<dt>{{ 'ประมาณการที่เบิกได้' | tx }}</dt><dd><b>{{ baht(estimate()!) }}</b></dd>}
            </dl>
          }
          @if (problems().length) {<ul class="problems">@for (p of problems(); track p) {<li>{{ p | tx }}</li>}</ul>}
          <ng-container foot>
            <button uiButton variant="secondary" size="sm" type="button" (click)="creating.set(false)">{{ 'ยกเลิก' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="button" [disabled]="problems().length > 0" (click)="create()">{{ 'สร้างฉบับร่าง' | tx }}</button>
          </ng-container>
        </bo-drawer>
      } @else if (selected(); as c) {
        <bo-drawer [heading]="c.id" [sub]="(KIND[c.kind] | tx) + ' · ' + c.insurer + ' · ' + (STATUS[c.status].label | tx)" (closed)="selectedId.set(null)">
          <dl class="data-grid">
            <dt>{{ 'กรมธรรม์' | tx }}</dt><dd>{{ policyNo(c) }} · {{ 'วงเงินคงเหลือ' | tx }} {{ baht(remaining(c)) }}</dd>
            <dt>{{ 'เจ้าของ / สัตว์' | tx }}</dt><dd>{{ c.ownerKey }} · {{ c.pet }}</dd>
            <dt>{{ 'การวินิจฉัย' | tx }}</dt><dd>{{ c.diagnosis | tx }}</dd>
            <dt>{{ 'เลขที่ใบแจ้งหนี้' | tx }}</dt><dd>{{ invoiceNo(c) }}</dd>
            <dt>{{ 'ยอดเคลม' | tx }}</dt><dd>{{ baht(c.amount) }}</dd>
            @if (c.insurerRef) {<dt>{{ 'เลขรับเรื่อง' | tx }}</dt><dd>{{ c.insurerRef }} · {{ c.submittedVia | tx }}</dd>}
            @if (c.approvedAmount !== undefined) {<dt>{{ 'ผลพิจารณา' | tx }}</dt><dd>{{ baht(c.approvedAmount) }} · {{ c.decisionNote | tx }}</dd>}
            @if (c.reimbursed; as r) {
              <dt>{{ 'ได้รับเงิน' | tx }}</dt><dd>{{ baht(r.amount) }} → {{ (r.payee === 'hospital' ? 'โรงพยาบาล' : 'เจ้าของ') | tx }} · {{ r.ref || '—' }}</dd>
              <dt>EOB</dt><dd [class.text-danger]="variance(c)">{{ variance(c) ? ('ต่างจากที่อนุมัติ {amount}' | tx: { amount: baht(variance(c)!) }) : ('ตรงกับที่อนุมัติ' | tx) }}</dd>
            }
          </dl>
          <div class="timeline">
            @for (l of c.log; track $index) {
              <div class="tl"><span class="chip" [class]="'chip ' + STATUS[l[2]].cls">{{ STATUS[l[2]].label | tx }}</span>{{ l[0] }} · {{ l[1] | tx }} — {{ l[3] | tx }}</div>
            }
          </div>
          <ng-container foot>
            @if (c.status === 'draft' || c.status === 'documents-ready') {
              <button uiButton variant="secondary" size="sm" type="button" (click)="actions.printClaim(c)"><ng-icon [svg]="icons.print" aria-hidden="true" />{{ 'ออกเอกสาร' | tx }}</button>
            }
            <span class="grow"></span>
            @switch (c.status) {
              @case ('documents-ready') {<button uiButton size="sm" type="button" (click)="actions.submitClaim(c)">{{ 'บันทึกการส่ง' | tx }}</button>}
              @case ('submitted') {<button uiButton size="sm" type="button" (click)="actions.decideClaim(c)">{{ 'บันทึกผลพิจารณา' | tx }}</button>}
              @case ('approved') {<button uiButton size="sm" type="button" (click)="actions.reimburse(c)">{{ 'บันทึกรับเงิน' | tx }}</button>}
              @case ('partially-approved') {<button uiButton size="sm" type="button" (click)="actions.reimburse(c)">{{ 'บันทึกรับเงิน' | tx }}</button>}
            }
          </ng-container>
        </bo-drawer>
      }
    </div>
  `,
  host: { class: 'page' },
})
export class ClaimsComponent {
  /** The table's pages */
  protected readonly pager = new Pager(() => this.rows());
  private readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly route = inject(ActivatedRoute);
  protected readonly icons = { plus: lucidePlus, print: lucidePrinter };
  protected readonly STATUS = CLAIM_STATUS;
  protected readonly KIND = CLAIM_KIND;
  protected readonly statusKeys = STATUS_KEYS;
  protected readonly insurers = INSURERS;
  protected readonly baht = baht;

  protected readonly status = signal<ClaimStatus | ''>((this.route.snapshot.queryParamMap.get('status') as ClaimStatus | null) ?? '');
  protected readonly insurer = signal<Insurer | ''>('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly summary = computed(() => claimSummary(this.store.data()));
  protected readonly rows = computed(() => this.store.data().claims.filter(c => (!this.insurer() || c.insurer === this.insurer()) && (!this.status() || this.matches(c, this.status() as ClaimStatus))));
  protected readonly selected = computed(() => this.store.data().claims.find(c => c.id === this.selectedId()) ?? null);

  /* The new claim */
  protected readonly creating = signal(false);
  protected readonly policies = computed(() => this.store.data().policies);
  protected readonly policyId = signal(this.store.data().policies[0]?.id ?? '');
  protected readonly kind = signal<'claim' | 'pre-auth'>('claim');
  protected readonly invoiceId = signal('');
  protected readonly diagnosis = signal('');
  protected readonly amount = signal('');
  protected readonly policy = computed(() => policyOf(this.store.data(), this.policyId()));
  protected readonly invoices = computed(() => (this.policy() ? claimableInvoices(this.store.clinic.data(), this.store.data(), this.policy()!) : []));
  protected readonly estimate = computed(() => {
    const i = this.store.clinic.data().invoices.find(x => x.id === this.invoiceId());
    return this.policy() && i && this.kind() === 'claim' ? claimEstimate(this.policy()!, i.total) : null;
  });
  protected readonly input = computed<ClaimInput>(() => ({ policyId: this.policyId(), kind: this.kind(), invoiceId: this.kind() === 'claim' ? this.invoiceId() || undefined : undefined, diagnosis: this.diagnosis(), amount: Number(this.amount()) }));
  protected readonly problems = computed(() => Object.values(claimProblems(this.store.clinic.data(), this.store.data(), this.input())) as string[]);

  /** Approved covers both full and partial approvals */
  private matches(c: Claim, s: ClaimStatus) {
    return s === 'approved' ? c.status === 'approved' || c.status === 'partially-approved' : s === 'draft' ? c.status === 'draft' || c.status === 'documents-ready' : c.status === s;
  }

  protected toggle(s: ClaimStatus) {
    this.status.set(this.status() === s ? '' : s);
  }

  protected pick(c: Claim) {
    this.creating.set(false);
    this.selectedId.set(this.selectedId() === c.id ? null : c.id);
  }

  protected policyNo(c: Claim) {
    return policyOf(this.store.data(), c.policyId)?.policyNo ?? '—';
  }

  protected remaining(c: Claim) {
    return policyOf(this.store.data(), c.policyId)?.remaining ?? 0;
  }

  protected invoiceNo(c: Claim) {
    return this.store.clinic.data().invoices.find(i => i.id === c.invoiceId)?.no ?? '—';
  }

  protected overdue = (c: Claim) => isOverdue(c);
  protected variance = (c: Claim) => eobVariance(c);

  protected openCreate() {
    this.selectedId.set(null);
    this.creating.set(true);
  }

  protected pickPolicy(id: string) {
    this.policyId.set(id);
    this.invoiceId.set('');
    this.amount.set('');
  }

  protected pickInvoice(id: string) {
    this.invoiceId.set(id);
    const estimate = this.estimate();
    if (estimate !== null) {
      this.amount.set(String(estimate));
    }
  }

  protected create() {
    this.actions.createClaim(this.input(), claim => {
      this.creating.set(false);
      this.diagnosis.set('');
      this.amount.set('');
      this.invoiceId.set('');
      this.selectedId.set(claim.id);
      this.status.set('');
    });
  }
}
