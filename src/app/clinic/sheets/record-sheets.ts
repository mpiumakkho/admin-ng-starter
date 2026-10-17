/* Sheets of one record: a result, an order, an appointment, a prescription, and a new order (the design's sheets) */
import { Component, computed, inject, input, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck, lucideTriangleAlert, lucideUserRound } from '@ng-icons/lucide';

import { UiButton, UiSegmented } from '../../user-management/ui';
import { ClinicActions } from '../clinic-actions';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { ACK_METHODS, ALERT_META, isOpenOrder, ORDER_CATALOG, ORDER_FLOW, timeOf } from '../data/model';
import type { Badge, LabResult } from '../data/types';
import { ClinicI18n, TxPipe } from '../i18n/clinic-i18n';
import { ALERT_ICONS } from '../shared/icons';
import { PetIcon } from '../shared/parts';
import { SheetHead } from './sheet-head';

const SHARED = [TxPipe, UiButton, SheetHead];

/* ---- One result ---- */
@Component({
  selector: 'cl-result-sheet',
  imports: [...SHARED, NgIcon],
  template: `
    @if (result(); as r) {
      <cl-sheet-head [heading]="(r.name | tx) + ' · ' + r.pet" [status]="status()"
        [sub]="'{0} · รายงาน {1} · สั่งโดย {2}' | tx: { '0': (r.status | tx), '1': timeOf(r.time), '2': (r.by | tx) }" />
      <div class="sheet-body">
        @if (r.flag === 'critical' && !r.ack) {
          <div class="safety">
            <b><ng-icon [svg]="icons.alert" aria-hidden="true" />{{ 'CRITICAL VALUE — ต้องแจ้งแพทย์ตามนโยบาย' | tx }}</b>
            <div class="secondary">{{ 'ค่าวิกฤตยังไม่รับทราบ · ต้องโทรศัพท์ + ยืนยัน read-back ภายใน 30 นาที (ห้าม LINE/SMS อย่างเดียว)' | tx }}</div>
          </div>
        }
        <div class="section">
          <div class="section-title"><h3>{{ 'ค่าที่ตรวจได้' | tx }}</h3></div>
          <table class="mini-table">
            <thead><tr><th scope="col">{{ 'รายการ' | tx }}</th><th scope="col">{{ 'ค่า' | tx }}</th><th scope="col">{{ 'ช่วงอ้างอิง' | tx }}</th></tr></thead>
            <tbody>
              @for (value of r.values; track value[0]) {
                <tr>
                  <td>{{ value[0] | tx }}</td>
                  <td><b [class.text-danger]="value[3]">{{ value[1] | tx }}</b>@if (value[3]) {<span class="visually-hidden"> {{ 'ผิดปกติ' | tx }}</span>}</td>
                  <td class="muted">{{ value[2] | tx }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'การแปลผล' | tx }}</h3></div>
          <p class="sheet-text">{{ r.interp ? (r.interp | tx) : ('ยังไม่มีการแปลผล' | tx) }}</p>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'การรับทราบ (callback)' | tx }}</h3></div>
          @if (r.ack) {
            <div class="safety ok"><b><ng-icon [svg]="icons.check" aria-hidden="true" />{{ ackText(r) }}</b><div class="secondary">{{ (r.ackNote || 'การรับทราบครั้งแรกถือเป็นหลักฐาน แก้ไขไม่ได้') | tx }}</div></div>
          } @else {
            <p class="sheet-text">{{ 'ยังไม่รับทราบ' | tx }}</p>
          }
        </div>
      </div>
      <div class="sheet-foot">
        <button uiButton variant="secondary" size="sm" type="button" (click)="actions.interpret(r)">{{ (r.interp ? 'แก้การแปลผล' : 'เพิ่มการแปลผล') | tx }}</button>
        <button uiButton variant="secondary" size="sm" type="button" [disabled]="r.flag === 'critical' && !r.ack" (click)="actions.notifyOwner(r)"
          [attr.title]="r.flag === 'critical' && !r.ack ? ('ค่าวิกฤตต้องรับทราบก่อนแจ้งเจ้าของ' | tx) : null">{{ 'แจ้งเจ้าของ' | tx }}</button>
        <span class="grow"></span>
        <button uiButton size="sm" type="button" [disabled]="r.ack" (click)="actions.acknowledge(r)">{{ (r.ack ? 'รับทราบแล้ว' : 'Acknowledge') | tx }}</button>
      </div>
    }
  `,
  host: { class: 'contents' },
})
export class ResultSheet {
  readonly id = input.required<string>();
  private readonly store = inject(ClinicStore);
  private readonly i18n = inject(ClinicI18n);
  protected readonly actions = inject(ClinicActions);
  protected readonly icons = { alert: lucideTriangleAlert, check: lucideCheck };
  protected readonly timeOf = timeOf;
  protected readonly result = computed(() => this.store.data().results.find(r => r.id === this.id()), { equal: () => false });
  protected readonly status = computed<Badge | null>(() => {
    const r = this.result();
    return r ? { text: r.flag === 'critical' && !r.ack ? 'Critical' : r.ack ? 'Acknowledged' : 'New', cls: r.flag === 'critical' && !r.ack ? 'late' : r.ack ? 'checked' : 'waiting' } : null;
  });

