/* The three boards of the clinical work: orders, results and dispense (the design's pages/Orders, Results, Dispense) */
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { UiButton } from '../../user-management/ui';
import { ClinicActions } from '../clinic-actions';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { minutesSince, timeOf } from '../data/model';
import { TxPipe } from '../i18n/clinic-i18n';
import { BoardColumn, MiniAlerts, TaskCard, Toolbar } from '../shared/parts';

/** Orders between departments: Draft > Accepted > In progress > Completed, and verbal orders to co-sign above them */
@Component({
  selector: 'app-clinic-orders',
  imports: [NgIcon, TxPipe, UiButton, Toolbar, BoardColumn, TaskCard],
  template: `
    <cl-toolbar [heading]="'Orders' | tx">
      <span subtitle>{{ 'คำสั่งตรวจและรักษาระหว่างแผนก · คลิกการ์ดเพื่อดู Order summary' | tx }}</span>
      <button uiButton size="sm" type="button" (click)="ui.openSheet('newOrder')"><ng-icon [svg]="plus" aria-hidden="true" />{{ 'New order' | tx }}</button>
    </cl-toolbar>

    <!-- Verbal medication orders a nurse took: not in force until a vet co-signs them -->
    <section class="cosign-panel" [attr.aria-label]="'คำสั่งวาจา · รอเซ็นกำกับ' | tx">
      <div class="section-title">
        <h2>{{ 'คำสั่งวาจา · รอเซ็นกำกับ' | tx }}<span class="count">{{ pending().length }}</span></h2>
        <span class="secondary">{{ 'คำสั่งที่พยาบาลรับทางวาจาไว้ ยังไม่มีผลจนกว่าสัตวแพทย์จะเซ็น' | tx }}</span>
      </div>
      @if (pending().length) {
        <div class="table-wrap cosign-wrap">
          <table class="cosign-table">
            <thead>
              <tr>
                <th scope="col">{{ 'สัตว์ป่วย' | tx }}</th><th scope="col">{{ 'คำสั่ง' | tx }}</th><th scope="col">{{ 'พยาบาลรับไว้' | tx }}</th>
                <th scope="col">{{ 'รอมาแล้ว' | tx }}</th><th scope="col">CDS</th><th scope="col">{{ 'การทำงาน' | tx }}</th>
              </tr>
            </thead>
            <tbody>
              @for (rx of pending(); track rx.id) {
                <tr class="static">
                  <td><b>{{ rx.pet }}</b><div class="secondary">{{ rx.owner }}</div></td>
                  <td><b>{{ rx.drug }}</b><div class="secondary">{{ rx.dose | tx }} · {{ rx.freq | tx }} · {{ rx.days | tx }} · {{ rx.code }}</div></td>
                  <td>{{ rx.by | tx }}<div class="secondary">{{ rx.orderedAt }}{{ rx.orderedBy ? ' · ' + ('สั่งโดย' | tx) + ' ' + (rx.orderedBy | tx) : '' }}{{ rx.inpatient ? ' · ' + ('ให้ในวอร์ด' | tx) : '' }}</div></td>
                  <td>{{ '{n} นาที' | tx: { n: waited(rx.orderedAt) } }}</td>
                  <td><span class="chip ok">{{ 'CDS ผ่าน' | tx }}</span></td>
                  <td>
                    <button uiButton size="sm" type="button" (click)="actions.cosign(rx)">{{ 'เซ็นกำกับ' | tx }}</button>
                    <button type="button" class="link" (click)="store.selectPet(rx.pet); ui.openSheet('prescription', { id: rx.id })">{{ 'รายละเอียด' | tx }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="muted">{{ 'ไม่มีคำสั่งวาจาที่รอเซ็นกำกับ' | tx }}</p>
      }
    </section>

    <div class="board">
      <div class="board-grid">
        @for (column of columns(); track column.name) {
          <cl-column [name]="column.name" [count]="column.list.length">
            @for (o of column.list; track o.id) {
              <cl-task [title]="o.pet + ' · ' + (o.name | tx)" [line1]="(o.kind | tx) + ' · ' + timeOf(o.time)" [line2]="o.code"
                [status]="o.priority === 'Urgent' ? { text: 'Urgent', cls: 'danger' } : null" (opened)="store.selectPet(o.pet); ui.openSheet('order', { id: o.id })" />
            }
          </cl-column>
        }
      </div>
    </div>
  `,
  host: { class: 'workspace' },
})
export class OrdersComponent {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly actions = inject(ClinicActions);
  protected readonly plus = lucidePlus;
  protected readonly timeOf = timeOf;
  protected readonly pending = this.store.pendingCosign;
  protected readonly columns = computed(() => {
    const orders = this.store.data().orders;
    return ['Draft', 'Accepted', 'In progress', 'Completed'].map(name => ({ name, list: orders.filter(o => o.col === name) }));
  });

