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
| `POST /me/password` | `{ currentPassword, newPassword }` | Nothing. `invalid_credentials` when the current password is wrong, which counts towards the lockout as at sign-in (refused the same while locked); `weak_password` or `password_reused` when the new one breaks the password rules below |

Sign-in refusals: `invalid_credentials`, `account_suspended` (status `suspended`), `invite_pending` (status `invited`), `two_factor_required`, `invalid_code`. Wrong passwords count: after 5 in a row the account is locked for a minute, then twice as long each time (up to 30 minutes), answering `invalid_credentials` all the while so nobody learns which accounts exist. They count apart for the addresses the person signed in from before and for any other, as Microsoft Entra's smart lockout does, so a stranger guessing from elsewhere locks out only their own address and not the person where they usually sign in; and a count left alone for a day starts again. Too many attempts from one address are refused with `429` `too_many_requests`. On success, record the session (browser, OS, IP) for the devices list, write an `auth.sign_in` entry to the activity log and update `lastActiveAt`, which each refresh updates too: it is when the person last used the app.

Failures are logged as well, as audits ask (ISO 27001, the Bank of Thailand's IT risk rules): a refused sign-in of an account that exists writes `auth.sign_in_failed`, the person as both actor and target, with the IP, browser and OS of the attempt and `cause` among the changes: `password` (wrong), `code` (wrong), `locked` (refused while locked, whatever the password), `suspended` or `invited`. A wrong password or code on `POST /me/reauthenticate` writes one too. The wrong attempt that locks the account writes `auth.account_locked` with `lockMinutes`. An email that belongs to nobody is not logged, so the log holds no stray input.

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
| `POST /auth/activate` | `{ token, password }` | Nothing. Sets the password and makes the account `active`. `invalid_token` (`400`) when the link has expired or was used; `weak_password`, `password_reused` |
| `POST /auth/password-reset/request` | `{ email }` | `202` always, whether or not the email belongs to someone, so the answer reveals nothing. Emails a link when it does |
| `POST /auth/password-reset/confirm` | `{ token, password }` | Nothing. Sets the new password and ends the user's sessions. `invalid_token`; `weak_password`, `password_reused` |

Invitation links work for `inviteExpiryDays` from the settings; reset links for one hour. Each works once, and a newer link of the same kind replaces the older ones. These requests carry neither the access token nor the cookie.

With the sample data (`LocalAdminApi`, or `localBackend`) there is no mail server: each email is written to the browser console as `[sample email] To ann@example.com: … http://…/activate?token=…`, so the links can be tried in development.

### Emails about your account

As Google and Microsoft do, the server also tells people by email when something happens to their account, so a stranger's sign-in or change does not go unnoticed. Each is sent after the change commits, and none fails the request:

| When | To |
| --- | --- |
| A sign-in from a browser and system (such as Chrome on Windows) the person never signed in with before; not their first sign-in | The person, with the device, IP address and time |
| A role is given to someone active (`role_assignment.added`) | The person, with the role, its scope and dates |
| Someone changes the person's email | The old address |
| The person's password changes (`POST /me/password`, or a reset link), once they have signed in before | The person |
| The server suspends an account nobody used for the settings' `suspendInactiveDays` | The person |
| An access review starts with role assignments the person may decide | The person, with how many, the review and when it closes |

Email is the only channel for now; LINE or another channel can be added alongside it later.

### The language of emails

Every email is in the language of the person it goes to: their `User.language`, `th` (Thai) or `en` (English), or, while that is `null`, the settings' `defaultLanguage`. The app keeps `language` to the language the person last used it in: after signing in, and whenever they switch, it sends `PATCH /users/:id` with `{ language }` if the two differ (`Session`). The form for a new user can set it as well, so the invitation comes in that language. Dates and times in emails are in the organization's time zone the server is set to (`access-control.time-zone`, `Asia/Bangkok` by default; the server's nightly jobs run by it too), with the Buddhist year in Thai (2569 for 2026).

## Password rules

The settings decide how long a new password must be (`passwordMinLength`, 8 to 64) and how many of a user's most recent passwords, the current one included, cannot be chosen again (`passwordHistory`, 0 to 24; 0 checks nothing). They apply wherever someone sets a password: `POST /me/password`, `POST /auth/activate` and `POST /auth/password-reset/confirm`. Refuse a shorter one with `weak_password` and a recent one with `password_reused` (both `422`). Resetting someone's password keeps the old one in their history.

| Request | Answer | Permission |
| --- | --- | --- |
| `GET /auth/password-policy` | `{ minLength, history }` | Anyone, signed in or not, so the pages for the links in emails can show the rule |

## Signed-in devices and two-step sign-in

People can see and end their own sessions and turn two-step sign-in on or off for themselves. With `users.edit` they can do the same for people they manage (see the rules below), except turning someone's two-step sign-in on.

| Request | Body | Answer |
| --- | --- | --- |
| `GET /users/:id/sessions` | | `UserSession[]`, newest use first, the one making the request with `current: true` |
| `DELETE /sessions/:id` | `{ reason? }` for someone else's (see Reasons) | Nothing |
| `POST /users/:id/sessions/end` | `{ reason? }` for someone else (see Reasons) | Nothing. Ends every session of the user; for yourself, all but the current one |
| `POST /me/two-factor` | | `TwoFactorSetup`: a new base32 `secret` and its `otpauth://` `uri`, kept pending until confirmed. `invalid_request` while two-step sign-in is on: an authenticator in use is replaced by turning it off, with a code, then on again |
| `POST /me/two-factor/confirm` | `{ code }` | `TwoFactorConfirmation`: `{ user, recoveryCodes }`, the `User` with `twoFactor: true` and their first recovery codes; `invalid_code` if the code does not match the pending secret |
| `POST /me/two-factor/disable` | `{ code }` | The `User` with `twoFactor: false`; `invalid_code` if the code is wrong, which counts towards the lockout as at sign-in (refused the same while locked) |
| `POST /users/:id/two-factor/reset` | `{ reason? }` (see Reasons) | The `User` with `twoFactor: false`. Needs `users.edit`; `self_change` for yourself |
| `GET /me/recovery-codes` | | `{ remaining }`: how many of your recovery codes are left unused |
| `POST /me/recovery-codes` | | `{ codes }`: ten new recovery codes, which replace the old ones; `invalid_request` while two-step sign-in is off |

Codes are TOTP (RFC 6238): SHA-1, 30-second steps, 6 digits; accept one step either side for clock drift. `data/totp.ts` is a working reference. Log `auth.sessions_ended`, `auth.two_factor_on` and `auth.two_factor_off`.

### Recovery codes

As Google and GitHub give backup codes, turning two-step sign-in on gives ten recovery codes, for when the phone is lost. Each is ten lowercase letters and digits, without the ones easy to mix up (`0`, `1`, `i`, `l`, `o`), shown as two groups of five: `abcde-fghjk`. They are shown once, when made: the server keeps only a hash of each, as of a password. Wherever a code from the app is asked (`POST /auth/login`, `POST /me/reauthenticate`, `POST /me/two-factor/disable`), an unused recovery code works instead, once; ignore case, spaces and the dash. A wrong one is `invalid_code` and counts as a wrong code does. Turning two-step sign-in off, or an administrator resetting it, deletes them. Log `auth.recovery_code_used` (the person as both actor and target, with `recoveryCodesLeft` among the changes) and `auth.recovery_codes_created` when someone makes new ones.

### Roles that must use two-step sign-in

The settings can require it for some roles (`twoFactorRoleIds`). Someone who holds one of them now (see Role assignments) and has not turned it on can still sign in, but until they turn it on the server answers every request with `403` `two_factor_mandatory`, `GET /events` included, except the ones they need to do it: `GET /me`, `GET /settings`, `GET /roles`, `POST /me/reauthenticate` (turning it on may ask for the password again), `POST /me/two-factor` and `POST /me/two-factor/confirm` (and `/auth/*`, which need no access token). This applies at once, from the next request: an administrator who adds their own role while their two-step sign-in is off is held back too. `POST /me/two-factor/disable` is refused with `two_factor_mandatory` while their role requires it. An administrator can still turn it off for them with `POST /users/:id/two-factor/reset`; they then have to turn it on again before anything else.

The app checks the same thing after signing in, and whenever a request answers `two_factor_mandatory`, and sends the person to `/setup-two-factor` until it is on. The settings page warns an administrator who is about to add their own role that way.

## Confirming who you are

As GitHub's sudo mode and Microsoft Entra's reauthentication ask for the password again, the changes that could take the system over or shut people out go through only when the person signed in, or confirmed their password, within the settings' `reauthMinutes` (10 on a new installation; `0` never asks). Refreshing the token does not count. Otherwise refuse them with `403` `reauth_required`, once the request is known to be allowed (the permission, and who the person may manage) and before anything changes:

| Change | Requests |
| --- | --- |
| Giving, changing or taking away roles | `POST /users` and `POST /users/import`, which give the new users roles; `POST /role-assignments`, `PATCH /role-assignments/:id`, `DELETE /role-assignments/:id`, `POST /role-assignments/batch` |
| What a role allows | `PATCH /roles/:id` when `permissions` change, `DELETE /roles/:id` |
| Deleting people | `POST /users/delete` |
| Someone else's sign-in | `POST /users/:id/reset-password`, `POST /users/:id/two-factor/reset`, and `DELETE /sessions/:id` and `POST /users/:id/sessions/end`, each for someone else |
| What recovers an account | `PATCH /users/:id` when `email` changes, since the reset links go there; `POST /me/two-factor`, which binds the account to an authenticator |
| Your own recovery codes | `POST /me/recovery-codes` |
| Closing an access review, which takes away the roles decided `remove` | `POST /access-reviews/:id/close` |
| The settings | `PATCH /settings` |

The list is fixed, so whoever changes the settings cannot take one of them off it; the settings decide only how long a confirmation lasts.

| Request | Body | Answer |
| --- | --- | --- |
| `POST /me/reauthenticate` | `{ password, code? }` | Nothing. Notes the time on the session of the access token. A wrong password is `invalid_credentials`; with two-step sign-in on, no `code` is `two_factor_required` and a wrong one `invalid_code` |

Wrong passwords and codes count towards locking the account, as at sign-in, and too many attempts from one address are refused with `429` `too_many_requests`. When a change is refused with `reauth_required`, the app asks for the password (and the code, with two-step sign-in on) over the page and sends the same request again, so nothing typed is lost; closing that dialog leaves the change unsent.

## Live updates

With `provideUserManagement({ api: HttpAdminApi, liveUpdates: true })`, the app reads the event stream at `GET /events` and loads its data again whenever a message arrives, so changes made by other people show without a reload. `EventSource` cannot send an `Authorization` header, so `HttpAdminApi` reads the stream through `HttpClient` with the access token, and connects again (refreshing the token first if needed) when the stream closes.

The server sends `data: changed` after each change and a `: ping` comment every 25 seconds, and closes the stream when the access token it was opened with runs out, so nobody keeps hearing about changes on a token that has expired or a session that has ended. `HttpAdminApi` then refreshes the token and connects again straight away. The message body is not read. Without `liveUpdates`, the app loads data when someone signs in and after their own changes.

## Users

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `GET /users` | | `User[]` | `users.view`; through a branch, its people and yourself (see Branch administrators); without it, only the signed-in user |
| `POST /users` | `UserDraft` | The new `User` | `users.create` |
| `POST /users/import` | `{ users: UserDraft[] }` | The new `User`s. All or none: refuse the whole request when one is refused | `users.create` |
| `PATCH /users/:id` | `UserChanges`: a `Partial<UserDraft>` without `roles` | The `User` | `users.edit`; without it, people may change their own `firstName`, `lastName`, `phone`, `avatar` and `language` |
| `POST /users/status` | `{ ids, status, reason? }` | The `User`s that changed | `users.edit` |
| `POST /users/delete` | `{ ids, reason? }` | Nothing | `users.delete` |
| `POST /users/:id/reset-password` | `{ reason? }` | Nothing | `users.edit` |
| `POST /users/:id/resend-invite` | | Nothing; `not_invited` unless the status is `invited` | `users.create` |

`UserDraft.branchId` is the branch the person belongs to (see Branches), or `null` for none: an unknown branch is `not_found`, a closed one `branch_closed` (`409`) unless they already belong to it.

`UserDraft.roles` gives a new user their first roles, each a `RoleGrant` checked as `POST /role-assignments` checks it; with none, they get the settings' `defaultRoleId` for good. Log one `role_assignment.added` entry per role, after the `user.created` or `user.invited` entry. Roles change afterwards only through role assignments: `PATCH /users/:id` refuses `roles` with `invalid_request`.

`language` is `th`, `en`, or `null` for the settings' `defaultLanguage`: the language of the person's emails (see The language of emails). Anything else is `invalid_request`. A change of `language` alone writes no `user.updated` entry, as it is a preference, like the theme; nor does a `PATCH` that changes nothing else the log keeps.

The server assigns `id`, `createdAt` and `lastActiveAt`. A new user with status `invited` gets an invitation email. Refuse an email someone else has with `email_taken`. When the settings list allowed domains, refuse a new or changed email outside them with `email_domain`.

## Role assignments

Someone's roles are the `RoleAssignment`s in `User.roles`, as in NIST RBAC: a person can hold several roles, and their permissions are those of every role they hold now, together. Each assignment gives one role from `startsAt` until `endsAt`, or for good when `endsAt` is `null`. It counts while `startsAt <= now < endsAt`: before that it is *scheduled*, after it *expired*. Someone who holds no role now can still sign in, and sees their own profile only.

**Scope**, as Azure RBAC scopes a role assignment: `branchId` `null` gives the role across the whole organization; a branch limits it to that branch (an open one: `not_found`, `branch_closed`). User management's own permissions (`users.*`, `roles.*`, `activity.*`, `settings.*`, `branches.*`, `reviews.*`) come from assignments for the whole organization, except the four that one limited to a branch grants over the people of that branch (see Branch administrators). Otherwise an assignment limited to a branch grants its permissions in that branch, for the app's own modules to check (`Session.can(permission, branchId)` in the app, `Actor.can(permission, branchId)` on the server).

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `POST /role-assignments` | `RoleAssignmentDraft`: `{ userId, roleId, startsAt?, endsAt, reason? }` | The `User` | `users.edit` |
| `PATCH /role-assignments/:id` | `{ endsAt?, reason? }` | The `User` | `users.edit` |
| `DELETE /role-assignments/:id` | `{ reason? }` | The `User` | `users.edit` |
| `POST /role-assignments/batch` | `{ userIds, add: RoleGrant }` or `{ userIds, removeRoleId, reason? }` | The `User`s that changed | `users.edit` |

- **Dates.** `startsAt` left out, or earlier than now, means now. `endsAt` must be later than both `startsAt` and now. Otherwise `invalid_request`.
- **Each role's own rules** (`Role.assignment`). With `maxDays`, an assignment of that role must end, at most that many days after it starts: refuse a longer one, or one without an end, with `assignment_too_long` (`422`). When `PATCH` moves the end, count from the start or from now, whichever is later. With `reasonRequired`, a blank `reason` is `reason_required` (`422`). A reason is at most 500 characters.
- **Once at a time.** A new assignment that overlaps one the person already has of the same role in the same scope is refused with `already_assigned` (`409`); the same role in two branches is two assignments. To extend one, or renew one that has expired, `PATCH` its `endsAt`.
- **Who may.** The rules below apply: the actor must have `users.edit` and every permission of the role in the assignment's scope (rule 2; see Branch administrators) and be able to manage the person (rule 3), and nobody changes their own assignments (rule 4).
- **Conflicting roles.** A role that a rule says cannot be held with one the person holds, now or later, at an overlapping time is refused with `role_conflict` (`409`); see Conflicting roles.
- **Expired ones stay** on the user, so they can be renewed, until they are older than the settings' `activityRetentionDays`. A removed one is gone at once; the activity log keeps what it was.
- **Several people at once.** `add` gives the role to everyone in `userIds` who does not hold it now or later; `removeRoleId` takes away their current and scheduled assignments of that role. Send one of the two. All or none: refuse the whole request when one change is refused. Repeated ids count once, and people with nothing to change are left out of the answer and the log.

Log each change with the person as the target: `role_assignment.added` (changes `roleId`, `branchId`, `startsAt`, `endsAt`, with the grant's reason as the entry's `reason`), `role_assignment.updated` (the fields that changed, `reason` among them), `role_assignment.removed` (`roleId`, with the request's reason) and, written by the server itself when an assignment ends, `role_assignment.expired` with `actorId: null`. A review that takes one away writes `role_assignment.removed` with `actorId: null` (see Access reviews). Deleting a user removes their assignments without entries of their own.

## Branches

Branches (sites, offices) are optional: the settings' `branchesEnabled` shows the Branches page and the branch fields. People belong to one branch, or none, as Google Workspace puts each user in one organizational unit; roles can be limited to a branch (see Role assignments). Turning branches off hides them and keeps the data.

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `GET /branches` | | `Branch[]` | Anyone signed in, to show branch names |
| `POST /branches` | `BranchDraft`: `{ code, name }` | The new `Branch` | `branches.manage` |
| `PATCH /branches/:id` | `Partial<BranchDraft>` and `active` | The `Branch` | `branches.manage` |
| `DELETE /branches/:id` | | Nothing; `branch_in_use` while anyone belongs to it or holds a role there now or later | `branches.manage` |

`code` is short (1 to 10 letters, digits or dashes, kept upper-case) and unique, ignoring case: `code_taken` (`409`). `name` is 1 to 100 characters. A closed branch (`active: false`) keeps its people and their roles, but nobody new joins it or gets a role there. Deleting a branch removes the ended role assignments limited to it. Log `branch.created`, `branch.updated` (the fields that changed) and `branch.deleted`.

## Branch administrators

As Microsoft Entra's administrative units and Google Workspace's organizational units let someone look after one part of the organization, a role limited to a branch grants four of user management's permissions over the people who belong to that branch (`User.branchId`), so a branch manager looks after their branch's staff and nobody else. Deleting people, roles, settings, branches, access reviews and exporting the log (`users.delete`, `roles.*`, `settings.*`, `branches.*`, `reviews.*`, `activity.export`) still need a role for the whole organization. Someone who has one of the four only through branches gets:

| Permission | Through a branch |
| --- | --- |
| `users.view` | `GET /users` answers the people of those branches, and themselves |
| `users.create` | `POST /users` and `POST /users/import` with `branchId` one of those branches, and `POST /users/:id/resend-invite` for their people. A new user given no role gets the settings' default role limited to their branch |
| `users.edit` | The changes to the people of those branches: `PATCH /users/:id` (moving them only to another of those branches), status, password, two-step sign-in, devices and role assignments |
| `activity.view` | `GET /activity` answers the entries whose `targetId` is one of the people of those branches |

Roles go by scope. An assignment for the whole organization needs `users.edit` (`users.create` for a new user's roles) for the whole organization; one limited to a branch needs it there. Rules 2 and 3 count the same way: what someone has in a branch is what their roles for the whole organization allow, together with what their roles limited to that branch allow. They give a role limited to a branch only when they have its every permission there, and manage a person only when they have, for each role the person holds now or later, every permission of that role in its scope. So nobody manages through a branch someone whose role for the whole organization allows more than their own roles for the whole organization. Anything else is `forbidden`.

## Roles

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `GET /roles` | | `Role[]` | Anyone signed in |
| `POST /roles` | `RoleDraft` | The new `Role` | `roles.manage` |
| `PATCH /roles/:id` | `Partial<RoleDraft>` | The `Role` | `roles.manage` |
| `DELETE /roles/:id` | | Nothing; `system_role` for a built-in role, `role_in_use` while anyone holds it now or later, `default_role` while the settings give it to new users | `roles.manage` |

`Role.assignment` sets how the role may be given (see Role assignments): `maxDays` (1 to 365, or `null` for no limit) and `reasonRequired`. A new role without it gets `{ maxDays: null, reasonRequired: false }`. Deleting a role removes its expired assignments with it.

**Built-in roles** (`system: true`) come from the server's code, as Microsoft Entra's and AWS's built-in roles do: their `name`, `description` and `permissions` are the same on every installation and come back after an upgrade, and the built-in Administrator role holds every permission, including ones added later. `PATCH` may change only their `tone` and `assignment`; anything else is `system_role`. To give a built-in role's people something different, copy it into a new role (the roles page has "Duplicate") and assign that instead.

## Reasons

As Microsoft Entra asks for a justification, the changes that take or reset someone's access carry a reason: `reason`, trimmed, at most 500 characters. The activity log keeps it as the entry's `Activity.reason`. The settings' `reasonsRequired` lists the ones that must have one; there a blank reason is `reason_required` (`422`). The others take a reason when one is given.

| `reasonsRequired` | Requests | Entries |
| --- | --- | --- |
| `status` | `POST /users/status` | `user.suspended`, `user.activated` |
| `delete` | `POST /users/delete` | `user.deleted` |
| `removeRole` | `DELETE /role-assignments/:id`; `POST /role-assignments/batch` with `removeRoleId`; `remove` in `POST /access-reviews/:id/decisions`, as its `note` | `role_assignment.removed`, `access_review.decided` |
| `resetSignIn` | `POST /users/:id/reset-password`; `POST /users/:id/two-factor/reset` | `user.password_reset`, `auth.two_factor_off` |
| `endSessions` | `DELETE /sessions/:id`, `POST /users/:id/sessions/end`, for someone else | `auth.sessions_ended` |

Nobody needs a reason for their own sessions or password. A new role assignment's `reason` (see Role assignments, where `Role.assignment.reasonRequired` decides) is the reason of its `role_assignment.added` entry.

## Conflicting roles

As NIST RBAC's static separation of duty, a rule names roles nobody may hold at the same time, so that one person cannot both do and check the same work.

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `GET /role-conflicts` | | `RoleConflict[]` | Anyone signed in |
| `POST /role-conflicts` | `RoleConflictDraft`: `{ name, description?, roleIds }` | The new `RoleConflict` | `roles.manage` |
| `PATCH /role-conflicts/:id` | `Partial<RoleConflictDraft>` | The `RoleConflict` | `roles.manage` |
| `DELETE /role-conflicts/:id` | | Nothing | `roles.manage` |

`name` is 1 to 100 characters, `description` at most 500, and `roleIds` 2 to 20 different roles that exist (`not_found` otherwise). Giving a role (`POST /role-assignments`, `add` in `POST /role-assignments/batch`, a new or imported user's roles) is refused with `role_conflict` (`409`) when the person holds, now or later, another role of a rule with that role at a time the new assignment overlaps. Scope does not matter: a role for one branch still lets one person do both. Moving an assignment's end (`PATCH /role-assignments/:id`) is checked the same way.

A rule made while people already hold its roles is kept: the roles page lists them as the people to fix, and the rule stops anyone new. Deleting a role takes it off the rules; a rule left with fewer than two roles goes with it. Log `role_conflict.created`, `role_conflict.updated` (the `name` and `description` that changed, and `roles` as items added and removed) and `role_conflict.deleted`.

## Access reviews

As Microsoft Entra's access reviews, and the regular checks of who can do what that ISO 27001 (control 5.18) and the Bank of Thailand's IT risk rules ask for, a review asks whether people still need the roles they hold. Someone with `reviews.manage` starts one; the people who look after each person decide, before a due date, whether each of their roles stays or goes; when it closes, the roles marked to go are taken away, and the review stays as the record an auditor asks for.

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `GET /access-reviews` | | `AccessReview[]`, newest first | `reviews.manage`: every review; without it, the ones they take part in (see Who decides) |
| `POST /access-reviews` | `AccessReviewDraft`: `{ name, roleId?, branchId?, dueAt, reviewerIds? }` | The new `AccessReview` | `reviews.manage` |
| `GET /access-reviews/:id/items` | | `AccessReviewItem[]`, by person | `reviews.manage`, or named by the review: all of them; without it, the ones they may decide (or decided, once it is closed), and `not_found` for a review they take no part in |
| `POST /access-reviews/:id/decisions` | `{ itemIds, decision, note? }` | The `AccessReviewItem`s decided | Someone who may decide each of them |
| `POST /access-reviews/:id/close` | | The `AccessReview`, closed | `reviews.manage` |
| `DELETE /access-reviews/:id` | | Nothing | `reviews.manage`; an open review only |

**What it covers.** Starting a review takes, at that moment, every role assignment held now or later (not ended) by the people in its scope: of the role `roleId`, or of every role when it is left out or `null`; of the people who belong to the branch `branchId` (`User.branchId`), or of everyone. Each becomes an `AccessReviewItem` that keeps the person's name and email, the role's name, the assignment's scope and dates as text, so the report reads the same after they change or are deleted. `name` is 1 to 100 characters; `dueAt` an instant after now and at most 365 days ahead; `reviewerIds` at most 20 different people. An unknown role, branch or person is `not_found`; anything else wrong is `invalid_request`.

**Who decides.** An assignment is decided by the people who look after its holder: those who may manage them with `users.edit` (rules 1, 3 and 4, so a branch administrator decides for the people of their branch) and have every permission of the role in the assignment's scope. The people the review names in `reviewerIds` decide all of it besides. Nobody decides about their own roles. Someone without `reviews.manage` takes part in a review that names them, in an open one that holds an assignment they may decide, and in a closed one where they decided some: `GET /access-reviews` lists those, and `GET …/items` answers them those assignments, the ones they decided once it is closed (all of them, to the people it names). Who may decide is worked out when asked, from the roles people hold then. `canDecide` marks each assignment the signed-in user may decide now, and each review says how many of those still wait for a decision (`waitingCount`).

**Deciding.** `decision` is `keep` or `remove`; `note`, at most 500 characters, says why. With `removeRole` in the settings' `reasonsRequired` (see Reasons), `remove` without a note is `reason_required`. A decision changes nothing yet and can change until the review closes: the last one counts, with who made it and when. All or none: an assignment of another review is `not_found`, one the person may not decide `forbidden`, their own `self_change`, and nothing is decided. On a closed review, `review_closed` (`409`).

**Closing.** At `dueAt` the server closes the review by itself; `POST …/close` closes it sooner, a change that asks for the password again (see Confirming who you are). Closing takes away each assignment decided `remove`, writing `role_assignment.removed` with `actorId: null`, the review's name as `accessReview` among the changes and the decision's note as the reason, and gives every item its `outcome`:

| `outcome` | When |
| --- | --- |
| `kept` | Decided `keep` |
| `removed` | Decided `remove`, and taken away |
| `not_reviewed` | Nobody decided: it stays, and the report says so |
| `gone` | Decided `remove`, but it had already ended or been taken away |
| `last_administrator` | Decided `remove`, but nobody else would be left to run the system (rule 6): it stays |

A closed review cannot change or be deleted (`review_closed`): it is the record. Log `access_review.started` (the `roleId` and `branchId` when given, `dueAt`, the `reviewers` as items added, and how many `assignments`), `access_review.decided` (the `decision` and how many `assignments`, with the note as the reason), `access_review.closed` (how many were `kept`, `removed` and `notReviewed`; `actorId: null` when the server closed it) and `access_review.deleted`, each with the review as the target. When a review starts, the server emails each active person who may decide some of it how many and by when (see Emails about your account).

## Activity

| Request | Answer | Permission |
| --- | --- | --- |
| `GET /activity?from=&to=` | `Activity[]`, newest first, at most 10,000. `from` and `to` (both optional) keep the entries at or after `from` and before `to`. Each is an ISO 8601 instant with `Z` or an offset, such as `2026-10-01T00:00:00.000Z` or `2026-10-01T07:00:00+07:00`; a date alone or a time without an offset is `invalid_request` | `activity.view`; through a branch, the entries about its people; without it, an empty list |

The server writes the log itself, one entry per change, with `actorId` from the session and `ip`, `browser` and `os` from the request. What the server does by itself, such as ending an assignment on time, has `actorId: null` and empty `ip`, `browser` and `os`. `changes` lists the fields that changed and `reason` is the request's reason, if any (see Reasons); see `Activity` in `data/models.ts` and how `data/local-admin-api.ts` fills it. Entries older than the settings' `activityRetentionDays` are deleted every night.

## Settings

| Request | Body | Answer | Permission |
| --- | --- | --- | --- |
| `GET /settings` | | `AdminSettings` | Anyone signed in |
| `PATCH /settings` | `Partial<AdminSettings>` | The `AdminSettings` | `settings.manage` |

`defaultRoleId` is the role a new user gets, for good, when `POST /users` or an imported row gives them none; limited to their branch when someone adds them through a branch (see Branch administrators). `branchesEnabled` (`false` on a new installation) turns branches on. `reasonsRequired` (see Reasons; `["status", "delete"]` on a new installation) lists the changes that need a reason; an unknown item is `invalid_request`, and the list is stored without duplicates. `reauthMinutes` (0 to 1440; 10 on a new installation) is how long a sign-in or a confirmed password lets the person make the changes under Confirming who you are. `defaultLanguage` (`th` or `en`; `th` on a new installation) is the language of emails to people whose `language` is `null`, such as someone just invited (see The language of emails). `suspendInactiveDays` (0 to 3650; 0, off, on a new installation): every night the server suspends active accounts whose `lastActiveAt` (or `createdAt`, for someone who never signed in) is older than that, as IT audits ask of accounts nobody uses, and writes `user.suspended` for each with `actorId: null` and `inactiveDays` among the changes, then emails them; never the last active user who can run the system (rule 6). Besides the default role, the allowed domains, the invitation expiry and the idle timeout, `AdminSettings` holds the account rules: `twoFactorRoleIds` (roles that must use two-step sign-in), `passwordMinLength` (8 to 64), `passwordHistory` (0 to 24) and `activityRetentionDays` (90 to 3650: at least 90 days, as Thailand's Computer-Related Crime Act, section 26, has service providers keep traffic data; an installation that kept less keeps 90). Refuse a value outside its range with `invalid_request` and an unknown role id with `not_found`. Store `allowedDomains` lower-cased, without duplicates, and `twoFactorRoleIds` without duplicates; deleting a role takes it off that list. Log a `settings.updated` entry listing the fields that changed, the three lists as items added and removed. `sessionTimeoutMinutes` is enforced by the app, and by the server too: a session that made no request for that long (give or take the minute `lastSeenAt` is kept to) ends, so its next request, or refresh, is `401` `unauthenticated`. A browser left asleep with the refresh cookie gets nothing from it.

## Rules the server must check

The pages hide what a role cannot do, but only the server can enforce it. `data/local-admin-api.ts` checks the same rules and is a working reference, with the helpers in `data/access-rules.ts`:

1. Each request needs the permission in the tables above, for the whole organization or, where Branch administrators says so, in a branch. Refuse with `403` and `forbidden`.
2. Nobody gives out more than they have. Refuse with `forbidden` when someone:
   - gives a role (a new assignment, a change to one, or a new user's roles) that grants a permission they lack;
   - adds or removes a permission they lack on a role.
3. Nobody manages someone who holds, now or later, a role that grants a permission they lack in that role's scope (see Branch administrators). Refuse editing, suspending, deleting, resetting or inviting that person, or changing their role assignments, with `forbidden`. The same goes for roles: nobody edits or deletes a role that grants a permission they lack.
4. Nobody suspends or deletes themselves, changes their own role assignments, or changes the permissions of a role they hold now. Refuse with `self_change`.
5. Take only the fields each request may set (the `UserDraft`, `UserChanges`, `RoleAssignmentDraft`, `RoleDraft`, `AccessReviewDraft` and `AdminSettings` fields), and refuse anything else with `invalid_request`, so nobody can set an `id`, the `system` flag or the dates the server keeps.
6. Someone must always be able to run the system, as Google Workspace keeps a last super administrator: at least one active user holds, for good and for the whole organization, a role with every permission. Refuse removing that assignment, giving it an end, or suspending or deleting its holder, when it is the last one, with `last_administrator` (`409`).

## Errors

Refuse a request with a 4xx status and a body such as `{ "code": "email_taken" }`; the body may carry more, such as the other fields of an RFC 9457 problem detail. The codes are listed in `AdminApiErrorCode` in `data/admin-api.ts`, and the pages show a message for each. These are the statuses `localBackend` uses:

| Status | Codes |
| --- | --- |
| `401` | `unauthenticated` (no access token, or one that has run out or whose session has ended), `invalid_credentials`, `two_factor_required`, `invalid_code` |
| `403` | `forbidden`, `self_change`, `account_suspended`, `invite_pending`, `two_factor_mandatory`: the role requires two-step sign-in and it is off; `reauth_required`: the change needs the password confirmed again |
| `404` | `not_found` |
| `400` | `invalid_request`: a field the request may not set, or a value of the wrong kind; `invalid_token`: an email link that has expired or was used |
| `409` | `email_taken`, `role_in_use`, `system_role`, `not_invited`, `default_role`, `already_assigned`, `last_administrator`, `code_taken`, `branch_in_use`, `branch_closed`, `role_conflict`, `review_closed` |
| `422` | `email_domain`, `weak_password`, `password_reused`, `assignment_too_long`, `reason_required` |
| `429` | `too_many_requests`: too many sign-in, refresh or reset attempts from one address, or checks of a password or a code (`POST /me/reauthenticate`, `POST /me/password`, `POST /me/two-factor/disable`) |

Without a known code, `401` counts as `unauthenticated`, `403` as `forbidden`, `404` as `not_found` and `429` as `too_many_requests`. When a refresh cannot fix an `unauthenticated`, the app sends the person to sign in, then brings them back to the page they were on. Other failures (offline, `5xx`) show "Something went wrong".
