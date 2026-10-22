# Flockwise admin API contract (v1)

Endpoints used by the church office dashboard (`/admin` in the web app). They extend the
member contract in [API.md](API.md), use the same conventions (base URL, JSON, minor-unit
money, ISO 8601 UTC, `{ data, nextCursor }` lists, `{ error: { code, message, fields } }` errors),
and the same sign-in endpoints.

The demo backend in `src/api/mock.ts` implements everything below and is the reference for
exact shapes. TypeScript types: `src/api/admin-types.ts`.

## Sign-in for staff

Same OTP flow as members (`POST /auth/otp/request`, `/auth/otp/verify`), with `audience: "admin"`
in the request body. The returned `Session` has `staff: { role }` when the person is on the
church's staff list; the web admin refuses sessions without it. Roles: `owner`, `admin`, `pastor`,
`finance`, `leader`. Every `/admin/*` endpoint must check the role server-side:

| Area | owner / admin | pastor | finance | leader |
|---|---|---|---|---|
| Dashboard | ✓ | ✓ (no giving totals) | ✓ | – |
| People, notes, import | ✓ | ✓ | read | their group members |
| Events, announcements | ✓ | ✓ | – | – |
| Groups, join requests | ✓ | ✓ | – | their groups |
| Giving, funds, 80G | ✓ | – | ✓ | – |
| Settings, staff | ✓ | – | – | – |

## Dashboard

| Method | Path | Returns |
|---|---|---|
| GET | `/admin/dashboard` | `Dashboard` (people counts, 12 weeks of Sunday attendance, 6 months of giving, pending join requests, next 4 events, 6 recent gifts, birthdays in the next 7 days) |

## People

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/people?q=&status=&cursor=` | | `{ data: Person[], nextCursor, total }` (sorted by last name; `q` matches name, email, phone digits, household) |
| POST | `/admin/people` | `PersonInput` | `Person` |
| GET | `/admin/people/:id` | | `Person` (with `groups`) |
| PATCH | `/admin/people/:id` | partial `PersonInput` | `Person` |
| DELETE | `/admin/people/:id` | | `204` |
| POST | `/admin/people/import` | `{ rows: PersonInput[], source: "excel"\|"csv"\|"elvanto"\|"planning_center", dedupeBy: "phone"\|"email" }` | `{ created, updated, skipped, errors: [{ row, message }] }` |

The web app parses the spreadsheet in the browser and sends clean rows (phones normalised to
`+91 XXXXX XXXXX` for bare 10-digit Indian numbers, dates as `YYYY-MM-DD`). Match existing people
on the last 10 digits of the phone, or lower-cased email. Process in batches of 500 server-side.

## Services & events

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/events?when=upcoming\|past` | | `Paginated<AdminEvent>` (`AdminEvent` = `ChurchEvent` without `myRsvp`, plus `published`, `attendance`) |
| POST | `/admin/events` | `EventInput` | `AdminEvent` |
| PATCH | `/admin/events/:id` | partial `EventInput` | `AdminEvent` |
| DELETE | `/admin/events/:id` | | `204` |
| PUT | `/admin/events/:id/attendance` | `{ count }` | `AdminEvent` (service headcounts feed the dashboard chart) |

Only `published` events are returned by the member `/events` and `/home` endpoints.

## Groups

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/groups` | | `Paginated<AdminGroup>` (`isOpen`, `memberCount`, `pendingRequests`) |
| POST | `/admin/groups` | `GroupInput` | `AdminGroup` |
| PATCH | `/admin/groups/:id` | partial `GroupInput` | `AdminGroup` |
| DELETE | `/admin/groups/:id` | | `204` |
| GET | `/admin/groups/join-requests` | | `Paginated<JoinRequest>` (newest first) |
| POST | `/admin/groups/join-requests/:id/approve` | | `204` (adds the person to the group) |
| POST | `/admin/groups/join-requests/:id/decline` | | `204` |

Only `isOpen` groups appear in the member `/groups` list. Member `POST /groups/:id/join-requests` creates a `JoinRequest`.

## Giving

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/giving/donations?fundId=&from=&to=&q=&cursor=` | | `{ data: AdminDonation[], nextCursor, total, totalAmount }` (`from`/`to` are `YYYY-MM-DD`; `totalAmount` sums succeeded gifts) |
| POST | `/admin/giving/donations` | `OfflineDonationInput` (cash, cheque, bank transfer) | `AdminDonation` |
| GET | `/admin/giving/funds` | | `AdminFund[]` (`active`, `goal`, `raisedThisYear` for the current financial year) |
| POST | `/admin/giving/funds` | `FundInput` | `AdminFund` |
| PATCH | `/admin/giving/funds/:id` | partial `FundInput` | `AdminFund` |
| GET | `/admin/giving/receipts-80g?financialYear=2026-27` | | `Receipts80g` (donors with totals for Form 10BD) |

80G rules applied by `receipts-80g`: only succeeded gifts to `taxDeductible` funds, excluding FCRA
gifts and cash gifts above ₹2,000. Indian financial year runs 1 April to 31 March.

## Announcements

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/announcements` | | `Paginated<AdminAnnouncement>` (`status: "draft"\|"published"`) |
| POST | `/admin/announcements` | `{ title, body, status }` | `AdminAnnouncement` |
| PATCH | `/admin/announcements/:id` | partial | `AdminAnnouncement` (publishing a draft sets `publishedAt` to now) |
| DELETE | `/admin/announcements/:id` | | `204` |

## Settings and staff

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/settings` | | `ChurchSettings` (profile, languages, `payments`, `fcra`, `receipts80g`) |
| PATCH | `/admin/settings` | partial `ChurchSettings` (not `id` or `payments`) | `ChurchSettings` |
| POST | `/admin/settings/payments/connect` | | `{ onboardingUrl }` (Razorpay/Stripe onboarding for the church's own account; empty when already connected) |
| GET | `/admin/staff` | | `StaffMember[]` |
| POST | `/admin/staff` | `{ name, email, role }` | `StaffMember` with `status: "invited"` (send the invite email) |
| DELETE | `/admin/staff/:id` | | `204` (the owner cannot be removed) |

## CORS

The web app calls the API from the browser, so the API must allow the web app's origin
(e.g. `https://app.flockwise.church`) with headers `Authorization, Content-Type, X-Client`.
