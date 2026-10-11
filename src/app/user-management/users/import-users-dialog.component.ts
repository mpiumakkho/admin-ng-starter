import { Component, computed, inject, model, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck, lucideDownload, lucideFileSpreadsheet } from '@ng-icons/lucide';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Session } from '../access/session';
import { AdminStore } from '../data/admin-store';
import { DEPARTMENTS } from '../data/catalog';
import { RoleGrant, UserStatus } from '../data/models';
import { checkImportRows, IMPORT_COLUMNS } from '../data/user-import';
import { downloadText, parseCsv, toCsv } from '../shared/csv';
import { errorMessage } from '../shared/errors';
import { translationsChanged } from '../shared/i18n';
import { UiAlert, UiButton, UiDialog, UiDialogFooter, UiFileDropzone, UiOption, UiSegmented, UiTable, UiToastService } from '../ui';

/** The most rows one import takes */
const MAX_ROWS = 500;

/**
 * Adds users from a CSV file. Every row is checked as the server would before anything is saved; rows with
 * problems are listed and left out.
 */
@Component({
  selector: 'app-import-users-dialog',
  imports: [NgIcon, TranslatePipe, UiAlert, UiButton, UiDialog, UiDialogFooter, UiFileDropzone, UiSegmented, UiTable],
  templateUrl: './import-users-dialog.component.html',
  styleUrl: './import-users-dialog.component.scss',
})
export class ImportUsersDialog {
  private readonly store = inject(AdminStore);
  private readonly session = inject(Session);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(UiToastService);
  private readonly i18n = translationsChanged();

  readonly open = model(false);

  protected readonly icons = { file: lucideFileSpreadsheet, template: lucideDownload, ok: lucideCircleCheck, problem: lucideCircleAlert };
  protected readonly fileName = signal('');
  /** The file's rows, header first; null before a file is picked */
  private readonly cells = signal<string[][] | null>(null);
  protected readonly status = signal<UserStatus>('invited');
  protected readonly importing = signal(false);
  protected readonly tooMany = signal(false);

  protected readonly statusOptions = computed<UiOption<UserStatus>[]>(() => {
    this.i18n();
    return [
      { value: 'invited', label: this.translate.instant('Send invitations') },
      { value: 'active', label: this.translate.instant('Add as active') },
    ];
  });

  protected readonly result = computed(() => {
    const cells = this.cells();
    if (!cells) {
      return null;
    }
    const settings = this.store.settings();
    return checkImportRows(cells, {
      roles: this.store.roles(),
      takenEmails: new Set(this.store.users().map(user => user.email.toLowerCase())),
      allowedDomains: settings.allowedDomains,
      defaultRoleId: settings.defaultRoleId,
      canAssign: role => this.session.canAssign(role),
      status: this.status(),
    });
  });

  protected readonly ready = computed(() => this.result()?.rows.filter(row => !row.problems.length) ?? []);
  protected readonly withProblems = computed(() => this.result()?.rows.filter(row => row.problems.length).length ?? 0);

  protected roleNames(grants: RoleGrant[]) {
    return grants.map(grant => this.store.rolesById().get(grant.roleId)?.name).filter(Boolean).join(', ') || '—';
  }

  protected async pick(file: File) {
    const cells = parseCsv(await file.text());
    this.tooMany.set(cells.length - 1 > MAX_ROWS);
    this.fileName.set(file.name);
    this.cells.set(cells.slice(0, MAX_ROWS + 1));
  }

  protected chooseAgain() {
    this.cells.set(null);
    this.fileName.set('');
    this.tooMany.set(false);
  }

  /** A file with the columns and two sample rows, to fill in */
  protected downloadTemplate() {
    const roles = this.store.roles().filter(role => this.session.canAssign(role));
    downloadText('users-template.csv', toCsv([
      [...IMPORT_COLUMNS],
      ['Ann', 'Smith', 'ann.smith@example.com', '0812345678', DEPARTMENTS[0], roles[0]?.name ?? ''],
      ['Somchai', 'Jaidee', 'somchai.j@example.com', '', DEPARTMENTS[1], roles.at(-1)?.name ?? ''],
    ]));
  }

  protected async import() {
    const drafts = this.ready().map(row => row.draft);
    if (!drafts.length) {
      return;
    }
    this.importing.set(true);
    try {
      await this.store.createUsers(drafts);
      this.toast.show(this.translate.instant('toast.imported', { count: drafts.length }));
      this.close();
    } catch (error) {
      this.toast.show(this.translate.instant(errorMessage(error)), 'error');
    } finally {
      this.importing.set(false);
    }
  }

  protected close() {
    this.open.set(false);
    this.chooseAgain();
  }
}
