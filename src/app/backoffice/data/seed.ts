/* The morning of 24 September 2026 in the hospital's back office: what waits for the people who run it */
import type {
  AccountingExport, ActivityEntry, Approval, Area, BackofficeData, BoException, CallOut, CeRecord, Claim, ControlSystem, CountRecord, DrugRecord, LeaveRequest, LedgerDispense, License,
  LineLink, OnCallSlot, Policy, Privilege, PrivilegeChange, Recall, ServiceMessage, Shift, ShiftKind, StaffMember, StockReceipt, VaccineDue, WasteRecord, WorkItem,
} from './types';

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
    priority: 'high', due: '2026-10-15', owner: 'ฝ่ายบุคคล', status: 'open', ref: 'LIC-VET-0042', link: '/backoffice/workforce/credentials' },
  { id: 'W8', module: 'M24', kind: 'ตารางเวร', title: 'เวรดึกวันเสาร์ 27 ก.ย. ยังไม่มีพยาบาล', detail: 'ต้องการ 1 คน ยังไม่มี · พ.ส. กมล ลาพักร้อน 26–28 ก.ย.',
    priority: 'high', due: '2026-09-27', owner: 'หัวหน้าพยาบาล', status: 'open', ref: 'SHIFT-0927-N', link: '/backoffice/workforce/schedule' },
  { id: 'W9', module: 'M24', kind: 'การลา', title: 'คำขอลาพักร้อน พ.ส. ณิชา 1–3 ต.ค.', detail: 'กระทบเวร 3 เวร ต้องจัดคนแทนก่อนอนุมัติ · รอหัวหน้าพยาบาล',
    priority: 'normal', due: '2026-09-26', owner: 'หัวหน้าพยาบาล', status: 'waiting', ref: 'LV-2609-08', link: '/backoffice/workforce/leave' },
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
    at: '2026-09-24 00:00', source: 'ใบอนุญาตและ Credential', ref: 'LIC-VET-0042', link: '/backoffice/workforce/credentials' },
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

/* What went to the accounting system (PEAK): every bill and receipt, and the batch of 23 September that it refused */
const ok = (id: string, invoiceId: string, document: string, docType: AccountingExport['docType'], amount: number, at: string, ref: string): AccountingExport => ({
  id, invoiceId, document, docType, amount, businessDate: at.slice(0, 10), adapter: 'PEAK', status: 'delivered', attempts: 1, firstAt: at, lastAt: at, deliveredAt: at,
  externalRef: ref, retryable: true, idempotencyKey: `${invoiceId}:${docType}:1`,
});
const ACCOUNTING_EXPORTS: AccountingExport[] = [
  ok('XP-0061', 'I6', 'INV-2606-0090', 'invoice', 1650, '2026-06-12 23:00', 'PEAK-INV-060090'),
  ok('XP-0062', 'I6', 'INV-2606-0090', 'receipt', 1650, '2026-06-12 23:00', 'PEAK-RC-060090'),
  ok('XP-0071', 'I2', 'INV-2607-0045', 'invoice', 1150, '2026-07-02 23:00', 'PEAK-INV-070045'),
  ok('XP-0072', 'I2', 'INV-2607-0045', 'receipt', 1150, '2026-07-02 23:00', 'PEAK-RC-070045'),
  ok('XP-0081', 'I5', 'INV-2608-0007', 'invoice', 1880, '2026-08-02 23:00', 'PEAK-INV-080007'),
  ok('XP-0082', 'I5', 'INV-2608-0007', 'receipt', 1880, '2026-08-02 23:00', 'PEAK-RC-080007'),
  ok('XP-0091', 'I3', 'INV-2609-0031', 'invoice', 980, '2026-09-01 23:00', 'PEAK-INV-090031'),
  ok('XP-0092', 'I9', 'INV-2609-0102', 'invoice', 1200, '2026-09-08 23:00', 'PEAK-INV-090102'),
  ok('XP-0093', 'I9', 'INV-2609-0102', 'receipt', 1200, '2026-09-08 23:00', 'PEAK-RC-090102'),
  ok('XP-0094', 'I9', 'INV-2609-0102', 'credit-note', 1200, '2026-09-08 23:00', 'PEAK-CN-090102'),
  ok('XP-0095', 'I1', 'INV-2609-0112', 'invoice', 2450, '2026-09-11 23:00', 'PEAK-INV-090112'),
  ok('XP-0097', 'I4', 'INV-2609-0158', 'invoice', 2350, '2026-09-12 23:00', 'PEAK-INV-090158'),
  ok('XP-0098', 'I4', 'INV-2609-0158', 'receipt', 2350, '2026-09-12 23:00', 'PEAK-RC-090158'),
  { id: 'XP-0096', invoiceId: 'I1', document: 'INV-2609-0112', docType: 'receipt', amount: 1000, businessDate: '2026-09-23', adapter: 'PEAK', status: 'failed', attempts: 3,
    firstAt: '2026-09-11 23:00', lastAt: '2026-09-24 06:00', retryable: true, idempotencyKey: 'I1:receipt:1', errorCode: 'AUTH_401', errorText: 'PEAK ตอบ 401 — token หมดอายุ' },
  { id: 'XP-0101', invoiceId: 'I8', document: 'INV-2609-0140', docType: 'invoice', amount: 450, businessDate: '2026-09-23', adapter: 'PEAK', status: 'failed', attempts: 2,
    firstAt: '2026-09-23 23:00', lastAt: '2026-09-24 06:00', retryable: true, idempotencyKey: 'I8:invoice:1', errorCode: 'AUTH_401', errorText: 'PEAK ตอบ 401 — token หมดอายุ' },
  { id: 'XP-0102', invoiceId: 'I8', document: 'INV-2609-0140', docType: 'credit-note', amount: 450, businessDate: '2026-09-23', adapter: 'PEAK', status: 'failed', attempts: 2,
    firstAt: '2026-09-23 23:00', lastAt: '2026-09-24 06:00', retryable: true, idempotencyKey: 'I8:credit-note:1', errorCode: 'AUTH_401', errorText: 'PEAK ตอบ 401 — token หมดอายุ' },
];

