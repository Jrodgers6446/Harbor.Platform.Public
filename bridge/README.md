# Harbor Bridge

Chrome (MV3) extension that connects the Harbor website to the scheduling and work-order systems a company already
uses, and to Harbor Helper on the same PC. It starts with no connections; the user adds the systems they use.
Read-only: it never changes anything in those systems.

## Set it up for your deployment

Before loading or zipping the extension, edit these to match your own setup:

- `background.js`: `SUPABASE` (project URL), `KEY` (anon key) and `SITES` (the hosts your Harbor website runs on).
- `manifest.json`: `host_permissions` (your Supabase URL) and the `content_scripts` `matches` for `site.js`. They
  ship with placeholders (`your-project.supabase.co`, `harbor.example.com`, `harbor-overwatch.example.com`); replace
  them with your own domains.
- `popup.js`: `SITE_URL`, the page the "Open the Harbor website" button opens.

The two built-in connectors are a "dispatch" system (the day's jobs and techs) and a "workorders" system (finished
work orders). Their hosts are placeholders: `https://dispatch.example.com` and `https://workorders.example.com`.
Replace them with the real hosts of your own systems in all three places:

- `background.js`: `DISPATCH` and `WORKORDERS` (defined once at the top).
- `manifest.json`: `optional_host_permissions`.
- `popup.js`: `MATCH`.

The readers also depend on how those systems behave, so adjust to your system: `DISPATCH_BOARD_PATH` and
`WORKORDERS_PAGE_PATH` in `background.js`, `GQL_PATH` and the operation names in `dispatch-inject.js`, and
`LIST_PATH` plus the field names in `workorders.js`. Change or remove the connectors if you use different systems.

## Install

`chrome://extensions` > Developer mode > Load unpacked > pick this folder.

## Use

Click the Bridge icon, pick a system, Add (Chrome asks to allow just that site), Open, and sign in once. On the Harbor
website the refresh button at the top reads every connection. The website sends its own sign-in with each refresh;
Bridge uses it for that one upload and doesn't keep it.

## Add a connector

Add an entry to `CONNECTORS` in `background.js`, a reader for it, and its site to `optional_host_permissions` (and
`MATCH` in `popup.js`).

## Data

Uploads go through the `bridge_put()` function into the Supabase table `bridge_snapshots` (one row per store, source
and day, kept 14 days).

## Icons

`icons/` holds placeholder icons. Replace them with your own artwork if you like.
