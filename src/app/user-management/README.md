# user-management

Users, roles and permissions, and the activity log for an Angular 22 app, in one folder: the pages, the data layer, who may do what, and the UI they are built from. The rest of this project (navbar, sidebar, sign-in page) is the app around it.

| Folder | What it holds |
| --- | --- |
| `overview/`, `users/`, `roles/`, `branches/`, `activity/`, `settings/` | The pages |
| `access/` | `Session` (who is signed in and what their role allows), the route guards and the no-access page |
| `data/` | Types, `AdminApi` (the contract with the server), `LocalAdminApi` (sample data in the browser), `HttpAdminApi` (a real server, see [API.md](API.md)), `AdminStore` (signals the pages read) and the permission rules |
| `shared/` | Pieces several pages use: role and status badges, the activity sentence, date pipes, error messages, CSV, and the Export menu (copy, Excel, CSV, print) with its own small .xlsx writer |
| `ui/` | The building blocks: cards, tables, forms, menus, charts and the theme. See [ui/README.md](ui/README.md) |
| `i18n/` | The text in Thai and English, as translation files |
| `index.ts` | What an app imports: routes, menu, `provideUserManagement()`, `Session`, guards, the APIs and the types |

## Adding it to another Angular app

1. Copy this folder to `src/app/user-management`.
2. Install what it uses:

   ```bash
   npm install @angular/cdk @ng-icons/core @ng-icons/lucide @ngx-translate/core @ngx-translate/http-loader chart.js ng2-charts uqr
   ```

3. In `angular.json`, add the theme to `styles`, before the app's own styles, and publish the translation files with the app's assets:

   ```json
   "styles": ["src/app/user-management/ui/ui.scss", "src/styles.scss"],
   "assets": [
     { "glob": "*.json", "input": "src/app/user-management/i18n", "output": "assets/i18n/user-management" }
   ]
   ```

4. Register it in `app.config.ts`. The pages read filters such as `?role=` from the URL, so the router needs component input binding. The text goes through ngx-translate, which loads the app's translation files and user management's together:

   ```ts
   import { provideUserManagement } from './user-management';

   providers: [
     provideRouter(routes, withComponentInputBinding()),
     provideHttpClient(),
     provideTranslateService({
       loader: provideTranslateMultiHttpLoader({ resources: ['./assets/i18n/', './assets/i18n/user-management/'] }),
     }),
     provideUserManagement(),
   ]
   ```

5. Add the pages to `app.routes.ts`, at the top level (the pages link to `/users`, `/roles`, `/activity` and `/settings`). Each page checks the signed-in user's permissions itself:

   ```ts
   import { Session, signedOut, USER_MANAGEMENT_ROUTES } from './user-management';

   export const routes: Routes = [
     // The first page the signed-in user's role allows, or the sign-in page
     { path: '', pathMatch: 'full', redirectTo: () => inject(Session).homeUrl() },
     ...USER_MANAGEMENT_ROUTES,
     { path: 'login', canActivate: [signedOut], loadComponent: () => import('./login/login.component').then(m => m.LoginComponent) },
   ];
   ```