/* Medication inventory (M06): the registry the pharmacist verified, and what the storekeeper and the ledger recorded lately */
const drug = (id: string, name: string, unit: string, form: string, reorderThreshold: number, lastCount?: [string, string], control?: [ControlSystem, number, boolean]): DrugRecord => ({
  id, name, unit, form, reorderThreshold, classSystem: control?.[0] ?? 'none', category: control?.[1], requiresWitnessDispense: control?.[2] ?? false,
  verifiedBy: 'ภก. ธนพร', lastCountAt: lastCount?.[0], lastCountBy: lastCount?.[1],
});
const DRUGS: DrugRecord[] = [
  drug('D01', 'Amoxicillin-clavulanate 250 mg', 'เม็ด', 'ยาเม็ด', 60, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D02', 'Amoxicillin 250 mg', 'เม็ด', 'ยาเม็ด', 40, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D03', 'Cefalexin 250 mg', 'เม็ด', 'ยาเม็ด', 40, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D04', 'Doxycycline 100 mg', 'เม็ด', 'ยาเม็ด', 40, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D05', 'Metronidazole 250 mg', 'เม็ด', 'ยาเม็ด', 40, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D06', 'Carprofen 25 mg', 'เม็ด', 'ยาเม็ด', 60, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D07', 'Meloxicam 1.5 mg/mL', 'mL', 'ยาน้ำ', 10, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D08', 'Paracetamol 500 mg', 'เม็ด', 'ยาเม็ด', 50),
  drug('D09', 'Tramadol 50 mg', 'เม็ด', 'ยาเม็ด', 30, ['2026-09-23 18:00', 'พ.ส. กมล'], ['psychotropic', 3, false]),
  drug('D10', 'Buprenorphine 0.3 mg/mL (inj)', 'mL', 'ยาฉีด', 20, ['2026-09-24 06:15', 'พ.ส. ณิชา'], ['narcotic', 2, true]),
  drug('D11', 'Prednisolone 5 mg', 'เม็ด', 'ยาเม็ด', 50, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D12', 'Gentamicin 40 mg/mL (inj)', 'mL', 'ยาฉีด', 10, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D13', 'Ondansetron 2 mg', 'เม็ด', 'ยาเม็ด', 30, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D14', 'Maropitant 16 mg', 'เม็ด', 'ยาเม็ด', 20, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D15', 'Omeprazole 10 mg', 'เม็ด', 'ยาเม็ด', 40, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D16', 'Mirtazapine 1.88 mg', 'เม็ด', 'ยาเม็ด', 20, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D17', 'Apoquel 3.6 mg', 'เม็ด', 'ยาเม็ด', 20, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D18', 'Otic drops (ear)', 'ขวด', 'ยาหยอด', 5, ['2026-09-01 08:30', 'คุณสมชาย (คลัง)']),
  drug('D19', 'Bravecto 1000 mg', 'เม็ด', 'ยาเม็ด', 10),
  drug('D20', 'Potassium gluconate 2 mEq', 'โดส', 'ผงผสมอาหาร', 30),
];
const RECEIPTS: StockReceipt[] = [
  { id: 'RC-2609-014', drug: 'Doxycycline 100 mg', lot: 'DX-2506-01', expiry: '06/2028', qty: 150, unit: 'เม็ด', location: 'ตู้ A2', sourceRef: 'DN-77012 · Zuellig', by: 'คุณสมชาย (คลัง)', at: '2026-09-22 09:40' },
  { id: 'RC-2609-015', drug: 'Paracetamol 500 mg', lot: 'PC-2507-01', expiry: '07/2028', qty: 200, unit: 'เม็ด', location: 'ตู้ A3', sourceRef: 'DN-77012 · Zuellig', by: 'คุณสมชาย (คลัง)', at: '2026-09-22 09:45' },
  { id: 'RC-2609-016', drug: 'Buprenorphine 0.3 mg/mL (inj)', lot: 'BU-2411-02', expiry: '11/2027', qty: 10, unit: 'mL', location: 'ตู้ล็อก C', sourceRef: 'DN-77030 · DKSH', note: 'ยาควบคุม · รับโดยเภสัชกรและพยาน', by: 'ภก. ธนพร', at: '2026-09-23 14:10' },
];
const LEDGER_DISPENSES: LedgerDispense[] = [
  { id: 'LD-2609-031', drug: 'Buprenorphine 0.3 mg/mL (inj)', lot: 'BU-2411-02', qty: 0.4, unit: 'mL', patient: 'Mali · Kanokwan R.', encounter: 'ENC-260923-07', order: 'RX-260923-42', by: 'พ.ส. ณิชา', witness: 'พ.ส. กมล', at: '2026-09-24 06:10' },
  { id: 'LD-2609-030', drug: 'Tramadol 50 mg', lot: 'TR-2410-01', qty: 2, unit: 'เม็ด', patient: 'Bolt · Patcharee L.', encounter: 'ENC-260911-03', order: 'RX-260911-05', by: 'สพ.ญ. ลลิตา', at: '2026-09-23 15:20' },
];
const WASTES: WasteRecord[] = [
  { id: 'WS-2609-008', drug: 'Buprenorphine 0.3 mg/mL (inj)', lot: 'BU-2411-02', qty: 0.1, unit: 'mL', reason: 'partial_dose', detail: 'เหลือจากการดูดยา 0.5 mL ให้ 0.4 mL ตามน้ำหนัก', witness: 'พ.ส. กมล', by: 'พ.ส. ณิชา', at: '2026-09-24 06:12', dispenseId: 'LD-2609-031' },
];
const COUNTS: CountRecord[] = [
  { id: 'CT-2609-021', drug: 'Buprenorphine 0.3 mg/mL (inj)', expected: 6, actual: 6, discrepancy: 0, unit: 'mL', by: 'พ.ส. ณิชา', at: '2026-09-24 06:15', investigation: 'none' },
  { id: 'CT-2609-020', drug: 'Tramadol 50 mg', expected: 44, actual: 42, discrepancy: -2, unit: 'เม็ด', by: 'พ.ส. กมล', at: '2026-09-23 18:00', investigation: 'open' },
  { id: 'CT-2609-019', drug: 'Tramadol 50 mg', expected: 46, actual: 46, discrepancy: 0, unit: 'เม็ด', by: 'พ.ส. ณิชา', at: '2026-09-22 18:00', investigation: 'none' },
  { id: 'CT-2609-018', drug: 'Buprenorphine 0.3 mg/mL (inj)', expected: 7, actual: 6.5, discrepancy: -0.5, unit: 'mL', by: 'พ.ส. กมล', at: '2026-09-22 06:15', investigation: 'resolved',
    resolvedBy: 'น.สพ. นรินทร์', resolvedAt: '2026-09-22 09:30', resolutionNotes: 'ตรวจพบบันทึกยาเสียของคืนวันที่ 21 ที่ยังไม่ลงในบัญชี ลงบันทึกแล้ว' },
];
const RECALLS: Recall[] = [
  { id: 'RCL-2609-002', drug: 'Carprofen 25 mg', lot: 'B-2312-04', reason: 'ประกาศผู้ผลิต 2026-09-22: ปริมาณตัวยาต่ำกว่าเกณฑ์ใน lot นี้ (class 2)', severity: 'class-2', status: 'open', openedBy: 'ภก. ธนพร', openedAt: '2026-09-23 09:00',
    updates: [['2026-09-23 09:00', 'ภก. ธนพร', 'open', 'รับประกาศจากผู้ผลิต เริ่มตรวจสอบ lot ในคลังและที่จ่ายไปแล้ว']] },
];

/* Sales and customer service: who is on LINE and what they agreed to, what was sent, what comes due, and the insurance on file */
const consent = (at: string, reminder = true, marketing = false) => ({ service: true, reminder, marketing, version: 'v3', at });
const LINE_LINKS: LineLink[] = [
  { ownerKey: 'Somsak W.', displayName: 'Somsak W.', linkedAt: '2026-01-12 10:20', consent: consent('2026-01-12 10:20', true, true) },
  { ownerKey: 'Napat T.', displayName: 'Napat', linkedAt: '2026-03-03 15:02', consent: consent('2026-03-03 15:02') },
  { ownerKey: 'Arisa K.', displayName: 'Arisa K', linkedAt: '2026-05-09 11:40', consent: { ...consent('2026-05-09 11:40'), reminder: false }, withdrawn: { purpose: 'reminder', at: '2026-09-10 20:15' } },
  { ownerKey: 'Patcharee L.', displayName: 'Patcharee', linkedAt: '2026-02-01 09:00', consent: consent('2026-09-18 10:05', true, true) },
  { ownerKey: 'Waraporn D.', displayName: 'Waraporn', linkedAt: '2026-04-20 13:10', consent: consent('2026-09-12 12:00') },
  { ownerKey: 'Thanawat P.', displayName: 'Thanawat P.', linkedAt: '2026-08-30 17:30', consent: consent('2026-08-30 17:30') },
  { ownerKey: 'Sirinya M.', displayName: 'Sirinya', linkedAt: '2026-09-01 16:30', consent: consent('2026-09-01 16:30') },
  { ownerKey: 'Kanokwan R.', displayName: 'Kanokwan R', linkedAt: '2026-09-23 16:40', consent: consent('2026-09-23 16:40', false) },
];
const MESSAGES: ServiceMessage[] = [
  { id: 'MSG-2609-118', ownerKey: 'Somsak W.', pet: 'Luna', kind: 'appointment-reminder', text: 'แจ้งเตือนนัด Luna 2026-09-24 09:00 · Annual exam', ref: 'A1', at: '2026-09-23 09:00', by: 'ระบบ', status: 'read' },
  { id: 'MSG-2609-119', ownerKey: 'Patcharee L.', pet: 'Bolt', kind: 'appointment-reminder', text: 'แจ้งเตือนนัด Bolt 2026-09-24 10:20 · Lameness', ref: 'A3', at: '2026-09-23 09:00', by: 'ระบบ', status: 'read' },
  { id: 'MSG-2609-121', ownerKey: 'Napat T.', pet: 'Mochi', kind: 'visit-status', text: 'Mochi เข้าห้องตรวจแล้ว · Exam Room 2', ref: 'A2', at: '2026-09-24 09:31', by: 'ระบบ', status: 'delivered' },
  { id: 'MSG-2609-120', ownerKey: 'Sirinya M.', pet: 'Khao Niao', kind: 'bill-link', text: 'ลิงก์ชำระ INV-2609-0031 · ฿980 (PromptPay)', ref: 'I3', at: '2026-09-17 10:00', by: 'นัทธมน (แคชเชียร์)', status: 'failed', error: 'LINE ตอบ 400 — ผู้ใช้บล็อกบัญชีชั่วคราว' },
  { id: 'MSG-2609-117', ownerKey: 'Waraporn D.', pet: 'Nala', kind: 'follow-up', text: 'ติดตามอาการ Nala หลังให้สารน้ำ · ตอบกลับได้ในแชท', ref: 'E-260912-06', at: '2026-09-14 10:00', by: 'พ.ส. ณิชา', status: 'read' },
];
const VACCINES_DUE: VaccineDue[] = [
  { ownerKey: 'Somsak W.', pet: 'Kiki', vaccine: 'FVRCP booster', due: '2026-10-02' },
  { ownerKey: 'Thanawat P.', pet: 'Pumpkin', vaccine: 'Rabies', due: '2026-10-10' },
  { ownerKey: 'Arisa K.', pet: 'Coco', vaccine: 'DHPPiL booster', due: '2026-10-05' },
  { ownerKey: 'Kittikun S.', pet: 'Milo', vaccine: 'FVRCP booster', due: '2026-10-08' },
  { ownerKey: 'Patcharee L.', pet: 'Bolt', vaccine: 'Leptospirosis', due: '2026-12-20' },
];
const POLICIES: Policy[] = [
  { id: 'PL1', ownerKey: 'Patcharee L.', pet: 'Bolt', insurer: 'Falcon', policyNo: 'FC-88120', limit: 30000, remaining: 18000, deductible: 500, copay: 0.2, validTo: '2027-02-28' },
  { id: 'PL2', ownerKey: 'Kanokwan R.', pet: 'Mali', insurer: 'MSIG', policyNo: 'MS-44821', limit: 50000, remaining: 50000, deductible: 1000, copay: 0.1, validTo: '2027-06-30' },
  { id: 'PL3', ownerKey: 'Waraporn D.', pet: 'Nala', insurer: 'Roojai', policyNo: 'RJ-20931', limit: 20000, remaining: 12350, deductible: 0, copay: 0.3, validTo: '2026-12-31' },
];
const CASHIER = 'นัทธมน (แคชเชียร์)';
const CLAIMS: Claim[] = [
  { id: 'CLM-2609-007', kind: 'claim', policyId: 'PL1', invoiceId: 'I1', ownerKey: 'Patcharee L.', pet: 'Bolt', insurer: 'Falcon', diagnosis: 'ขาหลังขวาเจ็บ · สงสัยเอ็นไขว้หน้าฉีกบางส่วน',
    amount: 1560, createdAt: '2026-09-12 09:10', createdBy: CASHIER, status: 'submitted', documentsAt: '2026-09-12 09:15', submittedVia: 'อีเมลฝ่ายสินไหม Falcon', insurerRef: 'FAL-CL-551207',
    log: [['2026-09-12 09:10', CASHIER, 'draft', 'สร้างจาก INV-2609-0112'], ['2026-09-12 09:15', CASHIER, 'documents-ready', 'ออกแบบฟอร์มเคลม Falcon'], ['2026-09-12 11:00', CASHIER, 'submitted', 'ส่งอีเมลพร้อมเอกสาร · เลขรับเรื่อง FAL-CL-551207']] },
  { id: 'CLM-2609-005', kind: 'claim', policyId: 'PL3', invoiceId: 'I4', ownerKey: 'Waraporn D.', pet: 'Nala', insurer: 'Roojai', diagnosis: 'ไตเรื้อรังระยะ 2 · ติดตามค่าไต',
    amount: 1645, createdAt: '2026-09-12 12:30', createdBy: CASHIER, status: 'approved', documentsAt: '2026-09-12 12:32', submittedVia: 'พอร์ทัล Roojai', insurerRef: 'RJ-CL-90233', approvedAmount: 1645, decisionNote: 'อนุมัติเต็มจำนวน · โอนให้เจ้าของ',
    log: [['2026-09-12 12:30', CASHIER, 'draft', 'สร้างจาก INV-2609-0158'], ['2026-09-12 12:32', CASHIER, 'documents-ready', 'ออกแบบฟอร์มเคลม Roojai'], ['2026-09-12 13:00', CASHIER, 'submitted', 'อัปโหลดในพอร์ทัล Roojai'], ['2026-09-20 10:00', CASHIER, 'approved', 'อนุมัติเต็มจำนวน · โอนให้เจ้าของ']] },
  { id: 'CLM-2609-008', kind: 'pre-auth', policyId: 'PL2', ownerKey: 'Kanokwan R.', pet: 'Mali', insurer: 'MSIG', diagnosis: 'Pyometra · ผ่าตัดมดลูกและนอนโรงพยาบาล 3 วัน',
    amount: 18500, createdAt: '2026-09-23 17:00', createdBy: CASHIER, status: 'draft',
    log: [['2026-09-23 17:00', CASHIER, 'draft', 'ขออนุมัติล่วงหน้าตามประมาณการ ฿18,500']] },
  { id: 'CLM-2607-012', kind: 'claim', policyId: 'PL1', invoiceId: 'I2', ownerKey: 'Patcharee L.', pet: 'Bolt', insurer: 'Falcon', diagnosis: 'วัคซีนประจำปี',
    amount: 520, createdAt: '2026-07-03 09:00', createdBy: CASHIER, status: 'rejected', documentsAt: '2026-07-03 09:05', submittedVia: 'อีเมลฝ่ายสินไหม Falcon', insurerRef: 'FAL-CL-540118', decisionNote: 'วัคซีนป้องกันไม่อยู่ในความคุ้มครองของแผน',
    log: [['2026-07-03 09:00', CASHIER, 'draft', 'สร้างจาก INV-2607-0045'], ['2026-07-03 09:05', CASHIER, 'documents-ready', 'ออกแบบฟอร์มเคลม Falcon'], ['2026-07-03 10:00', CASHIER, 'submitted', 'ส่งอีเมลพร้อมเอกสาร'], ['2026-07-15 14:00', CASHIER, 'rejected', 'วัคซีนป้องกันไม่อยู่ในความคุ้มครองของแผน']] },
];

/* Workforce (M24): the people, their licenses and CE, the hospital's privileges, two weeks of shifts, leave and on-call */
const STAFF: StaffMember[] = [
  { id: 'S01', name: 'น.สพ. นรินทร์', role: 'vet', position: 'ผู้อำนวยการโรงพยาบาล · สัตวแพทย์', department: 'OPD', employment: 'full-time', status: 'active', startedAt: '2019-06-01', phone: '081-220-4411', iamUser: 'narin.v', ceTarget: 20, weeklyHours: 40 },
  { id: 'S02', name: 'สพ.ญ. ลลิตา', role: 'vet', position: 'สัตวแพทย์อายุรกรรม', department: 'OPD', employment: 'full-time', status: 'active', startedAt: '2021-03-15', phone: '081-220-4412', iamUser: 'lalita.v', ceTarget: 20, weeklyHours: 40 },
  { id: 'S03', name: 'สพ.ญ. พิชญา', role: 'vet', position: 'สัตวแพทย์ศัลยกรรม', department: 'OR', employment: 'full-time', status: 'active', startedAt: '2022-08-01', phone: '081-220-4413', iamUser: 'pichaya.v', ceTarget: 20, weeklyHours: 40 },
  { id: 'S04', name: 'น.สพ. ภูมิ', role: 'vet', position: 'สัตวแพทย์ชั่วคราว', department: 'OPD', employment: 'locum', status: 'active', startedAt: '2026-09-20', phone: '089-551-0204', ceTarget: 20, weeklyHours: 24 },
  { id: 'S05', name: 'พ.ส. อรุณี', role: 'nurse', position: 'หัวหน้าพยาบาล', department: 'Ward', employment: 'full-time', status: 'active', startedAt: '2019-06-01', phone: '081-220-4421', iamUser: 'arunee.n', ceTarget: 12, weeklyHours: 40 },
  { id: 'S06', name: 'พ.ส. ณิชา', role: 'nurse', position: 'พยาบาลสัตว์', department: 'OPD', employment: 'full-time', status: 'active', startedAt: '2022-01-10', phone: '081-220-4422', iamUser: 'nicha.n', ceTarget: 12, weeklyHours: 40 },
  { id: 'S07', name: 'พ.ส. กมล', role: 'nurse', position: 'พยาบาลสัตว์', department: 'Ward', employment: 'full-time', status: 'active', startedAt: '2023-05-02', phone: '081-220-4423', iamUser: 'kamon.n', ceTarget: 12, weeklyHours: 40 },
  { id: 'S08', name: 'พ.ส. ปวีณา', role: 'nurse', position: 'พยาบาลสัตว์', department: 'Ward', employment: 'part-time', status: 'active', startedAt: '2024-11-01', phone: '081-220-4424', iamUser: 'paweena.n', ceTarget: 12, weeklyHours: 24 },
  { id: 'S14', name: 'พ.ส. สุดา', role: 'nurse', position: 'พยาบาลสัตว์', department: 'Ward', employment: 'full-time', status: 'active', startedAt: '2024-02-01', phone: '081-220-4425', iamUser: 'suda.n', ceTarget: 12, weeklyHours: 40 },
  { id: 'S15', name: 'พ.ส. วิภา', role: 'nurse', position: 'พยาบาลสัตว์', department: 'Ward', employment: 'full-time', status: 'active', startedAt: '2025-07-01', phone: '081-220-4426', iamUser: 'wipa.n', ceTarget: 12, weeklyHours: 40 },
  { id: 'S09', name: 'ภก. ธนพร', role: 'pharmacist', position: 'เภสัชกร', department: 'Pharmacy', employment: 'full-time', status: 'active', startedAt: '2020-02-03', phone: '081-220-4431', iamUser: 'thanaporn.p', ceTarget: 15, weeklyHours: 40 },
  { id: 'S10', name: 'สมใจ', role: 'groomer', position: 'ช่างอาบน้ำตัดขน', department: 'Grooming', employment: 'full-time', status: 'active', startedAt: '2023-09-01', phone: '081-220-4441', weeklyHours: 40 },
  { id: 'S11', name: 'นัทธมน', role: 'cashier', position: 'แคชเชียร์', department: 'การเงิน', employment: 'full-time', status: 'active', startedAt: '2022-04-01', phone: '081-220-4451', iamUser: 'nattamon.c', weeklyHours: 40 },
  { id: 'S12', name: 'วรรณา', role: 'manager', position: 'ผู้จัดการการเงิน', department: 'การเงิน', employment: 'full-time', status: 'active', startedAt: '2020-01-06', phone: '081-220-4452', iamUser: 'wanna.f', weeklyHours: 40 },
  { id: 'S13', name: 'ปรีดา', role: 'manager', position: 'เจ้าหน้าที่คุ้มครองข้อมูล (DPO)', department: 'สำนักงาน', employment: 'part-time', status: 'active', startedAt: '2025-01-15', phone: '081-220-4453', iamUser: 'preeda.d', weeklyHours: 24 },
];

const HR = 'ฝ่ายบุคคล';
const lic = (id: string, staffId: string, kind: License['kind'], number: string, issuer: string, issuedAt: string, expiresAt: string, verified?: [string, string]): License => ({
  id, staffId, kind, number, issuer, issuedAt, expiresAt, verification: verified ? 'verified' : 'pending', verifiedBy: verified?.[1], verifiedAt: verified?.[0],
  history: [
    [`${issuedAt} 09:00`, HR, 'บันทึกใบอนุญาต', `${number} · หมดอายุ ${expiresAt}`],
    ...(verified ? [[verified[0], verified[1], 'ตรวจสอบแล้ว', `ตรวจกับ${issuer}`] as [string, string, string, string]] : []),
  ],
});
const LICENSES: License[] = [
  lic('L01', 'S01', 'vet-license', 'LIC-VET-0017', 'สัตวแพทยสภา', '2026-04-01', '2031-03-31', ['2026-04-03 10:00', HR]),
  lic('L02', 'S01', 'controlled-license', 'CD-2210-033', 'อย.', '2022-10-01', '2027-09-30', ['2022-10-05 10:00', HR]),
  lic('L03', 'S02', 'vet-license', 'LIC-VET-0042', 'สัตวแพทยสภา', '2021-10-16', '2026-10-15', ['2021-10-20 10:00', HR]),
  lic('L04', 'S02', 'controlled-license', 'CD-2303-118', 'อย.', '2023-03-31', '2028-03-31', ['2023-04-04 11:00', HR]),
  lic('L05', 'S03', 'vet-license', 'LIC-VET-0058', 'สัตวแพทยสภา', '2025-07-01', '2030-06-30', ['2025-07-03 09:30', HR]),
  lic('L06', 'S04', 'vet-license', 'LIC-VET-0101', 'สัตวแพทยสภา', '2024-09-01', '2029-08-31'),
  lic('L07', 'S05', 'rvn-certificate', 'RVN-H-001', 'โรงพยาบาล', '2025-06-01', '2027-05-31', ['2025-06-01 09:00', 'น.สพ. นรินทร์']),
  lic('L08', 'S06', 'rvn-certificate', 'RVN-H-004', 'โรงพยาบาล', '2025-02-01', '2027-01-31', ['2025-02-01 09:00', 'พ.ส. อรุณี']),
  lic('L09', 'S07', 'rvn-certificate', 'RVN-H-006', 'โรงพยาบาล', '2024-12-21', '2026-12-20', ['2024-12-21 09:00', 'พ.ส. อรุณี']),
  lic('L10', 'S08', 'rvn-certificate', 'RVN-H-009', 'โรงพยาบาล', '2024-11-19', '2026-11-18', ['2024-11-19 09:00', 'พ.ส. อรุณี']),
  lic('L13', 'S14', 'rvn-certificate', 'RVN-H-011', 'โรงพยาบาล', '2026-02-01', '2028-01-31', ['2026-02-01 09:00', 'พ.ส. อรุณี']),
  lic('L14', 'S15', 'rvn-certificate', 'RVN-H-013', 'โรงพยาบาล', '2025-07-01', '2027-06-30', ['2025-07-01 09:00', 'พ.ส. อรุณี']),
  lic('L11', 'S09', 'pharmacist-license', 'PH-38812', 'สภาเภสัชกรรม', '2022-12-11', '2027-12-10', ['2022-12-15 10:00', HR]),
  lic('L12', 'S10', 'groomer-certificate', 'GRM-0721', 'สมาคมผู้ประกอบการสัตว์เลี้ยง', '2024-09-16', '2026-09-15', ['2024-09-18 10:00', HR]),
];

const ce = (id: string, staffId: string, course: string, provider: string, date: string, hours: number, category: CeRecord['category'], status: CeRecord['status'], certificate?: string): CeRecord => ({
  id, staffId, course, provider, date, hours, category, status, certificate, enteredBy: HR, enteredAt: `${date} 17:00`,
  ...(status === 'approved' ? { reviewedBy: 'ระบบ', reviewedAt: `${date} 17:00`, note: 'หลักสูตรในรายการที่โรงพยาบาลรับรอง' } : {}),
});
const CE_RECORDS: CeRecord[] = [
  ce('CE-26-015', 'S02', 'Abdominal ultrasound course', 'Vet Imaging Asia', '2026-09-12', 8, 'clinical', 'pending', 'ultrasound-cert-lalita.pdf'),
  ce('CE-26-014', 'S09', 'Antimicrobial stewardship webinar', 'สภาเภสัชกรรม', '2026-09-05', 2, 'pharmacology', 'pending'),
  ce('CE-26-013', 'S06', 'Controlled drug handling', 'อย.', '2026-08-20', 3, 'pharmacology', 'approved', 'cd-handling-nicha.pdf'),
  ce('CE-26-012', 'S09', 'Controlled drug handling', 'อย.', '2026-08-20', 3, 'pharmacology', 'approved', 'cd-handling-thanaporn.pdf'),
  ce('CE-26-011', 'S01', 'Feline CKD update', 'คณะสัตวแพทยศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย', '2026-06-07', 4, 'clinical', 'approved', 'ckd-narin.pdf'),
  ce('CE-26-010', 'S02', 'Feline CKD update', 'คณะสัตวแพทยศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย', '2026-06-07', 4, 'clinical', 'approved', 'ckd-lalita.pdf'),
  ce('CE-26-009', 'S03', 'Anesthesia monitoring workshop', 'สมาคมวิสัญญีสัตวแพทย์', '2026-05-16', 6, 'clinical', 'approved', 'anes-pichaya.pdf'),
  ce('CE-26-008', 'S01', 'VPAT Annual Conference 2026', 'VPAT', '2026-04-18', 12, 'clinical', 'approved', 'vpat-narin.pdf'),
  ce('CE-26-007', 'S02', 'VPAT Annual Conference 2026', 'VPAT', '2026-04-18', 12, 'clinical', 'approved', 'vpat-lalita.pdf'),
  ce('CE-26-006', 'S14', 'CPR (RECOVER) BLS', 'RECOVER Initiative', '2026-03-21', 4, 'clinical', 'approved', 'cpr-suda.pdf'),
  ce('CE-26-005', 'S15', 'CPR (RECOVER) BLS', 'RECOVER Initiative', '2026-03-21', 4, 'clinical', 'approved', 'cpr-wipa.pdf'),
  ce('CE-26-004', 'S06', 'CPR (RECOVER) BLS', 'RECOVER Initiative', '2026-03-21', 4, 'clinical', 'approved', 'cpr-nicha.pdf'),
  ce('CE-26-003', 'S05', 'CPR (RECOVER) BLS', 'RECOVER Initiative', '2026-03-21', 4, 'clinical', 'approved', 'cpr-arunee.pdf'),
  ce('CE-26-002', 'S05', 'Fire and chemical safety', 'โรงพยาบาล', '2026-02-12', 2, 'safety', 'approved'),
  ce('CE-26-001', 'S07', 'Fire and chemical safety', 'โรงพยาบาล', '2026-02-12', 2, 'safety', 'approved'),
];

const PRIVILEGES_SEED: Record<string, Privilege[]> = {
  S01: ['prescribe', 'prescribe-controlled', 'anesthesia', 'surgery', 'witness-controlled', 'imaging', 'discharge'],
  S02: ['prescribe', 'prescribe-controlled', 'anesthesia', 'witness-controlled', 'imaging', 'discharge'],
  S03: ['prescribe', 'anesthesia', 'surgery', 'witness-controlled', 'imaging', 'discharge'],
  S04: [],
  S05: ['witness-controlled', 'imaging', 'discharge'],
  S06: ['witness-controlled', 'imaging', 'discharge'],
  S07: ['witness-controlled', 'discharge'],
  S08: ['discharge'],
  S14: ['witness-controlled', 'discharge'],
  S15: ['discharge'],
  S09: ['dispense', 'witness-controlled'],
  S10: [], S11: [], S12: [], S13: [],
};
const PRIVILEGE_LOG: PrivilegeChange[] = [
  { id: 'PV-004', staffId: 'S07', privilege: 'imaging', action: 'revoke', reason: 'ยังไม่ผ่านการอบรมความปลอดภัยทางรังสีรอบปี 2026', by: 'พ.ส. อรุณี', at: '2026-08-30 15:00' },
  { id: 'PV-003', staffId: 'S03', privilege: 'surgery', action: 'grant', reason: 'ผ่านการประเมินผ่าตัดทำหมันและเนื้อเยื่ออ่อนครบ 20 เคส', by: 'น.สพ. นรินทร์', at: '2025-11-02 10:00' },
  { id: 'PV-002', staffId: 'S02', privilege: 'prescribe-controlled', action: 'grant', reason: 'ได้รับใบอนุญาตสั่งใช้ยาควบคุม CD-2303-118', by: 'น.สพ. นรินทร์', at: '2023-04-10 09:00' },
  { id: 'PV-001', staffId: 'S09', privilege: 'dispense', action: 'grant', reason: 'เภสัชกรประจำโรงพยาบาล ใบอนุญาต PH-38812', by: 'น.สพ. นรินทร์', at: '2020-02-03 09:00' },
];

/*
 * Two weeks of shifts, a letter a day from Monday: M morning, A afternoon, N night, X morning and afternoon (the
 * overlap the check finds), - off. The week of 21 September is out; the next is a draft. Kamon is on leave 26–28,
 * so Saturday night has no nurse.
 */
const AREA: Record<string, Area> = { S01: 'OPD', S02: 'OPD', S03: 'OR', S04: 'OPD', S05: 'Ward', S06: 'OPD', S07: 'Ward', S08: 'Ward', S14: 'Ward', S15: 'Ward', S09: 'Pharmacy', S10: 'Grooming' };
const ROTA: Record<string, [string, string]> = {
  S01: ['MMMMM--', 'MMMMM--'],
  S02: ['MAMAM-M', 'MAMAM--'],
  S03: ['AMAMAM-', 'AMXM-M-'],
  S04: ['-------', '---AA-M'],
  S05: ['MMMMM--', 'MMMMM--'],
  S06: ['-ANMAMN', 'NM-AMM-'],
  S07: ['AM-MM--', '-AN-N-N'],
  S08: ['--M--AA', '--A--AA'],
  S14: ['M-ANN-M', 'M-MMA-M'],
  S15: ['NN-A---', 'AN-N-N-'],
  S09: ['MMMMM--', 'MMMMM--'],
  S10: ['-MMMMM-', '-MMMMM-'],
};
function rota(): Shift[] {
  const out: Shift[] = [];
  const kinds: Record<string, ShiftKind[]> = { M: ['morning'], A: ['afternoon'], N: ['night'], X: ['morning', 'afternoon'] };
  let n = 0;
  for (const [staffId, weeks] of Object.entries(ROTA)) {
    weeks.forEach((week, w) => [...week].forEach((c, d) => {
      for (const kind of kinds[c] ?? []) {
        const day = new Date(Date.UTC(2026, 8, 21 + w * 7 + d)).toISOString().slice(0, 10);
        out.push({ id: `SH-${String(++n).padStart(3, '0')}`, staffId, date: day, kind, area: AREA[staffId], status: w === 0 ? 'published' : 'draft' });
      }
    }));
  }
  return out;
}

const LEAVES: LeaveRequest[] = [
  { id: 'LV-2609-09', staffId: 'S15', type: 'sick', from: '2026-09-24', to: '2026-09-24', reason: 'มีไข้ตั้งแต่เมื่อคืน ไปพบแพทย์ช่วงเช้า', status: 'pending', requestedBy: 'พ.ส. วิภา', requestedAt: '2026-09-24 07:40' },
  { id: 'LV-2609-08', staffId: 'S06', type: 'vacation', from: '2026-10-01', to: '2026-10-03', reason: 'กลับบ้านต่างจังหวัดงานบวชน้องชาย', status: 'pending', requestedBy: 'พ.ส. ณิชา', requestedAt: '2026-09-22 16:30' },
  { id: 'LV-2609-07', staffId: 'S08', type: 'personal', from: '2026-09-27', to: '2026-09-27', reason: 'ติดธุระส่วนตัวที่ธนาคาร', status: 'rejected', requestedBy: 'พ.ส. ปวีณา', requestedAt: '2026-09-16 10:00',
    decidedBy: 'พ.ส. อรุณี', decidedAt: '2026-09-16 14:00', decisionNote: 'วันอาทิตย์มีพยาบาลบ่ายคนเดียว ขอให้เลื่อนเป็นวันธรรมดา' },
  { id: 'LV-2609-06', staffId: 'S07', type: 'vacation', from: '2026-09-26', to: '2026-09-28', reason: 'ลาพักร้อนประจำปีตามที่แจ้งไว้ล่วงหน้า', status: 'approved', requestedBy: 'พ.ส. กมล', requestedAt: '2026-09-01 09:00',
    decidedBy: 'พ.ส. อรุณี', decidedAt: '2026-09-02 10:30', decisionNote: 'อนุมัติ · จัดคนแทนเวรดึกวันเสาร์ก่อนประกาศ' },
  { id: 'LV-2609-05', staffId: 'S03', type: 'personal', from: '2026-09-19', to: '2026-09-19', reason: 'ไปสอบวุฒิบัตรศัลยกรรมรอบแรก', status: 'approved', requestedBy: 'สพ.ญ. พิชญา', requestedAt: '2026-09-05 11:00',
    decidedBy: 'น.สพ. นรินทร์', decidedAt: '2026-09-05 15:00', decisionNote: 'อนุมัติ · ไม่มีผ่าตัดนัดวันนั้น' },
];

/** The week of 21 September is out: a fair turn among the three vets */
const ON_CALL: OnCallSlot[] = ['S01', 'S02', 'S03', 'S01', 'S02', 'S03', 'S01'].map((staffId, d) => ({ date: `2026-09-${21 + d}`, staffId, status: 'published' as const }));
const CALL_OUTS: CallOut[] = [
  { id: 'CO-2609-04', date: '2026-09-22', staffId: 'S02', hours: 2.5, reason: 'ผ่าตัดฉุกเฉิน GDV' },
  { id: 'CO-2609-05', date: '2026-09-23', staffId: 'S03', hours: 1.5, reason: 'สุนัขชักต่อเนื่อง' },
];

/** A fresh copy of the sample, for the store to change */
export function createBackofficeSeed(): BackofficeData {
  return structuredClone({
    workItems: WORK_ITEMS, approvals: APPROVALS, exceptions: EXCEPTIONS, activity: ACTIVITY, accountingExports: ACCOUNTING_EXPORTS, reconciliations: [],
    drugs: DRUGS, receipts: RECEIPTS, ledgerDispenses: LEDGER_DISPENSES, wastes: WASTES, counts: COUNTS, recalls: RECALLS,
    lineLinks: LINE_LINKS, messages: MESSAGES, vaccinesDue: VACCINES_DUE, policies: POLICIES, claims: CLAIMS,
    staff: STAFF, licenses: LICENSES, ce: CE_RECORDS, privileges: PRIVILEGES_SEED, privilegeLog: PRIVILEGE_LOG, shifts: rota(), leaves: LEAVES, onCall: ON_CALL, callOuts: CALL_OUTS,
  });
}
