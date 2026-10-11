import { Component, input, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck, lucideCopy, lucideDownload } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';

import { downloadText } from '../shared/csv';
import { UiAlert, UiButton } from '../ui';

/**
 * Recovery codes, shown once when they are made (API.md, "Recovery codes"): each stands in for a code from the app,
 * once, when the phone is lost. People copy or download them to keep somewhere safe, such as a password manager.
 */
@Component({
  selector: 'app-recovery-codes',
  imports: [NgIcon, TranslatePipe, UiAlert, UiButton],
  template: `
    <ui-alert tone="warning">{{ 'recoveryCodesOnce' | translate }}</ui-alert>
    <ol class="recovery-codes" [attr.aria-label]="'Recovery codes' | translate">
      @for (code of codes(); track code) {
        <li><code>{{ code }}</code></li>
      }
    </ol>
    <div class="recovery-actions">
      <button uiButton variant="secondary" size="sm" type="button" (click)="copy()">
        <ng-icon [svg]="copied() ? icons.done : icons.copy" /> {{ (copied() ? 'Copied' : 'Copy all') | translate }}
      </button>
      <button uiButton variant="secondary" size="sm" type="button" (click)="download()">
        <ng-icon [svg]="icons.download" /> {{ 'Download' | translate }}
      </button>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: .75rem; }
    .recovery-codes {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .375rem .75rem;
      margin: 0;
      padding: .75rem 1rem .75rem 2rem;
      border-radius: var(--ui-radius);
      background: var(--ui-surface-muted);
    }
    .recovery-codes code { color: var(--ui-heading); font-family: var(--ui-font-mono); font-size: .875rem; letter-spacing: .04em; }
    .recovery-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
  `,
})
export class RecoveryCodes {
  readonly codes = input.required<string[]>();

  protected readonly icons = { copy: lucideCopy, done: lucideCheck, download: lucideDownload };
  protected readonly copied = signal(false);

  protected async copy() {
    await navigator.clipboard?.writeText(this.codes().join('\n')).catch(() => undefined);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  protected download() {
    downloadText('recovery-codes.txt', this.codes().join('\n') + '\n', 'text/plain;charset=utf-8;');
  }
}
