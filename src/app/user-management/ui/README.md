# ui

The building blocks user management is made of, for Angular 22, with light and dark themes. They are standalone, use signals, and need no CSS framework or translation library: every piece of text comes in through an input, so the app decides the language.

They come with user management (see [../README.md](../README.md)); nothing here is built or installed on its own. Open `/ui-kit` to see every piece with a usage snippet.

Selectors start with `ui-` (`<ui-card>`, `button[uiButton]`), classes with `Ui` (`UiCard`) and CSS variables with `--ui-`.

The folder also works alone, for a dashboard that needs the components but not user management: copy it, install `@angular/cdk`, `@ng-icons/core` and `@ng-icons/lucide` (plus `chart.js` and `ng2-charts` for `charts/`), and add `ui.scss` to the `styles` in `angular.json`.

## Theme

`ui.scss` defines the `--ui-*` color, radius, shadow and font variables and the shared `.ui-input` and `.ui-table` classes. Put `theme-dark` on `<body>` (or `data-theme="dark"` on any element) for the dark theme; `UiThemeService` does this for you and remembers the choice:

```ts
readonly theme = inject(UiThemeService);
// theme.toggle(), theme.set('dark'), theme.isDark()
```

Change the look by overriding the variables, for example `--ui-primary`, `--ui-radius` or `--ui-font`. `--ui-font` starts with Sarabun, which this project ships in `src/assets/fonts/sarabun`; an app without it gets the system font instead.

Icons are passed as SVG strings, so import only the ones you use:

```ts
import { lucideUsers } from '@ng-icons/lucide';

<ui-stat-card label="Users" [value]="1284" [icon]="lucideUsers" tone="primary" [trend]="4.2" hint="vs last month" />
```

## Components

| Group | Pieces |
| --- | --- |
| Actions and surfaces | `uiButton` on `<button>` or `<a>`, `ui-card` (`uiCardActions`, `uiCardFooter`, `fit` to take its parent's height, so a long table scrolls inside and the pagination under a short one stays at the bottom, `fill` to take all of it, the body scrolling and, while it does, focusable by keyboard), `ui-page-header` (`breadcrumbLabel` names the trail for screen readers), `ui-dialog` (`dismissible` false for a question that must be answered), `ui-alert` (a tinted message in the page), `UiConfirmService` (`ask` for yes or no, `prompt` for a line of text with it, such as a reason, required or not), `UiToastService` with `<ui-toaster>` (`inline` to show them in the page), `uiMenuTrigger` (`menuOpened` and `menuClosed` events) with `ui-menu`, `uiMenuItem`, `uiMenuItemRadio`, `uiMenuItemCheckbox` and `uiMenuHeading` |
| Data display | `ui-badge`, `ui-avatar`, `ui-person`, `ui-icon-chip`, `ui-trend`, `ui-stat-card` (`trendSuffix=""` for a change in counts, content inside goes under the number, wrap it in an `<a>` to make the whole card a link), `ui-split-bar` (one bar split by status or kind, with a legend), `ui-empty-state`, `ui-timeline`, `ui-detail-list` (a `labelTitle` on an item says what an abbreviation in its label stands for), `ui-progress`, `ui-chart-legend` (an item with `link` and `queryParams` is a link) |
| Navigation and filters | `ui-segmented` (pills or underline tabs; an option's `ariaLabel` and `lang` let a short label such as "EN" be read as "English", and `disabled` shows it without letting it be picked), `ui-search-input` (`size="sm"` for toolbars), `ui-filter-chips` (`scroll` keeps them on one line that scrolls sideways, for phones), `ui-pagination` (at most five page numbers around the current one; with more pages, first and last buttons too) |
| Tables | `UiTableState` (search, filters, sort, paging and selection as signals; `selectable` limits which rows can be ticked, `pageSizeKey` remembers the reader's page size in the browser), `table[uiTable]` (`dense` for tighter rows), `ui-sort-header`, `ui-bulk-bar`, `ui-page-size` (the "1–10 of 48" button that picks rows per page). `[uiTableMinRows]` on `.ui-table-scroll` keeps a short last page as tall as a full one, and `[uiTableScrollReset]="table"` scrolls it back to the top when the page, page size, sort, search or filters change. Headers stay in view when the table scrolls inside `.ui-table-scroll` |
| Forms | `ui-form-field` (label, hint, errors), `uiInput`, `ui-checkbox`, `ui-switch`, `ui-choice-cards` (a choice with `disabled` shows but cannot be picked), `ui-file-dropzone` (`compact` for one row) |
| Charts (`charts/`) | `ui-chart` draws a Chart.js chart that follows the theme; put it in `@defer` and Chart.js loads only when the chart shows. `UI_CHART_PALETTE` and `areaFill()` (in `chart-colors.ts`) load no Chart.js |

Accessibility beyond WCAG 2.2 AA, for everything built from these pieces: focus shows as a solid 2px ring in `--ui-focus`, 2px off the edge, and text fields turn their border and a ring just outside it that colour (2.4.13); with `prefers-reduced-motion`, animations and transitions end at once and charts draw without animating, while spinners keep turning (2.3.3); `<abbr title>` gets a dotted underline (3.1.4); a table's rows scroll clear of its header row when they get focus (2.4.12); and with forced colors (Windows contrast themes) chosen options, the current page, ticked boxes and switches are drawn in the system's highlight.

`UiAccessibleViewService` turns on the accessible view, the pieces as they meet WCAG 2.2 AAA: it puts `ui-aaa` on `<body>`, and `ui.scss` makes every control at least 44 pixels square and text 7:1 against its background, spaces lines 1.5 and stops all motion. The components follow it too: `UiToastService` keeps messages until they are dismissed (show them in the page with `<ui-toaster inline />`), `ui-avatar` uses darker colors behind initials, and `ui-chart` writes the numbers on a bar chart and draws without animating. `uiMenuItemCheckbox` is a menu item that turns something on or off, such as this view. A `ui-dialog` with `[dismissible]="false"` closes only with its own buttons: not with Escape, a close button or a click outside it.

Form controls implement `ControlValueAccessor`, so they work with `formControlName` and `ngModel`. `ui-form-field` shows the errors of the control inside it once the control is touched or changed:

```html
<ui-form-field label="Email" for="email" required [errors]="{ required: 'Enter your email.', email: 'Check the address.' }">
  <input uiInput id="email" formControlName="email" />
</ui-form-field>
```

A table keeps its own markup; `UiTableState` only does the work:

```ts
readonly table = new UiTableState({
  rows: this.users,
  id: user => user.id,
  search: (user, query) => user.name.toLowerCase().includes(query),
  sorters: { name: (a, b) => a.name.localeCompare(b.name) },
  pageSize: 10,
});
```

```html
@for (user of table.pageRows(); track user.id) { ... }
<ui-pagination [(page)]="table.page" [pageCount]="table.pageCount()" />
```

## Tests

Their unit tests run with the app's: `npm test`.
