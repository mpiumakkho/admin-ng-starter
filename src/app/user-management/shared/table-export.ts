import { XlsxCell } from './xlsx';

/*
 * What a page hands the Export menu: its rows as people read them (for copying, Excel and printing) and as data (for
 * CSV, which keeps the plain values an import reads back).
 */

/** The formats that show the rows as people read them; CSV has its own columns */
export type ExportFormat = 'copy' | 'excel' | 'print';

export interface ExportColumn {
  header: string;
  /** The column holds dates: shown as a day, or with the time */
  date?: 'day' | 'time';
  /** Formats that leave the column out, such as an id nobody reads on paper */
  skip?: readonly ExportFormat[];
}

export interface TableExport {
  /** The file name, without the extension */
  fileName: string;
  /** Above the rows in a copy, an Excel sheet and a printout; also the sheet's name */
  title: string;
  columns: readonly ExportColumn[];
  rows: readonly (readonly XlsxCell[])[];
  /** The CSV file, header first */
  csv: readonly (readonly string[])[];
}

/** The table with only the columns a format carries */
export function forFormat(table: TableExport, format: ExportFormat): TableExport {
  const kept = table.columns.flatMap((column, index) => column.skip?.includes(format) ? [] : [index]);
  if (kept.length === table.columns.length) {
    return table;
  }
  return { ...table, columns: kept.map(index => table.columns[index]), rows: table.rows.map(row => kept.map(index => row[index])) };
}

/** How a cell reads in a copy or a printout */
export function cellText(value: XlsxCell, column: ExportColumn | undefined, locale: string): string {
  if (value instanceof Date) {
    return new Intl.DateTimeFormat(locale, column?.date === 'day'
      ? { dateStyle: 'medium' }
      : { dateStyle: 'medium', timeStyle: 'short' }).format(value);
  }
  return value === null || value === undefined ? '' : String(value);
}

/**
 * The text a copy puts on the clipboard, as DataTables copies a table: the title, a blank line, then the header and
 * the rows with a tab between cells, so it pastes into a spreadsheet as columns.
 */
export function copyText(table: TableExport, locale: string): string {
  // A tab or line break inside a cell would split it
  const clean = (text: string) => text.replace(/[\t\r\n]+/g, ' ');
  const lines = [
    table.columns.map(column => clean(column.header)).join('\t'),
    ...table.rows.map(row => row.map((value, index) => clean(cellText(value, table.columns[index], locale))).join('\t')),
  ];
  return [table.title, '', ...lines].join('\n');
}

/** A page with the title and the whole table, for the browser to print */
export function printHtml(table: TableExport, options: { locale: string; language: string; summary: string; fontBase: string }): string {
  const { locale, language, summary, fontBase } = options;
  const font = (subset: string, weight: number, range: string) =>
    `@font-face{font-family:Sarabun;font-weight:${weight};font-display:block;src:url('${fontBase}sarabun-${subset}-${weight}-normal.woff2') format('woff2');unicode-range:${range}}`;
  const thai = 'U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC';
  const latin = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const head = table.columns.map(column => `<th>${escapeHtml(column.header)}</th>`).join('');
  const body = table.rows.map(row => `<tr>${table.columns.map((column, index) =>
    `<td${column.date ? ' class="date"' : ''}>${escapeHtml(cellText(row[index], column, locale))}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="${escapeHtml(language)}"><head><meta charset="utf-8"><title>${escapeHtml(table.title)}</title><style>`
    + [font('thai', 400, thai), font('latin', 400, latin), font('thai', 600, thai), font('latin', 600, latin)].join('')
    // Wide tables print across the page
    + `@page{size:${table.columns.length > 6 ? 'landscape' : 'portrait'};margin:12mm}`
    + `body{margin:0;color:#0f172a;font:11px/1.45 Sarabun,system-ui,sans-serif}`
    + `h1{margin:0 0 2px;font-size:18px;font-weight:600}`
    + `p{margin:0 0 10px;color:#475569}`
    + `table{width:100%;border-collapse:collapse}`
    + `th,td{padding:4px 6px;border:1px solid #cbd5e1;text-align:start;vertical-align:top}`
    + `th{background:#f1f5f9;font-weight:600}`
    // A date stays on one line rather than make its row three lines tall
    + `.date{white-space:nowrap}`
    // The header repeats on every page, and a row is never split across two
    + `thead{display:table-header-group}tr{break-inside:avoid}`
    + `</style></head><body><h1>${escapeHtml(table.title)}</h1><p>${escapeHtml(summary)}</p>`
    + `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

/**
 * Prints a page without leaving this one: it loads in a hidden frame, which goes away once printing is done. Only
 * one at a time.
 */
export function printPage(document: Document, html: string): void {
  document.querySelector('iframe.table-print-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.className = 'table-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  frame.addEventListener('load', async () => {
    const view = frame.contentWindow;
    if (!view) {
      return;
    }
    // Thai needs its font before the page is laid out for printing
    await view.document.fonts?.ready;
    view.addEventListener('afterprint', () => frame.remove(), { once: true });
    view.focus();
    view.print();
  }, { once: true });
  frame.srcdoc = html;
  document.body.append(frame);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
