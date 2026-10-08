# User management API

`HttpAdminApi` (`data/http-admin-api.ts`) calls these endpoints. A backend that implements them works with every page as it is. To turn it on:

```ts
provideUserManagement({ api: HttpAdminApi, apiUrl: '/api' })
```

All bodies are JSON. The types are in `data/models.ts`; dates are ISO 8601 strings. Paths below start at `apiUrl`. `admin-api-starter`, next to this project, is a Spring Boot server that implements all of it.

## Trying it before the server exists

`localBackend` (`data/local-backend.ts`) is a pretend server in the browser. It answers these requests with the sample data, including the access token and the `401` that makes `HttpAdminApi` refresh it, as real responses and errors with the status codes under Errors below, so the app runs through `HttpAdminApi` exactly as it will against the backend:

```ts
provideHttpClient(withInterceptors([localBackend])),
provideUserManagement({ api: HttpAdminApi }),
```

Remove the interceptor once the server answers.

## Signing in: access token and refresh cookie

Signing in gives two things:

- An **access token**: a short-lived JWT (15 minutes) in the answer's body. `HttpAdminApi` keeps it in memory only, never in `localStorage` or `sessionStorage`, and sends it as `Authorization: Bearer <token>` on every request except those under `/auth`.
- A **refresh cookie**: an opaque random value the server sets as an `HttpOnly`, `SameSite=Strict` cookie, `Secure` in production, sent back only to requests under `/auth`. JavaScript never sees it. Each refresh replaces it with a new one.

Each sign-in is one **session**, which lasts until someone ends it or the refresh cookie runs out. Without `remember`, the cookie is gone when the browser closes, and the session ends after 12 hours without a refresh. With `remember`, it lasts 30 days.

| Request | Body | Answer |
| --- | --- | --- |
| `POST /auth/login` | `{ email, password, remember, code? }` | `{ accessToken, expiresIn, user }` (`expiresIn` in seconds) and the refresh cookie. With two-step sign-in on and no `code`, refuse with `two_factor_required`; a wrong code is `invalid_code` |
| `POST /auth/refresh` | | A new `{ accessToken, expiresIn, user }` and a new refresh cookie. `401` `unauthenticated` when the cookie is missing, has run out or was already used, when the session has ended, or when the account is no longer active |
| `POST /auth/logout` | | Nothing. Ends the refresh cookie's session and clears the cookie; works after the access token has run out, and answers the same when there is no cookie |
| `GET /me` | | The signed-in `User` |
| `POST /me/password` | `{ currentPassword, newPassword }` | Nothing. `invalid_credentials` when the current password is wrong, `weak_password` when the new one is under 8 characters |

Sign-in refusals: `invalid_credentials`, `account_suspended` (status `suspended`), `invite_pending` (status `invited`), `two_factor_required`, `invalid_code`. Wrong passwords count: after 5 in a row the account is locked for a minute, then twice as long each time (up to 30 minutes), answering `invalid_credentials` all the while so nobody learns which accounts exist. Too many attempts from one address are refused with `429` `too_many_requests`. On success, record the session (browser, OS, IP) for the devices list, write an `auth.sign_in` entry to the activity log and update `lastActiveAt`.

How `HttpAdminApi` uses them:

1. **On start**, it calls `POST /auth/refresh`. An answer means someone is signed in; `401` means nobody is.
2. **When a request is answered `401` `unauthenticated`** (or `401` with no known code), it refreshes once and sends the request again. Requests that fail while a refresh is under way wait for that same refresh instead of starting their own. If the server refuses the refresh too, the person is signed out. A `401` with another code (`invalid_credentials`, `two_factor_required`, `invalid_code`) is an answer, not a stale token: it is passed on as it is.
3. **On sign-out**, it calls `POST /auth/logout` and forgets the token.

`/auth/login`, `/auth/refresh` and `/auth/logout` are sent with credentials so the browser stores, sends and clears the cookie. The server ignores an `Authorization` header under `/auth`, so an old token sent there does no harm. Serve the API on the app's own origin (`apiUrl: '/api'`; `npm start` forwards `/api/…` unchanged to `http://localhost:8080/api/…` with `proxy.conf.json`). An API on another origin must answer those requests with `Access-Control-Allow-Credentials: true` and a specific `Access-Control-Allow-Origin`, and the two must be the same site for a `SameSite=Strict` cookie to be sent.

