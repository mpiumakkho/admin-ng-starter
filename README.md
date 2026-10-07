# Admin Dashboard

A user management admin built with Angular 22: an overview, users, roles and permissions, and an activity log. It is one Angular app: copy the project to start another admin. User management itself (its pages, data layer and UI) is one folder, `src/app/user-management`, which can also be copied into an existing app; [its README](src/app/user-management/README.md) lists the steps.

## Requirements

- Node.js `^22.22.3`, `^24.15.0` or `>=26.0.0`
- npm

## Getting started

```bash
npm install
npm start
```

Then open `http://localhost:4200/`. The app reloads when a source file changes.

The app runs on sample data saved in the browser, so you can add, edit and delete freely. To start over, clear the `admin-data-v3` key in `localStorage`.

Sign in with one of the sample accounts the sign-in page offers, one per role. Each sees only what its role allows:

| Role | Can |
| --- | --- |
| Administrator | Everything, except changing the permissions of the Administrator role they hold |
| Manager | Add, invite and edit people whose role is Manager or below; read roles, the activity log (and export it) and the settings |
| Support | Edit people whose role is Support or Viewer; read roles and the activity log |
| Viewer | Read users and roles |

Any active user's email works too, with any password of 6 or more characters, until that user sets their own password or turns on two-step sign-in (account menu, Security and devices).

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Runs the dev server |
| `npm run build` | Builds the app for production into `dist/admin-dashboard` |
| `npm run watch` | Rebuilds the development bundle on change |
| `npm test` | Runs the unit tests with Vitest |
| `npm run e2e` | Runs the end-to-end tests in `e2e/` with Playwright, in the installed Google Chrome, against the dev server (started if it is not running) |

## Pages

| Route | Page |
| --- | --- |
| `/overview` | Totals, new users per month, users by role, department and status, recent activity |
| `/users` | Search, filter, sort and page through users; select several to activate, suspend or delete them; export to CSV, or import many users from a CSV file, with every row checked before anything is saved |
| `/users/new`, `/users/:id/edit` | Add or edit a user. Leaving with unsaved changes asks first |
| `/users/:id` | A user's profile, permissions, activity and security: two-step sign-in, password and signed-in devices |
| `/roles` | Create roles and choose their permissions. Built-in roles and roles that still have users cannot be deleted |
| `/activity` | Every change as a table: when, who, what, the fields that changed, and the IP address and device. Filter by time range, person and type; open a row for the full record with before and after values; export to CSV. `?user=<id>` narrows it to what one person did or had done to them, as the account menu's "My activity" and a profile's "View in activity log" open it |
| `/settings` | The default role for new users, allowed email domains, how long invitations last, and signing out when idle |
| `/login` | Sign-in page. Every other page needs someone signed in, and opens only if their role allows it |
| `/ui-kit` | Every piece in `user-management/ui` with a usage snippet. It is not in the sidebar; open it from the account menu |

## Project layout

- `src/app/user-management` is user management, whole:
  - `overview`, `users`, `roles` and `activity` are the pages; `user-management.routes.ts` lazy loads them.
  - `access` decides who may do what: `Session` knows who is signed in and what their role allows, and the guards keep people out of pages their role does not allow.
  - `data` is the data layer. `models.ts` has the types and `catalog.ts` the permissions, departments and status labels. `AdminApi` (`admin-api.ts`) is the contract with the server; `LocalAdminApi` implements it with `localStorage` and the sample data in `mock-data.ts`, and `HttpAdminApi` calls a real server. `AdminStore` keeps users, roles and activity as signals for the pages and sends every change through `AdminApi`.
  - `shared` has pieces several pages use: status and role badges, the activity sentence, date pipes, error messages.
  - `ui` has the building blocks the pages are made of. See [its README](src/app/user-management/ui/README.md).
