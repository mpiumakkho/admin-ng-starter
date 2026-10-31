/* The morning of 24 September 2026 in the hospital's back office: what waits for the people who run it */
import type { ActivityEntry, Approval, BackofficeData, BoException, WorkItem } from './types';

/* Work the modules without a page of their own yet hold: credentials, equipment, complaints, PDPA (M24, M22, M28, M31) */
const WORK_ITEMS: WorkItem[] = [
  { id: 'W1', module: 'M31', kind: 'DSAR', title: 'คำขอเข้าถึงข้อมูลส่วนบุคคล · คุณ Kanokwan R.', detail: 'ขอสำเนาประวัติการรักษาของ Mali ทั้งหมด · ยืนยันตัวตนแล้ว',
    priority: 'high', due: '2026-09-30', owner: 'DPO', status: 'in-progress', ref: 'DSAR-2609-004' },
  { id: 'W2', module: 'M31', kind: 'DSAR', title: 'คำขอลบข้อมูล · คุณ Prasit N.', detail: 'เจ้าของย้ายโรงพยาบาล ขอลบข้อมูลติดต่อ · รอตรวจ retention',
    priority: 'normal', due: '2026-10-12', owner: 'DPO', status: 'open', ref: 'DSAR-2609-005' },
  { id: 'W3', module: 'M28', kind: 'ข้อร้องเรียน', title: 'รอนานเกิน 2 ชั่วโมงที่ OPD · คุณ Sirinya M.', detail: 'ร้องเรียนทาง LINE เมื่อ 2026-09-22 · ระดับปานกลาง · SLA ตอบกลับ 3 วัน',
    priority: 'high', due: '2026-09-25', owner: 'ผู้จัดการ OPD', status: 'in-progress', ref: 'CMP-2609-011' },
  { id: 'W4', module: 'M28', kind: 'ข้อร้องเรียน', title: 'ใบเสร็จไม่ตรงกับประมาณการ · คุณ Arisa K.', detail: 'เรียกเก็บค่า X-ray เกินประมาณการ ฿400 · รอการเงินตรวจสอบ',
    priority: 'normal', due: '2026-09-27', owner: 'การเงิน', status: 'open', ref: 'CMP-2609-012' },
  { id: 'W5', module: 'M22', kind: 'PM', title: 'บำรุงรักษาเครื่องดมยาสลบ · ห้องผ่าตัด 1', detail: 'PM ประจำ 6 เดือน เกินกำหนด 4 วัน · อุปกรณ์ critical',
    priority: 'critical', due: '2026-09-20', owner: 'ช่างซ่อมบำรุง', status: 'open', ref: 'EQ-OR1-ANES-01' },
  { id: 'W6', module: 'M22', kind: 'Calibration', title: 'สอบเทียบเครื่องตรวจเลือด CBC', detail: 'ครบกำหนดสอบเทียบประจำปี · นัดผู้ขาย 2026-09-26',
    priority: 'normal', due: '2026-09-26', owner: 'ห้องปฏิบัติการ', status: 'waiting', ref: 'EQ-LAB-CBC-02' },
  { id: 'W7', module: 'M24', kind: 'ใบอนุญาต', title: 'ใบอนุญาตประกอบวิชาชีพ สพ.ญ. ลลิตา หมดอายุใน 21 วัน', detail: 'หมดอายุ 2026-10-15 · ยังไม่ได้ยื่นต่ออายุ',
    priority: 'high', due: '2026-10-15', owner: 'ฝ่ายบุคคล', status: 'open', ref: 'LIC-VET-0042' },
  { id: 'W8', module: 'M24', kind: 'ตารางเวร', title: 'เวรดึกวันเสาร์ 27 ก.ย. ยังไม่มีพยาบาล', detail: 'ต้องการ 2 คน จัดแล้ว 1 คน · พ.ส. กมล ลาพักร้อน',
    priority: 'high', due: '2026-09-27', owner: 'หัวหน้าพยาบาล', status: 'open', ref: 'SHIFT-0927-N' },
  { id: 'W9', module: 'M24', kind: 'การลา', title: 'คำขอลาพักร้อน พ.ส. ณิชา 1–3 ต.ค.', detail: 'ตรวจ coverage แล้วพอ · รอหัวหน้าอนุมัติ',
    priority: 'normal', due: '2026-09-26', owner: 'หัวหน้าพยาบาล', status: 'waiting', ref: 'LEAVE-2609-08' },
];