The server checks on every request that the token's session is still open and the account still active, so ending a session or suspending someone takes effect at once, not when the token runs out. Changing a password ends the user's other sessions; suspending, deleting or resetting the password of someone ends all of theirs.

## Links in emails

An invited user gets an email with a link to set their password; resetting someone's password stops the old one working and emails them a link to set a new one. The links open `{mail.base-url}/activate?token=…` and `{mail.base-url}/reset-password?token=…`, the app's pages for setting a password from a link; the sign-in page's "Forgot password?" opens `/forgot-password`, which asks for a reset link. Through `AdminApi.acceptInvitation()`, `requestPasswordReset()` and `confirmPasswordReset()` they call:

| Request | Body | Answer |
| --- | --- | --- |
| `POST /auth/activate` | `{ token, password }` | Nothing. Sets the password and makes the account `active`. `invalid_token` (`400`) when the link has expired or was used; `weak_password` |
| `POST /auth/password-reset/request` | `{ email }` | `202` always, whether or not the email belongs to someone, so the answer reveals nothing. Emails a link when it does |
| `POST /auth/password-reset/confirm` | `{ token, password }` | Nothing. Sets the new password and ends the user's sessions. `invalid_token`; `weak_password` |

Invitation links work for `inviteExpiryDays` from the settings; reset links for one hour. Each works once, and a newer link of the same kind replaces the older ones. These requests carry neither the access token nor the cookie.

With the sample data (`LocalAdminApi`, or `localBackend`) there is no mail server: each email is written to the browser console as `[sample email] To ann@example.com: … http://…/activate?token=…`, so the links can be tried in development.

## Signed-in devices and two-step sign-in

People can see and end their own sessions and turn two-step sign-in on or off for themselves. With `users.edit` they can do the same for people they manage (see the rules below), except turning someone's two-step sign-in on.

| Request | Body | Answer |
| --- | --- | --- |
| `GET /users/:id/sessions` | | `UserSession[]`, newest use first, the one making the request with `current: true` |
| `DELETE /sessions/:id` | | Nothing |
| `POST /users/:id/sessions/end` | | Nothing. Ends every session of the user; for yourself, all but the current one |
| `POST /me/two-factor` | | `TwoFactorSetup`: a new base32 `secret` and its `otpauth://` `uri`, kept pending until confirmed |
| `POST /me/two-factor/confirm` | `{ code }` | The `User` with `twoFactor: true`; `invalid_code` if the code does not match the pending secret |
| `POST /me/two-factor/disable` | `{ code }` | The `User` with `twoFactor: false`; `invalid_code` if the code is wrong |
| `POST /users/:id/two-factor/reset` | | The `User` with `twoFactor: false`. Needs `users.edit`; `self_change` for yourself |

Codes are TOTP (RFC 6238): SHA-1, 30-second steps, 6 digits; accept one step either side for clock drift. `data/totp.ts` is a working reference. Log `auth.sessions_ended`, `auth.two_factor_on` and `auth.two_factor_off`.

## Live updates

With `provideUserManagement({ api: HttpAdminApi, liveUpdates: true })`, the app reads the event stream at `GET /events` and loads its data again whenever a message arrives, so changes made by other people show without a reload. `EventSource` cannot send an `Authorization` header, so `HttpAdminApi` reads the stream through `HttpClient` with the access token, and connects again (refreshing the token first if needed) when the stream closes.

The server sends `data: changed` after each change and a `: ping` comment every 25 seconds, and closes the stream when the access token it was opened with runs out, so nobody keeps hearing about changes on a token that has expired or a session that has ended. `HttpAdminApi` then refreshes the token and connects again straight away. The message body is not read. Without `liveUpdates`, the app loads data when someone signs in and after their own changes.

