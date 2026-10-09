/** Spreadsheet text (RFC 4180): commas, quoted fields with "" for a quote, line breaks inside quotes, CRLF or LF */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // Excel adds a byte order mark to UTF-8 files
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      // Quotes count only at the start of a field; elsewhere they are part of the text, as in O"Neil
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines carry no data
  return rows.filter(cells => cells.some(cell => cell.trim()));
}

/**
 * Rows as CSV text, quoting only the fields that need it. A cell that starts like a formula (= + - @) gets a
 * leading apostrophe, so a name such as =HYPERLINK(…) stays text when a spreadsheet opens the file.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const safe = (value: string) => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const escape = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return rows.map(row => row.map(cell => escape(safe(cell))).join(',')).join('\n');
}

/** Saves text as a file. The byte order mark keeps Thai readable when Excel opens a CSV. */
export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8;') {
  downloadBlob(fileName, new Blob(['﻿' + text], { type }));
}

/** Saves a file the page made, such as an Excel workbook */
export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
