import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AdminStore } from '../data/admin-store';
import { ACTIVITY_META } from '../data/catalog';
import { Activity, fullName } from '../data/models';
import { LocalNamePipe } from './formatting';

// Placeholders handed to the translation, then swapped for the names. Names are inserted as text,
// never as HTML, because they come from user data.
const TOKENS = { actor: '{actor}', target: '{target}' };

/** One activity entry as a sentence, such as "Henry Klein suspended Jane Doe", with the names in bold */
@Component({
  selector: 'app-activity-text',
  imports: [TranslatePipe, LocalNamePipe],
  template: `
    @for (part of split(message() | translate: tokens); track $index) {
      @if (part === tokens.actor) {
        <b>{{ actor() }}</b>
      } @else if (part === tokens.target) {
        <b>{{ entry().targetLabel | localName }}</b>
      } @else {
        {{ part }}
      }
    }
  `,
  styles: `b { color: var(--ui-heading); font-weight: 600; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityText {
  private readonly store = inject(AdminStore);
  private readonly translate = inject(TranslateService);
  readonly entry = input.required<Activity>();

  protected readonly tokens = TOKENS;
  protected readonly message = computed(() => ACTIVITY_META[this.entry().action].message);
  protected readonly actor = computed(() => {
    const user = this.store.usersById().get(this.entry().actorId ?? '');
    return user ? fullName(user) : this.entry().actorId === null ? this.translate.instant('System') : '—';
  });

  protected split(text: string): string[] {
    return text.split(/(\{actor\}|\{target\})/).filter(Boolean);
  }
}
