/* The context rail's text and the sheets it leads to (data/rail, sheets/rail-sheets): English for the Thai source
   text, and Thai for the English keys. Placeholders are {name}. */

export const EN_RAIL: Record<string, string> = {
  /* the rail */
  'ยังไม่ได้เลือกผู้ป่วย': 'No patient selected',
  'ต้องดำเนินการ': 'needs action',

  /* the patient's sections */
  'นัดถัดไป': 'Next appointment',
  'ยังไม่มีประวัติการมารักษา': 'No past visits yet',
  'เปิดนัดหมาย': 'Open appointments',
  'เปิดคิววันนี้': "Open today's queue",
  'เปิด Encounter': 'Open encounter',
  'ผลตรวจทั้งหมด ใหม่สุดก่อน': 'All results, newest first',
  '{0} รายการ · {1} รายการผิดปกติรอรับทราบ': '{0} results · {1} abnormal to acknowledge',
  'ยังไม่มีผลตรวจ': 'No results yet',
  'ผิดปกติ': 'Abnormal',
  'รับทราบแล้ว': 'Acknowledged',

  /* a past visit */
  'การมารักษา': 'Visit',
  'สรุปการมารักษา': 'Visit summary',
  'ไม่มีในข้อมูลตัวอย่าง': 'Not in the sample data',
  'ไม่มีผลตรวจใน visit นี้': 'No results in this visit',
  'ไม่มีเอกสารใน visit นี้': 'No documents in this visit',
  'บันทึกการรักษาฉบับเต็มของ visit ย้อนหลังไม่อยู่ในข้อมูลตัวอย่าง': 'The full clinical notes of past visits are not in the sample data',
  'กลับไปประวัติการรักษา': 'Back to visit history',
  'ดูยอดค้างชำระ': 'View balance due',

  /* a document */
  'ตัวอย่างเอกสาร': 'Document preview',
  'ชนิดไฟล์': 'File type',
  'ข้อมูลตัวอย่างไม่มีไฟล์จริง — แสดงรายละเอียดของเอกสารแทน': "The sample data has no real files — showing the document's details instead",
  'ข้อมูลตัวอย่างไม่มีไฟล์จริง — ไฟล์นี้คือรายละเอียดของเอกสาร': "The sample data has no real files — this file holds the document's details",
  'ดาวน์โหลดรายละเอียด': 'Download details',
  'ดาวน์โหลดรายละเอียดเอกสารแล้ว': 'Document details downloaded',
  'ไม่พบเอกสารนี้': 'Document not found',
  'กลับไปเอกสาร': 'Back to documents',

  /* billing */
  'ค่าใช้จ่าย': 'Charges',
  'ไม่มียอดค้าง': 'Nothing owed',
  '{0} ใบแจ้งหนี้ค้างชำระ · {1}': '{0} unpaid invoices · {1}',
  'ยอดคงค้าง': 'Balance',
  'ยอดค้างชำระ': 'Balance due',
  'เครดิต / มัดจำ': 'Credit / deposit',
  'ใบแจ้งหนี้ค้างชำระ': 'Unpaid invoices',
  'ชำระบางส่วน': 'Part paid',
  'ไม่มีใบแจ้งหนี้ค้างชำระ': 'No unpaid invoices',
  'ค่าใช้จ่าย visit วันนี้ · {pet}': "Today's charges · {pet}",
  'ตั้งแต่': 'from',
  'รวมโดยประมาณ': 'Estimated total',
  'ยังไม่ออกใบแจ้งหนี้ · คิดจากคำสั่งตรวจวันนี้ ช่วงราคาคิดที่ราคาต่ำสุด': "Not invoiced yet · from today's orders, a price range at its lowest",
  'ยังไม่มีค่าใช้จ่ายใน visit วันนี้': "No charges in today's visit yet",
  'ใบประเมินค่าใช้จ่าย': 'Estimate',
  'ส่งยอดค้างชำระให้เจ้าของ': 'Send the balance to the owner',

  /* consent */
  'ใบยินยอมครบถ้วน': 'Consent on file',
  'รอลงนามใบยินยอม': 'Consent waiting to be signed',
  'ยังไม่มีใบยินยอม': 'No consent on file',
  'ถอนความยินยอมแล้ว': 'Consent withdrawn',
  'ใบยินยอมหมดอายุ': 'Consent expired',
  'ยังไม่ได้ลงนามใบยินยอมการรักษา': 'Treatment consent not signed yet',
  'เปิดในทะเบียน': 'Open in registry',

  /* sample data */
  'ข้อเข่าขวามีน้ำในข้อเล็กน้อย ไม่พบกระดูกหัก': 'Mild right stifle effusion, no fracture',
  'สงสัยเอ็นไขว้หน้าอักเสบ — ให้ยาแก้ปวด 14 วันแล้วนัดตรวจซ้ำ': 'Suspected cranial cruciate strain — 14 days of pain relief, then a recheck',
};

export const TH_RAIL: Record<string, string> = {
  'Billing / balance': 'ค่าใช้จ่าย / ยอดค้าง',
  'Findings': 'ผลการตรวจ',
  'Neuter': 'ทำหมัน',
  'Right hind limb X-ray (2 views)': 'X-ray ขาหลังขวา (2 มุม)',
  'Carprofen 25 mg × 14': 'Carprofen 25 mg × 14 เม็ด',
  'Joint supplement 30 caps': 'อาหารเสริมบำรุงข้อ 30 แคปซูล',
  'DHPPiL booster': 'วัคซีนกระตุ้น DHPPiL',
  'Doxycycline 50 mg × 10': 'Doxycycline 50 mg × 10 เม็ด',
  'Nebulization': 'พ่นละอองยา',
  'Subcutaneous fluids': 'ให้สารน้ำใต้ผิวหนัง',
  'Maropitant injection': 'ฉีดยา Maropitant',
};