  protected waited(at: string | undefined) {
    return minutesSince(at ?? '');
  }
}

/** New results to acknowledge and take back into the encounter: Critical, New, Reviewed, Sent to owner */
@Component({
  selector: 'app-clinic-results',
  imports: [TxPipe, Toolbar, BoardColumn, TaskCard],
  template: `
    <cl-toolbar [heading]="'Results Inbox' | tx">
      <span subtitle>{{ 'ผลตรวจใหม่ที่ต้องรับทราบและส่งกลับ Encounter' | tx }}</span>
      <select class="ui-input select" [attr.aria-label]="'เรียงลำดับ' | tx" (change)="sort.set($any($event.target).value)">
        <option value="unread" [selected]="sort() === 'unread'">{{ 'Unread first' | tx }}</option>
        <option value="critical" [selected]="sort() === 'critical'">{{ 'Critical first' | tx }}</option>
      </select>
    </cl-toolbar>
    <div class="board">
      <div class="board-grid">
        @for (column of columns(); track column.name) {
          <cl-column [name]="column.name" [count]="column.list.length">
            @for (r of column.list; track r.id) {
              <cl-task [title]="r.pet + ' · ' + (r.name | tx)" [line1]="(r.status | tx) + ' · ' + timeOf(r.time)" [line2]="('สั่งโดย' | tx) + ' ' + (r.by | tx)"
                [status]="r.flag === 'critical' && !r.ack ? { text: 'Critical', cls: 'danger' } : null" (opened)="store.selectPet(r.pet); ui.openSheet('result', { id: r.id })" />
            }
          </cl-column>
        }
      </div>
    </div>
  `,
  host: { class: 'workspace' },
})
export class ResultsComponent {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly timeOf = timeOf;
  protected readonly sort = signal<'unread' | 'critical'>('unread');
  protected readonly columns = computed(() => {
    const results = this.store.data().results.slice().sort((a, b) =>
      this.sort() === 'unread' ? Number(a.ack) - Number(b.ack) : Number(b.flag === 'critical') - Number(a.flag === 'critical'));
    return ['Critical', 'New', 'Reviewed', 'Sent to owner'].map(name => ({ name, list: results.filter(r => r.col === name) }));
  });
}

/** Prescriptions on their way to the owner: Verify, Prepare, Counsel, Ready. The pharmacy dispenses; the vet follows. */
@Component({
  selector: 'app-clinic-dispense',
  imports: [TxPipe, Toolbar, BoardColumn, TaskCard, MiniAlerts],
  template: `
    <cl-toolbar [heading]="'Dispense' | tx">
      <span subtitle>{{ 'ตรวจสอบใบสั่งยา สต็อก และคำแนะนำก่อนส่งมอบ · ยืนยันการจ่ายยาใช้ confirmation dialog' | tx }}</span>
    </cl-toolbar>
    <div class="board">
      <div class="board-grid">
        @for (column of columns(); track column.name) {
          <cl-column [name]="column.name" [count]="column.list.length">
            @for (rx of column.list; track rx.id) {
              @let p = store.patientByPet(rx.pet);
              <cl-task [title]="rx.pet + ' · ' + rx.code" [line1]="rx.drug" [line2]="(rx.qty | tx) + ' · ' + rx.owner" (opened)="store.selectPet(rx.pet); ui.openSheet('prescription', { id: rx.id })">
                @if (p && p.alerts.length) {
                  <cl-mini-alerts [patient]="p" [blank]="true" />
                }
              </cl-task>
            }
          </cl-column>
        }
      </div>
    </div>
  `,
  host: { class: 'workspace' },
})
export class DispenseComponent {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly columns = computed(() => {
    const prescriptions = this.store.data().prescriptions.filter(rx => !rx.verbal);
    return ['Verify', 'Prepare', 'Counsel', 'Dispensed'].map(name => ({ name, list: prescriptions.filter(rx => rx.col === name) }));
  });
}
