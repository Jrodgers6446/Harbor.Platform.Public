# Harbor platform

Harbor is a field-service platform: a manager website, a tablet app for the techs, a browser extension that reads the
scheduling and work-order systems a company already uses, and a small program that sends confirmation texts from a
phone. This is a public copy of the project with the owner's project ids, hostnames, keys and sample data removed.

It covers the day-to-day of a repair team:

- **Daily forms.** Techs fill in their forms on the tablet. The manager signs and can print them.
- **Route.** The tablet orders the day's stops and shows the tradeoff between fastest and on time.
- **Pre-call.** Managers text customers ahead of the visit and track replies.
- **Tech dashboard.** Success rate against a goal, per-tech results, and why jobs failed.
- **Repair guides.** Steps and parts for the device in front of the tech.
- **Tablets.** Pair a tablet with a 6-digit code a manager approves, or with a one-time QR code.

## What is in here

| Folder | What it is |
|---|---|
| `supabase/` | Postgres schema as ordered migrations, plus SQL tests. Every write goes through a security definer function. |
| `web/` | Next.js 14 site: front page, a demo with made-up data, the signed-in app, and the Overwatch admin area. |
| `android/` | Kotlin / Jetpack Compose tablet app. |
| `bridge/` | Chrome MV3 extension that reads a "dispatch" system and a "workorders" system and uploads a daily snapshot. Read-only. |
| `helper/` | Node program for a Windows PC that drives a phone over adb to send Pre-call texts. |
| `scripts/` | `test-schema.sh`, which runs the migrations and tests against a scratch Postgres. |
| `.github/workflows/` | Builds the APK, the Bridge zip and the Helper zip. |

## How it fits together

```
tablet app --> Supabase <-- website <--postMessage--> Bridge --> Helper (127.0.0.1:47800) --> phone
                  ^                                     |
                  +---------- daily snapshots ----------+
```

- Sign-in is an emailed 6-digit code. A Supabase "before user created" hook only lets in emails a manager has added.
- Roles are `tech`, `manager` and `overwatch` (platform admin). Row level security keeps each store to its own data.
- A tablet pairs by code or QR, then gets its own device token once. Revoking the tablet stops it reporting.
- The site hands Bridge its access token per refresh. Bridge keeps no token of its own for Harbor, and the Helper token
  stays inside Bridge.

## Getting it running

You need your own Supabase project.

1. Run `supabase/migrations/*.sql` in order, set up auth as described in [web/README.md](web/README.md), then run
   `supabase/setup-store.sql` with your own values.
2. Website: `cd web && cp .env.example .env.local`, fill it in, `npm install && npm run dev`.
3. Tablet app: see [android/README.md](android/README.md). The Supabase URL and anon key are Gradle properties.
4. Bridge and Helper: see [bridge/README.md](bridge/README.md) and [helper/README.md](helper/README.md). Bridge has a
   few values to set before you load it.

The demo page at `/demo` works without any backend.

## Tests

```
PGHOST=localhost PGUSER=postgres ./scripts/test-schema.sh   # needs psql and a Postgres server
cd web && npx tsc --noEmit && npx next build
```

The schema tests print some expected errors (a tech trying to approve their own tablet, a bad token, and so on). Those are
the checks passing.

## Things to know before you deploy

- Sign-up is limited to one email domain. It is set in `signup_domain_ok()` in the signups migration and in
  `NEXT_PUBLIC_SIGNUP_DOMAIN` for the web form. Both default to `example.com`; change both.
- For CI builds, set repo variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` so the APK points at your project.
- The two Bridge connectors are a "dispatch" system and a "workorders" system. Their hosts ship as
  `https://dispatch.example.com` and `https://workorders.example.com`; set your real hosts in `bridge/background.js`,
  `bridge/manifest.json` and `bridge/popup.js`. The request paths and field names the readers use are marked "adjust
  to your system" in [bridge/README.md](bridge/README.md).
- `helper/src/fieldapp.js` drives an Android field app on the phone. Set `HARBOR_FIELD_APP_PACKAGE` to its package
  name (default `com.example.fieldapp`) and adjust the selectors to that app.
- Pre-call picks a claim line by carrier. The carrier name patterns ship as placeholders (`carrier a`, `carrier b`);
  put your real carrier names in `CARRIER_PATTERNS` in `web/lib/precallRules.ts` and `helper/src/rules.js`.
- The database check constraint on `bridge_snapshots.source` allows `dispatch` and `workorders`. If you add connectors,
  add them there and in `web/lib/bridge.ts`.
- Bridge, the website and the Helper are meant for one company's own staff. Don't point Pre-call at real customers
  until you have tested with a dry run.

## License

View-only, all rights reserved. See [LICENSE](LICENSE). You can read the code; copying, modifying, redistributing or running it needs written permission.
