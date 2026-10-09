/*
 * A small .xlsx writer for exports: one sheet with a title row, a bold header row frozen at the top, text, numbers
 * and dates. No library: an .xlsx file is a ZIP of a few XML parts, written here uncompressed.
 */

/** A cell: text, a number, a date (shown with the time, or as a day), or empty */
export type XlsxCell = string | number | Date | null | undefined;

export interface XlsxSheet {
  /** The tab name; characters Excel does not allow are left out, and it is cut to 31 */
  name: string;
  /** Written above the header, across every column */
  title?: string;
  header: readonly string[];
  rows: readonly (readonly XlsxCell[])[];
  /** Columns whose dates are days, without the time */
  dayColumns?: readonly number[];
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIPS = 'http://schemas.openxmlformats.org/package/2006/relationships';

// Cell styles, in the order of cellXfs below
const STYLE = { header: 1, title: 2, day: 3, dateTime: 4 } as const;

/** The workbook as the bytes of an .xlsx file */
export function toXlsx(sheet: XlsxSheet): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const part = (name: string, xml: string) => ({ name, data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`) });
  return zip([
    part('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
      + `<Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
      + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
      + `</Types>`),
    part('_rels/.rels', `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">`
      + `<Relationship Id="rId1" Type="${RELATIONSHIPS}/officeDocument" Target="xl/workbook.xml"/>`
      + `</Relationships>`),
    part('xl/workbook.xml', `<workbook xmlns="${MAIN}" xmlns:r="${RELATIONSHIPS}">`
      + `<sheets><sheet name="${escapeXml(sheetName(sheet.name))}" sheetId="1" r:id="rId1"/></sheets>`
      + `</workbook>`),
    part('xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">`
      + `<Relationship Id="rId1" Type="${RELATIONSHIPS}/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${RELATIONSHIPS}/styles" Target="styles.xml"/>`
      + `</Relationships>`),
    part('xl/styles.xml', STYLES),
    part('xl/worksheets/sheet1.xml', worksheet(sheet)),
  ]);
}

// Built-in formats 14 and 22 are the short date and date-time of the reader's own Excel settings
const STYLES = `<styleSheet xmlns="${MAIN}">`
  + `<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>`
  + `<font><b/><sz val="14"/><name val="Calibri"/></font></fonts>`
  + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
  + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="5">`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
  + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
  + `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`
  + `<xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`
  + `</cellXfs>`
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
  + `</styleSheet>`;

function worksheet(sheet: XlsxSheet): string {
  const columns = Math.max(1, sheet.header.length);
  const days = new Set(sheet.dayColumns ?? []);
  const lines: string[] = [];
  if (sheet.title) {
    lines.push(rowXml(1, [cellXml(1, 0, sheet.title, STYLE.title)]));
  }
  const headerRow = sheet.title ? 2 : 1;
  lines.push(rowXml(headerRow, sheet.header.map((label, column) => cellXml(headerRow, column, label, STYLE.header))));
  sheet.rows.forEach((row, index) => {
    const number = headerRow + 1 + index;
    lines.push(rowXml(number, row.map((value, column) =>
      cellXml(number, column, value, value instanceof Date ? (days.has(column) ? STYLE.day : STYLE.dateTime) : 0))));
  });

  // Wide enough for the longest value in each column, within limits
  const widths = Array.from({ length: columns }, (_, column) => {
    const longest = Math.max(
      sheet.header[column]?.length ?? 0,
      ...sheet.rows.map(row => cellText(row[column], days.has(column)).length));
    return Math.min(60, Math.max(8, longest + 2));
  });
  const lastColumn = columnName(columns - 1);
  return `<worksheet xmlns="${MAIN}" xmlns:r="${RELATIONSHIPS}">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${lines.join('')}</sheetData>`
    + (sheet.title && columns > 1 ? `<mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells>` : '')
    + `</worksheet>`;
}

function rowXml(number: number, cells: string[]): string {
  return `<row r="${number}">${cells.join('')}</row>`;
}

function cellXml(row: number, column: number, value: XlsxCell, style: number): string {
  const ref = `${columnName(column)}${row}`;
  const styled = style ? ` s="${style}"` : '';
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${styled}><v>${value}</v></c>` : '';
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : `<c r="${ref}"${styled}><v>${excelSerial(value)}</v></c>`;
  }
  // Inline text: never read as a formula, so a value such as =1+1 stays as typed
  return `<c r="${ref}"${styled} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/** Excel counts days from 30 December 1899, in the reader's local time */
function excelSerial(date: Date): number {
  return (date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000 + 25_569;
}

/** For the column width only: about as long as Excel shows it */
function cellText(value: XlsxCell, day: boolean): string {
  if (value instanceof Date) {
    return day ? '0000-00-00' : '0000-00-00 00:00';
  }
  return value === null || value === undefined ? '' : String(value);
}

/** A, B, …, Z, AA, AB, … */
export function columnName(index: number): string {
  let name = '';
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}

function sheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet1';
}

function escapeXml(text: string): string {
  return text
    // Characters XML 1.0 does not allow at all
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ZIP, stored without compression (PKWARE APPNOTE 6.3) */

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function zip(files: readonly ZipEntry[], date = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    // Bit 11: the name is UTF-8
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, file.data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, day, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, size, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.push(new Uint8Array(entry.buffer), name);

    offset += 30 + name.length + size;
  }

  const directorySize = directory.reduce((sum, bytes) => sum + bytes.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);

  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const result = new Uint8Array(all.reduce((sum, bytes) => sum + bytes.length, 0));
  let position = 0;
  for (const bytes of all) {
    result.set(bytes, position);
    position += bytes.length;
  }
  return result;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
