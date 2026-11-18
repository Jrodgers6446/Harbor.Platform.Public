# Harbor platform

Harbor is a field-service platform: a manager website, a tablet app for the techs, a browser extension that reads the
systems a company already uses, and a small program that sends confirmation texts from a phone. This is a public copy
of the project with the owner's project ids, hostnames, keys and sample data removed.

It covers the day-to-day of a repair team:

- **Daily sheets.** Techs fill in their sheet on the tablet. The manager signs and can print it.
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
| `bridge/` | Chrome MV3 extension that reads the scheduling and work-order sites and uploads a daily snapshot. Read-only. |
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

- The two built-in Bridge connectors point at specific third-party sites, and `helper/src/fieldapp.js` drives a specific
  third-party Android app. Swap them for the systems you use.
- The database check constraint on `bridge_snapshots.source` allows `honeycomb` and `portal`. If you add connectors,
  add them there and in `web/lib/bridge.ts`.
- Bridge, the website and the Helper are meant for one company's own staff. Don't point Pre-call at real customers
  until you have tested with a dry run.

## License

Not chosen yet. See [LICENSE](LICENSE).