const APPROVALS: Approval[] = [
  { id: 'AP1', module: 'M11', kind: 'refund', title: 'คืนเงิน ฿650 · Subcutaneous fluids ไม่ได้ทำ', detail: 'Nala · ใบแจ้งหนี้ INV-2609-0158 · เจ้าของชำระแล้วเต็มจำนวน',
    amount: 650, requestedBy: 'นัทธมน (แคชเชียร์)', requestedAt: '2026-09-24 09:48', reason: 'รายการ Subcutaneous fluids ถูกยกเลิกหลังออกใบแจ้งหนี้ เจ้าของชำระไปแล้ว',
    evidence: [['ใบแจ้งหนี้', 'INV-2609-0158 · ฿2,350 · ชำระแล้ว'], ['การชำระเดิม', '2026-09-12 · QR PromptPay · ฿2,350'], ['รายการที่ยกเลิก', 'Subcutaneous fluids ฿650 · ยกเลิกโดย สพ.ญ. ลลิตา']],
    approver: 'ผู้จัดการการเงิน', status: 'pending', ref: 'RF-2609-003' },
  { id: 'AP2', module: 'M11', kind: 'discount', title: 'ส่วนลด 15% · ค่ารักษา Mali วันที่ 2', detail: 'Kanokwan R. · ประมาณการ EST-260924-09 · ส่วนลดลูกค้าประกัน',
    amount: 1485, requestedBy: 'นัทธมน (แคชเชียร์)', requestedAt: '2026-09-24 10:20', reason: 'ลูกค้ามีประกันสัตว์เลี้ยง PI-44821 ตามเงื่อนไขส่วนลด 15% ของรายการที่ประกันไม่ครอบคลุม',
    evidence: [['ประมาณการ', 'EST-260924-09 · ฿9,900'], ['กรมธรรม์', 'Pet insurance · PI-44821 · ตรวจสอบแล้ว'], ['เกณฑ์ส่วนลด', 'ส่วนลดเกิน 10% ต้องให้ผู้จัดการอนุมัติ']],
    approver: 'ผู้จัดการการเงิน', status: 'pending', ref: 'DC-2609-007' },
  { id: 'AP3', module: 'M13', kind: 'audit-export', title: 'ส่งออกบันทึกตรวจสอบ · การเข้าถึงเวชระเบียน Nala', detail: 'ช่วง 2026-09-01 ถึง 2026-09-24 · ผู้ขอ DPO · วัตถุประสงค์ ตอบ DSAR-2609-004',
    requestedBy: 'ปรีดา (DPO)', requestedAt: '2026-09-23 16:05', reason: 'ตอบคำขอเข้าถึงข้อมูลส่วนบุคคล DSAR-2609-004 ต้องแนบรายการผู้เข้าถึงเวชระเบียน',
    evidence: [['ขอบเขต', 'entity=patient HN-130904 · 2026-09-01 → 2026-09-24'], ['วัตถุประสงค์', 'DSAR-2609-004'], ['การแยกหน้าที่', 'ผู้ขอไม่ใช่ผู้อนุมัติ']],
    approver: 'Security owner', status: 'pending', ref: 'AX-2609-002' },
  { id: 'AP4', module: 'M28', kind: 'complaint', title: 'ข้อร้องเรียนระดับรุนแรง · ยาผิดตัว (near miss)', detail: 'คุณ Napat T. · Mochi · ห้องยาจับผิดได้ก่อนส่งมอบ · ขอยกระดับเป็น incident',
    requestedBy: 'ผู้จัดการ OPD', requestedAt: '2026-09-23 14:30', reason: 'เจ้าของร้องเรียนว่าได้รับยาผิดตัวในครั้งก่อน ตรวจพบว่าเป็น near miss ที่ห้องยาแก้ไขแล้ว ขออนุมัติเปิด RCA',
    evidence: [['ข้อร้องเรียน', 'CMP-2609-010 · ระดับรุนแรง'], ['เหตุการณ์', 'NM-2609-003 · near miss · ห้องยา'], ['SLA', 'ตอบกลับเจ้าของภายใน 24 ชม. · เหลือ 5 ชม.']],
    approver: 'ผู้อำนวยการ', status: 'pending', ref: 'CMP-2609-010' },
  { id: 'AP5', module: 'M14', kind: 'permission-override', title: 'สิทธิ์ชั่วคราว · ภก. ธนพร ดูรายงานการเงินคลังยา', detail: 'ถึง 2026-10-08 · เพื่อปิดงบคลังยาประจำไตรมาส',
    requestedBy: 'ภก. ธนพร', requestedAt: '2026-09-24 08:15', reason: 'ต้องดูรายงานมูลค่าคลังยาเพื่อปิดงบไตรมาส 3 ซึ่งบทบาทเภสัชกรไม่มีสิทธิ์',
    evidence: [['สิทธิ์ที่ขอ', 'finance.reports.view · ขอบเขต คลังยา'], ['หมดอายุ', '2026-10-08'], ['เหตุผล', 'ปิดงบไตรมาส 3']],
    approver: 'Security owner', status: 'pending', ref: 'OV-2609-001' },
  { id: 'AP6', module: 'M11', kind: 'refund', title: 'คืนเงิน ฿280 · ยาที่ไม่ได้รับ', detail: 'Khao Niao · INV-2609-0031 · Doxycycline ไม่ได้จ่าย',
    amount: 280, requestedBy: 'นัทธมน (แคชเชียร์)', requestedAt: '2026-09-22 15:10', reason: 'ยา Doxycycline ไม่ได้จ่ายเพราะสต็อกหมด เจ้าของชำระบางส่วนแล้ว',
    evidence: [['ใบแจ้งหนี้', 'INV-2609-0031 · ฿980 · ค้างชำระ']], approver: 'ผู้จัดการการเงิน',
    status: 'rejected', decidedBy: 'วรรณา (ผู้จัดการการเงิน)', decidedAt: '2026-09-23 09:02', decision: 'ใบแจ้งหนี้ยังค้างชำระ ให้ปรับลดรายการแทนการคืนเงิน', ref: 'RF-2609-002' },
];

