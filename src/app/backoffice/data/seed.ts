/* The morning of 24 September 2026 in the hospital's back office: what waits for the people who run it */
import { hashOf } from './governance';
import { ANONYMOUS } from './quality';
import type {
  AccountingExport, ActivityEntry, Approval, Area, AuditEvent, AuditExport, BackofficeData, Breach, ConsentGrant, CrossBorder, DsarRequest, IntegrityPeriod, RetentionDataset, RiskLevel,
  RopaExport, RopaRecord, BoException, CalibrationRecord, CallOut, CatchPoint, CeRecord, Claim, Complaint, ComplaintCategory, ComplaintChannel,
  ComplaintSeverity, ContractKind, ControlSystem, CountRecord, Criticality, Decommission, Downtime, DrugRecord, Equipment, EquipmentClass, HarmLevel, Incident, KpiDefinition, LeaveRequest,
  LedgerDispense, License, LineLink, MmReview, NearMiss, OnCallSlot, PmTask, Policy, Privilege, PrivilegeChange, Rca, Recall, Remedy, SafetyCategory, SafetySurvey, ServiceContract,
  ServiceMessage, Shift, ShiftKind, StaffMember, StockReceipt, VaccineDue, WasteRecord, WorkItem,
  ConnectionTest,
} from './types';

