# user-management

Users, roles and permissions, and the activity log for an Angular 22 app, in one folder: the pages, the data layer, who may do what, and the UI they are built from. The rest of this project (navbar, sidebar, sign-in page) is the app around it.

| Folder | What it holds |
| --- | --- |
| `overview/`, `users/`, `roles/`, `activity/`, `settings/` | The pages |
| `access/` | `Session` (who is signed in and what their role allows), the route guards and the no-access page |
| `data/` | Types, `AdminApi` (the contract with the server), `LocalAdminApi` (sample data in the browser), `HttpAdminApi` (a real server, see [API.md](API.md)), `AdminStore` (signals the pages read) and the permission rules |
| `shared/` | Pieces several pages use: role and status badges, the activity sentence, date pipes, error messages |
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

## Security

The Security tab of a profile (`/users/:id?tab=security`) shows:

- **Two-step sign-in.** People turn it on by scanning a QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) and typing a code. After that, signing in asks for a code as well as the password. An administrator can turn it off for someone who lost their phone. The QR code is drawn by `uqr`, loaded only when the setup dialog opens.
- **Password.** Changing it signs you out on your other devices.
- **Signed-in devices.** Each session's browser, system, IP address and last activity. Sign out of one, or of all the others.

People see their own Security tab; with `users.edit`, also that of the people they manage.

## Live updates

`AdminStore` loads its data again whenever `AdminApi.watch()` reports a change. With the sample data, that happens when another tab of the browser changes something, so two windows stay in step, and a session ended in one is noticed in the other. With `HttpAdminApi`, pass `liveUpdates: true` once the server streams change events (see [API.md](API.md#live-updates)).

Some rules go beyond single permissions, so nobody can raise their own access or lock everyone out: nobody gives out a role or permission they do not have, manages a person or edits a role that allows more than their own, or changes their own role, status or role permissions. `data/access-rules.ts` has them, and `LocalAdminApi` enforces them as a server would, taking only the fields each request may set.

## Settings

The settings page (`settings.view` to open, `settings.manage` to change) decides:

- the role the Add user form picks first;
- which email domains new users may have;
- how long invitations last before the overview lists them as expired;
- how long someone can leave the app idle before `Session` signs them out.

`AdminStore.settings` holds them for any page that needs them.

## Trying it with the sample data

`LocalAdminApi` keeps 48 sample users, 4 roles and a month of activity in the browser's `localStorage`. The sign-in page offers one account per role (Administrator, Manager, Support and Viewer); any active user's email works too, with any password of 6 or more characters. Clear the `admin-data-v3` key in the browser to start over.

## Using a real server

Implement the endpoints in [API.md](API.md) and switch to `HttpAdminApi`:

```ts
provideUserManagement({ api: HttpAdminApi, apiUrl: 'https://admin.example.com/api' })
```

The pages only talk to `AdminStore` and `Session`, so nothing else changes. For another kind of backend (GraphQL, Firebase, Supabase), write a class that extends `AdminApi` and pass it as `api`. Either way the server must check permissions itself: hiding a button never stops a request.

To sign in through an identity provider (OIDC, Azure AD, Google) instead of a password form, let the provider's library handle the redirect, then have `getSession()` return the user the server matched to the provider's account.
