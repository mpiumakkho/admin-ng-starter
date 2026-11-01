/* One device: PM, calibration, downtime, contracts, cost and its bed in one place (assets.registry detail, M22 P2 / M10) */
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { map } from 'rxjs';

import { inpatients } from '../../../clinic/data/ward';
import { UiButton } from '../../../user-management/ui';
import { BackofficeActions } from '../../backoffice-actions';
import { BackofficeStore } from '../../backoffice.store';
import {
  CALIBRATION_RESULT, calibrationLapses, calibrationsOf, CONTRACT_KIND, CONTRACT_STATE, contractState, costOf, CRITICALITY, DOWNTIME_KIND,
  downtimeHours, DUE_STATE, EQUIPMENT_CLASS, EQUIPMENT_STATUS, equipmentOf, openDecommission, openDowntimeOf, pmState, READINESS, readiness, reliability,
} from '../../data/assets';
import { TxPipe } from '../../i18n/bo-i18n';

const baht = (n: number) => `฿${n.toLocaleString('en-US')}`;
const hours = (n: number | null) => (n === null ? '—' : n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1));

@Component({
  selector: 'bo-equipment-detail',
  imports: [RouterLink, NgIcon, TxPipe, UiButton],
  template: `
    @if (equipment(); as e) {
      @let r = ready();
      @let rel = reliability();
      <div class="page-head">
        <div class="title-block">
          <a class="link back" routerLink="/backoffice/assets/registry"><ng-icon [svg]="back" aria-hidden="true" />{{ 'ทะเบียนอุปกรณ์' | tx }}</a>
          <h1>{{ e.name | tx }} <span class="chip" [class]="'chip ' + STATUS[e.status].cls">{{ STATUS[e.status].label | tx }}</span></h1>
          <div class="subtitle">
            <span>{{ e.id }} · {{ CLASS[e.cls].label | tx }} · {{ e.maker }} {{ e.model }} · {{ e.serial }}</span>
            <span class="freshness">{{ 'ข้อมูล ณ วันนี้ 11:32' | tx }}</span>
          </div>
        </div>
        @if (e.status !== 'decommissioned') {
          <div class="page-actions">
            <button uiButton variant="secondary" size="sm" type="button" (click)="actions.moveEquipment(e)">{{ 'แก้ไขที่ตั้ง' | tx }}</button>
            @if (openDown(); as d) {
              <button uiButton size="sm" type="button" (click)="actions.closeDowntime(d)">{{ 'กลับมาใช้งาน' | tx }}</button>
            } @else {
              <button uiButton variant="danger" size="sm" type="button" routerLink="/backoffice/assets/downtime" [queryParams]="{ report: e.id }">{{ 'แจ้งขัดข้อง' | tx }}</button>
            }
          </div>
        }
      </div>

      <div class="record">
        <div class="record-main">
          <div class="panel">
            <div class="filter-bar"><b>{{ 'PM' | tx }}</b><span class="secondary grow">{{ 'ทุก {n} เดือน · ครั้งถัดไปวางแผนจากวันที่ทำ' | tx: { n: e.pmMonths } }}</span><a class="link" routerLink="/backoffice/assets/pm">{{ 'แผน PM' | tx }}</a></div>
            <div class="table-wrap">
              <table class="bo-table">
                <thead><tr><th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th><th scope="col" class="w-due">{{ 'กำหนด' | tx }}</th><th scope="col" class="w-due">{{ 'วันที่ทำ' | tx }}</th><th scope="col">{{ 'ผล' | tx }}</th><th scope="col" class="w-amount num">{{ 'ค่าใช้จ่าย' | tx }}</th></tr></thead>
                <tbody>
                  @for (t of pm(); track t.id) {
                    <tr class="static">
                      <td>{{ t.id }}</td>
                      <td class="num">{{ t.due }}@if (t.movedFrom) {<div class="secondary">{{ 'เลื่อนจาก {date}' | tx: { date: t.movedFrom } }}</div>}</td>
                      <td class="num">{{ t.doneAt ?? '—' }}</td>
                      <td>
                        @if (t.status === 'open') {<span class="chip" [class]="'chip ' + DUE[pmS()!].cls">{{ DUE[pmS()!].label | tx }}</span>}
                        @else if (t.status === 'cancelled') {<span class="chip quiet">{{ 'ยกเลิกแล้ว' | tx }}</span>}
                        @else {<span class="chip" [class]="'chip ' + (t.outcome === 'pass' ? 'ok' : 'danger')">{{ (t.outcome === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน') | tx }}</span>@if (t.findings) {<div class="secondary">{{ t.findings | tx }}</div>}}
                      </td>
                      <td class="num">{{ t.cost ? fmt(t.cost) : '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          @if (e.calibrationMonths) {
            <div class="panel">
              <div class="filter-bar"><b>{{ 'การสอบเทียบ' | tx }}</b><span class="secondary grow">{{ 'ทุก {n} เดือน' | tx: { n: e.calibrationMonths } }}@if (lapses().length) { · <span class="text-danger">{{ 'เคยเกินกำหนด {n} ครั้ง' | tx: { n: lapses().length } }}</span>}</span><a class="link" routerLink="/backoffice/assets/calibration">{{ 'Calibration' | tx }}</a></div>
              <div class="table-wrap">
                <table class="bo-table">
                  <thead><tr><th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th><th scope="col" class="w-due">{{ 'วันที่' | tx }}</th><th scope="col">{{ 'ผู้สอบเทียบ' | tx }}</th><th scope="col" class="w-status">{{ 'ผล' | tx }}</th><th scope="col" class="w-due">{{ 'ครั้งถัดไป' | tx }}</th></tr></thead>
                  <tbody>
                    @for (c of calibrations(); track c.id) {
                      <tr class="static"><td>{{ c.id }}</td><td class="num">{{ c.date }}</td><td>{{ c.by | tx }}@if (c.certificate) {<div class="secondary">{{ c.certificate }}</div>}</td><td><span class="chip" [class]="'chip ' + RESULT[c.result].cls">{{ RESULT[c.result].label | tx }}</span></td><td class="num">{{ c.nextDue }}</td></tr>
                    } @empty {
                      <tr class="static"><td colspan="5" class="empty">{{ 'ยังไม่มีผลสอบเทียบ' | tx }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          <div class="panel">
            <div class="filter-bar"><b>{{ 'การขัดข้อง' | tx }}</b><span class="secondary grow">{{ '12 เดือน · MTBF {a} ชม. · MTTR {b} ชม.' | tx: { a: fmtH(rel.mtbf), b: fmtH(rel.mttr) } }}</span><a class="link" routerLink="/backoffice/assets/downtime">{{ 'Downtime' | tx }}</a></div>
            <div class="table-wrap">
              <table class="bo-table">
                <thead><tr><th scope="col" class="w-ref">{{ 'เลขที่' | tx }}</th><th scope="col" class="w-at">{{ 'ช่วง' | tx }}</th><th scope="col">{{ 'อาการ / การแก้ไข' | tx }}</th><th scope="col" class="w-amount num">{{ 'ชั่วโมง' | tx }}</th></tr></thead>
                <tbody>
                  @for (d of downtime(); track d.id) {
                    <tr class="static">
                      <td>{{ d.id }}<div class="secondary">{{ KIND[d.kind] | tx }}</div></td>
                      <td class="num">{{ d.from }}<div class="secondary">{{ d.to ?? ('ยังไม่ปิด' | tx) }}</div></td>
                      <td>{{ d.problem | tx }}@if (d.fix) {<div class="secondary">{{ d.fix | tx }}</div>}</td>
                      <td class="num" [class.text-danger]="!d.to">{{ fmtH(dh(d)) }}</td>
                    </tr>
                  } @empty {
                    <tr class="static"><td colspan="4" class="empty">{{ 'ไม่มีการขัดข้อง' | tx }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="filter-bar"><b>{{ 'สัญญาบริการ' | tx }}</b><span class="grow"></span><a class="link" routerLink="/backoffice/assets/contracts">{{ 'Service Contracts' | tx }}</a></div>
            <div class="table-wrap">
              <table class="bo-table">
                <tbody>
                  @for (c of contracts(); track c.id) {
                    <tr class="static"><td class="w-ref">{{ c.id }}</td><td>{{ c.vendor | tx }}<div class="secondary">{{ KINDC[c.kind].label | tx }} · {{ c.contact | tx }}</div></td><td class="w-due num">{{ c.to }}</td><td class="w-status"><span class="chip" [class]="'chip ' + CSTATE[cstate(c)].cls">{{ CSTATE[cstate(c)].label | tx }}</span></td></tr>
                  } @empty {
                    <tr class="static"><td class="empty">{{ 'ไม่มีสัญญาบริการ' | tx }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside class="record-rail">
          @if (e.status !== 'decommissioned') {
            <div class="panel actions">
              <b>{{ 'ความพร้อม' | tx }} <span class="chip" [class]="'chip ' + READY[r.state].cls">{{ READY[r.state].label | tx }}</span></b>
              <ul class="checks">@for (x of r.reasons; track x) {<li>{{ x | tx }}</li>} @empty {<li class="ok-text">{{ 'ไม่มีรายการค้าง' | tx }}</li>}</ul>
              @if (decommission(); as dc) {<a class="link" routerLink="/backoffice/assets/decommission">{{ dc.id }} · {{ 'มีคำขอเลิกใช้' | tx }}</a>}
            </div>
          }
          <div class="panel summary">
            <div class="sum-row"><span>{{ 'ที่ตั้ง' | tx }}</span><b>{{ e.location | tx }}</b></div>
            <div class="sum-row"><span>{{ 'เตียง (M10)' | tx }}</span><b>{{ e.bed ?? '—' }}</b></div>
            @if (occupant(); as p) {<p class="notice info">{{ 'มีสัตว์ป่วยที่เตียง: {pet}' | tx: { pet: p } }}</p>}
            <div class="sum-row"><span>{{ 'ความสำคัญ' | tx }}</span><span class="chip" [class]="'chip ' + CRIT[e.criticality].cls">{{ CRIT[e.criticality].label | tx }}</span></div>
            <div class="sum-row"><span>{{ 'ความพร้อมใช้ 12 เดือน' | tx }}</span><b>{{ (rel.availability * 100).toFixed(1) }}%</b></div>
            <div class="sum-row"><span>{{ 'ขัดข้อง 12 เดือน' | tx }}</span><b>{{ rel.failures }}</b></div>
          </div>
          <div class="panel summary">
            <b>{{ 'ต้นทุน' | tx }}</b>
            <div class="sum-row"><span>{{ 'ราคาซื้อ' | tx }} · {{ e.purchasedAt }}</span><b>{{ fmt(cost().purchase) }}</b></div>
            <div class="sum-row"><span>{{ 'ค่าบำรุงรักษาและซ่อม' | tx }}</span><b>{{ fmt(cost().upkeep) }}</b></div>
            <div class="sum-row"><span>{{ 'รวม' | tx }}</span><b>{{ fmt(cost().total) }}</b></div>
            <p class="secondary">{{ 'ข้อมูลการดำเนินงานของ M22 ไม่ใช่ทะเบียนสินทรัพย์ ค่าเสื่อมราคาและการตัดจำหน่ายอยู่ในระบบบัญชี' | tx }}</p>
          </div>
        </aside>
      </div>

      <div class="panel">
        <div class="filter-bar"><b>{{ 'ประวัติ' | tx }}</b><span class="secondary grow">{{ 'จากบันทึกของ M22 · ล่าสุดก่อน' | tx }}</span></div>
        <div class="timeline">
          @for (h of history(); track $index) {
            <div class="tl">{{ h[0] }} · <b>{{ h[2] | tx }}</b> · {{ h[1] | tx }}@if (h[3]) { — {{ h[3] | tx }}}</div>
          }
        </div>
      </div>
    } @else {
      <div class="panel prompt">{{ 'ไม่พบอุปกรณ์นี้' | tx }}<div class="secondary"><a class="link" routerLink="/backoffice/assets/registry">{{ 'ทะเบียนอุปกรณ์' | tx }}</a></div></div>
    }
  `,
  host: { class: 'page' },
})
export class EquipmentDetailComponent {
  private readonly store = inject(BackofficeStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly actions = inject(BackofficeActions);
  protected readonly back = lucideArrowLeft;
  protected readonly CLASS = EQUIPMENT_CLASS;
  protected readonly STATUS = EQUIPMENT_STATUS;
  protected readonly CRIT = CRITICALITY;
  protected readonly READY = READINESS;
  protected readonly DUE = DUE_STATE;
  protected readonly RESULT = CALIBRATION_RESULT;
  protected readonly KIND = DOWNTIME_KIND;
  protected readonly KINDC = CONTRACT_KIND;
  protected readonly CSTATE = CONTRACT_STATE;
  protected readonly cstate = contractState;
  protected readonly fmt = baht;
  protected readonly fmtH = hours;
  protected readonly dh = downtimeHours;

  private readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: this.route.snapshot.paramMap.get('id') ?? '' });
  protected readonly equipment = computed(() => equipmentOf(this.store.data(), this.id()) ?? null);
  protected readonly ready = computed(() => readiness(this.store.data(), this.equipment()!));
  protected readonly reliability = computed(() => reliability(this.store.data(), [this.id()]));
  protected readonly pmS = computed(() => pmState(this.store.data(), this.equipment()!));
  protected readonly pm = computed(() => this.store.data().pm.filter(t => t.equipmentId === this.id()).sort((a, b) => b.due.localeCompare(a.due)));
  protected readonly calibrations = computed(() => calibrationsOf(this.store.data(), this.id()).reverse());
  protected readonly lapses = computed(() => (this.equipment() ? calibrationLapses(this.store.data(), this.equipment()!) : []));
  protected readonly downtime = computed(() => this.store.data().downtime.filter(d => d.equipmentId === this.id()).sort((a, b) => b.from.localeCompare(a.from)));
  protected readonly openDown = computed(() => openDowntimeOf(this.store.data(), this.id()) ?? null);
  protected readonly contracts = computed(() => this.store.data().contracts.filter(c => c.equipmentIds.includes(this.id())));
  protected readonly decommission = computed(() => openDecommission(this.store.data(), this.id()) ?? null);
  protected readonly cost = computed(() => costOf(this.equipment()!));
  /** The pet in the device's bed now, from the ward (M10) */
  protected readonly occupant = computed(() => {
    const bed = this.equipment()?.bed;
    return bed ? inpatients(this.store.clinic.data()).find(p => p.admission!.bed === bed)?.pet ?? null : null;
  });
  protected readonly history = computed(() => [...(this.equipment()?.history ?? [])].sort((a, b) => b[0].localeCompare(a[0])));
}
