#!/usr/bin/env bash
# Runs the migration + security tests against a throwaway local Postgres (needs psql + a Postgres server).
#   PGHOST=... PGPORT=... PGUSER=postgres ./scripts/test-schema.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql -q -c "drop database if exists harbor_test" -c "create database harbor_test"
psql -q -d harbor_test -f supabase/tests/supabase_stub.sql          # roles + auth.uid() like Supabase
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261114000000_devices.sql
psql -d harbor_test -f supabase/tests/devices_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261115000000_sheets.sql
psql -d harbor_test -f supabase/tests/sheets_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261116000000_store_codes.sql
psql -d harbor_test -f supabase/tests/store_codes_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261117000000_website.sql
psql -d harbor_test -f supabase/tests/website_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261118000000_release_files.sql
psql -d harbor_test -f supabase/tests/release_files_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261119000000_email_codes.sql
psql -d harbor_test -f supabase/tests/email_codes_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261120000000_bridge.sql
psql -d harbor_test -f supabase/tests/bridge_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261121000000_tablet_invites.sql
psql -d harbor_test -f supabase/tests/tablet_invites_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261122000000_store_settings.sql
psql -d harbor_test -f supabase/tests/store_settings_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261123000000_site_content.sql
psql -d harbor_test -f supabase/tests/site_content_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261124000000_precall.sql
psql -d harbor_test -f supabase/tests/precall_test.sql
psql -q -d harbor_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261125000000_signups.sql
psql -d harbor_test -f supabase/tests/signups_test.sql