const EXCEPTIONS: BoException[] = [
  { id: 'EX1', module: 'M11', kind: 'payment-failure', severity: 'critical', title: 'รับชำระ QR PromptPay ไม่สำเร็จ · ฿1,450', detail: 'Patcharee L. · INV-2609-0112 · ธนาคารตอบ timeout หลังลูกค้าสแกนแล้ว ต้องตรวจว่าเงินเข้าหรือไม่',
    at: '2026-09-24 11:05', source: 'รับชำระเงิน', ref: 'PAY-2609-0391' },
  { id: 'EX2', module: 'M11', kind: 'export-failure', severity: 'warning', title: 'ส่งข้อมูลบัญชีไป PEAK ไม่สำเร็จ 3 รายการ', detail: 'ใบเสร็จ 2026-09-23 · PEAK ตอบ 401 token หมดอายุ · รอ retry หลังต่ออายุ token',
    at: '2026-09-24 06:00', source: 'Accounting delivery queue', ref: 'ACC-2609-23' },
  { id: 'EX3', module: 'M06', kind: 'expiry', severity: 'warning', title: 'Carprofen 25 mg batch B-2312-04 หมดอายุใน 2 เดือน', detail: 'คงเหลือ 40 เม็ด · หมดอายุ 11/2026 · จ่ายก่อนตามหลัก FEFO',
    at: '2026-09-24 00:10', source: 'Lot และวันหมดอายุ', ref: 'B-2312-04', link: '/clinic/dispense' },
  { id: 'EX4', module: 'M06', kind: 'low-stock', severity: 'warning', title: 'Buprenorphine 0.3 mg/mL เหลือ 6 mL ต่ำกว่าจุดสั่งซื้อ', detail: 'จุดสั่งซื้อ 20 mL · ยาควบคุม · ใช้ในวอร์ด 3.6 mL/วัน',
    at: '2026-09-24 06:10', source: 'รายการต้องเติมยา', ref: 'BU-2411-02', link: '/clinic/ward' },
  { id: 'EX5', module: 'M24', kind: 'credential-expiry', severity: 'warning', title: 'ใบอนุญาต สพ.ญ. ลลิตา หมดอายุใน 21 วัน', detail: 'หมดอายุ 2026-10-15 · ถ้าไม่ต่ออายุจะจัดเวรตรวจไม่ได้',
    at: '2026-09-24 00:00', source: 'ใบอนุญาตและ Credential', ref: 'LIC-VET-0042' },
  { id: 'EX6', module: 'M22', kind: 'downtime', severity: 'critical', title: 'เครื่องดมยาสลบ ห้องผ่าตัด 1 ใช้งานไม่ได้', detail: 'แจ้งเสีย 2026-09-23 17:40 · อุปกรณ์ critical · ผ่าตัดพรุ่งนี้ 2 เคสต้องย้ายห้อง',
    at: '2026-09-23 17:40', source: 'Downtime', ref: 'DT-2609-005' },
  { id: 'EX7', module: 'M28', kind: 'sla-risk', severity: 'warning', title: 'ข้อร้องเรียน CMP-2609-010 ต้องตอบกลับภายใน 5 ชั่วโมง', detail: 'ระดับรุนแรง · SLA 24 ชม. · รออนุมัติเปิด RCA',
    at: '2026-09-24 09:30', source: 'ข้อร้องเรียน', ref: 'CMP-2609-010' },
  { id: 'EX8', module: 'M31', kind: 'sla-risk', severity: 'info', title: 'DSAR-2609-004 เหลือ 6 วันจากกำหนด 30 วัน', detail: 'รอบันทึกตรวจสอบจาก AX-2609-002 · ผู้รับผิดชอบ DPO',
    at: '2026-09-24 08:00', source: 'DSAR', ref: 'DSAR-2609-004' },
  { id: 'EX9', module: 'M11', kind: 'payment-failure', severity: 'warning', title: 'บัตรเครดิตถูกปฏิเสธ · ฿980', detail: 'Sirinya M. · INV-2609-0031 · ลูกค้าจะชำระเงินสดในนัดถัดไป',
    at: '2026-09-23 16:20', source: 'รับชำระเงิน', ref: 'PAY-2609-0377', acknowledgedBy: 'นัทธมน (แคชเชียร์)', acknowledgedAt: '2026-09-23 16:25', note: 'ลูกค้าแจ้งจะชำระเงินสดวันนัด 2026-09-25' },
];