  protected ackText(r: LabResult): string {
    const method = ACK_METHODS.find(m => m.value === r.ackMethod)?.label ?? '—';
    return [this.i18n.t('รับทราบแล้ว'), this.i18n.t(method), r.ackReadBack ? 'read-back' : '', r.ackAt ?? '', this.i18n.t(r.ackBy ?? '')].filter(Boolean).join(' · ');
  }
}

/* ---- One order ---- */
@Component({
  selector: 'cl-order-sheet',
  imports: [...SHARED],
  template: `
    @if (order(); as o) {
      <cl-sheet-head [heading]="'Order · ' + (o.name | tx)" [status]="{ text: o.state, cls: o.state === 'Completed' ? 'checked' : o.state === 'Draft' ? 'waiting' : o.state === 'Cancelled' ? 'late' : 'room' }"
        [sub]="'{0} · {1} · สั่งโดย {2}' | tx: { '0': o.pet, '1': o.code, '2': (o.by | tx) }" />
      <div class="sheet-body">
        <div class="section">
          <div class="section-title"><h3>{{ 'รายละเอียดคำสั่ง' | tx }}</h3></div>
          <dl class="data-grid">
            <dt>{{ 'ประเภท' | tx }}</dt><dd>{{ o.kind | tx }}</dd>
            <dt>{{ 'ความเร่งด่วน' | tx }}</dt><dd>{{ o.priority | tx }}</dd>
            <dt>{{ 'แผนกที่รับ' | tx }}</dt><dd>{{ o.dept | tx }}</dd>
            <dt>{{ 'เวลาสั่ง' | tx }}</dt><dd>{{ o.time }}</dd>
            <dt>{{ 'ราคาโดยประมาณ' | tx }}</dt><dd>{{ o.price }}</dd>
          </dl>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'สถานะ' | tx }}</h3></div>
          <div class="timeline">
            @for (step of o.trail; track $index) {
              <div class="tl"><b>{{ step[0] }}</b><div class="secondary">{{ step[1] | tx }}</div></div>
            }
          </div>
        </div>
      </div>
      <div class="sheet-foot">
        @if (isOpen(o)) {
          <button uiButton variant="danger-soft" size="sm" type="button" (click)="actions.cancelOrder(o)">{{ 'ยกเลิก Order' | tx }}</button>
        }
        <span class="grow"></span>
        @if (flow[o.col]; as step) {
          <button uiButton variant="secondary" size="sm" type="button" (click)="encounter(o.pet)">{{ 'เปิด Encounter' | tx }}</button>
          <button uiButton size="sm" type="button" (click)="actions.advanceOrder(o)">{{ step.label | tx }}</button>
        } @else {
          <button uiButton size="sm" type="button" (click)="encounter(o.pet)">{{ 'เปิด Encounter' | tx }}</button>
        }
      </div>
    }
  `,
  host: { class: 'contents' },
})
export class OrderSheet {
  readonly id = input.required<string>();
  private readonly store = inject(ClinicStore);
  protected readonly actions = inject(ClinicActions);
  protected readonly flow = ORDER_FLOW;
  protected readonly isOpen = isOpenOrder;
  protected readonly order = computed(() => this.store.data().orders.find(o => o.id === this.id()), { equal: () => false });

  protected encounter(pet: string) {
    const p = this.store.patientByPet(pet);
    if (p) {
      this.actions.startEncounter(p);
    }
  }
}

