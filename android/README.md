# Harbor tech app (Android)

Kotlin + Jetpack Compose tablet app for field techs. It is built for a tablet in landscape and also works on phones. It talks straight to the Supabase backend in `../supabase` using the REST/RPC API; there is no other server.

Screens:

| Tab | What it does |
|---|---|
| Forms | Today's daily forms: customer list, plus a card per customer with part, back glass and battery SKUs, a reference, installed/returned, outcome and reason. Clock in and BOD in the header. |
| End of day | Clock out, end mileage, EOD, manager name and finger signature, then submit (locks the forms). |
| Route | Customers left on a map, ordered fastest (least driving) or on time (every stop inside its window), with ETAs. Navigate opens Google Maps or Waze. |
| Assist | Repair steps for the current customer's device, with a checklist and notes. Starter guides ship in `app/src/main/assets/guides.json`; guides in the `repair_guides` table replace them. |

Also: sign-in with an emailed 6-digit code (no password), pairing (QR from the website, or a 6-digit code approved under Devices in the web app) and a foreground service that reports location about once a minute.

## Configuration

The Supabase URL and anon key are compiled into `BuildConfig`. Pass them as Gradle properties or environment variables:

```
./gradlew assembleDebug \
  -PHARBOR_SUPABASE_URL=https://your-project.supabase.co \
  -PHARBOR_SUPABASE_ANON_KEY=your-anon-key
```

Without them the app builds with placeholder values and won't be able to sign in.

## Build

Open `android/` in Android Studio, or run `./gradlew assembleDebug` (JDK 17, Android SDK 34).

Release builds use the debug key unless these environment variables are set: `HARBOR_KEYSTORE_FILE` (path to a .jks), `HARBOR_KEYSTORE_PASSWORD`, `HARBOR_KEY_ALIAS`, `HARBOR_KEY_PASSWORD`. A debug-signed build can't be updated in place by one signed with a different key, so uninstall first.

## Setting up a tech

1. Create the tech's login in Supabase (Authentication, Add user) and a `profiles` row with their franchise, `role = 'tech'` and a `tech_id`.
2. Push their daily forms with `upsert_daily_sheet`.
3. On the tablet: sign in, pair it (QR or code), and set location permission to "Allow all the time".