const ACTIVITY: ActivityEntry[] = [
  { id: 'A1', at: '2026-09-24 11:05', by: 'นัทธมน (แคชเชียร์)', module: 'M11', action: 'รับชำระไม่สำเร็จ', target: 'PAY-2609-0391', ref: 'INV-2609-0112', detail: 'QR PromptPay ฿1,450 · ธนาคาร timeout' },
  { id: 'A2', at: '2026-09-24 10:58', by: 'ภก. ธนพร', module: 'M06', action: 'จัดยาส่งวอร์ด', target: 'RX-260924-20', ref: 'Mochi', detail: 'Maropitant 16 mg · batch M-2502-03 → Cat ward' },
  { id: 'A3', at: '2026-09-24 10:20', by: 'นัทธมน (แคชเชียร์)', module: 'M11', action: 'ขอส่วนลด', target: 'DC-2609-007', ref: 'EST-260924-09', detail: 'ส่วนลด 15% ฿1,485 · รอผู้จัดการการเงิน' },
  { id: 'A4', at: '2026-09-24 09:48', by: 'นัทธมน (แคชเชียร์)', module: 'M11', action: 'ขอคืนเงิน', target: 'RF-2609-003', ref: 'INV-2609-0158', detail: '฿650 · Subcutaneous fluids ยกเลิก' },
  { id: 'A5', at: '2026-09-24 08:15', by: 'ภก. ธนพร', module: 'M14', action: 'ขอสิทธิ์ชั่วคราว', target: 'OV-2609-001', ref: 'finance.reports.view', detail: 'ถึง 2026-10-08' },
  { id: 'A6', at: '2026-09-24 06:00', by: 'ระบบ', module: 'M11', action: 'ส่งข้อมูลบัญชีไม่สำเร็จ', target: 'ACC-2609-23', ref: 'PEAK', detail: '3 รายการ · 401 token หมดอายุ' },
  { id: 'A7', at: '2026-09-23 17:40', by: 'พ.ส. ณิชา', module: 'M22', action: 'แจ้งอุปกรณ์เสีย', target: 'DT-2609-005', ref: 'EQ-OR1-ANES-01', detail: 'เครื่องดมยาสลบ ห้องผ่าตัด 1 · ไม่จ่ายแก๊ส' },
  { id: 'A8', at: '2026-09-23 16:05', by: 'ปรีดา (DPO)', module: 'M13', action: 'ขอส่งออกบันทึกตรวจสอบ', target: 'AX-2609-002', ref: 'HN-130904', detail: 'เพื่อตอบ DSAR-2609-004' },
  { id: 'A9', at: '2026-09-23 14:30', by: 'ผู้จัดการ OPD', module: 'M28', action: 'ยกระดับข้อร้องเรียน', target: 'CMP-2609-010', ref: 'NM-2609-003', detail: 'ระดับรุนแรง · ขออนุมัติเปิด RCA' },
  { id: 'A10', at: '2026-09-23 09:02', by: 'วรรณา (ผู้จัดการการเงิน)', module: 'M11', action: 'ปฏิเสธคำขอคืนเงิน', target: 'RF-2609-002', ref: 'INV-2609-0031', detail: 'ให้ปรับลดรายการแทน', before: 'รออนุมัติ', after: 'ปฏิเสธ' },
  { id: 'A11', at: '2026-09-22 15:10', by: 'นัทธมน (แคชเชียร์)', module: 'M11', action: 'ขอคืนเงิน', target: 'RF-2609-002', ref: 'INV-2609-0031', detail: '฿280 · Doxycycline ไม่ได้จ่าย' },
  { id: 'A12', at: '2026-09-22 11:30', by: 'ปรีดา (DPO)', module: 'M31', action: 'ยืนยันตัวตนผู้ขอ', target: 'DSAR-2609-004', ref: 'Kanokwan R.', detail: 'บัตรประชาชนตรงกับทะเบียนเจ้าของ', before: 'รอยืนยันตัวตน', after: 'กำลังดำเนินการ' },
];

/** A fresh copy of the sample, for the store to change */
export function createBackofficeSeed(): BackofficeData {
  return structuredClone({ workItems: WORK_ITEMS, approvals: APPROVALS, exceptions: EXCEPTIONS, activity: ACTIVITY });
}