## Users

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `GET /users` | | `User[]` | `users.view`; without it, only the signed-in user |
| `POST /users` | `UserDraft` | The new `User` | `users.create` |
| `POST /users/import` | `{ users: UserDraft[] }` | The new `User`s. All or none: refuse the whole request when one is refused | `users.create` |
| `PATCH /users/:id` | `Partial<UserDraft>` | The `User` | `users.edit`; without it, people may change their own `firstName`, `lastName`, `phone` and `avatar` |
| `POST /users/status` | `{ ids, status }` | The `User`s that changed | `users.edit` |
| `POST /users/delete` | `{ ids }` | Nothing | `users.delete` |
| `POST /users/:id/reset-password` | | Nothing | `users.edit` |
| `POST /users/:id/resend-invite` | | Nothing; `not_invited` unless the status is `invited` | `users.create` |

The server assigns `id`, `createdAt` and `lastActiveAt`. A new user with status `invited` gets an invitation email. Refuse an email someone else has with `email_taken`. When the settings list allowed domains, refuse a new or changed email outside them with `email_domain`.

## Roles

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `GET /roles` | | `Role[]` | Anyone signed in |
| `POST /roles` | `RoleDraft` | The new `Role` | `roles.manage` |
| `PATCH /roles/:id` | `Partial<RoleDraft>` | The `Role` | `roles.manage` |
| `DELETE /roles/:id` | | Nothing; `system_role` for a built-in role, `role_in_use` while users hold it, `default_role` while the settings give it to new users | `roles.manage` |

## Activity

| Request | Answer | Permission |
| --- | --- | --- |
| `GET /activity` | `Activity[]`, newest first | `activity.view`; without it, an empty list |

The server writes the log itself, one entry per change, with `actorId` from the session and `ip`, `browser` and `os` from the request. `changes` lists the fields that changed; see `Activity` in `data/models.ts` and how `data/local-admin-api.ts` fills it.

## Settings

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `GET /settings` | | `AdminSettings` | Anyone signed in |
| `PATCH /settings` | `Partial<AdminSettings>` | The `AdminSettings` | `settings.manage` |

Store `allowedDomains` lower-cased, without duplicates. Log a `settings.updated` entry listing the fields that changed. `sessionTimeoutMinutes` is enforced by the app; a server can also end idle sessions on its side.

## Rules the server must check

The pages hide what a role cannot do, but only the server can enforce it. `data/local-admin-api.ts` checks the same rules and is a working reference, with the helpers in `data/access-rules.ts`:

1. Each request needs the permission in the tables above. Refuse with `403` and `forbidden`.
2. Nobody gives out more than they have. Refuse with `forbidden` when someone:
   - assigns a role that grants a permission they lack;
   - adds or removes a permission they lack on a role.
3. Nobody manages someone whose role grants a permission they lack. Refuse editing, suspending, deleting, resetting or inviting that person with `forbidden`. The same goes for roles: nobody edits or deletes a role that grants a permission they lack.
4. Nobody suspends or deletes themselves, changes their own role, or changes the permissions of the role they hold. Refuse with `self_change`.
5. Take only the fields each request may set (the `UserDraft`, `RoleDraft` and `AdminSettings` fields), and refuse anything else with `invalid_request`, so nobody can set an `id`, the `system` flag or a date.

## Errors

Refuse a request with a 4xx status and a body such as `{ "code": "email_taken" }`; the body may carry more, such as the other fields of an RFC 9457 problem detail. The codes are listed in `AdminApiErrorCode` in `data/admin-api.ts`, and the pages show a message for each. These are the statuses `localBackend` uses:

| Status | Codes |
| --- | --- |
| `401` | `unauthenticated` (no access token, or one that has run out or whose session has ended), `invalid_credentials`, `two_factor_required`, `invalid_code` |
| `403` | `forbidden`, `self_change`, `account_suspended`, `invite_pending` |
| `404` | `not_found` |
| `400` | `invalid_request`: a field the request may not set, or a value of the wrong kind; `invalid_token`: an email link that has expired or was used |
| `409` | `email_taken`, `role_in_use`, `system_role`, `not_invited`, `default_role` |
| `422` | `email_domain`, `weak_password` |
| `429` | `too_many_requests`: too many sign-in, refresh or reset attempts from one address |

Without a known code, `401` counts as `unauthenticated`, `403` as `forbidden`, `404` as `not_found` and `429` as `too_many_requests`. When a refresh cannot fix an `unauthenticated`, the app sends the person to sign in, then brings them back to the page they were on. Other failures (offline, `5xx`) show "Something went wrong".