/* Work the modules hold: credentials, equipment, complaints, PDPA (M24, M22, M28, M31) */
const WORK_ITEMS: WorkItem[] = [
  { id: 'W1', module: 'M31', kind: 'DSAR', title: 'คำขอเข้าถึงข้อมูลส่วนบุคคล · คุณ Kanokwan R.', detail: 'ขอสำเนาประวัติการรักษาของ Mali ทั้งหมด · ยืนยันตัวตนแล้ว',
    priority: 'high', due: '2026-09-30', owner: 'DPO', status: 'in-progress', ref: 'DSAR-2609-004', link: '/backoffice/quality/dsar/DSAR-2609-004' },
  { id: 'W2', module: 'M31', kind: 'DSAR', title: 'คำขอลบข้อมูล · คุณ Prasit N.', detail: 'เจ้าของย้ายโรงพยาบาล ขอลบข้อมูลติดต่อ · รอตรวจ retention',
    priority: 'normal', due: '2026-10-12', owner: 'DPO', status: 'open', ref: 'DSAR-2609-005', link: '/backoffice/quality/dsar/DSAR-2609-005' },
  { id: 'W3', module: 'M28', kind: 'ข้อร้องเรียน', title: 'รอนานเกิน 2 ชั่วโมงที่ OPD · คุณ Sirinya M.', detail: 'ร้องเรียนทาง LINE เมื่อ 2026-09-22 · ระดับปานกลาง · SLA ตอบกลับ 3 วัน',
    priority: 'high', due: '2026-09-25', owner: 'ผู้จัดการ OPD', status: 'in-progress', ref: 'CMP-2609-011', link: '/backoffice/quality/complaints' },
  { id: 'W4', module: 'M28', kind: 'ข้อร้องเรียน', title: 'ใบเสร็จไม่ตรงกับประมาณการ · คุณ Arisa K.', detail: 'เรียกเก็บค่า X-ray เกินประมาณการ ฿400 · รอการเงินตรวจสอบ',
    priority: 'normal', due: '2026-09-26', owner: 'การเงิน', status: 'open', ref: 'CMP-2609-012', link: '/backoffice/quality/complaints' },
  { id: 'W5', module: 'M22', kind: 'PM', title: 'บำรุงรักษาเครื่องดมยาสลบ · ห้องผ่าตัด 1', detail: 'PM ประจำ 6 เดือน เกินกำหนด 4 วัน · อุปกรณ์ critical',
    priority: 'critical', due: '2026-09-20', owner: 'ช่างซ่อมบำรุง', status: 'open', ref: 'EQ-OR1-ANES-01', link: '/backoffice/assets/pm' },
  { id: 'W6', module: 'M22', kind: 'Calibration', title: 'สอบเทียบเครื่องตรวจเลือด CBC', detail: 'ครบกำหนดสอบเทียบประจำปี · นัดผู้ขาย 2026-09-26',
    priority: 'normal', due: '2026-09-26', owner: 'ห้องปฏิบัติการ', status: 'waiting', ref: 'EQ-LAB-CBC-02', link: '/backoffice/assets/calibration' },
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
  { id: 'AP3', module: 'M13', kind: 'audit-export', title: 'ส่งออกบันทึกตรวจสอบ · การเข้าถึงเวชระเบียน Mali', detail: 'ช่วง 2026-09-01 ถึง 2026-09-24 · ผู้ขอ DPO · วัตถุประสงค์ ตอบ DSAR-2609-004',
    requestedBy: 'ปรีดา (DPO)', requestedAt: '2026-09-23 16:05', reason: 'ตอบคำขอเข้าถึงข้อมูลส่วนบุคคล DSAR-2609-004 ต้องแนบรายการผู้เข้าถึงเวชระเบียน',
    evidence: [['ขอบเขต', 'entity=patient HN-180533 · 2026-09-01 → 2026-09-24'], ['วัตถุประสงค์', 'DSAR-2609-004'], ['การแยกหน้าที่', 'ผู้ขอไม่ใช่ผู้อนุมัติ']],
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
    at: '2026-09-23 17:40', source: 'Downtime', ref: 'DT-2609-005', link: '/backoffice/assets/downtime' },
  { id: 'EX7', module: 'M28', kind: 'sla-risk', severity: 'warning', title: 'ข้อร้องเรียน CMP-2609-010 ต้องตอบกลับภายใน 5 ชั่วโมง', detail: 'ระดับรุนแรง · SLA 24 ชม. · รออนุมัติเปิด RCA',
    at: '2026-09-24 09:30', source: 'ข้อร้องเรียน', ref: 'CMP-2609-010', link: '/backoffice/quality/complaints' },
  { id: 'EX8', module: 'M31', kind: 'sla-risk', severity: 'info', title: 'DSAR-2609-004 เหลือ 6 วันจากกำหนด 30 วัน', detail: 'รอบันทึกตรวจสอบจาก AX-2609-002 · ผู้รับผิดชอบ DPO',
    at: '2026-09-24 08:00', source: 'DSAR', ref: 'DSAR-2609-004', link: '/backoffice/quality/dsar/DSAR-2609-004' },
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
  { id: 'A8', at: '2026-09-23 16:05', by: 'ปรีดา (DPO)', module: 'M13', action: 'ขอส่งออกบันทึกตรวจสอบ', target: 'AX-2609-002', ref: 'HN-180533', detail: 'เพื่อตอบ DSAR-2609-004' },
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

/*
 * The hospital's equipment: OR 1's anaesthesia machine down since last night with its PM four days late, a monitor
 * at ICU bed I-02 out of calibration, the defibrillator and the oxygen concentrator with their repair contract
 * lapsed, the CBC analyser due for calibration on Saturday, an old ECG waiting to be retired.
 */
const TECH = 'ช่างเอก (ช่างซ่อมบำรุง)';
type Row = [id: string, name: string, cls: EquipmentClass, maker: string, model: string, serial: string, location: string, bed: string, criticality: Criticality,
  bought: string, cost: number, pm: number, cal: number];
const EQUIPMENT_ROWS: Row[] = [
  ['EQ-OR1-ANES-01', 'เครื่องดมยาสลบ ห้องผ่าตัด 1', 'anaesthesia', 'Mindray', 'WATO EX-35 Vet', 'WEX35-21-0417', 'ห้องผ่าตัด 1', '', 'critical', '2021-03-15', 1_250_000, 6, 12],
  ['EQ-OR2-ANES-02', 'เครื่องดมยาสลบ ห้องผ่าตัด 2', 'anaesthesia', 'Mindray', 'WATO EX-20 Vet', 'WEX20-23-1182', 'ห้องผ่าตัด 2', '', 'critical', '2023-06-01', 890_000, 6, 12],
  ['EQ-OR1-MON-01', 'เครื่องติดตามสัญญาณชีพ ห้องผ่าตัด 1', 'monitor', 'Mindray', 'ePM 12M Vet', 'EPM12-22-3310', 'ห้องผ่าตัด 1', '', 'critical', '2022-01-10', 320_000, 6, 12],
  ['EQ-ICU-MON-02', 'เครื่องติดตามสัญญาณชีพ ICU เตียง 1', 'monitor', 'Mindray', 'uMEC 10 Vet', 'UMEC-23-5521', 'ICU', 'I-01', 'critical', '2023-02-20', 185_000, 6, 12],
  ['EQ-ICU-MON-03', 'เครื่องติดตามสัญญาณชีพ ICU เตียง 2', 'monitor', 'Mindray', 'uMEC 10 Vet', 'UMEC-23-5522', 'ICU', 'I-02', 'critical', '2023-02-20', 185_000, 6, 12],
  ['EQ-ICU-INF-01', 'เครื่องให้สารน้ำ ICU', 'infusion', 'Mindray', 'SK-600II', 'SK6-24-0081', 'ICU', 'I-01', 'high', '2024-01-15', 45_000, 12, 12],
  ['EQ-DW-INF-01', 'เครื่องให้สารน้ำ Dog ward', 'infusion', 'Mindray', 'SK-600II', 'SK6-24-0082', 'Dog ward', 'D-03', 'high', '2024-01-15', 45_000, 12, 12],
  ['EQ-ICU-O2-01', 'เครื่องผลิตออกซิเจน ICU', 'oxygen', 'DeVilbiss', '525KS', 'DV525-22-7781', 'ICU', '', 'critical', '2022-05-01', 68_000, 6, 0],
  ['EQ-ICU-DEF-01', 'เครื่องกระตุกหัวใจ', 'defibrillator', 'Mindray', 'BeneHeart D3', 'BHD3-21-0092', 'ICU', '', 'critical', '2021-08-01', 210_000, 6, 12],
  ['EQ-LAB-CBC-02', 'เครื่องตรวจเลือด CBC', 'lab', 'IDEXX', 'ProCyte One', 'PC1-22-4410', 'ห้องปฏิบัติการ', '', 'high', '2022-09-01', 420_000, 6, 12],
  ['EQ-LAB-CHEM-01', 'เครื่องตรวจเคมีในเลือด', 'lab', 'IDEXX', 'Catalyst One', 'C1-21-9902', 'ห้องปฏิบัติการ', '', 'high', '2021-11-01', 380_000, 6, 6],
  ['EQ-XR-IMG-01', 'เครื่องเอกซเรย์ดิจิทัล', 'imaging', 'Fujifilm', 'FDR D-EVO II', 'FDR-23-0551', 'ห้องเอกซเรย์', '', 'high', '2023-03-01', 1_850_000, 6, 12],
  ['EQ-OPD-IMG-02', 'เครื่องอัลตราซาวด์', 'imaging', 'Mindray', 'Vetus 8', 'VET8-24-0317', 'OPD', '', 'high', '2024-04-01', 950_000, 12, 0],
  ['EQ-CSSD-STR-01', 'หม้อนึ่งฆ่าเชื้อแรงดันไอน้ำ', 'sterilisation', 'Tuttnauer', '3870EA', 'TT3870-20-1127', 'ห้องฆ่าเชื้อ', '', 'critical', '2020-07-01', 290_000, 3, 12],
  ['EQ-DEN-DEN-01', 'เครื่องขูดหินปูนและกรอฟัน', 'dental', 'iM3', 'GS Deluxe', 'IM3-22-0663', 'ห้องทันตกรรม', '', 'standard', '2022-02-01', 160_000, 12, 0],
  ['EQ-OPD-MON-00', 'เครื่อง ECG 3 ลีด (รุ่นเดิม)', 'monitor', 'Edan', 'VE-300', 'VE300-16-0041', 'OPD', '', 'standard', '2016-05-01', 95_000, 12, 12],
  ['EQ-XR-IMG-00', 'เครื่องเอกซเรย์ฟิล์ม (รุ่นเดิม)', 'imaging', 'Toshiba', 'KXO-15', 'KXO15-12-0007', 'ห้องเอกซเรย์', '', 'high', '2012-01-01', 900_000, 6, 12],
];
const EQUIPMENT_COSTS: Record<string, [string, string, number, string][]> = {
  'EQ-OR1-ANES-01': [['2025-10-14', 'ซ่อม', 8_500, 'DT-2510-001'], ['2025-11-10', 'สอบเทียบ', 4_500, 'CAL-25-004'], ['2026-01-23', 'ซ่อม', 22_000, 'DT-2601-001'], ['2026-03-20', 'PM', 6_500, 'PM-003']],
  'EQ-XR-IMG-01': [['2026-03-12', 'ซ่อม', 15_000, 'DT-2603-002']],
  'EQ-CSSD-STR-01': [['2026-05-06', 'ซ่อม', 3_200, 'DT-2605-001']],
};
function equipment(): Equipment[] {
  return EQUIPMENT_ROWS.map(([id, name, cls, maker, model, serial, location, bed, criticality, bought, cost, pm, cal]) => ({
    id, name, cls, maker, model, serial, location, bed: bed || undefined, criticality, status: id === 'EQ-OR1-ANES-01' ? 'down' : id === 'EQ-XR-IMG-00' ? 'decommissioned' : 'in-service',
    purchasedAt: bought, purchaseCost: cost, pmMonths: pm, calibrationMonths: cal || undefined, costs: EQUIPMENT_COSTS[id] ?? [],
    history: [[`${bought} 09:00`, TECH, 'ขึ้นทะเบียน', `${serial} · ${location}${bed ? ` · ${bed}` : ''}`]],
  }));
}

/** One open PM for each device in service, and the ones done before it */
const PM_TASKS: PmTask[] = [
  { id: 'PM-001', equipmentId: 'EQ-CSSD-STR-01', due: '2026-04-10', status: 'done', doneAt: '2026-04-08', doneBy: TECH, outcome: 'pass' },
  { id: 'PM-002', equipmentId: 'EQ-OR1-MON-01', due: '2026-04-10', status: 'done', doneAt: '2026-04-05', doneBy: TECH, outcome: 'pass' },
  { id: 'PM-003', equipmentId: 'EQ-OR1-ANES-01', due: '2026-03-20', status: 'done', doneAt: '2026-03-20', doneBy: 'บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง', outcome: 'pass', cost: 6_500, findings: 'เปลี่ยน soda lime canister และ O-ring' },
  { id: 'PM-004', equipmentId: 'EQ-LAB-CHEM-01', due: '2026-03-18', status: 'done', doneAt: '2026-03-18', doneBy: 'IDEXX Laboratories (Thailand)', outcome: 'pass' },
  { id: 'PM-005', equipmentId: 'EQ-OR2-ANES-02', due: '2026-07-01', status: 'done', doneAt: '2026-07-02', doneBy: 'บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง', outcome: 'pass' },
  { id: 'PM-006', equipmentId: 'EQ-CSSD-STR-01', due: '2026-07-08', status: 'done', doneAt: '2026-07-10', doneBy: TECH, outcome: 'pass', findings: 'ล้าง chamber และเปลี่ยนซีลประตู' },
  ...([
    ['EQ-OR1-ANES-01', '2026-09-20'], ['EQ-OR2-ANES-02', '2027-01-02'], ['EQ-OR1-MON-01', '2026-10-05'], ['EQ-ICU-MON-02', '2026-12-15'], ['EQ-ICU-MON-03', '2026-12-15'],
    ['EQ-ICU-INF-01', '2027-01-20'], ['EQ-DW-INF-01', '2026-10-20'], ['EQ-ICU-O2-01', '2026-09-30'], ['EQ-ICU-DEF-01', '2027-02-01'], ['EQ-LAB-CBC-02', '2026-11-15'],
    ['EQ-LAB-CHEM-01', '2026-09-18'], ['EQ-XR-IMG-01', '2026-12-01'], ['EQ-OPD-IMG-02', '2027-04-01'], ['EQ-CSSD-STR-01', '2026-10-10'], ['EQ-DEN-DEN-01', '2027-02-01'],
    ['EQ-OPD-MON-00', '2026-11-01'],
  ] as const).map(([equipmentId, due], i): PmTask => ({ id: `PM-${String(i + 7).padStart(3, '0')}`, equipmentId, due, status: 'open' })),
];

const CALIBRATIONS: CalibrationRecord[] = [
  ['CAL-24-011', 'EQ-OR1-ANES-01', '2024-11-05', '2025-11-05', 'pass'], ['CAL-25-004', 'EQ-OR1-ANES-01', '2025-11-10', '2026-11-10', 'pass'],
  ['CAL-26-003', 'EQ-OR2-ANES-02', '2026-03-01', '2027-03-01', 'pass'], ['CAL-25-002', 'EQ-OR1-MON-01', '2025-10-12', '2026-10-12', 'pass'],
  ['CAL-26-002', 'EQ-ICU-MON-02', '2026-02-20', '2027-02-20', 'pass'], ['CAL-25-001', 'EQ-ICU-MON-03', '2025-09-10', '2026-09-10', 'pass'],
  ['CAL-26-001', 'EQ-ICU-INF-01', '2026-01-15', '2027-01-15', 'adjusted'], ['CAL-26-005', 'EQ-DW-INF-01', '2026-01-15', '2027-01-15', 'pass'],
  ['CAL-26-008', 'EQ-ICU-DEF-01', '2026-08-01', '2027-08-01', 'pass'], ['CAL-25-003', 'EQ-LAB-CBC-02', '2025-09-26', '2026-09-26', 'pass'],
  ['CAL-25-005', 'EQ-LAB-CHEM-01', '2025-10-01', '2026-04-01', 'pass'], ['CAL-26-006', 'EQ-LAB-CHEM-01', '2026-04-01', '2026-10-01', 'pass'],
  ['CAL-26-004', 'EQ-XR-IMG-01', '2026-03-01', '2027-03-01', 'pass'], ['CAL-26-007', 'EQ-CSSD-STR-01', '2026-01-20', '2027-01-20', 'pass'],
  ['CAL-25-006', 'EQ-OPD-MON-00', '2025-06-01', '2026-06-01', 'pass'],
].map(([id, equipmentId, date, nextDue, result]) => ({
  id, equipmentId, date, nextDue, result: result as CalibrationRecord['result'], by: equipmentId.includes('LAB') ? 'IDEXX Laboratories (Thailand)' : 'บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง',
  certificate: `${id}.pdf`, enteredBy: TECH,
}));

const DOWNTIME: Downtime[] = [
  { id: 'DT-2510-001', equipmentId: 'EQ-OR1-ANES-01', kind: 'failure', from: '2025-10-14 08:20', to: '2025-10-14 15:20', reportedBy: 'สพ.ญ. พิชญา', problem: 'วาล์วหายใจออกรั่ว',
    impact: 'ย้ายเคสเช้าไปห้องผ่าตัด 2', fix: 'เปลี่ยนซีลวาล์วหายใจออก ทดสอบรั่วผ่าน', closedBy: 'บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง' },
  { id: 'DT-2601-001', equipmentId: 'EQ-OR1-ANES-01', kind: 'failure', from: '2026-01-22 10:00', to: '2026-01-23 10:00', reportedBy: 'สพ.ญ. พิชญา', problem: 'vaporiser ล็อกเข้าที่ไม่ได้',
    impact: 'งดผ่าตัดห้อง 1 หนึ่งวัน', fix: 'เปลี่ยนชุดล็อก vaporiser', closedBy: 'บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง' },
  { id: 'DT-2603-002', equipmentId: 'EQ-XR-IMG-01', kind: 'failure', from: '2026-03-11 13:00', to: '2026-03-12 17:00', reportedBy: 'พ.ส. อรุณี', problem: 'แผ่นรับภาพไม่เชื่อมต่อเครื่อง',
    impact: 'ส่ง X-ray ไปโรงพยาบาลเครือข่าย 3 ราย', fix: 'เปลี่ยนแบตเตอรี่แผ่นรับภาพและจับคู่ใหม่', closedBy: 'บจก. ฟูจิฟิล์ม (ประเทศไทย)' },
  { id: 'DT-2605-001', equipmentId: 'EQ-CSSD-STR-01', kind: 'failure', from: '2026-05-06 08:00', to: '2026-05-06 14:00', reportedBy: 'พ.ส. กมล', problem: 'แรงดันไม่ถึง 2.1 bar',
    impact: 'ใช้ชุดเครื่องมือสำรอง', fix: 'เปลี่ยน safety valve', closedBy: TECH },
  { id: 'DT-2607-003', equipmentId: 'EQ-LAB-CHEM-01', kind: 'failure', from: '2026-07-18 09:00', to: '2026-07-18 11:30', reportedBy: 'พ.ส. สุดา', problem: 'centrifuge ภายในมีเสียงดัง',
    impact: 'ส่งตรวจเคมีนอกโรงพยาบาลช่วงเช้า', fix: 'ทำความสะอาดและปรับสมดุลโรเตอร์', closedBy: 'IDEXX Laboratories (Thailand)' },
  { id: 'DT-2609-003', equipmentId: 'EQ-ICU-O2-01', kind: 'failure', from: '2026-09-05 22:10', to: '2026-09-06 09:30', reportedBy: 'พ.ส. ณิชา', problem: 'เตือนความเข้มข้นออกซิเจนต่ำกว่า 85%',
    impact: 'ใช้ถังออกซิเจนสำรองใน ICU', fix: 'เปลี่ยนไส้กรองอากาศและ sieve bed', closedBy: TECH },
  { id: 'DT-2609-004', equipmentId: 'EQ-LAB-CBC-02', kind: 'planned', from: '2026-09-10 09:00', to: '2026-09-10 12:00', reportedBy: TECH, problem: 'อัปเดตซอฟต์แวร์ตามผู้ผลิต',
    impact: 'งดตรวจ CBC ช่วงเช้า', fix: 'อัปเดตเป็นเวอร์ชัน 2.4 ทดสอบ QC ผ่าน', closedBy: 'IDEXX Laboratories (Thailand)' },
  { id: 'DT-2609-005', equipmentId: 'EQ-OR1-ANES-01', kind: 'failure', from: '2026-09-23 17:40', reportedBy: 'พ.ส. ณิชา', problem: 'ไม่จ่ายแก๊ส · flow meter ไม่ขึ้น',
    impact: 'ผ่าตัดพรุ่งนี้ 2 เคสต้องย้ายไปห้องผ่าตัด 2' },
];

const CONTRACTS: ServiceContract[] = [
  ['SC-001', 'บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง', 'คุณอนุชา · 02-118-4400', 'full', '2025-11-01', '2026-10-31', 180_000, 4, ['EQ-OR1-ANES-01', 'EQ-OR2-ANES-02', 'EQ-OR1-MON-01', 'EQ-ICU-MON-02', 'EQ-ICU-MON-03']],
  ['SC-002', 'IDEXX Laboratories (Thailand)', 'Service desk · 02-670-0900', 'full', '2026-01-01', '2026-12-15', 95_000, 24, ['EQ-LAB-CBC-02', 'EQ-LAB-CHEM-01']],
  ['SC-003', 'บจก. ไบโอเมด ซัพพลาย', 'คุณวีระ · 081-552-0193', 'repair', '2024-09-01', '2026-08-31', 24_000, 8, ['EQ-ICU-DEF-01', 'EQ-ICU-O2-01']],
  ['SC-004', 'บจก. ฟูจิฟิล์ม (ประเทศไทย)', 'Medical service · 02-270-6000', 'full', '2024-03-01', '2027-02-28', 120_000, 8, ['EQ-XR-IMG-01']],
  ['SC-005', 'บจก. สเตอริเทค', 'คุณปรางค์ · 089-411-2280', 'full', '2026-01-01', '2027-06-30', 36_000, 12, ['EQ-CSSD-STR-01']],
  ['SC-006', 'บจก. เมดิแคร์ เวท เอ็นจิเนียริ่ง', 'คุณอนุชา · 02-118-4400', 'calibration', '2026-01-01', '2026-12-31', 18_000, 48, ['EQ-ICU-INF-01', 'EQ-DW-INF-01', 'EQ-OPD-MON-00']],
].map(([id, vendor, contact, kind, from, to, annualFee, responseHours, equipmentIds]) => ({
  id: id as string, vendor: vendor as string, contact: contact as string, kind: kind as ContractKind, from: from as string, to: to as string, annualFee: annualFee as number,
  responseHours: responseHours as number, equipmentIds: equipmentIds as string[], status: 'active' as const,
  history: [[`${from} 09:00`, 'วรรณา (ผู้จัดการการเงิน)', 'บันทึกสัญญา', `${from} → ${to}`]] as ServiceContract['history'],
}));

const DECOMMISSIONS: Decommission[] = [
  { id: 'DEC-2609-001', equipmentId: 'EQ-OPD-MON-00', reason: 'ใช้งานมา 10 ปี อะไหล่เลิกผลิตแล้ว และสอบเทียบเกินกำหนดตั้งแต่เดือนมิถุนายน', method: 'scrap',
    replacement: 'ใช้เครื่องติดตามสัญญาณชีพ ePM 12M แทน', status: 'requested', requestedBy: TECH, requestedAt: '2026-09-21 10:00' },
  { id: 'DEC-2605-001', equipmentId: 'EQ-XR-IMG-00', reason: 'แทนด้วยเครื่องเอกซเรย์ดิจิทัล FDR D-EVO II ตั้งแต่ปี 2023', method: 'scrap', status: 'completed', requestedBy: TECH,
    requestedAt: '2026-05-08 14:00', decidedBy: 'น.สพ. นรินทร์', decidedAt: '2026-05-12 10:00', decisionNote: 'อนุมัติ · ตรวจแล้วไม่มีการใช้งานตั้งแต่ปี 2023',
    completedBy: TECH, completedAt: '2026-05-20 15:00', evidence: 'ใบรับซากและหนังสือรับรองการทำลาย RC-6605-118 · ปลดทะเบียนเครื่องกำเนิดรังสีกับ ปส. แล้ว' },
];

/* Quality and patient safety (M12): a year of safety events, the analyses they led to, the KPIs, the culture survey and M&M */
const QPS = 'คณะกรรมการคุณภาพ';
const DIRECTOR = 'น.สพ. นรินทร์';
/** An earlier incident, triaged and closed */
const pastIncident = (id: string, when: string, category: SafetyCategory, location: string, harm: HarmLevel, description: string, outcome: string): Incident => ({
  id, at: when, reportedAt: when, reportedBy: 'หัวหน้าพยาบาล', category, location, description, immediateAction: 'แก้ไขทันทีและแจ้งสัตวแพทย์เจ้าของไข้', harm, status: 'closed',
  triagedBy: QPS, triagedAt: when, owner: 'หัวหน้าพยาบาล', closedBy: QPS, closedAt: when, outcome, history: [[when, 'หัวหน้าพยาบาล', 'รับแจ้งอุบัติการณ์', description]],
});
const INCIDENTS: Incident[] = [
  { id: 'INC-2609-005', at: '2026-09-24 08:20', reportedAt: '2026-09-24 08:50', category: 'communication', location: 'ห้องผ่าตัด 2',
    description: 'คำสั่งงดน้ำงดอาหารก่อนผ่าตัดไม่ได้ส่งต่อในการส่งเวรดึก ต้องเลื่อนผ่าตัดทำหมันออกไป 1 วัน', immediateAction: 'แจ้งเจ้าของและนัดผ่าตัดใหม่ 2026-09-25', harm: 1,
    status: 'reported', history: [['2026-09-24 08:50', ANONYMOUS, 'รับแจ้งอุบัติการณ์', 'ไม่มีอันตราย · การสื่อสาร']] },
  { id: 'INC-2609-004', at: '2026-09-23 17:40', reportedAt: '2026-09-23 17:55', reportedBy: 'พ.ส. ณิชา', category: 'equipment', location: 'ห้องผ่าตัด 1',
    description: 'เครื่องดมยาสลบไม่จ่ายแก๊สระหว่างเตรียมเครื่อง ตรวจพบก่อนนำสัตว์เข้าห้อง', immediateAction: 'แจ้งช่างและย้ายเคสไปห้องผ่าตัด 2', harm: 1, status: 'reported',
    source: 'DT-2609-005', history: [['2026-09-23 17:55', 'พ.ส. ณิชา', 'รับแจ้งอุบัติการณ์', 'ไม่มีอันตราย · อุปกรณ์']] },
  { id: 'INC-2609-003', at: '2026-09-20 15:40', reportedAt: '2026-09-20 16:00', reportedBy: 'พ.ส. ปวีณา', category: 'fall', location: 'OPD', pet: 'Milo',
    description: 'แมวกระโดดลงจากโต๊ะตรวจขณะเจ้าของอุ้มออก ขาหน้าซ้ายช้ำ', immediateAction: 'สัตวแพทย์ตรวจซ้ำและเอกซเรย์ ไม่พบกระดูกหัก', harm: 2, status: 'reported',
    history: [['2026-09-20 16:00', 'พ.ส. ปวีณา', 'รับแจ้งอุบัติการณ์', 'อันตรายเล็กน้อย · การพลัดตก']] },
  { id: 'INC-2609-002', at: '2026-09-15 13:40', reportedAt: '2026-09-15 16:10', reportedBy: 'สพ.ญ. พิชญา', category: 'anaesthesia', location: 'ห้องผ่าตัด 1', pet: 'Bolt',
    description: 'อุณหภูมิกายต่ำ 35.2°C หลังผ่าตัด 2 ชั่วโมง ฟื้นจากยาสลบช้า', immediateAction: 'ให้ความอบอุ่นและสารน้ำอุ่น ติดตามอุณหภูมิทุก 15 นาที', harm: 3,
    status: 'triaged', triagedBy: 'พ.ส. อรุณี', triagedAt: '2026-09-16 09:00', owner: 'สพ.ญ. พิชญา', rcaId: 'RCA-2609-001',
    history: [['2026-09-15 16:10', 'สพ.ญ. พิชญา', 'รับแจ้งอุบัติการณ์', 'อันตรายปานกลาง · การดมยา'], ['2026-09-16 09:00', 'พ.ส. อรุณี', 'คัดกรองเรียบร้อย', 'อันตรายปานกลาง → อันตรายปานกลาง · สพ.ญ. พิชญา'],
      ['2026-09-16 09:10', 'พ.ส. อรุณี', 'เปิด RCA แล้ว', 'RCA-2609-001']] },
  { id: 'INC-2609-001', at: '2026-09-08 07:10', reportedAt: '2026-09-08 07:40', reportedBy: 'พ.ส. กมล', category: 'medication', location: 'Cat ward', pet: 'Milo',
    description: 'ได้รับอินซูลินซ้ำ 2 ครั้งในเช้าเดียวกัน เวรดึกให้แล้วแต่ไม่ได้ลงบันทึก น้ำตาลลดลงเหลือ 48 mg/dL', immediateAction: 'ให้ dextrose ทางหลอดเลือด ตรวจน้ำตาลทุก 1 ชม. แจ้งเจ้าของ',
    harm: 4, status: 'triaged', triagedBy: DIRECTOR, triagedAt: '2026-09-08 10:00', owner: 'พ.ส. อรุณี', rcaId: 'RCA-2609-002',
    history: [['2026-09-08 07:40', 'พ.ส. กมล', 'รับแจ้งอุบัติการณ์', 'อันตรายรุนแรง · ยา'], ['2026-09-08 10:00', DIRECTOR, 'คัดกรองเรียบร้อย', 'อันตรายรุนแรง → อันตรายรุนแรง · พ.ส. อรุณี'],
      ['2026-09-08 11:00', DIRECTOR, 'เปิด RCA แล้ว', 'RCA-2609-002']] },
  pastIncident('INC-2608-003', '2026-08-19 10:00', 'infection', 'ห้องผ่าตัด 2', 3, 'แผลผ่าตัดทำหมันติดเชื้อภายใน 7 วัน', 'รักษาด้วยยาปฏิชีวนะ แผลหายดี ทบทวนขั้นตอนเตรียมผิวหนัง'),
  pastIncident('INC-2608-002', '2026-08-07 18:00', 'medication', 'Cat ward', 2, 'ให้ยาลดปวดซ้ำเพราะไม่ได้ลงบันทึก', 'ติดตามอาการ ไม่มีผลข้างเคียง'),
  pastIncident('INC-2608-001', '2026-08-03 10:00', 'communication', 'OPD', 1, 'นัดผ่าตัดซ้อนกันสองเคส', 'ปรับตารางนัด และเพิ่มการตรวจห้องว่างก่อนยืนยันนัด'),
  { ...pastIncident('INC-2607-001', '2026-07-14 09:30', 'identification', 'ICU', 4, 'เจาะเลือดผิดตัวระหว่างแมวสองตัวในกรงติดกัน ให้เลือดล่าช้า 3 ชม.', 'RCA-2607-001 อนุมัติแล้ว · ติดฉลากข้างกรงทันทีหลังเจาะ'),
    rcaId: 'RCA-2607-001', triagedBy: DIRECTOR },
  pastIncident('INC-2606-001', '2026-06-18 22:00', 'medication', 'ICU', 3, 'ให้ potassium เร็วเกินอัตราที่สั่ง', 'หยุดให้และตรวจค่าเกลือแร่ ตั้งค่าเครื่องให้สารน้ำใหม่'),
  pastIncident('INC-2605-001', '2026-05-06 09:00', 'infection', 'ห้องผ่าตัด 2', 2, 'ชุดเครื่องมือผ่านการนึ่งไม่ครบรอบ', 'นึ่งซ้ำและตรวจตัวชี้วัดทุกชุด'),
  pastIncident('INC-2604-001', '2026-04-05 08:00', 'fall', 'Dog ward', 2, 'สุนัขลื่นล้มขณะพาเดิน', 'ปูแผ่นกันลื่นทางเดินวอร์ด'),
  pastIncident('INC-2603-001', '2026-03-11 14:00', 'identification', 'ห้องเอกซเรย์', 1, 'ส่งภาพเอกซเรย์ผิดรายชื่อไปโรงพยาบาลเครือข่าย', 'เรียกคืนภาพและแจ้งโรงพยาบาลเครือข่าย'),
  pastIncident('INC-2602-001', '2026-02-17 11:00', 'surgery', 'ห้องผ่าตัด 1', 3, 'แผลผ่าตัดแยกหลังทำหมัน', 'เย็บแผลใหม่ และนัดตรวจแผลวันที่ 3'),
  pastIncident('INC-2601-002', '2026-01-28 16:00', 'communication', 'OPD', 2, 'แจ้งผลแล็บผิดเจ้าของ', 'โทรแจ้งเจ้าของทั้งสองราย ทวนชื่อก่อนแจ้งผลทุกครั้ง'),
  pastIncident('INC-2601-001', '2026-01-22 10:00', 'equipment', 'ห้องผ่าตัด 1', 1, 'vaporiser ล็อกไม่ได้ ต้องงดผ่าตัด', 'DT-2601-001 · เปลี่ยนชุดล็อก vaporiser'),
  pastIncident('INC-2512-001', '2025-12-09 13:00', 'equipment', 'ห้องผ่าตัด 2', 1, 'จอ monitor ดับระหว่างผ่าตัด 2 นาที', 'เปลี่ยนสายไฟและตรวจเครื่องสำรอง'),
  pastIncident('INC-2511-002', '2025-11-22 09:00', 'infection', 'ICU', 3, 'ติดเชื้อที่ตำแหน่งสายน้ำเกลือ', 'ถอดสายและรักษา ทบทวนการเปลี่ยนสายทุก 72 ชม.'),
  pastIncident('INC-2511-001', '2025-11-03 15:00', 'medication', 'Dog ward', 2, 'ให้ยาปฏิชีวนะช้ากว่ากำหนด 4 ชม.', 'ปรับเวลาในตารางให้ยา'),
  pastIncident('INC-2510-001', '2025-10-14 10:00', 'fall', 'OPD', 2, 'แมวกระโดดจากโต๊ะตรวจ', 'ใช้ผ้าห่อตัวแมวทุกครั้งระหว่างตรวจ'),
];

/** An earlier near miss, its prevention in place */
const pastNearMiss = (id: string, when: string, category: SafetyCategory, location: string, caughtAt: CatchPoint, caughtBy: string, description: string): NearMiss => ({
  id, at: when, reportedBy: caughtBy, category, location, description, caughtAt, caughtBy, prevention: 'ทบทวนขั้นตอนในที่ประชุมหน่วยงาน', status: 'actioned',
  history: [[when, caughtBy, 'รับแจ้งเหตุเกือบพลาด', description]],
});
const NEAR_MISSES: NearMiss[] = [
  { id: 'NM-2609-004', at: '2026-09-24 07:40', category: 'medication', location: 'ICU', caughtAt: 'handover', caughtBy: 'พ.ส. วิภา', status: 'open',
    description: 'อัตราให้สารน้ำตั้งเป็น mL/ชม. แทน mL/กก./ชม. พยาบาลเวรเช้าตรวจทานพบก่อนเปิดเครื่อง',
    history: [['2026-09-24 07:55', ANONYMOUS, 'รับแจ้งเหตุเกือบพลาด', 'การส่งเวร · พ.ส. วิภา']] },
  { id: 'NM-2609-003', at: '2026-09-23 10:15', reportedBy: 'ภก. ธนพร', category: 'medication', location: 'ห้องยา', caughtAt: 'dispensing', caughtBy: 'ภก. ธนพร', status: 'open',
    description: 'หยิบ Metronidazole แทน Meloxicam ให้ Mochi เพราะฉลากชั้นวางคล้ายกัน ตรวจพบตอนตรวจสอบขั้นสุดท้าย',
    history: [['2026-09-23 10:20', 'ภก. ธนพร', 'รับแจ้งเหตุเกือบพลาด', 'ขั้นจ่ายยา · ภก. ธนพร']] },
  { id: 'NM-2609-002', at: '2026-09-17 11:00', reportedBy: 'สพ.ญ. ลลิตา', category: 'medication', location: 'OPD', caughtAt: 'prescribing', caughtBy: 'ระบบตรวจสอบยา (CDS)',
    description: 'สั่ง Meloxicam ร่วมกับ Prednisolone ระบบเตือนยาตีกันก่อนบันทึก', prevention: 'ตั้งคำเตือน NSAID ร่วมกับ steroid ให้ต้องระบุเหตุผลก่อนสั่ง', status: 'actioned',
    history: [['2026-09-17 11:05', 'สพ.ญ. ลลิตา', 'รับแจ้งเหตุเกือบพลาด', 'ขั้นสั่งยา · ระบบตรวจสอบยา (CDS)'], ['2026-09-18 09:00', 'ภก. ธนพร', 'บันทึกมาตรการป้องกันแล้ว', 'ตั้งคำเตือน NSAID ร่วมกับ steroid ให้ต้องระบุเหตุผลก่อนสั่ง']] },
  { id: 'NM-2609-001', at: '2026-09-05 09:30', reportedBy: 'พ.ส. สุดา', category: 'identification', location: 'ห้องปฏิบัติการ', caughtAt: 'specimen', caughtBy: 'พ.ส. สุดา',
    description: 'หลอดเลือดติดฉลากสลับกันระหว่างสัตว์สองตัวในคิวเดียวกัน ห้องแล็บพบตอนลงทะเบียนตัวอย่าง', prevention: 'ติดฉลากข้างกรงทันทีหลังเจาะ และสแกนบาร์โค้ดก่อนส่ง', status: 'actioned',
    history: [['2026-09-05 09:40', 'พ.ส. สุดา', 'รับแจ้งเหตุเกือบพลาด', 'การเก็บสิ่งส่งตรวจ · พ.ส. สุดา'], ['2026-09-06 10:00', 'พ.ส. อรุณี', 'บันทึกมาตรการป้องกันแล้ว', 'ติดฉลากข้างกรงทันทีหลังเจาะ และสแกนบาร์โค้ดก่อนส่ง']] },
  ...([
    ['NM-2608-002', '2026-08-26 14:00', 'medication', 'ห้องยา', 'dispensing', 'ภก. ธนพร', 'หยิบยาผิดความแรง ตรวจพบก่อนส่งมอบ'],
    ['NM-2608-001', '2026-08-12 09:00', 'identification', 'OPD', 'procedure', 'สพ.ญ. ลลิตา', 'ป้ายข้อมือสัตว์ไม่ตรงกับใบนัด ตรวจพบก่อนฉีดวัคซีน'],
    ['NM-2607-001', '2026-07-09 16:00', 'medication', 'Dog ward', 'administration', 'พ.ส. กมล', 'ขนาดยาในใบสั่งเป็นมิลลิกรัม แต่เตรียมเป็นมิลลิลิตร ตรวจพบก่อนให้ยา'],
    ['NM-2606-002', '2026-06-24 11:00', 'surgery', 'ห้องผ่าตัด 1', 'procedure', 'สพ.ญ. พิชญา', 'ยังไม่ได้ลงนามยินยอมผ่าตัด ตรวจพบตอน time-out'],
    ['NM-2606-001', '2026-06-03 08:30', 'medication', 'ห้องยา', 'dispensing', 'ภก. ธนพร', 'หยิบยาผิดความแรง ตรวจพบก่อนส่งมอบ'],
    ['NM-2605-002', '2026-05-21 15:00', 'medication', 'OPD', 'prescribing', 'ระบบตรวจสอบยา (CDS)', 'สั่งยาที่สัตว์แพ้ ระบบเตือนก่อนบันทึก'],
    ['NM-2605-001', '2026-05-08 10:00', 'identification', 'ห้องปฏิบัติการ', 'specimen', 'พ.ส. สุดา', 'ป้ายข้อมือสัตว์ไม่ตรงกับใบนัด ตรวจพบก่อนฉีดวัคซีน'],
    ['NM-2604-003', '2026-04-27 13:00', 'medication', 'Cat ward', 'administration', 'พ.ส. ปวีณา', 'ขนาดยาในใบสั่งเป็นมิลลิกรัม แต่เตรียมเป็นมิลลิลิตร ตรวจพบก่อนให้ยา'],
    ['NM-2604-002', '2026-04-14 09:00', 'surgery', 'ห้องผ่าตัด 2', 'procedure', 'สพ.ญ. พิชญา', 'ยังไม่ได้ลงนามยินยอมผ่าตัด ตรวจพบตอน time-out'],
    ['NM-2604-001', '2026-04-02 17:00', 'medication', 'ห้องยา', 'dispensing', 'ภก. ธนพร', 'หยิบยาผิดความแรง ตรวจพบก่อนส่งมอบ'],
    ['NM-2603-002', '2026-03-23 10:00', 'medication', 'OPD', 'prescribing', 'ระบบตรวจสอบยา (CDS)', 'สั่งยาที่สัตว์แพ้ ระบบเตือนก่อนบันทึก'],
    ['NM-2603-001', '2026-03-04 14:00', 'identification', 'OPD', 'procedure', 'พ.ส. ณิชา', 'ป้ายข้อมือสัตว์ไม่ตรงกับใบนัด ตรวจพบก่อนฉีดวัคซีน'],
    ['NM-2602-002', '2026-02-20 09:00', 'medication', 'Dog ward', 'administration', 'พ.ส. กมล', 'ขนาดยาในใบสั่งเป็นมิลลิกรัม แต่เตรียมเป็นมิลลิลิตร ตรวจพบก่อนให้ยา'],
    ['NM-2602-001', '2026-02-06 11:00', 'medication', 'ห้องยา', 'dispensing', 'ภก. ธนพร', 'หยิบยาผิดความแรง ตรวจพบก่อนส่งมอบ'],
    ['NM-2601-003', '2026-01-29 15:00', 'surgery', 'ห้องผ่าตัด 1', 'procedure', 'สพ.ญ. พิชญา', 'ยังไม่ได้ลงนามยินยอมผ่าตัด ตรวจพบตอน time-out'],
    ['NM-2601-002', '2026-01-15 10:00', 'medication', 'OPD', 'prescribing', 'ระบบตรวจสอบยา (CDS)', 'สั่งยาที่สัตว์แพ้ ระบบเตือนก่อนบันทึก'],
    ['NM-2601-001', '2026-01-07 08:00', 'medication', 'ห้องยา', 'dispensing', 'ภก. ธนพร', 'หยิบยาผิดความแรง ตรวจพบก่อนส่งมอบ'],
    ['NM-2512-001', '2025-12-16 13:00', 'identification', 'ห้องปฏิบัติการ', 'specimen', 'พ.ส. สุดา', 'ป้ายข้อมือสัตว์ไม่ตรงกับใบนัด ตรวจพบก่อนฉีดวัคซีน'],
    ['NM-2511-002', '2025-11-25 16:00', 'medication', 'Cat ward', 'administration', 'พ.ส. ปวีณา', 'ขนาดยาในใบสั่งเป็นมิลลิกรัม แต่เตรียมเป็นมิลลิลิตร ตรวจพบก่อนให้ยา'],
    ['NM-2511-001', '2025-11-10 10:00', 'medication', 'ห้องยา', 'dispensing', 'ภก. ธนพร', 'หยิบยาผิดความแรง ตรวจพบก่อนส่งมอบ'],
    ['NM-2510-002', '2025-10-28 09:00', 'surgery', 'ห้องผ่าตัด 2', 'procedure', 'สพ.ญ. พิชญา', 'ยังไม่ได้ลงนามยินยอมผ่าตัด ตรวจพบตอน time-out'],
    ['NM-2510-001', '2025-10-06 14:00', 'medication', 'OPD', 'prescribing', 'ระบบตรวจสอบยา (CDS)', 'สั่งยาที่สัตว์แพ้ ระบบเตือนก่อนบันทึก'],
  ] as [string, string, SafetyCategory, string, CatchPoint, string, string][]).map(r => pastNearMiss(...r)),
];

const RCAS: Rca[] = [
  { id: 'RCA-2609-002', source: 'INC-2609-001', title: 'ให้อินซูลินซ้ำ · Milo', team: ['พ.ส. อรุณี', 'สพ.ญ. ลลิตา', 'ภก. ธนพร'], openedBy: DIRECTOR, openedAt: '2026-09-08 11:00',
    whys: [
      'Milo ได้อินซูลินสองครั้ง เพราะพยาบาลเวรเช้าไม่เห็นว่าเวรดึกให้ไปแล้ว',
      'เวรดึกให้ยาแล้วแต่ยังไม่ได้ลงใน treatment sheet ก่อนส่งเวร',
      'การลงบันทึกทำรวมตอนท้ายเวร ไม่ได้ทำทันทีหลังให้ยา',
      'treatment sheet อยู่ที่เคาน์เตอร์พยาบาล ไม่อยู่ข้างกรง ต้องเดินกลับมาลงทีหลัง',
      'ไม่มีขั้นตอนบังคับให้บันทึกยาความเสี่ยงสูงที่ข้างกรง',
    ],
    rootCause: 'ไม่มีการบันทึกการให้ยาความเสี่ยงสูง ณ จุดให้ยา และการส่งเวรไม่ได้ทวนยาความเสี่ยงสูงทีละรายการ',
    actions: [
      { text: 'บันทึกอินซูลินและยาความเสี่ยงสูงใน treatment sheet ที่ข้างกรงทันทีหลังให้', owner: 'พ.ส. อรุณี', due: '2026-10-15' },
      { text: 'เพิ่มการทวนยาความเสี่ยงสูงทีละรายการในแบบฟอร์มส่งเวร', owner: 'พ.ส. อรุณี', due: '2026-10-01' },
      { text: 'อบรมพยาบาลทุกเวรเรื่องยาความเสี่ยงสูง', owner: 'ภก. ธนพร', due: '2026-10-31' },
    ],
    status: 'review', submittedBy: 'พ.ส. อรุณี', submittedAt: '2026-09-22 15:00',
    history: [['2026-09-08 11:00', DIRECTOR, 'เปิด RCA แล้ว', 'INC-2609-001 · พ.ส. อรุณี, สพ.ญ. ลลิตา, ภก. ธนพร'], ['2026-09-22 15:00', 'พ.ส. อรุณี', 'ส่งอนุมัติแล้ว', '5 ทำไม · 3 มาตรการ']] },
  { id: 'RCA-2609-001', source: 'INC-2609-002', title: 'อุณหภูมิกายต่ำหลังผ่าตัด · Bolt', team: ['สพ.ญ. พิชญา', 'พ.ส. กมล'], openedBy: 'พ.ส. อรุณี', openedAt: '2026-09-16 09:10',
    whys: [
      'Bolt อุณหภูมิ 35.2°C เมื่อออกจากห้องผ่าตัด เพราะสูญเสียความร้อนระหว่างผ่าตัด 2 ชั่วโมง',
      'ไม่ได้ใช้ผ้าห่มลมร้อนตลอดการผ่าตัด เพราะเครื่องถูกยืมไปใช้ที่ ICU',
      'โรงพยาบาลมีผ้าห่มลมร้อนเพียงเครื่องเดียวสำหรับสองห้องผ่าตัดและ ICU',
    ],
    rootCause: '', actions: [], status: 'open', history: [['2026-09-16 09:10', 'พ.ส. อรุณี', 'เปิด RCA แล้ว', 'INC-2609-002 · สพ.ญ. พิชญา, พ.ส. กมล']] },
  { id: 'RCA-2607-001', source: 'INC-2607-001', title: 'เจาะเลือดผิดตัว · ICU', team: ['สพ.ญ. ลลิตา', 'พ.ส. สุดา'], openedBy: DIRECTOR, openedAt: '2026-07-14 13:00',
    whys: [
      'เลือดที่ส่งจองเป็นของแมวอีกตัว เพราะหลอดเลือดติดฉลากผิด',
      'ติดฉลากที่เคาน์เตอร์หลังเจาะครบทั้งสองตัว ไม่ได้ติดข้างกรง',
      'เจาะเลือดสองตัวต่อกันเพื่อประหยัดเวลาในเวรที่คนน้อย',
      'ไม่มีกฎให้เจาะและติดฉลากทีละตัว',
      'ไม่มีการทวนชื่อกับป้ายกรงก่อนส่งเลือด',
    ],
    rootCause: 'การติดฉลากสิ่งส่งตรวจไม่ได้ทำ ณ จุดเก็บ และไม่มีการทวนตัวตนก่อนส่ง',
    actions: [
      { text: 'ติดฉลากข้างกรงทันทีหลังเจาะเลือด', owner: 'พ.ส. สุดา', due: '2026-08-15', doneAt: '2026-08-14' },
      { text: 'ใช้บาร์โค้ดผู้ป่วยกับหลอดเลือดทุกหลอด', owner: 'พ.ส. อรุณี', due: '2026-09-15' },
    ],
    status: 'approved', submittedBy: 'สพ.ญ. ลลิตา', submittedAt: '2026-08-05 10:00', approvedBy: DIRECTOR, approvedAt: '2026-08-10 09:00', note: 'มาตรการครอบคลุม ติดตามบาร์โค้ดให้ทันกำหนด',
    history: [['2026-07-14 13:00', DIRECTOR, 'เปิด RCA แล้ว', 'INC-2607-001'], ['2026-08-05 10:00', 'สพ.ญ. ลลิตา', 'ส่งอนุมัติแล้ว', '5 ทำไม · 2 มาตรการ'],
      ['2026-08-10 09:00', DIRECTOR, 'อนุมัติ RCA แล้ว', 'มาตรการครอบคลุม ติดตามบาร์โค้ดให้ทันกำหนด'], ['2026-08-14 16:00', 'พ.ส. สุดา', 'มาตรการเสร็จ', 'ติดฉลากข้างกรงทันทีหลังเจาะเลือด']] },
];

const MONTHS_12 = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const kpi = (id: string, name: string, domain: KpiDefinition['domain'], formula: string, source: string, unit: string, better: KpiDefinition['better'], target: number, owner: string,
  values: number[], benchmark?: [string, number]): KpiDefinition => ({
  id, name, domain, formula, source, unit, better, target, owner, benchmark, snapshots: values.map((v, i) => [MONTHS_12[i], v]),
  history: [['2026-01-05 09:00', QPS, 'กำหนดตัวชี้วัด', `เป้าหมาย ${target}`]],
});
const KPIS: KpiDefinition[] = [
  kpi('K01', 'อุบัติการณ์ต่อ 1,000 visit', 'clinical', 'อุบัติการณ์ ÷ visit × 1,000', 'M12 · visit จากงานตรวจรักษา', 'ต่อ 1,000 visit', 'lower', 3, QPS,
    [2.4, 2.1, 2.8, 1.9, 2.2, 2.6, 2.0, 2.3, 2.5, 3.1, 2.7, 3.4], ['TAHSA (ตัวอย่าง)', 4]),
  kpi('K02', 'การติดเชื้อแผลผ่าตัด', 'clinical', 'การผ่าตัดสะอาดที่ติดเชื้อภายใน 30 วัน ÷ การผ่าตัดสะอาด', 'M12 · บันทึกผ่าตัด', '%', 'lower', 2, 'สพ.ญ. พิชญา',
    [1.2, 1.8, 0.9, 1.5, 1.1, 2.4, 1.0, 1.3, 0.8, 1.6, 2.2, 1.4], ['AAHA (ตัวอย่าง)', 3]),
  kpi('K03', 'การเสียชีวิตเกี่ยวกับการดมยา', 'clinical', 'เสียชีวิตภายใน 48 ชม. หลังดมยา ÷ ครั้งที่ดมยา × 1,000', 'M12 · M&M', 'ต่อ 1,000 ครั้ง', 'lower', 1.5, 'สพ.ญ. พิชญา',
    [0, 0, 2.1, 0, 0, 0, 1.9, 0, 0, 0, 0, 2.0], ['AAHA (ตัวอย่าง)', 1.8]),
  kpi('K04', 'near miss ต่ออุบัติการณ์', 'clinical', 'near miss ÷ อุบัติการณ์ ในเดือน', 'M12 · คำนวณจากรายงานตอนนี้', 'เท่า', 'higher', 2, QPS,
    [2.0, 1.0, 1.0, 1.5, 2.0, 2.0, 3.0, 2.0, 2.0, 1.0, 0.7, 0.8]),
  kpi('K05', 'PM ตามกำหนด', 'operational', 'อุปกรณ์ที่ PM ไม่เกินกำหนด ÷ อุปกรณ์ที่มีแผน PM', 'M22 · คำนวณจากแผน PM ตอนนี้', '%', 'higher', 95, 'ช่างซ่อมบำรุง',
    [100, 100, 94, 100, 100, 94, 100, 100, 94, 100, 94, 88], ['TAHSA-11 (ตัวอย่าง)', 95]),
  kpi('K06', 'สอบเทียบไม่เกินกำหนด', 'operational', 'อุปกรณ์ที่สอบเทียบไม่เกินกำหนด ÷ อุปกรณ์ที่ต้องสอบเทียบ', 'M22 · คำนวณจากบันทึกสอบเทียบตอนนี้', '%', 'higher', 100, 'ช่างซ่อมบำรุง',
    [100, 100, 100, 92, 92, 100, 92, 85, 85, 92, 92, 85], ['TAHSA-11 (ตัวอย่าง)', 100]),
  kpi('K07', 'ตอบข้อร้องเรียนทันกำหนด', 'operational', 'คำตอบที่ส่งภายใน SLA ตามความรุนแรง ÷ คำตอบที่ส่ง', 'M28 · คำนวณจากข้อร้องเรียนตอนนี้', '%', 'higher', 90, 'ผู้จัดการ OPD',
    [88, 92, 85, 90, 95, 80, 90, 86, 92, 89, 83, 80], ['TAHSA-13 (ตัวอย่าง)', 90]),
  kpi('K08', 'เวลารอ OPD เฉลี่ย', 'operational', 'นาทีจากลงทะเบียนถึงพบสัตวแพทย์', 'คิว OPD', 'นาที', 'lower', 30, 'ผู้จัดการ OPD', [28, 31, 27, 35, 33, 29, 30, 34, 38, 36, 41, 39]),
  kpi('K09', 'ลูกหนี้ค้างเกิน 30 วัน', 'financial', 'ยอดค้างชำระเกิน 30 วัน ÷ ยอดค้างชำระทั้งหมด', 'M11', '%', 'lower', 10, 'ผู้จัดการการเงิน', [8, 9, 7, 11, 10, 9, 8, 12, 10, 9, 11, 13]),
  kpi('K10', 'คืนเงินต่อรายได้', 'financial', 'ยอดคืนเงิน ÷ รายได้รับชำระ', 'M11', '%', 'lower', 1, 'ผู้จัดการการเงิน', [0.6, 0.4, 0.8, 0.5, 0.7, 0.9, 0.5, 0.6, 1.1, 0.7, 0.6, 0.8]),
];

const DIMENSIONS = ['การทำงานเป็นทีม', 'การสื่อสารอย่างเปิดเผย', 'การไม่ลงโทษเมื่อเกิดความผิดพลาด', 'ความถี่ในการรายงานเหตุการณ์', 'การสนับสนุนจากผู้บริหาร', 'การส่งต่องานระหว่างเวร', 'อัตรากำลัง'];
const SURVEYS: SafetySurvey[] = [
  { id: 'SC-2026', round: '2026', from: '2026-09-01', to: '2026-09-30', invited: 36, responded: 22, status: 'open',
    dimensions: DIMENSIONS.map((d, i) => [d, [82, 66, 57, 63, 72, 49, 41][i]]) },
  { id: 'SC-2025', round: '2025', from: '2025-09-01', to: '2025-09-30', invited: 34, responded: 27, status: 'closed', closedBy: QPS,
    dimensions: DIMENSIONS.map((d, i) => [d, [78, 61, 48, 55, 70, 52, 44][i]]) },
];

const MM_REVIEWS: MmReview[] = [
  { id: 'MM-2609-02', pet: 'Toffee', outcome: 'death', eventDate: '2026-09-12', summary: 'สุนัข 12 ปี เสียชีวิต 6 ชั่วโมงหลังผ่าตัดม้ามจากเลือดออกในช่องท้อง', presenter: 'สพ.ญ. พิชญา',
    reviewDate: '2026-09-30', status: 'scheduled' },
  { id: 'MM-2609-01', pet: 'Bolt', outcome: 'complication', eventDate: '2026-09-15', summary: 'อุณหภูมิกายต่ำหลังผ่าตัด ฟื้นจากยาสลบช้า', presenter: 'พ.ส. กมล', reviewDate: '2026-09-24',
    status: 'scheduled', incidentId: 'INC-2609-002' },
  { id: 'MM-2608-01', pet: 'Ginger', outcome: 'readmission', eventDate: '2026-08-11', summary: 'แมว 9 ปี กลับมารักษาซ้ำใน 48 ชม. หลังถอนฟันจากเลือดออกที่แผล', presenter: DIRECTOR,
    reviewDate: '2026-08-27', status: 'reviewed', learning: 'ตรวจการแข็งตัวของเลือดก่อนถอนฟันหลายซี่ในแมวสูงอายุ และนัดตรวจแผลภายใน 24 ชม.', attendees: 11 },
  { id: 'MM-2607-01', pet: 'Lucky', outcome: 'complication', eventDate: '2026-07-18', summary: 'ความดันต่ำระหว่างดมยาในสุนัขโรคหัวใจ', presenter: 'สพ.ญ. พิชญา', reviewDate: '2026-07-30',
    status: 'reviewed', learning: 'ประเมินหัวใจก่อนดมยาทุกรายที่มีเสียงหัวใจผิดปกติ และเตรียมยาเพิ่มความดันไว้ก่อน', attendees: 9 },
];

/* Complaints (M28): this month's open cases and half a year of settled ones */
const pastComplaint = (id: string, receivedAt: string, channel: ComplaintChannel, ownerKey: string, category: ComplaintCategory, topic: string, severity: ComplaintSeverity,
  subject: string, sentAt: string, resolvedAt: string, remedy: Remedy, score: number): Complaint => ({
  id, receivedAt, channel, ownerKey, category, topic, severity, subject, description: subject, handler: category === 'financial' ? 'การเงิน' : 'ผู้จัดการ OPD', status: 'resolved',
  triagedBy: 'ผู้จัดการ OPD', triagedAt: receivedAt, communications: [[receivedAt, ownerKey, 'in', channel, subject], [sentAt, 'ผู้จัดการ OPD', 'out', channel, 'ชี้แจงสาเหตุและขออภัย']],
  findings: severity === 'low' ? undefined : 'ตรวจสอบกับผู้เกี่ยวข้องแล้ว', links: [],
  response: { text: 'ชี้แจงสาเหตุและขออภัย', draftedBy: 'ผู้จัดการ OPD', draftedAt: sentAt, sentAt, sentBy: 'ผู้จัดการ OPD' },
  resolution: { outcome: 'ชี้แจงสาเหตุและแก้ไขแล้ว', remedy, by: 'ผู้จัดการ OPD', at: resolvedAt }, satisfaction: { score, at: resolvedAt },
  history: [[receivedAt, 'แผนกต้อนรับ', 'รับข้อร้องเรียน', subject]],
});
const OPD_MANAGER = 'ผู้จัดการ OPD';
const COMPLAINTS: Complaint[] = [
  { id: 'CMP-2609-013', receivedAt: '2026-09-24 10:05', channel: 'email', ownerKey: 'Somsak W.', pet: 'Luna', category: 'operational', topic: 'การนัดหมาย', status: 'new',
    subject: 'นัดหมายถูกเลื่อนโดยไม่ได้แจ้ง', description: 'มาตามนัด 09:00 แต่ไม่มีชื่อในคิว เจ้าหน้าที่บอกว่านัดถูกเลื่อนแล้วโดยไม่มีใครโทรแจ้ง', links: [],
    communications: [['2026-09-24 10:05', 'Somsak W.', 'in', 'email', 'มาตามนัด 09:00 แต่ไม่มีชื่อในคิว เจ้าหน้าที่บอกว่านัดถูกเลื่อนแล้วโดยไม่มีใครโทรแจ้ง']],
    history: [['2026-09-24 10:05', 'แผนกต้อนรับ', 'รับเรื่องร้องเรียน', 'อีเมล · นัดหมายถูกเลื่อนโดยไม่ได้แจ้ง']] },
  { id: 'CMP-2609-012', receivedAt: '2026-09-23 15:00', channel: 'in-person', ownerKey: 'Arisa K.', pet: 'Coco', category: 'financial', topic: 'ค่าบริการ', severity: 'moderate',
    subject: 'ใบเสร็จไม่ตรงกับประมาณการ', description: 'เรียกเก็บค่า X-ray เกินประมาณการ ฿400 โดยไม่ได้แจ้งก่อนทำ', handler: 'การเงิน', status: 'triaged', triagedBy: OPD_MANAGER,
    triagedAt: '2026-09-23 16:00', links: [], communications: [['2026-09-23 15:00', 'Arisa K.', 'in', 'in-person', 'เรียกเก็บค่า X-ray เกินประมาณการ ฿400 โดยไม่ได้แจ้งก่อนทำ']],
    history: [['2026-09-23 15:00', 'แผนกต้อนรับ', 'รับเรื่องร้องเรียน', 'ที่โรงพยาบาล · ใบเสร็จไม่ตรงกับประมาณการ'], ['2026-09-23 16:00', OPD_MANAGER, 'คัดกรองเรียบร้อย', 'ปานกลาง · การเงิน']] },
  { id: 'CMP-2609-011', receivedAt: '2026-09-22 15:00', channel: 'line', ownerKey: 'Sirinya M.', pet: 'Khao Niao', category: 'operational', topic: 'เวลารอ', severity: 'moderate',
    subject: 'รอนานเกิน 2 ชั่วโมงที่ OPD', description: 'นัด 13:00 ได้พบหมอ 15:10 ไม่มีใครแจ้งเวลารอ ทั้งที่เคยขอไว้แล้ว', handler: OPD_MANAGER, status: 'investigating', triagedBy: OPD_MANAGER,
    triagedAt: '2026-09-22 16:10', findings: 'สัตวแพทย์ OPD ถูกเรียกไปผ่าตัดฉุกเฉิน 1 ชม. คิวไม่ได้ปรับ และไม่ได้แจ้งเวลารอทุก 15 นาทีตามที่บันทึกในทะเบียนเจ้าของ', links: [],
    communications: [['2026-09-22 15:00', 'Sirinya M.', 'in', 'line', 'นัด 13:00 ได้พบหมอ 15:10 ไม่มีใครแจ้งเวลารอ ทั้งที่เคยขอไว้แล้ว'],
      ['2026-09-22 16:20', OPD_MANAGER, 'out', 'line', 'รับเรื่องแล้ว จะตรวจสอบและแจ้งกลับภายใน 3 วัน']],
    history: [['2026-09-22 15:00', 'แผนกต้อนรับ', 'รับเรื่องร้องเรียน', 'LINE · รอนานเกิน 2 ชั่วโมงที่ OPD'], ['2026-09-22 16:10', OPD_MANAGER, 'คัดกรองเรียบร้อย', 'ปานกลาง · ผู้จัดการ OPD'],
      ['2026-09-23 11:00', OPD_MANAGER, 'บันทึกผลสอบสวนแล้ว', 'สัตวแพทย์ OPD ถูกเรียกไปผ่าตัดฉุกเฉิน 1 ชม. คิวไม่ได้ปรับ และไม่ได้แจ้งเวลารอทุก 15 นาทีตามที่บันทึกในทะเบียนเจ้าของ']] },
  { id: 'CMP-2609-010', receivedAt: '2026-09-23 16:32', channel: 'phone', ownerKey: 'Napat T.', pet: 'Mochi', category: 'clinical', topic: 'ยา', severity: 'severe',
    subject: 'ได้รับยาผิดตัวในครั้งก่อน', description: 'ได้ยาแก้อักเสบที่ไม่ใช่ตัวที่หมอสั่ง ขอคำอธิบายและไม่อยากให้เกิดกับสัตว์ตัวอื่น', handler: OPD_MANAGER, status: 'investigating',
    triagedBy: OPD_MANAGER, triagedAt: '2026-09-23 17:10', links: ['NM-2609-003'],
    findings: 'ห้องยาหยิบ Metronidazole แทน Meloxicam เพราะฉลากชั้นวางคล้ายกัน ภก. ธนพรเปลี่ยนก่อนส่งมอบ แต่ฉลากซองยาเดิมยังติดอยู่ในถุง',
    response: { text: 'ขออภัยในความสับสน ยาที่ Mochi ได้รับคือ Meloxicam ตามที่สั่ง ฉลากที่ผิดเป็นซองที่เปลี่ยนออกแล้ว เราแยกชั้นวางยาและเพิ่มการตรวจสองคนแล้ว', draftedBy: OPD_MANAGER,
      draftedAt: '2026-09-24 09:30' },
    communications: [['2026-09-23 16:32', 'Napat T.', 'in', 'phone', 'ได้ยาแก้อักเสบที่ไม่ใช่ตัวที่หมอสั่ง ขอคำอธิบายและไม่อยากให้เกิดกับสัตว์ตัวอื่น']],
    history: [['2026-09-23 16:32', 'แผนกต้อนรับ', 'รับเรื่องร้องเรียน', 'โทรศัพท์ · ได้รับยาผิดตัวในครั้งก่อน'], ['2026-09-23 17:10', OPD_MANAGER, 'คัดกรองเรียบร้อย', 'รุนแรง · ผู้จัดการ OPD'],
      ['2026-09-24 09:00', OPD_MANAGER, 'บันทึกผลสอบสวนแล้ว', 'NM-2609-003'], ['2026-09-24 09:30', OPD_MANAGER, 'ร่างคำตอบแล้ว', 'รอผู้อำนวยการลงนาม']] },
  { ...pastComplaint('CMP-2609-009', '2026-09-16 10:20', 'email', 'Kittikun S.', 'financial', 'ค่าบริการ', 'low', 'ใบกำกับภาษีออกผิดชื่อ', '2026-09-16 15:40', '2026-09-17 10:00', 'process', 5),
    pet: 'Milo', satisfaction: undefined },
  { ...pastComplaint('CMP-2609-008', '2026-09-10 18:05', 'in-person', 'Patcharee L.', 'operational', 'การสื่อสาร', 'moderate', 'ไม่ได้รับใบเสนอราคาก่อนทำหัตถการ', '2026-09-12 09:00',
    '2026-09-13 11:00', 'apology', 3), pet: 'Bolt', status: 'responded', resolution: undefined, satisfaction: undefined },
  { ...pastComplaint('CMP-2609-007', '2026-09-09 08:00', 'email', '', 'operational', 'ความสะอาด', 'moderate', 'ห้องพักพยาบาลเวรดึกไม่มีการทำความสะอาด', '2026-09-10 10:00',
    '2026-09-11 09:00', 'process', 0), ownerKey: undefined, handler: 'หัวหน้าพยาบาล', satisfaction: undefined,
    communications: [['2026-09-09 08:00', ANONYMOUS, 'in', 'email', 'ห้องพักพยาบาลเวรดึกไม่มีการทำความสะอาด'], ['2026-09-10 10:00', 'หัวหน้าพยาบาล', 'out', 'email', 'ชี้แจงสาเหตุและขออภัย']] },
  { ...pastComplaint('CMP-2609-006', '2026-09-04 12:00', 'line', 'Waraporn D.', 'clinical', 'การสื่อสาร', 'moderate', 'ไม่ได้รับการแจ้งอาการระหว่างนอนโรงพยาบาล', '2026-09-08 10:00',
    '2026-09-09 14:00', 'apology', 2), pet: 'Nala' },
  pastComplaint('CMP-2608-003', '2026-08-30 19:00', 'phone', 'Thanawat P.', 'clinical', 'ผลการรักษา', 'low', 'หูยังอักเสบหลังรักษา', '2026-09-01 10:00', '2026-09-03 10:00', 'none', 3),
  pastComplaint('CMP-2608-002', '2026-08-22 10:30', 'in-person', 'Arisa K.', 'financial', 'ค่าบริการ', 'moderate', 'ค่าฝากเลี้ยงคิดเกินวัน', '2026-08-24 09:00', '2026-08-25 10:00', 'refund', 5),
  pastComplaint('CMP-2608-001', '2026-08-09 12:00', 'line', 'Napat T.', 'operational', 'ความสะอาด', 'low', 'ห้องรอแมวมีกลิ่น', '2026-08-10 10:00', '2026-08-12 10:00', 'process', 4),
  pastComplaint('CMP-2607-003', '2026-07-28 17:00', 'email', 'Somsak W.', 'operational', 'เวลารอ', 'low', 'รอชำระเงินนาน', '2026-07-30 10:00', '2026-08-01 10:00', 'process', 3),
  pastComplaint('CMP-2607-002', '2026-07-20 15:00', 'phone', 'Waraporn D.', 'clinical', 'ยา', 'moderate', 'ไม่ได้อธิบายวิธีให้ยาหยอดตา', '2026-07-22 10:00', '2026-07-23 10:00', 'apology', 4),
  pastComplaint('CMP-2607-001', '2026-07-06 09:00', 'line', 'Kittikun S.', 'operational', 'เวลารอ', 'low', 'รอคิวอาบน้ำตัดขนนาน', '2026-07-07 10:00', '2026-07-08 10:00', 'process', 4),
  pastComplaint('CMP-2606-003', '2026-06-27 10:00', 'in-person', 'Sirinya M.', 'operational', 'เวลารอ', 'moderate', 'รอผลแล็บนาน', '2026-06-29 10:00', '2026-06-30 10:00', 'apology', 3),
  pastComplaint('CMP-2606-002', '2026-06-15 13:00', 'phone', 'Patcharee L.', 'financial', 'ค่าบริการ', 'low', 'ไม่ได้รับส่วนลดสมาชิก', '2026-06-16 10:00', '2026-06-17 10:00', 'credit', 5),
  pastComplaint('CMP-2606-001', '2026-06-02 11:00', 'line', 'Thanawat P.', 'operational', 'การนัดหมาย', 'low', 'ข้อความนัดทาง LINE แจ้งผิดวัน', '2026-06-03 10:00', '2026-06-04 10:00', 'process', 4),
  pastComplaint('CMP-2605-002', '2026-05-19 16:00', 'email', 'Kanokwan R.', 'clinical', 'ผลการรักษา', 'moderate', 'อาการไม่ดีขึ้นหลังรักษา 3 วัน', '2026-05-22 18:00', '2026-05-25 10:00', 'apology', 3),
  pastComplaint('CMP-2605-001', '2026-05-03 09:30', 'in-person', 'Arisa K.', 'operational', 'พฤติกรรมบริการ', 'low', 'เจ้าหน้าที่ต้อนรับพูดไม่สุภาพ', '2026-05-05 10:00', '2026-05-06 10:00', 'apology', 3),
  pastComplaint('CMP-2604-002', '2026-04-21 14:00', 'line', 'Napat T.', 'financial', 'ค่าบริการ', 'moderate', 'ค่าตรวจเลือดสูงกว่าที่แจ้ง', '2026-04-23 09:00', '2026-04-24 10:00', 'refund', 4),
  pastComplaint('CMP-2604-001', '2026-04-08 10:00', 'phone', 'Somsak W.', 'operational', 'เวลารอ', 'low', 'รอรับยานาน', '2026-04-09 10:00', '2026-04-10 10:00', 'apology', 4),
];

/* PDPA (M31): the requests, consents, breaches and records the DPO keeps (a design contract: no pdpa service yet) */
const DPO = 'ปรีดา (DPO)';
const DSARS: DsarRequest[] = [
  { id: 'DSAR-2609-006', right: 'rectification', requester: 'Thanawat P.', ownerKey: 'Thanawat P.', pets: ['Pumpkin'], hns: ['HN-200311'], channel: 'phone',
    scope: 'แก้เบอร์โทรศัพท์และที่อยู่ในทะเบียนเจ้าของ', receivedAt: '2026-09-20 10:00', statutoryDue: '2026-10-20', status: 'verified',
    identity: { method: 'โทรกลับเบอร์ในทะเบียนและถามข้อมูลยืนยัน', by: DPO, at: '2026-09-21 09:00' }, collected: [],
    history: [['2026-09-20 10:00', 'แผนกต้อนรับ', 'รับคำขอ DSAR', 'สิทธิขอแก้ไข · Thanawat P.'], ['2026-09-21 09:00', DPO, 'ยืนยันตัวตนผู้ขอ', 'โทรกลับเบอร์ในทะเบียนและถามข้อมูลยืนยัน']] },
  { id: 'DSAR-2609-005', right: 'erasure', requester: 'Prasit N.', pets: ['Taro'], hns: ['HN-150221'], channel: 'line', scope: 'ลบข้อมูลติดต่อและการเชื่อม LINE เพราะย้ายไปโรงพยาบาลอื่น',
    receivedAt: '2026-09-12 14:00', statutoryDue: '2026-10-12', status: 'intake', collected: [],
    history: [['2026-09-12 14:00', DPO, 'รับคำขอ DSAR', 'สิทธิขอลบ · Prasit N.']] },
  { id: 'DSAR-2609-004', right: 'access', requester: 'Kanokwan R.', ownerKey: 'Kanokwan R.', pets: ['Mali'], hns: ['HN-180533'], channel: 'email',
    scope: 'สำเนาประวัติการรักษาของ Mali ทั้งหมด และรายชื่อผู้ที่เข้าถึงเวชระเบียน', receivedAt: '2026-08-31 10:00', statutoryDue: '2026-09-30', status: 'collecting',
    identity: { method: 'บัตรประชาชนตรงกับทะเบียนเจ้าของ', by: DPO, at: '2026-09-22 11:30' }, collected: ['EMR', 'ผลแล็บ'], exportId: 'AX-2609-002',
    history: [['2026-08-31 10:00', DPO, 'รับคำขอ DSAR', 'สิทธิเข้าถึงและขอสำเนา · Kanokwan R.'], ['2026-09-22 11:30', DPO, 'ยืนยันตัวตนผู้ขอ', 'บัตรประชาชนตรงกับทะเบียนเจ้าของ'],
      ['2026-09-23 15:40', DPO, 'รวบรวมข้อมูลแล้ว', 'EMR'], ['2026-09-23 15:50', DPO, 'รวบรวมข้อมูลแล้ว', 'ผลแล็บ'], ['2026-09-23 16:05', DPO, 'ขอส่งออกบันทึกตรวจสอบ', 'AX-2609-002']] },
  { id: 'DSAR-2609-003', right: 'withdraw-consent', requester: 'Arisa K.', ownerKey: 'Arisa K.', pets: [], hns: [], channel: 'line', scope: 'ถอนความยินยอมการแจ้งเตือนทาง LINE',
    receivedAt: '2026-09-10 20:15', statutoryDue: '2026-10-10', status: 'closed', identity: { method: 'ยืนยันผ่านบัญชี LINE ที่เชื่อมไว้', by: 'ระบบ', at: '2026-09-10 20:15' }, collected: [],
    outcome: 'ถอนทันทีทาง LINE ระบบหยุดส่งการแจ้งเตือนแล้ว',
    history: [['2026-09-10 20:15', 'ระบบ', 'รับคำขอ DSAR', 'สิทธิถอนความยินยอม · Arisa K.'], ['2026-09-10 20:15', 'ระบบ', 'ปิดคำขอแล้ว', 'ถอนทันทีทาง LINE ระบบหยุดส่งการแจ้งเตือนแล้ว']] },
  { id: 'DSAR-2609-001', right: 'access', requester: 'ญาติของ Somsak W.', ownerKey: 'Somsak W.', pets: ['Luna'], hns: ['HN-190412'], channel: 'in-person', scope: 'ขอประวัติการรักษาของ Luna',
    receivedAt: '2026-09-03 11:00', statutoryDue: '2026-10-03', status: 'rejected', collected: [], outcome: 'ผู้ขอไม่ใช่เจ้าของและไม่มีหนังสือมอบอำนาจ แจ้งเจ้าของแล้ว',
    history: [['2026-09-03 11:00', 'แผนกต้อนรับ', 'รับคำขอ DSAR', 'สิทธิเข้าถึงและขอสำเนา · ญาติของ Somsak W.'], ['2026-09-04 10:00', DPO, 'ปฏิเสธคำขอ', 'ผู้ขอไม่ใช่เจ้าของและไม่มีหนังสือมอบอำนาจ แจ้งเจ้าของแล้ว']] },
  { id: 'DSAR-2608-002', right: 'portability', requester: 'Patcharee L.', ownerKey: 'Patcharee L.', pets: ['Bolt'], hns: ['HN-240118'], channel: 'email',
    scope: 'ประวัติวัคซีนและผลตรวจในไฟล์ที่อ่านด้วยเครื่องได้', receivedAt: '2026-08-05 09:00', statutoryDue: '2026-09-04', status: 'closed',
    identity: { method: 'บัตรประชาชนตรงกับทะเบียนเจ้าของ', by: DPO, at: '2026-08-06 10:00' }, collected: ['EMR', 'ผลแล็บ'],
    delivery: { method: 'ลิงก์ดาวน์โหลดทางอีเมล', artifact: 'DSAR-2608-002.zip', expires: '2026-09-03', by: DPO, at: '2026-08-20 14:00' }, outcome: 'ส่งมอบครบ เจ้าของยืนยันรับแล้ว',
    history: [['2026-08-05 09:00', DPO, 'รับคำขอ DSAR', 'สิทธิขอรับและโอนย้ายข้อมูล · Patcharee L.'], ['2026-08-20 14:00', DPO, 'ส่งมอบข้อมูลแล้ว', 'ลิงก์ดาวน์โหลดทางอีเมล'],
      ['2026-08-22 10:00', DPO, 'ปิดคำขอแล้ว', 'ส่งมอบครบ เจ้าของยืนยันรับแล้ว']] },
];

const CONSENTS: ConsentGrant[] = [
  { id: 'CNS-006', ownerKey: 'Kanokwan R.', purpose: 'insurance', status: 'granted', version: 'v3', at: '2026-09-23 16:45', channel: 'แบบฟอร์มที่โรงพยาบาล' },
  { id: 'CNS-005', ownerKey: 'Waraporn D.', purpose: 'case-study', status: 'withdrawn', version: 'v3', at: '2026-04-20 13:20', channel: 'แบบฟอร์มที่โรงพยาบาล', withdrawnAt: '2026-09-15 09:30' },
  { id: 'CNS-004', ownerKey: 'Somsak W.', purpose: 'case-study', status: 'granted', version: 'v2', at: '2025-11-02 10:00', channel: 'แบบฟอร์มที่โรงพยาบาล' },
  { id: 'CNS-003', ownerKey: 'Napat T.', purpose: 'case-study', status: 'declined', version: 'v3', at: '2026-03-03 15:10', channel: 'LINE' },
  { id: 'CNS-002', ownerKey: 'Arisa K.', purpose: 'insurance', status: 'declined', version: 'v3', at: '2026-05-09 11:45', channel: 'แบบฟอร์มที่โรงพยาบาล' },
  { id: 'CNS-001', ownerKey: 'Patcharee L.', purpose: 'insurance', status: 'granted', version: 'v2', at: '2026-02-01 09:10', channel: 'แบบฟอร์มที่โรงพยาบาล' },
];

const BREACHES: Breach[] = [
  { id: 'BR-2609-003', title: 'ส่งรายชื่อเจ้าของออกนอกระบบ', discoveredAt: '2026-09-24 09:10', reportedBy: 'วรรณา (ผู้จัดการการเงิน)', source: 'อีเมลขาออก',
    description: 'ไฟล์รายชื่อและเบอร์โทรเจ้าของ 40 รายถูกส่งให้ผู้ขายอาหารสัตว์ทางอีเมล โดยไม่มีสัญญาประมวลผลข้อมูล', statutoryDue: '2026-09-27 09:10',
    affected: { count: 40, kinds: ['ชื่อ', 'เบอร์โทร'] }, status: 'open', notifications: [],
    history: [['2026-09-24 09:20', 'วรรณา (ผู้จัดการการเงิน)', 'บันทึกเหตุละเมิด', 'กระทบ 40 ราย · ส่งรายชื่อเจ้าของออกนอกระบบ']] },
  { id: 'BR-2609-002', title: 'ส่งลิงก์ชำระเงินผิดเจ้าของทาง LINE', discoveredAt: '2026-09-21 16:00', reportedBy: 'นัทธมน (แคชเชียร์)', source: 'LINE CRM (M15)',
    description: 'ลิงก์ชำระพร้อมชื่อสัตว์และยอดค้างของเจ้าของรายหนึ่ง ส่งไปยังบัญชี LINE ของอีกราย ผู้รับแจ้งกลับมา', statutoryDue: '2026-09-24 16:00',
    severity: 'medium', assessment: { dpia: 'ข้อมูลการเงินและชื่อสัตว์ 1 ราย ผู้รับลบข้อความแล้ว ความเสี่ยงต่ำต่อสิทธิแต่ต้องแจ้ง สคส.', by: DPO, at: '2026-09-22 09:00' },
    affected: { count: 1, kinds: ['ชื่อสัตว์', 'ยอดค้างชำระ'] }, status: 'assessed', notifications: [],
    history: [['2026-09-21 16:20', 'นัทธมน (แคชเชียร์)', 'บันทึกเหตุละเมิด', 'กระทบ 1 ราย · ส่งลิงก์ชำระเงินผิดเจ้าของทาง LINE'],
      ['2026-09-22 09:00', DPO, 'ประเมินความรุนแรงแล้ว', 'ปานกลาง · ข้อมูลการเงินและชื่อสัตว์ 1 ราย ผู้รับลบข้อความแล้ว ความเสี่ยงต่ำต่อสิทธิแต่ต้องแจ้ง สคส.']] },
  { id: 'BR-2609-001', title: 'แท็บเล็ตวอร์ดหาย', discoveredAt: '2026-09-05 07:30', reportedBy: 'พ.ส. อรุณี', source: 'วอร์ด', description: 'แท็บเล็ตบันทึกการรักษาของ Dog ward หายระหว่างเปลี่ยนเวร',
    statutoryDue: '2026-09-08 07:30', severity: 'low', assessment: { dpia: 'เครื่องเข้ารหัสทั้งเครื่องและล็อกระยะไกลแล้ว ไม่มีความเสี่ยงต่อสิทธิ ไม่ต้องแจ้ง', by: DPO, at: '2026-09-05 10:00' },
    affected: { count: 0, kinds: [] }, status: 'closed', notifications: [], closedAt: '2026-09-07 15:00', outcome: 'ล้างเครื่องจากระยะไกลแล้ว พบเครื่องในห้องเก็บของวันที่ 7',
    history: [['2026-09-05 07:40', 'พ.ส. อรุณี', 'บันทึกเหตุละเมิด', 'กระทบ 0 ราย · แท็บเล็ตวอร์ดหาย'], ['2026-09-05 10:00', DPO, 'ประเมินความรุนแรงแล้ว', 'ต่ำ (ไม่มีความเสี่ยงต่อสิทธิ)'],
      ['2026-09-07 15:00', DPO, 'ปิดเหตุแล้ว', 'ล้างเครื่องจากระยะไกลแล้ว พบเครื่องในห้องเก็บของวันที่ 7']] },
  { id: 'BR-2607-001', title: 'ระบบนัดหมายของผู้ให้บริการภายนอกถูกเจาะ', discoveredAt: '2026-07-21 18:00', reportedBy: 'สมชาย (ผู้ดูแลระบบ)', source: 'แจ้งจากผู้ให้บริการ',
    description: 'ผู้ให้บริการระบบนัดหมายออนไลน์แจ้งว่าฐานข้อมูลถูกเข้าถึง มีชื่อ เบอร์โทร และอีเมลเจ้าของของโรงพยาบาล', statutoryDue: '2026-07-24 18:00', severity: 'high',
    assessment: { dpia: 'ข้อมูลติดต่อ 212 ราย เสี่ยงถูกนำไปหลอกลวง ต้องแจ้ง สคส. และเจ้าของข้อมูล', by: DPO, at: '2026-07-22 09:00' }, affected: { count: 212, kinds: ['ชื่อ', 'เบอร์โทร', 'อีเมล'] },
    status: 'closed', notifications: [['pdpc', '2026-07-23 10:00', DPO, 'PDPC-6907-0112'], ['subjects', '2026-07-23 15:00', DPO, 'SMS และอีเมล 212 ราย']],
    signOff: { by: 'น.สพ. นรินทร์', at: '2026-08-15 10:00', note: 'ยกเลิกสัญญาผู้ให้บริการ ย้ายระบบนัดหมายเข้าระบบโรงพยาบาลแล้ว' }, closedAt: '2026-08-15 10:00',
    outcome: 'ยกเลิกสัญญาผู้ให้บริการ ย้ายระบบนัดหมายเข้าระบบโรงพยาบาลแล้ว',
    history: [['2026-07-21 18:30', 'สมชาย (ผู้ดูแลระบบ)', 'บันทึกเหตุละเมิด', 'กระทบ 212 ราย · ระบบนัดหมายของผู้ให้บริการภายนอกถูกเจาะ'], ['2026-07-22 09:00', DPO, 'ประเมินความรุนแรงแล้ว', 'สูง'],
      ['2026-07-23 10:00', DPO, 'แจ้งเหตุแล้ว', 'สำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.) · PDPC-6907-0112'], ['2026-07-23 15:00', DPO, 'แจ้งเหตุแล้ว', 'เจ้าของข้อมูลที่ได้รับผลกระทบ · SMS และอีเมล 212 ราย'],
      ['2026-08-15 10:00', 'น.สพ. นรินทร์', 'ผู้อำนวยการลงนามปิดเหตุ', 'ยกเลิกสัญญาผู้ให้บริการ ย้ายระบบนัดหมายเข้าระบบโรงพยาบาลแล้ว']] },
];

const RETENTION: RetentionDataset[] = [
  { id: 'RT-01', dataset: 'เวชระเบียนและผลตรวจ', module: 'M02 EMR', policy: '10 ปีหลังการรักษาครั้งสุดท้าย', basis: 'มาตรฐานวิชาชีพสัตวแพทย์', records: 18_420, pastWindow: 312 },
  { id: 'RT-02', dataset: 'ใบแจ้งหนี้และใบเสร็จ', module: 'M11 Billing', policy: '5 ปีตามกฎหมายบัญชี', basis: 'พ.ร.บ.การบัญชี', records: 41_200, pastWindow: 0 },
  { id: 'RT-03', dataset: 'ข้อมูลติดต่อเจ้าของ', module: 'M01 EMPI', policy: '3 ปีหลังติดต่อครั้งล่าสุด', basis: 'ความยินยอมและการให้บริการ', records: 6_380, pastWindow: 147, hold: 'DSAR-2609-005 · รอตรวจก่อนลบ' },
  { id: 'RT-04', dataset: 'บันทึกข้อความ LINE', module: 'M15 LINE CRM', policy: '1 ปี', basis: 'ความยินยอม', records: 9_870, pastWindow: 1_204 },
  { id: 'RT-05', dataset: 'ภาพจากกล้องวงจรปิด', module: 'อาคารสถานที่', policy: '30 วัน', basis: 'ประโยชน์โดยชอบด้วยกฎหมาย', records: 30, pastWindow: 0 },
  { id: 'RT-06', dataset: 'บันทึกตรวจสอบ (audit)', module: 'M13 Audit', policy: '7 ปี', basis: 'กฎหมายและการตรวจสอบ', records: 98_400, pastWindow: 0, hold: 'ห้ามลบก่อนครบ 7 ปี' },
];

const ROPA: RopaRecord[] = [
  { id: 'ROPA-01', activity: 'การรักษาและเวชระเบียน', purpose: 'ตรวจ รักษา และติดตามผล', basis: 'สัญญา', dataKinds: 'ข้อมูลเจ้าของ ประวัติสัตว์ ผลตรวจ', subjects: 'เจ้าของสัตว์',
    recipients: 'ห้องแล็บภายนอก (IDEXX)', retention: '10 ปีหลังการรักษาครั้งสุดท้าย', crossBorder: 'CB-03', owner: 'ผู้อำนวยการ', reviewedAt: '2026-03-01' },
  { id: 'ROPA-02', activity: 'การเรียกเก็บเงินและบัญชี', purpose: 'ออกใบแจ้งหนี้ รับชำระ และส่งข้อมูลบัญชี', basis: 'หน้าที่ตามกฎหมาย', dataKinds: 'ชื่อ ที่อยู่ เลขผู้เสียภาษี ยอดชำระ',
    subjects: 'เจ้าของสัตว์', recipients: 'PEAK (ระบบบัญชี)', retention: '5 ปี', owner: 'ผู้จัดการการเงิน', reviewedAt: '2026-03-01' },
  { id: 'ROPA-03', activity: 'ข้อความบริการและการแจ้งเตือนทาง LINE', purpose: 'แจ้งนัด ผลตรวจ และลิงก์ชำระ', basis: 'ความยินยอม', dataKinds: 'LINE ID ชื่อ ชื่อสัตว์ นัดหมาย',
    subjects: 'เจ้าของที่เชื่อม LINE', recipients: 'LY Corporation (LINE)', retention: '1 ปี', crossBorder: 'CB-02', owner: 'ผู้จัดการ OPD', reviewedAt: '2026-03-01' },
  { id: 'ROPA-04', activity: 'เคลมประกันสัตว์เลี้ยง', purpose: 'ส่งเอกสารเคลมให้บริษัทประกัน', basis: 'ความยินยอม', dataKinds: 'ข้อมูลเจ้าของ กรมธรรม์ การวินิจฉัย ค่ารักษา',
    subjects: 'เจ้าของที่มีกรมธรรม์', recipients: 'บริษัทประกัน', retention: '5 ปี', owner: 'ผู้จัดการการเงิน', reviewedAt: '2026-03-01' },
  { id: 'ROPA-05', activity: 'สำรองข้อมูลระบบ', purpose: 'กู้คืนเมื่อระบบขัดข้อง', basis: 'ประโยชน์โดยชอบด้วยกฎหมาย', dataKinds: 'ข้อมูลทั้งระบบ (เข้ารหัส)', subjects: 'ทุกกลุ่ม',
    recipients: 'AWS (สิงคโปร์)', retention: '35 วัน', crossBorder: 'CB-01', owner: 'สมชาย (ผู้ดูแลระบบ)', reviewedAt: '2025-08-15' },
  { id: 'ROPA-06', activity: 'บุคลากรและตารางเวร', purpose: 'จ้างงาน ใบอนุญาต และจัดเวร', basis: 'สัญญาจ้าง', dataKinds: 'ข้อมูลพนักงาน ใบอนุญาต การลา', subjects: 'บุคลากร',
    recipients: 'ไม่มี', retention: '10 ปีหลังพ้นสภาพ', owner: 'ฝ่ายบุคคล', reviewedAt: '2026-03-01' },
];

const CROSS_BORDER: CrossBorder[] = [
  { id: 'CB-01', destination: 'สิงคโปร์', vendor: 'AWS (ap-southeast-1)', data: 'สำรองข้อมูลทั้งระบบ เข้ารหัสก่อนส่ง', safeguard: 'สัญญาประมวลผลข้อมูลและข้อสัญญามาตรฐาน', status: 'assessed', assessedAt: '2025-08-15' },
  { id: 'CB-02', destination: 'ญี่ปุ่น', vendor: 'LY Corporation (LINE)', data: 'LINE ID และข้อความที่ส่ง', safeguard: 'นโยบายคุ้มครองข้อมูลของผู้ให้บริการ', status: 'assessed', assessedAt: '2026-03-01' },
  { id: 'CB-03', destination: 'สหรัฐอเมริกา', vendor: 'IDEXX VetConnect PLUS', data: 'ผลแล็บและชื่อสัตว์', safeguard: 'รอสัญญาประมวลผลข้อมูลฉบับลงนาม', status: 'pending' },
];

const ROPA_EXPORTS: RopaExport[] = [
  { id: 'ROPA-2603-001', at: '2026-03-01 10:00', by: DPO, records: 6, seconds: 10, artifact: 'ROPA-2603-001.pdf' },
];

/* Audit (M13): events as /audit/v1/events gives them, with the risk the backend set and the hash it checked */
const audit = (id: string, occurredAt: string, actor: string, actorRole: string, action: string, entityType: string, entityId: string, riskLevel: RiskLevel,
  patientId?: string, result: AuditEvent['result'] = 'success', hashCheck: AuditEvent['hashCheck'] = 'verified'): AuditEvent => {
  const base = { occurredAt, actor, actorRole, action, entityType, entityId, patientId, result, riskLevel, requestId: `req-${id.slice(-4)}${occurredAt.slice(8, 10)}` };
  return { id, ...base, eventHash: hashOf(base), hashCheck };
};
const AUDIT_EVENTS: AuditEvent[] = [
  audit('EV-260924-0021', '2026-09-24 11:05', 'นัทธมน (แคชเชียร์)', 'Reception', 'billing.payment.capture', 'payment', 'PAY-2609-0391', 'medium', undefined, 'error'),
  audit('EV-260924-0020', '2026-09-24 10:58', 'ภก. ธนพร', 'Pharmacist', 'pharmacy.controlled.dispense', 'prescription', 'RX-260924-20', 'high', 'HN-210877'),
  audit('EV-260924-0019', '2026-09-24 10:41', 'สพ.ญ. ลลิตา', 'Vet', 'emr.record.read', 'patient', 'HN-130904', 'low', 'HN-130904'),
  audit('EV-260924-0018', '2026-09-24 08:15', 'ภก. ธนพร', 'Pharmacist', 'iam.override.request', 'permission', 'OV-2609-001', 'high'),
  audit('EV-260924-0017', '2026-09-24 08:10', 'พ.ส. กมล', 'RVN', 'emr.treatment.record', 'treatment', 'TS-180533-0924', 'low', 'HN-180533'),
  audit('EV-260923-0016', '2026-09-23 17:40', 'พ.ส. ณิชา', 'RVN', 'equipment.downtime.open', 'downtime', 'DT-2609-005', 'low'),
  audit('EV-260923-0015', '2026-09-23 16:10', 'น.สพ. นรินทร์', 'Vet', 'emr.note.sign', 'clinical_note', 'CN-180533-0923', 'medium', 'HN-180533'),
  audit('EV-260923-0014', '2026-09-23 16:05', DPO, 'DPOCompliance', 'audit.export.request', 'audit_export', 'AX-2609-002', 'medium'),
  audit('EV-260923-0013', '2026-09-23 09:02', 'วรรณา (ผู้จัดการการเงิน)', 'Manager', 'billing.refund.reject', 'refund', 'RF-2609-002', 'high'),
  audit('EV-260922-0012', '2026-09-22 15:10', 'นัทธมน (แคชเชียร์)', 'Reception', 'billing.refund.request', 'refund', 'RF-2609-002', 'high'),
  audit('EV-260922-0011', '2026-09-22 11:30', DPO, 'DPOCompliance', 'empi.owner.pii_read', 'owner', 'Kanokwan R.', 'medium', 'HN-180533'),
  audit('EV-260920-0010', '2026-09-20 08:55', 'นัทธมน (แคชเชียร์)', 'Reception', 'emr.record.read', 'patient', 'HN-180533', 'low', 'HN-180533', 'denied'),
  audit('EV-260918-0009', '2026-09-18 15:30', 'สมชาย (ผู้ดูแลระบบ)', 'Admin', 'empi.patient.merge', 'patient', 'HN-250299 → HN-250207', 'critical', 'HN-250207'),
  audit('EV-260915-0008', '2026-09-15 16:40', 'ภก. ธนพร', 'Pharmacist', 'pharmacy.prescription.read', 'prescription', 'RX-260915-07', 'low', 'HN-180533'),
  audit('EV-260912-0007', '2026-09-12 12:00', 'พ.ส. ณิชา', 'RVN', 'emr.consent.record', 'consent', 'DNR-130904', 'medium', 'HN-130904'),
  audit('EV-260912-0006', '2026-09-12 10:05', 'นัทธมน (แคชเชียร์)', 'Reception', 'billing.invoice.read', 'invoice', 'INV-2609-0122', 'low', 'HN-180533'),
  audit('EV-260910-0005', '2026-09-10 20:15', 'Arisa K.', 'Owner (LINE)', 'consent.withdraw', 'consent', 'LINE-Arisa K.-reminder', 'medium'),
  audit('EV-260908-0004', '2026-09-08 07:05', 'พ.ส. กมล', 'RVN', 'emr.treatment.record', 'treatment', 'TS-230622-0908', 'low', 'HN-230622'),
  audit('EV-260908-0003', '2026-09-08 05:40', 'พ.ส. ปวีณา', 'RVN', 'emr.record.read', 'patient', 'HN-230622', 'low', 'HN-230622'),
  audit('EV-260905-0002', '2026-09-05 14:20', 'พ.ส. อรุณี', 'RVN', 'emr.record.read', 'patient', 'HN-180533', 'low', 'HN-180533'),
  audit('EV-260901-0001', '2026-09-01 09:12', 'น.สพ. นรินทร์', 'Vet', 'emr.record.read', 'patient', 'HN-180533', 'low', 'HN-180533'),
  audit('EV-260830-0004', '2026-08-30 18:20', 'สพ.ญ. ลลิตา', 'Vet', 'emr.record.read', 'patient', 'HN-200311', 'low', 'HN-200311'),
  audit('EV-260819-0003', '2026-08-19 10:30', 'สพ.ญ. พิชญา', 'Vet', 'emr.note.amend', 'clinical_note', 'CN-220145-0819', 'medium', 'HN-220145', 'success', 'mismatch'),
  audit('EV-260814-0002', '2026-08-14 16:00', 'พ.ส. สุดา', 'RVN', 'lab.specimen.relabel', 'specimen', 'SP-0814-022', 'medium', 'HN-240118'),
  audit('EV-260803-0001', '2026-08-03 10:00', 'แผนกต้อนรับ', 'Reception', 'appointment.book', 'appointment', 'APT-0803-14', 'low'),
  audit('EV-260714-0002', '2026-07-14 09:35', 'พ.ส. สุดา', 'RVN', 'lab.specimen.collect', 'specimen', 'SP-0714-008', 'low', 'HN-230622'),
  audit('EV-260702-0001', '2026-07-02 11:00', 'สมชาย (ผู้ดูแลระบบ)', 'Admin', 'iam.role.grant', 'role', 'Pharmacist → ภก. ธนพร', 'high'),
];

const AUDIT_EXPORTS: AuditExport[] = [
  { id: 'AX-2609-003', requestedBy: 'พ.ส. อรุณี', requestedAt: '2026-09-22 14:00', shape: 'patient', value: 'HN-230622', from: '2026-09-07', to: '2026-09-09',
    purpose: 'สอบสวนอุบัติการณ์หรือเหตุละเมิด', reference: 'INC-2609-001', status: 'approved', decidedBy: DPO, decidedAt: '2026-09-22 16:00', decision: 'ขอบเขตตรงกับเวลาที่เกิดเหตุ' },
  { id: 'AX-2609-002', requestedBy: DPO, requestedAt: '2026-09-23 16:05', shape: 'patient', value: 'HN-180533', from: '2026-09-01', to: '2026-09-24',
    purpose: 'ตอบคำขอ DSAR', reference: 'DSAR-2609-004', status: 'pending' },
  { id: 'AX-2609-001', requestedBy: DPO, requestedAt: '2026-09-02 10:00', shape: 'actor', value: 'นัทธมน', from: '2026-08-01', to: '2026-08-31', purpose: 'ตรวจสอบภายใน',
    reference: 'IA-2609-01', status: 'expired', decidedBy: 'น.สพ. นรินทร์', decidedAt: '2026-09-03 09:00', decision: 'ตรวจการเข้าถึงข้อมูลของแคชเชียร์ตามแผนตรวจสอบ',
    performedAt: '2026-09-03 09:30', artifact: 'AX-2609-001.csv', expires: '2026-09-10', rows: 0 },
  { id: 'AX-2608-003', requestedBy: 'วรรณา (ผู้จัดการการเงิน)', requestedAt: '2026-08-28 11:00', shape: 'tenant', value: '', from: '2026-07-29', to: '2026-08-27', purpose: 'ตรวจสอบภายใน',
    reference: 'FIN-Q3', status: 'rejected', decidedBy: DPO, decidedAt: '2026-08-28 15:00', decision: 'ขอบเขตทั้งโรงพยาบาลกว้างเกินวัตถุประสงค์ ให้ระบุผู้ใช้งาน' },
];

const INTEGRITY: IntegrityPeriod[] = [
  { period: '2026-09', gaps: [['2026-09-14 02:00', 20]], checkedAt: '2026-09-24 06:00' },
  { period: '2026-08', gaps: [['2026-08-02 03:00', 12]], checkedAt: '2026-09-01 06:00' },
  { period: '2026-07', gaps: [], checkedAt: '2026-08-01 06:00' },
];

/** A fresh copy of the sample, for the store to change */
/* Integration center: the adapter's connection tests, newest first. The 06:00 run found the PEAK token expired; it was rotated at 08:15 and not tested since */
const ADAPTER_TESTS: ConnectionTest[] = [
  { id: 'CT-0014', at: '2026-09-24 06:02', by: 'ระบบ (รอบส่ง 06:00)', result: 'auth-failed', code: 'AUTH_401', ms: 412 },
  { id: 'CT-0013', at: '2026-09-23 23:01', by: 'ระบบ (รอบส่ง 23:00)', result: 'passed', ms: 388 },
  { id: 'CT-0012', at: '2026-09-23 06:01', by: 'ระบบ (รอบส่ง 06:00)', result: 'passed', ms: 371 },
];

export function createBackofficeSeed(): BackofficeData {
  return structuredClone({
    workItems: WORK_ITEMS, approvals: APPROVALS, exceptions: EXCEPTIONS, activity: ACTIVITY, accountingExports: ACCOUNTING_EXPORTS, reconciliations: [],
    drugs: DRUGS, receipts: RECEIPTS, ledgerDispenses: LEDGER_DISPENSES, wastes: WASTES, counts: COUNTS, recalls: RECALLS,
    lineLinks: LINE_LINKS, messages: MESSAGES, vaccinesDue: VACCINES_DUE, policies: POLICIES, claims: CLAIMS,
    staff: STAFF, licenses: LICENSES, ce: CE_RECORDS, privileges: PRIVILEGES_SEED, privilegeLog: PRIVILEGE_LOG, shifts: rota(), leaves: LEAVES, onCall: ON_CALL, callOuts: CALL_OUTS,
    equipment: equipment(), pm: PM_TASKS, calibrations: CALIBRATIONS, downtime: DOWNTIME, contracts: CONTRACTS, decommissions: DECOMMISSIONS,
    incidents: INCIDENTS, nearMisses: NEAR_MISSES, rcas: RCAS, kpis: KPIS, surveys: SURVEYS, mm: MM_REVIEWS, complaints: COMPLAINTS,
    dsars: DSARS, consents: CONSENTS, breaches: BREACHES, retention: RETENTION, ropa: ROPA, crossBorder: CROSS_BORDER, ropaExports: ROPA_EXPORTS,
    auditEvents: AUDIT_EVENTS, auditExports: AUDIT_EXPORTS, integrity: INTEGRITY, adapterTests: ADAPTER_TESTS,
  });
}
