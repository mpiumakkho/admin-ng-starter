# Admin Dashboard

A user management admin built with Angular 22: an overview, users, roles and permissions, and an activity log. It is one Angular app: copy the project to start another admin. User management itself (its pages, data layer and UI) is one folder, `src/app/user-management`, which can also be copied into an existing app; [its README](src/app/user-management/README.md) lists the steps.

**API contract:** [`src/app/user-management/API.md`](src/app/user-management/API.md) says what a server must do for the app: every request, its permission, and the errors it may answer. The server in [admin-api-starter](https://github.com/mpiumakkho/admin-api-starter) does all of it; its [API coverage](https://github.com/mpiumakkho/admin-api-starter/blob/main/docs/API-COVERAGE.md) lists each request beside the code and the tests that answer it.

## Requirements

- Node.js `^22.22.3`, `^24.15.0` or `>=26.0.0`
- npm

## Getting started

```bash
npm install
npm start
```

Then open `http://localhost:4200/`. The app reloads when a source file changes.

The app runs on sample data saved in the browser, so you can add, edit and delete freely. To start over, clear the `admin-data-v5` key in `localStorage`.

Sign in with one of the sample accounts the sign-in page offers, one per role. Each sees only what its role allows:

| Role | Can |
| --- | --- |
| Administrator | Everything, except changing the permissions of the Administrator role they hold |
| Manager | Add, invite and edit people whose role is Manager or below; read roles, the activity log (and export it) and the settings |
| Support | Edit people whose role is Support or Viewer; read roles and the activity log |
| Viewer | Read users and roles |
| Branch manager | Viewer for everyone, and Manager in Chiang Mai only: add, invite and edit the people of Chiang Mai whose roles allow no more than theirs, and read their activity |

Any active user's email works too, with any password of 6 or more characters, until that user sets their own password or turns on two-step sign-in (account menu, Security and devices).

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Runs the dev server, forwarding `/api` to `http://localhost:8080` for a real API |
| `npm run build` | Builds the app for production into `dist/admin-dashboard` |
| `npm run watch` | Rebuilds the development bundle on change |
| `npm test` | Runs the unit tests with Vitest |
| `npm run e2e` | Runs the end-to-end tests in `e2e/` with Playwright, in the installed Google Chrome, against the dev server (started if it is not running) |
| `npm run check-i18n` | Checks the translations: every language has the same keys as English, none empty, and every key the code names is translated |

GitHub Actions (`.github/workflows/ci.yml`) runs the translation check, the unit tests, the build and the end-to-end tests on every push and pull request.

## Pages

| Route | Page |
| --- | --- |
| `/overview` | Totals, new users per month, users by role, department and status, recent activity |
| `/users` | Search, filter, sort and page through users; select several to activate, suspend, delete them or give them all one role; export what the list shows (copy, Excel, CSV or print), or import many users from a CSV file, with every row checked before anything is saved |
| `/users/new`, `/users/:id/edit` | Add or edit a user. Leaving with unsaved changes asks first |
| `/users/:id` | A user's profile, permissions, activity and security: two-step sign-in, password and signed-in devices |
| `/roles` | Create roles and choose their permissions. Built-in roles and roles that still have users cannot be deleted |
| `/roles/conflicts` | Roles nobody may hold at the same time, and the people who held them before a rule was made, to fix |
| `/branches` | Sites and offices people belong to: search by name or code, filter open or closed, sort and page through them; add, rename, close or delete them, with how many people and roles each has. Shown once the settings turn branches on; roles can then be given for one branch only |
| `/activity` | Every change as a table: when, who, what, the fields that changed, why (when a reason was given), and the IP address and device. Filter by time range (or two dates), person and type; open a row for the full record with before and after values; export what the log shows (copy, Excel, CSV or print). `?user=<id>` narrows it to what one person did or had done to them, as the account menu's "My activity" and a profile's "View in activity log" open it |
| `/settings` | The default role for new users, allowed email domains, how long invitations last, signing out when idle, which roles must use two-step sign-in, the password rules (shortest length, recent passwords not allowed again), how long activity is kept, which changes must have a reason, and whether people belong to branches |
| `/setup-two-factor` | Where someone lands whose role must use two-step sign-in while theirs is off; nothing else opens until they turn it on |
| `/login` | Sign-in page. Every other page needs someone signed in, and opens only if their role allows it |
| `/forgot-password` | "Forgot password?": asks for an email and has a reset link sent to it, answering the same whether or not the email belongs to someone |
| `/activate`, `/reset-password` | Where the links in emails lead: set a first password from an invitation, or a new one from a reset link, then sign in with it. With the sample data the emails are written to the browser console |
| `/ui-kit` | The component gallery: every piece in `user-management/ui` with a usage snippet. It is not in the sidebar; open it from the account menu |

## Project layout

- `src/app/user-management` is user management, whole:
  - `overview`, `users`, `roles` and `activity` are the pages; `user-management.routes.ts` lazy loads them.
  - `access` decides who may do what: `Session` knows who is signed in and what their role allows, and the guards keep people out of pages their role does not allow.
  - `data` is the data layer. `models.ts` has the types and `catalog.ts` the permissions, departments and status labels. `AdminApi` (`admin-api.ts`) is the contract with the server; `LocalAdminApi` implements it with `localStorage` and the sample data in `mock-data.ts`, and `HttpAdminApi` calls a real server. `AdminStore` keeps users, roles and activity as signals for the pages and sends every change through `AdminApi`.
  - `shared` has pieces several pages use: status and role badges, the activity sentence, date pipes, error messages.
  - `ui` has the building blocks the pages are made of. See [its README](src/app/user-management/ui/README.md).
- `src/app/layout` is the app around it: navbar, sidebar, footer and the language switch. The sidebar shows the groups in `src/app/layout/sidebar/menu.ts`: each part of the app is one dropdown (user management's comes from `USER_MANAGEMENT_MENU`), open on its own pages, with a chevron that turns clockwise as it opens. Pages the signed-in user's role does not allow are left out. In the icon-only layout a group opens as a flyout on hover.
- `src/app/auth` is the sign-in page, `src/app/error-pages` the 404 and 500 pages, and `src/app/ui-kit` the component reference.
- `src/styles.scss` holds the few global styles: the font, the base look of plain HTML elements and the rules for `<body>`. Everything else, the layout included, is styled in each component's own stylesheet with the `--ui-*` variables of user management's `ui` theme.
- `e2e` holds the end-to-end tests: signing in, what each role can and cannot do, profiles, import and settings. `accessibility.spec.ts` checks every page, menu and dialog against WCAG 2.2 AA with axe, in the light and dark themes, and `expectAccessible()` in `e2e/helpers.ts` does the same for any new page; `accessible-view.spec.ts` checks the accessible view against AAA (see [Accessibility](#accessibility)).

## Connecting a real API

`HttpAdminApi` calls the endpoints in [src/app/user-management/API.md](src/app/user-management/API.md). `../admin-api-starter`, next to this project, is a Spring Boot server that implements them; any other server that does works too. Start it on `http://localhost:8080`, then switch to `HttpAdminApi` in `src/app/app.config.ts`:

```ts
provideUserManagement({ api: HttpAdminApi, apiUrl: '/api', liveUpdates: true }),
```

`npm start` forwards `/api` to `http://localhost:8080` (`proxy.conf.json`), so the API shares the app's origin and its cookie needs no CORS setup. Signing in gives a short-lived access token, which `HttpAdminApi` keeps in memory only and sends as `Authorization: Bearer …`, and an HttpOnly refresh cookie that gets a new token after a reload or when the old one runs out.

Nothing else changes: the pages only talk to `AdminStore` and `Session`. The server keeps the session, checks every request against the signed-in user's permissions, and writes the activity log. API.md lists the rules it must check and the error codes the pages understand.

## Languages

The UI supports Thai (`th`, the default) and English (`en`). Each part keeps its own translation files, and the app loads both:

- `src/assets/i18n/th.json` and `en.json` for the app around user management: navbar, sign-in, error pages, component gallery.
- `src/app/user-management/i18n/th.json` and `en.json` for user management. `angular.json` publishes them as `assets/i18n/user-management/`.

The Thai and English files of each part must have the same keys. Keys are the English text, except for messages with values such as `toast.deleted` or `activity.user.created`.

In templates, translate text with the pipe:

```html
<span>{{ 'Users' | translate }}</span>
```

The `ui` components never translate on their own: pass them translated text through their inputs. To add a language, add its JSON file and an entry in `LANGUAGES` in `src/app/layout/language.service.ts`. The language a visitor picks is stored in `localStorage`.

## Accessibility

The app meets WCAG 2.2 AA as it is, and AAA through the **accessible view**, which WCAG allows as a "conforming alternate version" since every page leads to it. Turn it on with the switch at the top right of the sign-in, email-link and error pages, or with "Accessible view" in the account menu. `UiAccessibleViewService` sets `ui-aaa` on `<body>` and remembers the choice in `localStorage`; `src/index.html` sets the class before the first paint, as with the theme.

The usual view stays compact. The accessible view, in both themes:

- makes every button, link and field at least 44 by 44 pixels, and spaces checkboxes in a list so they do not overlap (2.5.5);
- gives all text a contrast of at least 7:1, or 4.5:1 for large text, chart labels included (1.4.6);
- spaces lines 1.5 and paragraphs further (1.4.8), and moves nothing, charts included (2.3.3);
- writes each bar's number on the bar chart, rather than only in a tooltip on hover (2.1.3);
- keeps messages until they are dismissed, above the page rather than over it (2.2.3, 2.4.12);
- holds changes made elsewhere, such as in another tab, until "Show the changes" (2.2.4);
- keeps the page and what was typed when the session ends, and asks for the password again over it, rather than opening the sign-in page (2.2.5, 3.2.5). A role that comes to require two-step sign-in is announced with a link to set it up, rather than opening the setup page (3.2.5).

In both views focus is a 2px ring that the navbar, a table's header row or the show-password button never covers (2.4.11 to 2.4.13); the header, menu, page and footer are landmarks (1.3.6); links say where they lead (2.4.9); abbreviations such as IP and CSV say what they stand for, and the others are written out (3.1.4); the idle timeout is said once after signing in and in the account menu (2.2.6); and with forced colors (Windows contrast themes) the chosen option, the current page, ticked boxes and switches use the system's highlight.

**Exception: 2.2.3.** Signing out after a set time idle, and links in emails that stop working after a while, are time limits kept for security, which 2.2.3 does not allow. The app meets AAA except 2.2.3 for these two. Choosing "Never" under "Sign out when idle" in the settings removes the first.

Tools check what they can: `e2e/accessible-view.spec.ts` runs axe's AAA rules and a 44-pixel target check on every page, and covers the behaviour above. Criteria that only a person can judge, such as plain wording (3.1.5) and help next to the fields (3.3.5), rest on review.

## Font

The app uses [Sarabun](https://github.com/cadsondemak/Sarabun) for Thai and English, kept in the project, so no font service is needed and the text looks the same offline or behind a firewall.

- The files are in `src/assets/fonts/sarabun`: weights 300 to 700, each split into Thai, Latin and accented Latin, so a page downloads only what it shows (about 10 KB per file). The license, SIL Open Font License 1.1, is `OFL.txt` beside them.
- `src/assets/scss/_fonts.scss` declares them. The build gives them hashed names in `media/`, so browsers cache them safely.
- `--ui-font` in `src/app/user-management/ui/ui.scss` puts Sarabun first, for the whole app.
- Sarabun's letters run smaller than the font the sizes were first set for (x-height 0.50 against 0.55), so `size-adjust: 106%` in each `@font-face` draws them a little larger. Every font size keeps its intended look and the layout does not move; change that one value to make all text larger or smaller.
- The "Admin" wordmark in `src/assets/images/logo.svg` and `logo-light.svg` is Sarabun Bold drawn as outlines, so it matches without loading a font.

Headings have a line height of at least 1.35, so Thai vowels and tone marks stacked above and below the letters have room when a title wraps.

## Themes

The app has a light theme (white sidebar) and a dark theme (slate). Visitors switch with the sun/moon button in the navbar. The choice is stored in `localStorage`; without one, the app follows the system setting.

- `UiThemeService` from `user-management/ui` sets `theme-light` or `theme-dark` on `<body>`. A small script in `src/index.html` sets the same class before the app starts, so the page never flashes the wrong theme.
- The whole app, layout and user management, takes its colors from the `--ui-*` variables in `src/app/user-management/ui/ui.scss`, which switch with the theme. The few layout colors without a variable, such as the sidebar's current page and the gradients of the sign-in and error pages, set their dark value in the component's own stylesheet.
