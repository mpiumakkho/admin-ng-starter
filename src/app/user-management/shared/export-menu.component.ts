import { Component, DOCUMENT, inject, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideChevronDown, lucideCopy, lucideDownload, lucideFileSpreadsheet, lucideFileText, lucidePrinter } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { UiButton, UiMenu, UiMenuItem, UiMenuTrigger, UiToastService } from '../ui';
import { downloadBlob, downloadText, toCsv } from './csv';
import { intlLocale } from './formatting';
import { copyText, forFormat, printHtml, printPage, TableExport } from './table-export';
import { toXlsx } from './xlsx';

/**
 * Export as DataTables offers it: copy to the clipboard, an Excel file, a CSV file or a printout. Every format holds
 * the rows the page shows, filtered and sorted, from all its pages.
 *
 *   <app-export-menu [source]="exportTable" />
 */
@Component({
  selector: 'app-export-menu',
  imports: [NgIcon, TranslatePipe, UiButton, UiMenu, UiMenuItem, UiMenuTrigger],
  template: `
    <button uiButton variant="secondary" type="button" [uiMenuTrigger]="menu">
      <ng-icon [svg]="icons.export" /> {{ 'Export' | translate }} <ng-icon class="export-caret" [svg]="icons.caret" />
    </button>
    <ng-template #menu>
      <ui-menu [attr.aria-label]="'Export' | translate">
        <button uiMenuItem [icon]="icons.copy" (triggered)="copy()">{{ 'Copy' | translate }}</button>
        <button uiMenuItem [icon]="icons.excel" (triggered)="excel()">Excel</button>
        <button uiMenuItem [icon]="icons.csv" (triggered)="csv()"><abbr [title]="'abbr.csv' | translate">CSV</abbr></button>
        <button uiMenuItem [icon]="icons.print" (triggered)="print()">{{ 'Print' | translate }}</button>
      </ui-menu>
    </ng-template>
  `,
  // The button lines up with the others in the page header as if it stood there itself
  styles: `
    :host { display: contents; }
    .export-caret { margin-inline-start: -.125rem; opacity: .7; }
  `,
})
export class ExportMenu {
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly document = inject(DOCUMENT);

  /** Builds the export when a format is picked, from the rows as the page shows them at that moment */
  readonly source = input.required<() => TableExport>();

  protected readonly icons = {
    export: lucideDownload, caret: lucideChevronDown, copy: lucideCopy, excel: lucideFileSpreadsheet, csv: lucideFileText, print: lucidePrinter,
  };

  private language() {
    return this.translate.currentLang() ?? 'en';
  }

  protected async copy() {
    const table = forFormat(this.source()(), 'copy');
    try {
      await navigator.clipboard.writeText(copyText(table, intlLocale(this.language())));
      this.toast.show(this.translate.instant('toast.copied', { count: table.rows.length }));
    } catch {
      this.toast.show(this.translate.instant('Could not copy to the clipboard.'), 'error');
    }
  }

  protected excel() {
    const table = forFormat(this.source()(), 'excel');
    const bytes = toXlsx({
      name: table.title,
      title: table.title,
      header: table.columns.map(column => column.header),
      rows: table.rows,
      dayColumns: table.columns.flatMap((column, index) => column.date === 'day' ? [index] : []),
    });
    downloadBlob(`${table.fileName}.xlsx`, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    this.toast.show(this.translate.instant('toast.exported', { count: table.rows.length }));
  }

  protected csv() {
    const table = this.source()();
    downloadText(`${table.fileName}.csv`, toCsv(table.csv));
    this.toast.show(this.translate.instant('toast.exported', { count: table.rows.length }));
  }

  protected print() {
    const table = forFormat(this.source()(), 'print');
    const locale = intlLocale(this.language());
    const printed = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    printPage(this.document, printHtml(table, {
      locale,
      language: this.language(),
      summary: this.translate.instant('printSummary', { count: table.rows.length, date: printed }),
      fontBase: new URL('assets/fonts/sarabun/', this.document.baseURI).href,
    }));
  }
}
