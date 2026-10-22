# Flockwise web

The Flockwise web app: the **church office dashboard** (`/admin`) and the **member portal**
(`/app`, same features as the mobile app). Vite + React 19 + TypeScript + React Router.

It talks to the backend only through the API in [docs/API.md](docs/API.md) (shared with the
mobile app) and [docs/API-ADMIN.md](docs/API-ADMIN.md). Until the backend is live it runs on a
built-in demo backend with sample data for "Grace Community Church" (sign-in code `123456`).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-checks and builds to dist/
npm start            # serves dist/ on $PORT (default 3000), for Hostinger
```

## Settings (`.env`, copy from `.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | `https://api.flockwise.church/v1` | Flockwise API base URL |
| `VITE_USE_MOCKS` | `true` | `true` = demo data, no server. Set `false` once the API is live |
| `VITE_APP_ENV` | `development` | `production` hides the Server switcher |

These are baked in at build time, so rebuild after changing them. In non-production builds you
can also point a running app at any API from **Settings → Server** (admin) or **Me → Server** (member).

## Deploy on Hostinger (Node.js web app)

1. hPanel → **Websites → Add website → Node.js app** (or **Web app**). Connect the GitHub repo or upload the zip.
2. Framework: **Vite** (or "Other"). Node **22.x**. Build command `npm run build`. Start command `npm start`. Output directory `dist`.
3. Environment variables: `VITE_USE_MOCKS=false`, `VITE_API_URL=https://api.flockwise.church/v1`, `VITE_APP_ENV=production`. Keep `VITE_USE_MOCKS=true` for a demo site.
4. Domain: `app.flockwise.church` (add an A/CNAME record as hPanel instructs). SSL is automatic.

Static hosting also works: upload the contents of `dist/` to `public_html`. The included
`.htaccess` makes deep links like `/admin/people` work.

## Structure

```
src/api/        client (per-scope sessions, token refresh), endpoints, types, demo backend (mock.ts)
src/admin/      office dashboard: dashboard, people, import, events, groups, giving (+80G), announcements, settings
src/member/     member portal: home, events + RSVP, groups, give, me
src/components/ shared UI, OTP sign-in, server switcher
src/i18n/       English + Hindi strings, shared with the mobile app (Hindi is machine drafted: needs review)
server.mjs      zero-dependency production server with SPA fallback
```

## What still needs the backend

Everything works in demo mode. Against a real server, giving works today with
[flockwise-api](../flockwise-api) (Razorpay). OTP sign-in, people, events, groups, announcements
and settings endpoints are specified in the docs and still to be built server-side.
