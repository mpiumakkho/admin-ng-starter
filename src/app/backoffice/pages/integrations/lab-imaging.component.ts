/* Lab and imaging connections: HL7 to the analyzers, DICOM to the PACS, each tied to its device in the asset register, and the message flow as metadata only (INT-LAB-01, M05 · GATED) */
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BackofficeStore } from '../../backoffice.store';
import { HEALTH, LAB_CONNECTIONS, LAB_MESSAGES, labHealth, MESSAGE_STATUS } from '../../data/integrations';
import { TxPipe } from '../../i18n/bo-i18n';
import { PageHead } from '../../shared/parts';

@Component({
  selector: 'bo-lab-imaging',
  imports: [RouterLink, TxPipe, PageHead],
  template: `
    <bo-page-head [heading]="'การเชื่อมต่อ Lab และ Imaging'" [source]="'INT-LAB-01 · M05 · HL7 OML/ORM และ DICOM MWL ผ่าน Mirth · Orthanc · งานแล็บในคลินิกอยู่ที่ M05 ไม่ใช่หน้านี้ · สัญญาการออกแบบ (GATED)'" [freshness]="'ข้อมูล ณ วันนี้ 11:32'" />
    <p class="notice warn">{{ 'การเชื่อมต่อ HL7/PACS ยังไม่อยู่ในระบบ (spec-gap) ข้อมูลด้านล่างเป็นตัวอย่าง ไม่มีการตั้งค่าหรือทดสอบจนกว่าสัญญาจะพร้อม' | tx }}</p>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'การเชื่อมต่อ' | tx }}</b><span class="secondary grow">{{ 'ติดต่อไม่ได้เมื่ออุปกรณ์ขัดข้องในทะเบียนอุปกรณ์ · ทดสอบผ่านไม่ได้แปลว่าการจับคู่ข้อความถูกต้อง' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table lab-connections">
          <thead><tr>
            <th scope="col">{{ 'Connector' }}</th>
            <th scope="col" class="w-kind">{{ 'ประเภท' | tx }}</th>
            <th scope="col" class="w-status">{{ 'สถานะ' | tx }}</th>
            <th scope="col">{{ 'อุปกรณ์' | tx }}</th>
            <th scope="col" class="w-kind">{{ 'ชนิดข้อความ' | tx }}</th>
            <th scope="col" class="w-at">{{ 'ข้อความล่าสุด' | tx }}</th>
          </tr></thead>
          <tbody>
            @for (c of connections(); track c.id) {
              <tr class="static">
                <td><b>{{ c.name }}</b><div class="secondary">{{ c.id }}</div></td>
                <td>{{ c.kind === 'HL7' ? 'HL7' : 'DICOM/PACS' }}</td>
                <td><span class="chip" [class]="'chip ' + HEALTH[c.health].cls">{{ HEALTH[c.health].label | tx }}</span></td>
                <td>@for (e of c.devices; track e.id) {<div class="device"><a class="link" [routerLink]="['/backoffice/assets/equipment', e.id]">{{ e.id }}</a> <span class="secondary">{{ e.name | tx }}</span></div>}</td>
                <td>{{ c.flow | tx }}</td>
                <td class="num">{{ c.lastMessage ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="filter-bar"><b>{{ 'การไหลของข้อความ' | tx }}</b><span class="secondary grow">{{ 'แสดงเฉพาะข้อมูลกำกับและเลข accession ไม่แสดงข้อมูลผู้ป่วย' | tx }}</span></div>
      <div class="table-wrap">
        <table class="bo-table">
          <thead><tr>
            <th scope="col" class="w-at">{{ 'เวลา' | tx }}</th>
            <th scope="col" class="w-kind">{{ 'ทิศทาง' | tx }}</th>
            <th scope="col">{{ 'ประเภท' | tx }}</th>
            <th scope="col" class="w-status">{{ 'สถานะข้อความ' | tx }}</th>
            <th scope="col">{{ 'ข้อผิดพลาด' | tx }}</th>
            <th scope="col" class="w-ref">Accession</th>
          </tr></thead>
          <tbody>
            @for (m of messages; track m.at + m.ref) {
              <tr class="static">
                <td class="num">{{ m.at }}</td>
                <td>{{ (m.direction === 'in' ? 'ขาเข้า' : 'ขาออก') | tx }} · {{ m.connection }}</td>
                <td>{{ m.type | tx }}</td>
                <td><span class="chip" [class]="'chip ' + MESSAGE_STATUS[m.status].cls">{{ MESSAGE_STATUS[m.status].label | tx }}</span></td>
                <td>@if (m.error) {<span class="text-danger">{{ m.error | tx }}</span>} @else {<span class="secondary">—</span>}</td>
                <td>{{ m.ref }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  host: { class: 'page' },
})
export class LabImagingComponent {
  private readonly store = inject(BackofficeStore);
  protected readonly HEALTH = HEALTH;
  protected readonly MESSAGE_STATUS = MESSAGE_STATUS;
  protected readonly messages = LAB_MESSAGES;
  protected readonly connections = computed(() => {
    const equipment = this.store.data().equipment;
    return LAB_CONNECTIONS.map(c => ({
      ...c, health: labHealth(c, equipment),
      devices: c.equipment.map(id => ({ id, name: equipment.find(e => e.id === id)?.name ?? '' })),
    }));
  });
}