6. Give the app a sign-in page (this project's is in `src/app/auth/login`). It calls `Session.signIn()`, then opens the `returnUrl` query parameter the guards set, or `Session.homeUrl()`:

   ```ts
   await inject(Session).signIn(email, password, remember);
   ```

   The guards send people who are not signed in to `/login`; pass `signInPath` to `provideUserManagement()` to use another address.

   The links in emails lead to two more pages, `/activate` and `/reset-password`, and the sign-in page's "Forgot password?" to `/forgot-password`. This project's are in `src/app/auth/set-password` and `src/app/auth/forgot-password`; they call `AdminApi.acceptInvitation()`, `confirmPasswordReset()` and `requestPasswordReset()` (API.md, "Links in emails"), and read the shortest password allowed from `getPasswordPolicy()`.

   Someone whose role must use two-step sign-in while theirs is off is kept on `/setup-two-factor` (`TWO_FACTOR_SETUP_PATH`), which comes with `USER_MANAGEMENT_ROUTES`. It is a page of its own, like sign-in: show it without the navbar and sidebar (this project lists it in `AUTH_PAGES` in `src/app/app.component.ts`).

7. Put the pages in the app's menu. `USER_MANAGEMENT_MENU` is one group, "User management", with a link per page and the permission each needs; show a link only when `Session.can(link.permission)`, and the group only when it has a link to show. This project's sidebar (`src/app/layout/sidebar`) shows it as a dropdown.

The sample users' photos are in this project's `src/assets/images/faces`. Without them the avatars show initials instead.

## Who may do what

Each role grants permissions such as `users.edit` or `roles.manage` (the full list is in `data/catalog.ts`). Pages and menus ask `Session` before showing an action, and the guards in `access/guards.ts` keep people out of pages their role does not allow:

```ts
protected readonly session = inject(Session);
```

```html
@if (session.can('users.delete')) { <button …>Delete</button> }
```

A page someone may not open shows the no-access page at the address they asked for. Everyone can open their own profile and change their own name, phone and photo.

### Roles and role assignments

The model follows NIST RBAC, with the role assignments of Microsoft Entra:

- **A person can hold several roles**, and has every permission of each one, together. Their roles are the `RoleAssignment`s in `User.roles`, each with a start, an end (`null` for good) and a reason. The profile's "Roles & permissions" tab lists them, active, scheduled and ended, and gives, extends, renews or takes them away; the users list gives or takes a role from everyone selected.
- **A role can be given for a time.** It counts from `startsAt` until `endsAt` and then stops by itself; `roleAssignmentState()` in `data/access-rules.ts` says which it is. `AdminStore.now` moves on at each start and end, so permissions, badges and counts follow without a reload. An ended assignment stays on the profile, to renew it, until the activity log forgets it.
- **Each role has its own rules for giving it** (`Role.assignment`): a longest assignment (`maxDays`), after which it must end, and whether a reason is required. They are set on the roles page.
- **Built-in roles** (Administrator, Manager) keep the name, description and permissions the server's code gives them; their color and rules can change. "Duplicate" copies one into a role of your own.
- **Someone can always run the system:** the server refuses to take away, time-limit, suspend or delete the last active person who holds every permission for good (`last_administrator`).

Nobody gives a role that grants a permission they lack, manages someone whose roles (now or scheduled) grant one, or changes their own roles. [API.md](API.md#role-assignments) has the requests and rules a server checks.

### Conflicting roles

As NIST RBAC's static separation of duty, a rule names roles nobody may hold at the same time, so that one person cannot both do and check the same work. The Roles & permissions page leads to them (`/roles/conflicts`, with a count of the people to fix); `roles.manage` adds, changes and deletes rules. Giving a role that clashes with one the person holds at an overlapping time, in any scope, is refused with `role_conflict`; the role dialog names the rule first, and an import row with two such roles shows a problem. A rule made while people already hold its roles lists them as the people to fix, as an access review would (`AdminStore.roleConflictViolations`, `roleConflict()` in `data/access-rules.ts`).

### Branches

Branches (sites, offices) are optional: they show once the settings turn on "Use branches", and the sample data has them on. With them on:

- **Each person belongs to one branch, or none**, as Google Workspace puts each user in one organizational unit. The user form picks it, the users list shows and filters by it (`/users?branch=<id>`, or `none`), and an import file can name it by code or name in a Branch column.
- **A role can be given for one branch only** (`RoleAssignment.branchId`), as Azure RBAC gives a role at a scope. It allows what it allows in that branch and nowhere else: `Session.can(permission, branchId)` says yes for that branch, and `Session.branchesWith(permission)` lists the branches. `Session.can(permission)` without a branch counts only roles for the whole organization, and only those keep an administrator (`last_administrator`); user management takes four permissions from a branch role too (see [Branch administrators](#branch-administrators)).
- **The Branches page** (`branches.view`, under User management; `branches.manage` to change it) adds, renames, closes and deletes them, and searches, filters by status, sorts and pages its list as the users list does. A closed branch keeps its people and roles, but nobody new joins it or gets a role there; one that anyone belongs to or holds a role in cannot be deleted.

The app's own modules use the branch scope for their records, such as an order's branch: `session.can('orders.approve', order.branchId)`.

### Branch administrators

As Microsoft Entra's administrative units and Google Workspace's organizational unit admins do, a role limited to a branch grants `users.view`, `users.create`, `users.edit` and `activity.view` over the people who belong to that branch (`BRANCH_SCOPED_PERMISSIONS` in `data/access-rules.ts`), so a branch manager looks after their branch's staff and nobody else. Deleting people, roles, settings, branches and exporting the log still need a role for the whole organization. The sample's "Branch manager" holds Viewer for everyone and Manager in Chiang Mai only. For such a person:

- **The menu and the guards** ask `Session.canSomewhere(permission)`, so Users and Activity log open, and the buttons for a whole page show (Add user).
- **Each person** goes by `Session.canOn(permission, user)`: the permission over the person's branch, and, rule 3 counted by scope (`permissionsIn`), every permission of each role they hold in that role's scope. A role for the whole organization that allows more than the manager's own keeps its holder out of reach; the users list says why a row cannot be ticked.
- **New people** join one of their branches (the form offers only those, without "No branch"), and without a role get the default role limited to that branch. An import gives its roles limited to the row's branch.
- **Roles** are given limited to their branches only (`Session.canGive(role, branchId)`): the role dialog's "Applies in" lists those branches, and offers the roles they hold there.
- **The activity log** shows the entries about the people of their branches; the server answers only those.

[API.md](API.md#branch-administrators) has the rules the server checks; `LocalAdminApi` checks the same.

## Security

The Security tab of a profile (`/users/:id?tab=security`) shows:

- **Two-step sign-in.** People turn it on by scanning a QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) and typing a code. After that, signing in asks for a code as well as the password. An administrator can turn it off for someone who lost their phone. The QR code is drawn by `uqr`, loaded only when the setup dialog opens.
- **Recovery codes.** Turning two-step sign-in on shows ten single-use codes, such as `abcde-fghjk`, to copy or download (`RecoveryCodes`); they are not shown again. Wherever a code is asked (signing in, confirming who you are, turning it off), "Lost your phone? Use a recovery code" takes one instead (`TwoFactorCodeField`). The Security tab says how many are left and makes new ones, which replace the old (a risky change: the password may be asked again). Turning two-step sign-in off deletes them. [API.md](API.md#recovery-codes) has the requests.
- **Password.** Changing it signs you out on your other devices.
- **Signed-in devices.** Each session's browser, system, IP address and last activity. Sign out of one, or of all the others.

People see their own Security tab; with `users.edit`, also that of the people they manage.

## Live updates

`AdminStore` loads its data again whenever `AdminApi.watch()` reports a change. With the sample data, that happens when another tab of the browser changes something, so two windows stay in step, and a session ended in one is noticed in the other. With `HttpAdminApi`, pass `liveUpdates: true` once the server streams change events (see [API.md](API.md#live-updates)).

In the accessible view (`UiAccessibleViewService`) the page never changes by itself: `AdminStore.holdChanges` is on, so a change made elsewhere sets `changesWaiting` and waits for `showChanges()`, and a session that ends sets `Session.paused` instead of leaving for the sign-in page, for signing in again over the page with `Session.resume()`. Put `<app-session-notices />` above the page content and `<app-reauth-dialog />` in the app shell (see `src/app/app.component.html`); they show these to the person.

Some rules go beyond single permissions, so nobody can raise their own access or lock everyone out: nobody gives out a role or permission they do not have, manages a person or edits a role that allows more than their own, or changes their own role, status or role permissions. `data/access-rules.ts` has them, and `LocalAdminApi` enforces them as a server would, taking only the fields each request may set.

### Reasons

The changes that take or reset someone's access ask why, as Microsoft Entra asks for a justification: suspending or reactivating someone, deleting people, taking a role away, resetting someone's password or two-step sign-in, and signing someone out of their devices. Where the page already asks before such a change, the question takes a Reason field; the settings decide where it is required, and a change that asks nothing first asks only then. `ReasonPrompt` (`shared/reason-prompt.ts`) does this over `UiConfirmService.prompt`. The activity log keeps the reason as `Activity.reason`, shows it under the details and in the entry, searches and exports it; a profile's activity shows it too. A new role assignment's own reason is its entry's reason. [API.md](API.md#reasons) has the requests.

### Confirming who you are

As GitHub's sudo mode and Microsoft Entra's reauthentication do, the changes that could take the system over or shut people out ask for the password again when the person signed in, or last confirmed it, longer ago than the settings allow (10 minutes on a new installation): giving, changing or taking away roles (new users' roles too), changing what a role allows or deleting one, deleting people, resetting someone else's password or two-step sign-in, signing someone else out, and changing the settings. The server refuses such a change with `reauth_required`; `AdminStore` then waits while `<app-reauth-dialog />` asks for the password (and the code, with two-step sign-in on), and sends the same request again, so the page and what was typed stay as they were. Closing the dialog leaves the change unsent. `Session.reauthRequested`, `reauthenticate()` and `cancelReauth()` drive it. [API.md](API.md#confirming-who-you-are) has the list and the request.

## Settings

The settings page (`settings.view` to open, `settings.manage` to change) decides:

- the role the Add user form picks first;
- which email domains new users may have;
- how long invitations last before the overview lists them as expired;
- how long someone can leave the app idle before `Session` signs them out;
- which roles must turn on two-step sign-in before anything else (the guards then keep them on `/setup-two-factor`);
- the password rules: the shortest password and how many recent passwords may not be used again;
- how long the activity log keeps each entry;
- whether people belong to branches (see [Branches](#branches));
- which changes must have a reason (see [Reasons](#reasons)); suspending or reactivating someone and deleting people on a new installation;
- how long a sign-in or a confirmed password lasts for the risky changes (see [Confirming who you are](#confirming-who-you-are)), or never asking again.

`AdminStore.settings` holds them for any page that needs them.

## Trying it with the sample data

`LocalAdminApi` keeps 48 sample users, 14 roles and a month of activity in the browser's `localStorage`: the four built-in roles and ten an organization might add (Help desk, HR, Auditor and so on), so the pages show a longer list of roles. With more than six roles, the roles page searches its list, the user form offers roles in a dropdown and the overview chart adds up all but the five largest. The sign-in page offers one account for each built-in role (Administrator, Manager, Support and Viewer); any active user's email works too, with any password of 6 or more characters. Clear the `admin-data-v7` key in the browser to start over.

## Using a real server

Implement the endpoints in [API.md](API.md), or run `admin-api-starter`, the Spring Boot server next to this project that implements them, and switch to `HttpAdminApi`:

```ts
provideUserManagement({ api: HttpAdminApi, apiUrl: '/api', liveUpdates: true })
```

Serve the API on the app's own origin: this project's `npm start` forwards `/api` to the server at `http://localhost:8080` with `proxy.conf.json`. `HttpAdminApi` keeps the short-lived access token in memory only and sends it as a bearer token; the HttpOnly refresh cookie gets a new one after a reload or when it runs out (see [API.md](API.md#signing-in-access-token-and-refresh-cookie)).

The pages only talk to `AdminStore` and `Session`, so nothing else changes. For another kind of backend (GraphQL, Firebase, Supabase), write a class that extends `AdminApi` and pass it as `api`. Either way the server must check permissions itself: hiding a button never stops a request.

To sign in through an identity provider (OIDC, Azure AD, Google) instead of a password form, let the provider's library handle the redirect, then have `getSession()` return the user the server matched to the provider's account.
