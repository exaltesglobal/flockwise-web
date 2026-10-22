# Flockwise mobile API contract (v1)

This is what the Android/iOS app expects from the Flockwise backend. Build these
endpoints in the web app's backend (on Hostinger) and the mobile app will work
against it by changing one setting: `EXPO_PUBLIC_API_URL`.

The demo backend in `src/api/mock.ts` implements every endpoint below, so it is
also a working reference for request and response shapes. TypeScript types live
in `src/api/types.ts`.

## Conventions

- **Base URL**: `https://api.flockwise.church/v1` (production), `https://staging-api.flockwise.church/v1` (staging). Any host works; the app only needs the base URL.
- **Format**: JSON in and out. `Content-Type: application/json`.
- **Auth**: `Authorization: Bearer <accessToken>` on every request except `/auth/*`.
- **Tenancy**: the church is taken from the signed-in member's token. The app never sends a church id.
- **Money**: integers in minor units (paise, cents) plus an ISO 4217 `currency`.
- **Time**: ISO 8601 UTC strings, e.g. `2026-10-25T03:30:00Z`.
- **Lists**: `{ "data": [...], "nextCursor": "abc" | null }`; pass `?cursor=abc` for the next page.
- **Errors**: non-2xx with
  ```json
  { "error": { "code": "invalid_code", "message": "Human readable, already translated", "fields": { "phone": "..." } } }
  ```
  `401` means the access token expired; the app calls `/auth/refresh` once, then signs the user out if that fails.
- **CORS**: not needed for the native apps. Needed only if the web build of this app is used.
- **Language**: the app sends the member's language via `PATCH /me`; return `message` strings in that language where you can.

## Auth (passwordless OTP)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/otp/request` | `{ identifier }` (phone in E.164 or email) | `OtpRequest` `{ requestId, channel: "sms"\|"whatsapp"\|"email", expiresInSeconds }` |
| POST | `/auth/otp/verify` | `{ requestId, code }` | `Session` |
| POST | `/auth/refresh` | `{ refreshToken }` | `Session` (rotate the refresh token) |
| POST | `/auth/sign-out` | `{ refreshToken }` | `204` |

`Session` = `{ accessToken, refreshToken, expiresAt, member: Member, church: Church }`.

Only people already in the church's member list can sign in. Unknown numbers should get a friendly `404 not_member` error telling them to contact the church office. Rate-limit OTP requests per identifier and per IP.

## Me

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/me` | | `Member` |
| PATCH | `/me` | any of `firstName, lastName, email, language` | `Member` |
| POST | `/me/devices` | `{ pushToken, platform: "ios"\|"android" }` | `204` (for push notifications, later) |

## Home

| Method | Path | Returns |
|---|---|---|
| GET | `/home` | `{ nextService: ChurchEvent \| null, announcements: Announcement[], upcomingEvents: ChurchEvent[] }` |

## Events

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/events?cursor=` | | `Paginated<ChurchEvent>` (upcoming, soonest first) |
| GET | `/events/:id` | | `ChurchEvent` |
| PUT | `/events/:id/rsvp` | `{ status: "going"\|"not_going" }` | `ChurchEvent` (with updated `goingCount`, `myRsvp`) |

`ChurchEvent` = `{ id, kind: "service"\|"event", title, description, startsAt, endsAt, location, imageUrl?, goingCount, capacity?, myRsvp }`.

## Groups

| Method | Path | Returns |
|---|---|---|
| GET | `/groups` | `Paginated<Group>` (groups open to this member) |
| POST | `/groups/:id/join-requests` | `Group` with `membership: "requested"` (the leader approves in the admin panel) |

## Giving

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/giving/funds` | | `Fund[]` `{ id, name, description, taxDeductible }` |
| POST | `/giving/intents` | `GiveIntentInput` | `{ donationId, checkoutUrl }` |
| GET | `/giving/donations?cursor=` | | `Paginated<Donation>` |

`GiveIntentInput` = `{ fundId, amount, currency, frequency: "once"\|"monthly", donorCitizenship: "IN"\|"OTHER", pan? }`.

How giving works:
1. The app posts the intent. The backend creates a Razorpay order/subscription (India) or Stripe Checkout session (elsewhere) **on the church's own connected account**, and returns its hosted `checkoutUrl`.
2. The app opens `checkoutUrl` in the in-app browser. UPI, cards and netbanking are handled by Razorpay/Stripe; the app never touches card data.
3. The payment provider's webhook tells the backend the result; the backend marks the donation `succeeded`, emails the 80G receipt, and it appears in `/giving/donations`.
4. **FCRA**: if `donorCitizenship` is `OTHER` and the church is in India, route the gift to the church's FCRA account (SBI New Delhi) or refuse it if the church has no FCRA registration. Confirm the rules with a lawyer before launch.

## Coming later (not in the app yet)

Check-in (kids and services, QR), push notifications, sermons/media, prayer requests, volunteer rotas, household management, member directory.
