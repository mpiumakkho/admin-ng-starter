/* Stock receipt: a lot received into a drug's shelf, with what it does to the stock shown before it is posted (INV-RCV-01) */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import { CONTROL_SYSTEM, daysLeft, EXPIRY_BUCKETS, expiryBucket, locationsOf, monthToExpiry, receiptProblems } from '../../data/inventory';
import type { ReceiptInput } from '../../data/inventory';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-receipts',
  imports: [TxPipe, UiButton, PageHead],
  template: `
    <bo-page-head [heading]="'รับยาเข้าคลัง'" [source]="'M06 · รับได้เฉพาะยาในทะเบียน · การบันทึกเพิ่มคงเหลือเมื่อระบบยืนยัน · ไม่มีใบสั่งซื้อหรือ supplier master ในหน้านี้ (procurement reserved)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />

    <div class="record">
      <div class="record-main">
        <form class="panel receipt-form" (submit)="submit($event)">
          <div class="filter-bar"><b>{{ 'แบบฟอร์มรับเข้า' | tx }}</b><span class="secondary grow">{{ 'ช่อง Lot และวันหมดอายุบันทึกตามสัญญาที่ยังรอ BE lot slice (GATED) — ตัวอย่างนี้เก็บไว้ให้ห้องยาใช้ FEFO' | tx }}</span></div>
          <div class="form-grid">
            <label>{{ 'รายการยา' | tx }}
              <select class="ui-input" name="drug" (change)="drug.set($any($event.target).value)">
                <option value="" [selected]="!drug()">{{ '— เลือกจากทะเบียนยา —' | tx }}</option>
                @for (d of drugs(); track d.id) {<option [value]="d.name" [selected]="d.name === drug()">{{ d.id }} · {{ d.name }}</option>}
              </select>
            </label>
            <label>{{ 'ตำแหน่งจัดเก็บ' | tx }}
              <select class="ui-input" name="location" (change)="location.set($any($event.target).value)">
                @for (l of locations(); track l) {<option [value]="l" [selected]="l === location()">{{ l | tx }}</option>}
              </select>
            </label>
            <label>Lot<input class="ui-input" name="lot" [value]="lot()" (input)="lot.set($any($event.target).value)" [placeholder]="'เช่น AM-2509-01' | tx" /></label>
            <label>{{ 'วันหมดอายุ' | tx }}<input class="ui-input" name="expiry" type="month" [value]="month()" (change)="month.set($any($event.target).value)" /></label>
            <label>{{ 'จำนวนรับ' | tx }}{{ unit() ? ' (' + (unit() | tx) + ')' : '' }}<input class="ui-input" name="qty" type="number" min="0" step="any" [value]="qty()" (input)="qty.set($any($event.target).value)" /></label>
            <label>{{ 'อ้างอิงที่มา' | tx }} <span class="muted">{{ '(ไม่บังคับ)' | tx }}</span><input class="ui-input" name="sourceRef" [value]="sourceRef()" (input)="sourceRef.set($any($event.target).value)" [placeholder]="'เลขที่ใบส่งของ · ผู้จำหน่าย' | tx" /></label>
            <label class="full">{{ 'หมายเหตุ' | tx }} <span class="muted">{{ '(ไม่บังคับ)' | tx }}</span><textarea class="ui-input" name="note" rows="2" [value]="note()" (input)="note.set($any($event.target).value)"></textarea></label>
          </div>
          <div class="form-foot">
            <button uiButton variant="secondary" size="sm" type="button" (click)="reset()">{{ 'ล้างฟอร์ม' | tx }}</button>
            <span class="grow"></span>
            <button uiButton size="sm" type="submit" [disabled]="!canSubmit()">{{ 'บันทึกการรับเข้า' | tx }}</button>
          </div>
        </form>

        <div class="panel">
          <div class="filter-bar"><b>{{ 'รับเข้าล่าสุด' | tx }}</b><span class="secondary grow">{{ 'receipt ที่บันทึกแล้วแก้ไขไม่ได้ · การแก้ไขผ่านกฎ reversal ของโมดูลเจ้าของ (GATED)' | tx }}</span></div>
          <div class="table-wrap">
            <table class="bo-table">
              <thead>
                <tr>
                  <th scope="col" class="w-at">{{ 'เวลา' | tx }}</th>
                  <th scope="col">{{ 'รายการยา' | tx }}</th>
                  <th scope="col" class="w-ref">Lot</th>
                  <th scope="col" class="w-due">{{ 'วันหมดอายุ' | tx }}</th>
                  <th scope="col" class="w-amount num">{{ 'จำนวน' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'ตำแหน่ง' | tx }}</th>
                  <th scope="col" class="w-owner">{{ 'ผู้รับ' | tx }}</th>
                  <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
                </tr>
              </thead>
              <tbody>
                @for (r of receipts(); track r.id) {
                  <tr tabindex="0" (click)="actions.openItem(r.drug)" (keydown.enter)="actions.openItem(r.drug)">
                    <td class="num">{{ r.at }}</td>
                    <td><b>{{ r.drug }}</b><div class="secondary">{{ r.id }}@if (r.sourceRef) { · {{ r.sourceRef }}}</div></td>
                    <td>{{ r.lot }}</td>
                    <td class="num">{{ r.expiry }}</td>
                    <td class="num">+{{ r.qty }} {{ r.unit | tx }}</td>
                    <td>{{ r.location | tx }}</td>
                    <td>{{ r.by | tx }}</td>
                    <td><span class="chip ok">{{ 'บันทึกแล้ว' | tx }}</span></td>
                  </tr>
                } @empty {
                  <tr class="static"><td colspan="8" class="empty">{{ 'ยังไม่มีการรับเข้า' | tx }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- What the receipt will do, before it is posted; the figures are a preview until the system confirms -->
      <aside class="record-rail">
        <div class="panel actions impact">
          <b>{{ 'ผลต่อคงเหลือ (ประมาณการ)' | tx }}</b>
          @if (item(); as i) {
            <dl class="data-grid">
              <dt>{{ 'คงเหลือตอนนี้' | tx }}</dt><dd>{{ i.onHand ?? '—' }} {{ i.drug.unit | tx }}</dd>
              <dt>{{ 'หลังรับเข้า' | tx }}</dt><dd><b>{{ after() }} {{ i.drug.unit | tx }}</b>@if (i.isLow && after() > i.drug.reorderThreshold) { · <span class="chip ok">{{ 'พ้นจุดสั่งเติม' | tx }}</span>}</dd>
              <dt>{{ 'จุดสั่งเติม' | tx }}</dt><dd>{{ i.drug.reorderThreshold }} {{ i.drug.unit | tx }}</dd>
              <dt>{{ 'lot ในคลัง' | tx }}</dt><dd>{{ i.lots.length }}</dd>
            </dl>
            @if (i.controlled) {<div class="notice warn">{{ 'ยาควบคุม ({cls} ประเภท {cat}) — รับโดยเภสัชกร ลงบัญชียาควบคุม และนับหลังรับเข้า' | tx: { cls: (CONTROL[i.drug.classSystem].short | tx), cat: i.drug.category ?? '' } }}</div>}
            @if (expiryNote(); as n) {<div class="notice" [class]="'notice ' + n.cls">{{ n.text | tx }}</div>}
          } @else {
            <p class="secondary">{{ 'เลือกรายการยาเพื่อดูผลต่อคงเหลือ' | tx }}</p>
          }
        </div>
        <div class="panel actions">
          <b>{{ 'การตรวจสอบ' | tx }}</b>
          @if (problemList().length) {
            <ul class="problems">
              @for (p of problemList(); track p) {<li>{{ p | tx }}</li>}
            </ul>
          } @else {
            <p class="secondary ok-text">{{ 'ครบถ้วน — ตรวจทานกับของจริงแล้วกดบันทึก' | tx }}</p>
          }
          <p class="secondary">{{ 'ผู้รับ: {name} · บันทึกเป็นหลักฐานพร้อมเวลา' | tx: { name: store.userName() } }}</p>
        </div>
      </aside>
    </div>
  `,
  host: { class: 'page' },
})
export class ReceiptsComponent {
  protected readonly store = inject(BackofficeStore);
  protected readonly actions = inject(BackofficeActions);
  private readonly route = inject(ActivatedRoute);
  protected readonly CONTROL = CONTROL_SYSTEM;

