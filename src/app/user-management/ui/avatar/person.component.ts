import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

import { UiAvatar, UiAvatarSize } from './avatar.component';

/**
 * Avatar with a name and a second line (email, role, job title). Extra content appears after the name.
 *
 *   <ui-person name="Henry Klein" detail="henry@example.com" src="..." />
 */
@Component({
  selector: 'ui-person',
  imports: [UiAvatar],
  template: `
    <ui-avatar [name]="name()" [src]="src()" [size]="size()" />
    <span class="ui-person-text">
      <span class="ui-person-name">{{ name() }}<ng-content /></span>
      @if (detail()) {
        <span class="ui-person-detail">{{ detail() }}</span>
      }
    </span>
  `,
  styles: `
    .ui-person {
      display: inline-flex;
      align-items: center;
      gap: .75rem;
      min-width: 0;
      font-family: var(--ui-font);
      // A photo's baseline is its bottom edge, so baseline alignment would make photo rows taller than initials rows
      vertical-align: middle;
    }

    .ui-person-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.35;
    }

    .ui-person-name {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      overflow: hidden;
      color: var(--ui-heading);
      font-size: .875rem;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ui-person-detail {
      overflow: hidden;
      color: var(--ui-muted);
      font-size: .75rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-person' },
})
export class UiPerson {
  readonly name = input('');
  readonly detail = input('');
  readonly src = input<string | null | undefined>('');
  readonly size = input<UiAvatarSize>('sm');
}