/* ---- One appointment ---- */
@Component({
  selector: 'cl-appointment-sheet',
  imports: [...SHARED, NgIcon, PetIcon],
  template: `
    @if (appointment(); as a) {
      @let p = patient();
      <cl-sheet-head [heading]="('นัดหมาย' | tx) + ' · ' + a.pet" [status]="{ text: a.state, cls: a.state === 'Confirmed' ? 'checked' : a.state === 'Waitlist' ? 'waiting' : a.state === 'Completed' ? 'done' : 'room' }"
        [sub]="a.date + ' ' + a.time + ' · ' + (a.type | tx)" />
      <div class="sheet-body">
        @if (p && p.alerts.length) {
          <div class="section">
            @for (alert of p.alerts; track $index) {
              <div class="safety" [class.warn]="meta[alert.type].cls === 'warn'">
                <b><ng-icon [svg]="alertIcons[alert.type]" aria-hidden="true" />{{ alert.label | tx }}</b>
                @if (alert.detail) {
                  <div class="secondary">{{ alert.detail | tx }}</div>
                }
              </div>
            }
          </div>
        }
        <div class="section">
          <div class="section-title"><h3>{{ 'เจ้าของและสัตว์' | tx }}</h3></div>
          <div class="person"><cl-pet-icon [kind]="a.kind" size="lg" /><div><b>{{ a.pet }}</b><div class="secondary">{{ a.breed }}</div></div></div>
          <div class="person"><span class="circle"><ng-icon [svg]="person" aria-hidden="true" /></span><div><b>{{ a.owner }}</b><div class="secondary">{{ a.phone }}</div></div></div>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'รายละเอียดนัด' | tx }}</h3></div>
          <dl class="data-grid">
            <dt>{{ 'ประเภท' | tx }}</dt><dd>{{ a.type | tx }}</dd>
            <dt>{{ 'เหตุผล' | tx }}</dt><dd>{{ a.reason | tx }}</dd>
            <dt>{{ 'ผู้ให้บริการ' | tx }}</dt><dd>{{ a.provider | tx }}</dd>
            <dt>{{ 'ห้อง' | tx }}</dt><dd>{{ a.room | tx }}</dd>
            <dt>{{ 'ระยะเวลา' | tx }}</dt><dd>{{ a.dur | tx }}</dd>
          </dl>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'การเงิน' | tx }}</h3></div>
          <dl class="data-grid">
            <dt>{{ 'มัดจำ' | tx }}</dt><dd>{{ a.deposit }}</dd>
            <dt>{{ 'ประมาณการ' | tx }}</dt><dd>{{ a.est }}</dd>
          </dl>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'Visit ก่อนหน้า' | tx }}</h3></div>
          @if (a.prev) {
            <div class="timeline"><div class="tl"><b>{{ a.prev[0] }}</b><div class="secondary">{{ a.prev[1] | tx }}</div></div></div>
          } @else {
            <p class="muted">{{ 'ยังไม่มีประวัติ' | tx }}</p>
          }
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'Reminders' | tx }}</h3></div>
          <div class="kv-list">
            @for (reminder of a.reminders; track reminder[0]) {
              <div class="row-card"><span class="grow">{{ reminder[0] | tx }}</span><span class="chip" [class]="'chip ' + reminder[1]">{{ (reminder[1] === 'ok' ? 'ส่งแล้ว' : 'รอส่ง') | tx }}</span></div>
            }
          </div>
        </div>
      </div>
      @if (p && a.date === today) {
        <div class="sheet-foot">
          <span class="grow"></span>
          <button uiButton size="sm" type="button" (click)="actions.startEncounter(p)">{{ 'เปิด Encounter' | tx }}</button>
        </div>
      }
    }
  `,
  host: { class: 'contents' },
})
export class AppointmentSheet {
  readonly id = input.required<string>();
  private readonly store = inject(ClinicStore);
  protected readonly actions = inject(ClinicActions);
  protected readonly person = lucideUserRound;
  protected readonly meta = ALERT_META;
  protected readonly alertIcons = ALERT_ICONS;
  protected readonly today = '2026-09-24';
  protected readonly appointment = computed(() => this.store.data().appointments.find(a => a.id === this.id()), { equal: () => false });
  protected readonly patient = computed(() => {
    const a = this.appointment();
    return a ? this.store.data().patients.find(p => p.pet === a.pet && p.ownerKey === a.owner) : undefined;
  }, { equal: () => false });
}