- `src/app/layout` is the app around it: navbar, sidebar, footer and the language switch. The sidebar shows the groups in `src/app/layout/sidebar/menu.ts`: each part of the app is one dropdown (user management's comes from `USER_MANAGEMENT_MENU`), open on its own pages, with a chevron that turns clockwise as it opens. Pages the signed-in user's role does not allow are left out. In the icon-only layout a group opens as a flyout on hover.
- `src/app/auth` is the sign-in page, `src/app/error-pages` the 404 and 500 pages, and `src/app/ui-kit` the component reference.
- `src/assets/scss` is the Bootstrap 4 theme used by the layout. User management uses its own `ui` theme instead.
- `e2e` holds the end-to-end tests: signing in, what each role can and cannot do, profiles, import and settings.

## Connecting a real API

Implement the endpoints in [src/app/user-management/API.md](src/app/user-management/API.md) on your server, then switch to `HttpAdminApi` in `src/app/app.config.ts`:

```ts
provideUserManagement({ api: HttpAdminApi, apiUrl: 'https://admin.example.com/api' }),
```

Nothing else changes: the pages only talk to `AdminStore` and `Session`. The server keeps the session, checks every request against the signed-in user's permissions, and writes the activity log. API.md lists the rules it must check and the error codes the pages understand.

## Languages

The UI supports Thai (`th`, the default) and English (`en`). Each part keeps its own translation files, and the app loads both:

- `src/assets/i18n/th.json` and `en.json` for the app around user management: navbar, sign-in, error pages, UI kit.
- `src/app/user-management/i18n/th.json` and `en.json` for user management. `angular.json` publishes them as `assets/i18n/user-management/`.

The Thai and English files of each part must have the same keys. Keys are the English text, except for messages with values such as `toast.deleted` or `activity.user.created`.

In templates, translate text with the pipe:

```html
<span>{{ 'Users' | translate }}</span>
```

The `ui` components never translate on their own: pass them translated text through their inputs. To add a language, add its JSON file and an entry in `LANGUAGES` in `src/app/layout/language.service.ts`. The language a visitor picks is stored in `localStorage`.

## Font

The app uses [Sarabun](https://github.com/cadsondemak/Sarabun) for Thai and English, kept in the project, so no font service is needed and the text looks the same offline or behind a firewall.

- The files are in `src/assets/fonts/sarabun`: weights 300 to 700, each split into Thai, Latin and accented Latin, so a page downloads only what it shows (about 10 KB per file). The license, SIL Open Font License 1.1, is `OFL.txt` beside them.
- `src/assets/scss/_fonts.scss` declares them. The build gives them hashed names in `media/`, so browsers cache them safely.
- `$font-family-sans-serif` in `src/assets/scss/_tokens.scss` (the layout) and `--ui-font` in `src/app/user-management/ui/ui.scss` (user management) put Sarabun first.
- Sarabun's letters run smaller than the font the sizes were first set for (x-height 0.50 against 0.55), so `size-adjust: 106%` in each `@font-face` draws them a little larger. Every font size keeps its intended look and the layout does not move; change that one value to make all text larger or smaller.
- The "Admin" wordmark in `src/assets/images/logo.svg` and `logo-light.svg` is Sarabun Bold drawn as outlines, so it matches without loading a font.

Headings have a line height of at least 1.35, so Thai vowels and tone marks stacked above and below the letters have room when a title wraps.

## Themes

The app has a light theme (white sidebar) and a dark theme (slate). Visitors switch with the sun/moon button in the navbar. The choice is stored in `localStorage`; without one, the app follows the system setting.

- `UiThemeService` from `user-management/ui` sets `theme-light` or `theme-dark` on `<body>`. A small script in `src/index.html` sets the same class before the app starts, so the page never flashes the wrong theme.
- User management takes its colors from the `--ui-*` variables in `src/app/user-management/ui/ui.scss`, which switch with the theme.
- The layout's dark styles live in `src/assets/scss/_dark.scss`.

## Notes

- The layout theme is written for Bootstrap 4. `ng-bootstrap` (used by the sidebar) expects Bootstrap 5, so `src/assets/scss/components/plugin-overrides/_ng-bootstrap.scss` maps the few classes and custom properties it needs.
- The layout SCSS uses `@import` and the older Sass color functions. Their deprecation warnings are silenced in `angular.json`, and the code needs migrating to `@use` before Dart Sass 3.