  protected readonly drugs = computed(() => this.store.data().drugs);
  protected readonly locations = computed(() => locationsOf(this.store.stock()));
  protected readonly receipts = computed(() => this.store.data().receipts);

  protected readonly drug = signal(this.route.snapshot.queryParamMap.get('drug') ?? '');
  protected readonly lot = signal('');
  protected readonly month = signal('');
  protected readonly qty = signal('');
  protected readonly location = signal(this.itemLocation(this.drug()) ?? this.locations()[0] ?? '');
  protected readonly sourceRef = signal('');
  protected readonly note = signal('');

  protected readonly item = computed(() => this.store.stock().find(i => i.drug.name === this.drug()) ?? null);
  protected readonly unit = computed(() => this.item()?.drug.unit ?? '');
  protected readonly input = computed<ReceiptInput>(() => ({ drug: this.drug(), lot: this.lot(), expiry: monthToExpiry(this.month()), qty: Number(this.qty()), location: this.location(), sourceRef: this.sourceRef(), note: this.note() }));
  protected readonly problems = computed(() => receiptProblems(this.store.clinic.data(), this.store.data(), this.input()));
  protected readonly problemList = computed(() => Object.values(this.problems()) as string[]);
  protected readonly canSubmit = computed(() => !this.problemList().length);
  protected readonly after = computed(() => Math.round(((this.item()?.onHand ?? 0) + (Number(this.qty()) || 0)) * 100) / 100);
  protected readonly expiryNote = computed(() => {
    const days = daysLeft(monthToExpiry(this.month()));
    if (days === null) {
      return null;
    }
    const bucket = expiryBucket(days);
    return bucket === 'ok' ? null : { cls: EXPIRY_BUCKETS.find(b => b.key === bucket)!.cls, text: days < 0 ? 'วันหมดอายุเป็นอดีต — รับเข้าไม่ได้' : 'lot นี้จะหมดอายุใน {n} วัน — ตรวจกับผู้จำหน่ายก่อนรับ'.replace('{n}', String(days)) };
  });

  private itemLocation(drug: string) {
    return this.store.stock().find(i => i.drug.name === drug)?.location;
  }

  protected submit(event: Event) {
    event.preventDefault();
    if (!this.canSubmit()) {
      return;
    }
    this.actions.receive(this.input(), receipt => {
      this.reset();
      this.actions.openItem(receipt.drug);
    });
  }

  protected reset() {
    this.drug.set(''); this.lot.set(''); this.month.set(''); this.qty.set(''); this.sourceRef.set(''); this.note.set('');
  }
}
