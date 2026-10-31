import { inject, Injectable } from '@angular/core';

import { BackofficeUi } from './backoffice-ui';
import { BackofficeStore } from './backoffice.store';
import { APPROVAL_KIND, canDecide } from './data/home';
import type { Approval, BoException } from './data/types';
import { BoI18n } from './i18n/bo-i18n';

/** A reason that will stand as evidence */
export const REASON_MIN = 10;
const reasonCheck = (v: string) => (v.trim().length >= REASON_MIN ? null : 'อย่างน้อย {n} ตัวอักษร — ข้อความนี้คือหลักฐานตรวจสอบ');

/** What the home pages' buttons do: each asks, changes the store, then says what happened */
@Injectable({ providedIn: 'root' })
export class BackofficeActions {
  private readonly store = inject(BackofficeStore);
  private readonly ui = inject(BackofficeUi);
  private readonly i18n = inject(BoI18n);

  /** Approve or reject, with why; never one's own request */
  decide(a: Approval, status: 'approved' | 'rejected') {
    if (!canDecide(a, this.store.userName())) {
      this.ui.toast('ผู้ขอตัดสินคำขอของตัวเองไม่ได้ (การแยกหน้าที่)', undefined, 'info');
      return;
    }
    const approve = status === 'approved';
    this.ui.ask({
      title: `${approve ? 'อนุมัติ' : 'ปฏิเสธ'} · ${a.ref}`,
      tone: approve ? 'primary' : 'danger',
      facts: [['ประเภท', APPROVAL_KIND[a.kind]], ['คำขอ', a.title], ['ขอโดย', `${a.requestedBy} · ${a.requestedAt}`], ...(a.amount ? [['จำนวนเงิน', `฿${a.amount.toLocaleString('en-US')}`] as [string, string]] : [])],
      intro: [approve ? 'การอนุมัติจะส่งผลไปยังโมดูลเจ้าของ และบันทึกชื่อผู้อนุมัติ เวลา และเหตุผลไว้ในบันทึกตรวจสอบ' : 'คำขอที่ปฏิเสธจะกลับไปยังผู้ขอพร้อมเหตุผล และบันทึกไว้ในบันทึกตรวจสอบ'],
      fields: [{
        name: 'decision', label: this.i18n.t('เหตุผล (≥{n} ตัวอักษร)', { n: REASON_MIN }), type: 'textarea',
        placeholder: approve ? 'เช่น ตรวจหลักฐานการชำระและการยกเลิกรายการแล้ว' : 'เช่น หลักฐานไม่ครบ ขอเอกสารเพิ่ม',
        validate: v => (reasonCheck(v) ? this.i18n.t(reasonCheck(v)!, { n: REASON_MIN }) : null),
      }],
      confirmLabel: approve ? 'อนุมัติ' : 'ปฏิเสธ',
      onConfirm: v => {
        this.store.decide(a, status, v['decision'].trim());
        this.ui.toast(approve ? 'อนุมัติ {ref} แล้ว · ส่งต่อให้โมดูลเจ้าของดำเนินการ' : 'ปฏิเสธ {ref} แล้ว · แจ้งผู้ขอ', { ref: a.ref }, approve ? 'success' : 'info');
      },
    });
  }

  /** Seen: who saw it and what they did about it; it is settled in the owning workflow, not here */
  acknowledge(x: BoException) {
    this.ui.ask({
      title: `รับทราบ · ${x.ref}`,
      facts: [['ข้อยกเว้น', x.title], ['เกิดเมื่อ', x.at], ['จัดการใน', x.source]],
      intro: ['การรับทราบบันทึกว่าใครเห็นแล้วและทำอะไร แต่ไม่ปิดข้อยกเว้น — ต้องไปแก้ที่ workflow ของโมดูลเจ้าของ'],
      fields: [{ name: 'note', label: 'สิ่งที่ทำหรือส่งต่อ', type: 'textarea', optional: true, placeholder: 'เช่น โทรแจ้งธนาคารแล้ว รอผลภายใน 1 ชม.' }],
      confirmLabel: 'รับทราบ',
      onConfirm: v => {
        this.store.acknowledge(x, v['note'].trim());
        this.ui.toast('รับทราบ {ref} แล้ว', { ref: x.ref });
      },
    });
  }
}