/* ---- One prescription; a vet reads it and co-signs a verbal order, the pharmacy dispenses it ---- */
@Component({
  selector: 'cl-prescription-sheet',
  imports: [...SHARED, NgIcon],
  template: `
    @if (prescription(); as rx) {
      @let draft = rx.verbal && !rx.cosignedBy;
      <cl-sheet-head [heading]="('ใบสั่งยา' | tx) + ' · ' + rx.code"
        [status]="draft ? { text: 'Verbal · รอเซ็นกำกับ', cls: 'waiting' } : { text: rx.state, cls: rx.state === 'Ready' ? 'checked' : rx.state === 'Verify' ? 'waiting' : 'room' }"
        [sub]="rx.pet + ' · ' + rx.owner + ' · ' + ((draft ? 'รับไว้โดย' : 'สั่งโดย') | tx) + ' ' + (rx.by | tx)" />
      <div class="sheet-body">
        @if (draft) {
          <div class="safety warn">
            <b><ng-icon [svg]="icons.alert" aria-hidden="true" />{{ 'คำสั่งวาจา — ยังไม่มีผล' | tx }}</b>
            <div class="secondary">{{ 'พยาบาลรับคำสั่งทางวาจาไว้' | tx }} {{ rx.orderedAt }} {{ '· ไม่ส่งเข้า Dispense และไม่เข้ารายการยาจนกว่าสัตวแพทย์จะเซ็นกำกับ' | tx }}</div>
          </div>
        }
        <div class="section">
          <div class="section-title"><h3>{{ 'รายละเอียดใบสั่งยา' | tx }}</h3></div>
          <dl class="data-grid">
            <dt>{{ 'ยา' | tx }}</dt><dd><b>{{ rx.drug }}</b></dd>
            <dt>{{ 'ขนาด' | tx }}</dt><dd>{{ rx.dose | tx }}</dd>
            <dt>{{ 'วิธีให้' | tx }}</dt><dd>{{ rx.route | tx }}</dd>
            <dt>{{ 'ความถี่' | tx }}</dt><dd>{{ rx.freq | tx }}</dd>
            <dt>{{ 'ระยะเวลา' | tx }}</dt><dd>{{ rx.days | tx }}</dd>
            <dt>{{ 'จำนวนจ่าย' | tx }}</dt><dd>{{ rx.qty | tx }}</dd>
            <dt>{{ 'คำแนะนำสำหรับเจ้าของ' | tx }}</dt><dd>{{ rx.advice | tx }}</dd>
          </dl>
          <p class="secondary">{{ 'ห้องยาเป็นผู้ตรวจสอบและจ่ายยา · สัตวแพทย์ดูได้อย่างเดียว' | tx }}</p>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'สต็อกตาม batch' | tx }}</h3></div>
          <table class="mini-table">
            <thead><tr><th scope="col">Batch</th><th scope="col">{{ 'หมดอายุ' | tx }}</th><th scope="col">{{ 'คงเหลือ' | tx }}</th><th scope="col">{{ 'ตำแหน่ง' | tx }}</th></tr></thead>
            <tbody>
              @for (batch of rx.stock; track batch[0]) {
                <tr><td>{{ batch[0] }}</td><td>{{ batch[1] }}</td><td>{{ batch[2] | tx }}</td><td>{{ batch[3] | tx }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="section">
          <div class="section-title"><h3>{{ 'ประวัติการจ่ายยาก่อนหน้า' | tx }}</h3></div>
          <div class="timeline">
            @for (entry of rx.history; track $index) {
              <div class="tl"><b>{{ entry[0] }}</b><div class="secondary">{{ entry[1] | tx }}</div></div>
            } @empty {
              <p class="muted">{{ 'ยังไม่เคยจ่ายยานี้' | tx }}</p>
            }
          </div>
        </div>
      </div>
      <div class="sheet-foot">
        <button uiButton variant="secondary" size="sm" type="button" (click)="profile(rx.pet)">{{ 'Patient med profile' | tx }}</button>
        <span class="grow"></span>
        @if (draft) {
          <button uiButton size="sm" type="button" (click)="actions.cosign(rx)">{{ 'เซ็นกำกับ' | tx }}</button>
        }
      </div>
    }
  `,
  host: { class: 'contents' },
})
export class PrescriptionSheet {
  readonly id = input.required<string>();
  private readonly store = inject(ClinicStore);
  private readonly ui = inject(ClinicUi);
  protected readonly actions = inject(ClinicActions);
  protected readonly icons = { alert: lucideTriangleAlert };
  protected readonly prescription = computed(() => this.store.data().prescriptions.find(rx => rx.id === this.id()), { equal: () => false });

