import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideChevronRight, lucideHouse } from '@ng-icons/lucide';

export interface UiBreadcrumb {
  label: string;
  /** Router link; leave out for the current page */
  link?: string | unknown[];
}

/**
 * Top of a page: icon, title and description, with the breadcrumb trail leading into the title on the same
 * line (Users › Edit user) so it takes no extra row. Buttons placed inside appear on the right.
 *
 *   <ui-page-header title="Users" subtitle="Everyone who can sign in" [icon]="lucideUsers" [breadcrumbs]="[{ label: 'Management' }]">
 *     <button uiButton>Add user</button>
 *   </ui-page-header>
 */
@Component({
  selector: 'ui-page-header',
  imports: [RouterLink, NgIcon],
  template: `
    <div class="ui-page-head-row">
      @if (icon(); as svg) {
        <span class="ui-page-head-icon"><ng-icon [svg]="svg" /></span>
      }
      <div class="ui-page-head-text">
        <div class="ui-page-head-title-row">
          @if (breadcrumbs().length || homeLink()) {
            <nav class="ui-crumbs" [attr.aria-label]="breadcrumbLabel()">
              @if (homeLink()) {
                <a [routerLink]="homeLink()" [attr.aria-label]="homeLabel()"><ng-icon [svg]="homeIcon" /></a>
                <ng-icon [svg]="separatorIcon" class="ui-crumb-separator" />
              }
              @for (crumb of breadcrumbs(); track $index) {
                @if (crumb.link) {
                  <a [routerLink]="crumb.link">{{ crumb.label }}</a>
                } @else {
                  <span>{{ crumb.label }}</span>
                }
                <ng-icon [svg]="separatorIcon" class="ui-crumb-separator" />
              }
            </nav>
          }
          <h1 class="ui-page-head-title">{{ title() }}</h1>
        </div>
        @if (subtitle()) {
          <p class="ui-page-head-subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="ui-page-head-actions">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .ui-page-header {
      display: block;
      margin-bottom: 1.75rem;
      font-family: var(--ui-font);
    }

    .ui-page-head-title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .125rem .375rem;
    }

    .ui-crumbs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .375rem;
      color: var(--ui-muted);
      font-size: .9375rem;
      font-weight: 500;

      a {
        display: inline-flex;
        align-items: center;
        color: inherit;
        text-decoration: none;

        &:hover {
          color: var(--ui-primary-text);
        }
      }

      > a > ng-icon {
        font-size: 1.0625rem;
      }
    }

    .ui-crumb-separator {
      color: var(--ui-subtle);
      font-size: .875rem;

      .rtl &,
      [dir="rtl"] & {
        transform: scaleX(-1);
      }
    }

    .ui-page-head-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
    }

    .ui-page-head-icon {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border: 1px solid var(--ui-primary-soft);
      border-radius: var(--ui-radius-lg);
      background: linear-gradient(145deg, var(--ui-primary-soft), transparent);
      color: var(--ui-primary-text);
      font-size: 1.375rem;
    }

    .ui-page-head-text {
      flex: 1 1 260px;
      min-width: 0;
    }

    .ui-page-head-title {
      margin: 0;
      color: var(--ui-heading);
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -.02em;
      // Room for Thai vowels and tone marks when the title wraps
      line-height: 1.35;
    }

    .ui-page-head-subtitle {
      margin: .25rem 0 0;
      color: var(--ui-muted);
      font-size: .875rem;
    }

    .ui-page-head-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .5rem;

      &:empty {
        display: none;
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-page-header' },
})
export class UiPageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  /** SVG markup, for example a Lucide icon */
  readonly icon = input<string>();
  readonly breadcrumbs = input<UiBreadcrumb[]>([]);
  /** Screen reader name of the breadcrumb trail */
  readonly breadcrumbLabel = input('Breadcrumb');
  /** Link for a house icon at the start of the trail, for example '/'. Off by default: next to the page icon it reads as a second icon */
  readonly homeLink = input<string | unknown[]>('');
  readonly homeLabel = input('Home');

  protected readonly homeIcon = lucideHouse;
  protected readonly separatorIcon = lucideChevronRight;
}
