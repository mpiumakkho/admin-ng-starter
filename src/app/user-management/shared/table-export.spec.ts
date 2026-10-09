import { copyText, forFormat, printHtml, TableExport } from './table-export';
import { columnName, crc32, toXlsx } from './xlsx';

/** The files in a ZIP made by zip(), read back from its central directory, with their CRC checked */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let entry = view.getUint32(end + 16, true);
  const files = new Map<string, string>();
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(entry, true)).toBe(0x02014b50);
    const crc = view.getUint32(entry + 16, true);
    const size = view.getUint32(entry + 24, true);
    const nameLength = view.getUint16(entry + 28, true);
    const local = view.getUint32(entry + 42, true);
    const name = decoder.decode(bytes.subarray(entry + 46, entry + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, decoder.decode(data));
    entry += 46 + nameLength;
  }
  return files;
}

const table: TableExport = {
  fileName: 'users',
  title: 'ผู้ใช้',
  columns: [{ header: 'Name' }, { header: 'Logins' }, { header: 'Joined', date: 'day' }],
  rows: [
    ['Somchai <Admin> & co', 12, new Date(2026, 9, 9, 14, 30)],
    ['=HYPERLINK("x")', null, null],
  ],
  csv: [],
};

describe('table export', () => {
  it('copies the title, a blank line, then tab-separated rows', () => {
    const text = copyText({ ...table, rows: [['Line\tone\ntwo', 3, new Date(2026, 9, 9)]] }, 'en-GB');
    expect(text.split('\n')).toEqual(['ผู้ใช้', '', 'Name\tLogins\tJoined', 'Line one two\t3\t9 Oct 2026']);
  });

  it('writes an .xlsx workbook: title, a bold header, text, numbers and dates', () => {
    const files = unzip(toXlsx({ name: 'Users: all [1]', title: table.title, header: table.columns.map(column => column.header), rows: table.rows, dayColumns: [2] }));
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml',
    ]);
    // Characters Excel does not allow in a sheet name are left out
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="Users  all  1" sheetId="1" r:id="rId1"/>');

    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('<c r="A1" s="2" t="inlineStr"><is><t xml:space="preserve">ผู้ใช้</t></is></c>');
    expect(sheet).toContain('<mergeCell ref="A1:C1"/>');
    expect(sheet).toContain('<c r="B2" s="1" t="inlineStr"><is><t xml:space="preserve">Logins</t></is></c>');
    expect(sheet).toContain('<t xml:space="preserve">Somchai &lt;Admin&gt; &amp; co</t>');
    expect(sheet).toContain('<c r="B3"><v>12</v></c>');
    // 9 October 2026, 14:30 as Excel counts it, as a day
    expect(sheet).toMatch(/<c r="C3" s="3"><v>46304\.60416666\d*<\/v><\/c>/);
    // Text that looks like a formula stays text; empty cells are left out
    expect(sheet).toContain('<t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t>');
    expect(sheet).not.toContain('r="B4"');
    expect(sheet).toContain('<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>');
  });

  it('leaves out the columns a format skips', () => {
    const withIds: TableExport = {
      ...table,
      columns: [{ header: 'Name' }, { header: 'Code', skip: ['copy', 'print'] }, { header: 'ID', skip: ['print'] }],
      rows: [['Somchai', 'user.updated', 'id-1']],
    };
    expect(forFormat(withIds, 'excel').columns.map(column => column.header)).toEqual(['Name', 'Code', 'ID']);
    expect(forFormat(withIds, 'copy').rows).toEqual([['Somchai', 'id-1']]);
    expect(forFormat(withIds, 'print').columns.map(column => column.header)).toEqual(['Name']);
    expect(forFormat(withIds, 'print').rows).toEqual([['Somchai']]);
  });

  it('names columns as Excel does', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  it('prints the title and every row, escaped', () => {
    const html = printHtml(table, { locale: 'en-GB', language: 'th', summary: '2 rows', fontBase: '/assets/fonts/sarabun/' });
    expect(html).toContain('<h1>ผู้ใช้</h1><p>2 rows</p>');
    expect(html).toContain('<td>Somchai &lt;Admin&gt; &amp; co</td><td>12</td><td class="date">9 Oct 2026</td>');
    expect(html).toContain('<td>=HYPERLINK(&quot;x&quot;)</td><td></td><td class="date"></td>');
    expect(html).toContain('@page{size:portrait');
  });
});