  protected profile(pet: string) {
    const p = this.store.patientByPet(pet);
    if (p) {
      this.store.select(p);
      this.ui.openSheet('patient', { tab: 'meds' });
    }
  }
}

/* ---- A new order from the catalog: saved as a draft or sent ---- */
@Component({
  selector: 'cl-new-order-sheet',
  imports: [...SHARED, UiSegmented],
  template: `
    <cl-sheet-head [heading]="'New order' | tx" [sub]="'เลือกผู้ป่วยและรายการตรวจ · บันทึกเป็นร่างหรือส่งคำสั่งทันที' | tx" />
    <div class="sheet-body">
      <div class="section">
        <div class="field">
          <label for="new-order-patient">{{ 'ผู้ป่วย' | tx }}</label>
          <select class="ui-input" id="new-order-patient" [value]="patientId()" (change)="patientId.set(+$any($event.target).value)">
            @for (p of store.data().patients; track p.id) {
              <option [value]="p.id" [selected]="p.id === patientId()">{{ p.pet }} · {{ p.code }} · {{ store.owner(p).name }}</option>
            }
          </select>
        </div>
      </div>
      <div class="section">
        <div class="field">
          <span class="field-label" id="new-order-priority">{{ 'ความเร่งด่วน' | tx }}</span>
          <ui-segmented size="sm" [options]="priorities()" [(value)]="priority" [ariaLabel]="'ความเร่งด่วน' | tx" />
        </div>
      </div>
      <div class="section">
        <div class="section-title"><h3>{{ 'รายการตรวจ' | tx }} <span class="count">{{ picked().size }}</span></h3></div>
        <div class="kv-list" role="group" [attr.aria-label]="'รายการตรวจ' | tx">
          @for (item of catalog; track item.id) {
            <label class="row-card pick" [class.on]="picked().has(item.id)">
              <input type="checkbox" [checked]="picked().has(item.id)" (change)="toggle(item.id)" />
              <span class="grow"><b>{{ item.name | tx }}</b><div class="secondary">{{ item.kind | tx }} · {{ item.dept | tx }}</div></span>
              <span class="muted">{{ item.price }}</span>
            </label>
          }
        </div>
      </div>
    </div>
    <div class="sheet-foot">
      <button uiButton variant="secondary" size="sm" type="button" [disabled]="!picked().size" (click)="save(false)">{{ 'บันทึกร่าง' | tx }}</button>
      <span class="grow"></span>
      <button uiButton size="sm" type="button" [disabled]="!picked().size" (click)="save(true)">{{ 'ส่งคำสั่ง' | tx }}</button>
    </div>
  `,
  host: { class: 'contents' },
})
export class NewOrderSheet {
  protected readonly store = inject(ClinicStore);
  private readonly ui = inject(ClinicUi);
  private readonly i18n = inject(ClinicI18n);
  protected readonly catalog = ORDER_CATALOG;
  protected readonly patientId = signal(this.store.selected().id);
  protected readonly priority = signal('Routine');
  protected readonly picked = signal(new Set<string>());
  protected readonly priorities = computed(() => ['Routine', 'Urgent', 'STAT'].map(value => ({ value, label: this.i18n.t(value) })));

  protected toggle(id: string) {
    this.picked.update(set => {
      const next = new Set(set);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected save(send: boolean) {
    const p = this.store.data().patients.find(x => x.id === this.patientId());
    if (!p) {
      return;
    }
    const items = this.catalog.filter(item => this.picked().has(item.id));
    const codes = this.store.createOrders(p, items, this.priority(), send);
    this.ui.closeSheet();
    this.ui.toast(send ? 'ส่ง {n} คำสั่งของ {pet} แล้ว · {codes}' : 'บันทึกร่าง {n} คำสั่งของ {pet} แล้ว · {codes}', { n: codes.length, pet: p.pet, codes: codes.join(', ') });
  }
}
