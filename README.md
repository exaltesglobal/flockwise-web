# Flockwise web

The Flockwise web app: the **church office dashboard** (`/admin`) and the **member portal**
(`/app`, same features as the mobile app). Vite + React 19 + TypeScript + React Router.

It talks to [flockwise-api](../flockwise-api) through the contract in [docs/API.md](docs/API.md)
(shared with the mobile app) and [docs/API-ADMIN.md](docs/API-ADMIN.md). With `VITE_USE_MOCKS=true`
it runs the same engine in the browser with sample data for "Grace Community Church": any email
signs in, code `123456`, and every message the system would send appears under Messages → Demo outbox.

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
src/core/       business engine, copied from flockwise-api (run: node scripts/sync-core.mjs). Do not edit here.
src/api/        client (per-scope sessions, token refresh), endpoints, demo backend (mock.ts runs src/core)
src/admin/      office: dashboard, people, check-in (desk + kiosk), events, volunteers, service planning,
                groups, giving (80G, pledges, statements), messages, announcements, care & prayer,
                insights, import, settings (campuses, rooms, team & roles, activity log)
src/member/     member portal: home, events (tickets, self check-in), serving, prayer wall, groups,
                give (pledges, 80G statement), directory, me (QR code, privacy, language)
src/components/ shared UI, email sign-in, QR code, server switcher
src/i18n/       English, Hindi, Tamil, Telugu, Malayalam, Kannada (non-English drafts need a native review)
server.mjs      zero-dependency production server with SPA fallback
```

## Roles

The menu and buttons follow the signed-in staff member's permissions (owner, admin, pastor, finance,
group leader, volunteer coordinator, check-in desk). The server enforces the same rules.
