# Harbor website

Next.js 14 (app router) site for managers, plus a signed-out front page and a demo with made-up data.

There are two levels of access:

| Level | Who | What they get |
|---|---|---|
| Standard | managers of one store | overview, employees, tablets, daily forms, repair guides, store settings, Pre-call, tech dashboard |
| Overwatch | the platform admin | everything above for any store, plus franchises, releases and the front page editor |

Techs can sign in too. They only get a download button for the tablet app. `/get` shows the current tablet build without
signing in.

Sign-in is a 6-digit code sent by email (Supabase email OTP). There are no passwords. A "before user created" auth hook
(`public.harbor_before_user_created`, defined in the migrations) only lets in emails a manager has added under Employees.

## Environment

Copy `.env.example` to `.env.local`. Nothing here is a secret, but the real values are specific to your project.

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's anon (publishable) key |
| `STANDARD_HOST` | hostname for the store site |
| `OVERWATCH_HOST` | hostname for the Overwatch site |
| `REDIRECT_HOSTS` | comma separated hostnames that forward to `STANDARD_HOST` |

One deployment serves both hostnames; `lib/hosts.ts` and `middleware.ts` keep them apart. On localhost leave the host
variables empty and everything is served as the store site.

Never put the service_role key in the website. It is only used by the CI upload steps.

## Run locally

```
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. The demo at `/demo` works without a backend.

## Supabase setup

1. Run the files in `../supabase/migrations/` in order in the SQL editor.
2. Authentication > Providers > Email: turn it on, allow sign ups (the hook keeps it private), OTP length 6.
3. Authentication > Hooks > Before User Created: pick `public.harbor_before_user_created`.
4. Authentication > Emails: put `{{ .Token }}` in the magic link template so the email shows the code. Set up custom SMTP
   if you need more than a few codes an hour.
5. Authentication > URL configuration: set the site URL to your store host and add `/auth/callback` for both hosts (and
   `http://localhost:3000/auth/callback` for local dev) to the redirect URLs.
6. Create a `releases` storage bucket (public read). The CI workflows upload tablet, Bridge and Helper builds there.
7. Add yourself: create your login under Authentication > Users, then run `../supabase/setup-store.sql` with your user id,
   email and store name. Use role `overwatch` instead of `manager` for the platform admin. If the sign-in hook blocks
   creating that first user, switch the hook off, create the user, and switch it back on.

## Deploying

Any host that runs Next.js works. On Vercel, import the repo, set the root directory to `web`, add the environment
variables above, and point both hostnames at the project.

## Checking a change

```
npx tsc --noEmit
npx next build
```
