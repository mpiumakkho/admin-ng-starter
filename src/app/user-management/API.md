# User management API

`HttpAdminApi` (`data/http-admin-api.ts`) calls these endpoints. A backend that implements them works with every page as it is. To turn it on:

```ts
provideUserManagement({ api: HttpAdminApi, apiUrl: 'https://admin.example.com/api' })
```

All bodies are JSON. The types are in `data/models.ts`; dates are ISO 8601 strings.

## Trying it before the server exists

`localBackend` (`data/local-backend.ts`) is a pretend server in the browser. It answers these requests with the sample data, as real responses and errors with the status codes under Errors below, so the app runs through `HttpAdminApi` exactly as it will against the backend:

```ts
provideHttpClient(withInterceptors([localBackend])),
provideUserManagement({ api: HttpAdminApi }),
```

Remove the interceptor once the server answers.

## Sessions

The server keeps the session in a cookie it sets on sign-in. `HttpAdminApi` sends credentials with every request, so an API on another origin must answer with `Access-Control-Allow-Credentials: true` and a specific `Access-Control-Allow-Origin`.

To use a bearer token instead, add an `HttpInterceptor` that sets the `Authorization` header, and keep the token where the interceptor can read it.

| Request | Body | Answer |
| --- | --- | --- |
| `GET /session` | | The signed-in `User`. `401`, `204` or `null` when nobody is signed in |
| `POST /session` | `{ email, password, remember, code? }` | The `User`. With `remember`, the cookie outlives the browser session. With two-step sign-in on and no `code`, refuse with `two_factor_required`; a wrong code is `invalid_code` |
| `DELETE /session` | | Nothing |
| `POST /session/password` | `{ currentPassword, newPassword }` | Nothing. `invalid_credentials` when the current password is wrong, `weak_password` when the new one is under 8 characters |

Sign-in refusals: `invalid_credentials`, `account_suspended` (status `suspended`), `invite_pending` (status `invited`), `two_factor_required`, `invalid_code`. On success, record the session (browser, OS, IP) for the devices list, write an `auth.sign_in` entry to the activity log and update `lastActiveAt`.

Changing a password ends the user's other sessions; suspending, deleting or resetting the password of someone ends all of theirs.

## Signed-in devices and two-step sign-in

People can see and end their own sessions and turn two-step sign-in on or off for themselves. With `users.edit` they can do the same for people they manage (see the rules below), except turning someone's two-step sign-in on.

| Request | Body | Answer |
| --- | --- | --- |
| `GET /users/:id/sessions` | | `UserSession[]`, the one making the request with `current: true` |
| `DELETE /sessions/:id` | | Nothing |
| `POST /users/:id/sessions/end` | | Nothing. Ends every session of the user; for yourself, all but the current one |
| `POST /session/two-factor` | | `TwoFactorSetup`: a new base32 `secret` and its `otpauth://` `uri`, kept pending until confirmed |
| `POST /session/two-factor/confirm` | `{ code }` | The `User` with `twoFactor: true`; `invalid_code` if the code does not match the pending secret |
| `POST /session/two-factor/disable` | `{ code }` | The `User` with `twoFactor: false`; `invalid_code` if the code is wrong |
| `POST /users/:id/two-factor/reset` | | The `User` with `twoFactor: false`. Needs `users.edit`; `self_change` for yourself |

Codes are TOTP (RFC 6238): SHA-1, 30-second steps, 6 digits; accept one step either side for clock drift. `data/totp.ts` is a working reference. Log `auth.sessions_ended`, `auth.two_factor_on` and `auth.two_factor_off`.

## Live updates

With `provideUserManagement({ api: HttpAdminApi, liveUpdates: true })`, the app opens an `EventSource` on `GET /events` (with credentials) and loads its data again whenever a message arrives, so changes made by other people show without a reload. The message body is not read: send any event after each change, for example `data: changed`. Without `liveUpdates`, the app loads data when someone signs in and after their own changes.

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
5. Take only the fields each request may set (the `UserDraft`, `RoleDraft` and `AdminSettings` fields), and refuse anything else with `invalid_request`, so nobody can set an `id`, the `system` flag or a date.
4. Nobody suspends or deletes themselves, changes their own role, or changes the permissions of the role they hold. Refuse with `self_change`.

## Errors

Refuse a request with a 4xx status and a body such as `{ "code": "email_taken" }`. The codes are listed in `AdminApiErrorCode` in `data/admin-api.ts`, and the pages show a message for each. These are the statuses `localBackend` uses:

| Status | Codes |
| --- | --- |
| `401` | `unauthenticated`, `invalid_credentials`, `two_factor_required`, `invalid_code` |
| `403` | `forbidden`, `self_change`, `account_suspended`, `invite_pending` |
| `404` | `not_found` |
| `400` | `invalid_request`: a field the request may not set, or a value of the wrong kind |
| `409` | `email_taken`, `role_in_use`, `system_role`, `not_invited`, `default_role` |
| `422` | `email_domain`, `weak_password` |

Without a known code, `401` counts as `unauthenticated`, `403` as `forbidden` and `404` as `not_found`. On `unauthenticated` the app sends the person to sign in, then brings them back to the page they were on. Other failures (offline, `5xx`) show "Something went wrong".
