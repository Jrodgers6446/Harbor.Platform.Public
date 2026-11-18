-- Devices: franchises, profiles, tablets, locations, and the tablet pairing RPCs.
-- Keep in sync with the Bridge extension's modules/devices/supabase/schema.sql.
--
-- * Everyone signs in with Supabase Auth. profiles maps a person to a franchise (store group) and a role.
-- * Managers see and manage their franchise's tablets. A tablet asks to pair (request_pairing) and shows a
--   6-digit code; a manager approves it after checking the code. Only then can it call report_location.
-- * Each approved tablet gets a random device token, shown once and stored only as a hash, so a tech's
--   password alone can't send locations for a tablet.
--
-- Tablet app contract (all calls send apikey: <anon key> and Authorization: Bearer <access token>)
--   1. sign in:           POST /auth/v1/token?grant_type=password          { email, password }
--   2. ask to pair:       POST /rest/v1/rpc/request_pairing                 { p_name, p_model, p_app_version }
--                         -> { device_id, pair_code }
--   3. wait for approval: POST /rest/v1/rpc/claim_device_token              { p_device_id }
--                         -> { status, device_token }   (token returned once, after approval)
--   4. every ~60 s:       POST /rest/v1/rpc/report_location                 { p_device_id, p_token, p_lat, p_lon,
--                                                                             p_accuracy, p_speed, p_battery, p_app_version }

create extension if not exists pgcrypto with schema extensions;

-- tables
create table if not exists franchises (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  franchise_id  uuid not null references franchises(id),
  role          text not null default 'tech' check (role in ('tech', 'manager')),
  display_name  text,
  email         text,
  created_at    timestamptz not null default now()
);

create table if not exists devices (
  id             uuid primary key default gen_random_uuid(),
  franchise_id   uuid not null references franchises(id),
  name           text not null,                 -- e.g. "Tablet 07"
  model          text,
  status         text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  pair_code      text,                          -- 6 digits shown on the tablet while pending
  requested_by   uuid references auth.users(id),
  requested_email text,
  token_hash     text,                          -- sha256 of the device token (never the token itself)
  token_claimed  boolean not null default false,
  tech_id        text,                          -- technician id in the dispatch system
  tech_name      text,
  van            text,
  app_version    text,
  battery        int,
  last_seen_at   timestamptz,
  last_lat       double precision,
  last_lon       double precision,
  last_accuracy  double precision,
  last_speed     double precision,
  approved_by    uuid references auth.users(id),
  approved_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists devices_franchise on devices(franchise_id);

create table if not exists locations (
  id           bigserial primary key,
  device_id    uuid not null references devices(id) on delete cascade,
  franchise_id uuid not null references franchises(id),
  at           timestamptz not null default now(),
  lat          double precision not null,
  lon          double precision not null,
  accuracy     double precision,
  speed        double precision,
  battery      int
);
create index if not exists locations_device_at on locations(device_id, at desc);

-- helpers
create or replace function my_franchise() returns uuid
language sql stable security definer set search_path = public, extensions as
$$ select franchise_id from profiles where user_id = auth.uid() $$;

create or replace function i_am_manager() returns boolean
language sql stable security definer set search_path = public, extensions as
$$ select exists (select 1 from profiles where user_id = auth.uid() and role = 'manager') $$;

-- row level security
alter table franchises enable row level security;
alter table profiles   enable row level security;
alter table devices    enable row level security;
alter table locations  enable row level security;

drop policy if exists franchise_read on franchises;
create policy franchise_read on franchises for select using (id = my_franchise());

drop policy if exists profile_self on profiles;
create policy profile_self on profiles for select using (user_id = auth.uid() or (i_am_manager() and franchise_id = my_franchise()));

-- Managers read and manage their franchise's devices. Techs only see devices they asked to pair.
drop policy if exists devices_manager_read on devices;
create policy devices_manager_read on devices for select
  using (franchise_id = my_franchise() and (i_am_manager() or requested_by = auth.uid()));
drop policy if exists devices_manager_update on devices;
create policy devices_manager_update on devices for update
  using (franchise_id = my_franchise() and i_am_manager())
  with check (franchise_id = my_franchise() and i_am_manager());
drop policy if exists devices_manager_delete on devices;
create policy devices_manager_delete on devices for delete
  using (franchise_id = my_franchise() and i_am_manager());
-- No insert policy: tablets are only created through request_pairing().

drop policy if exists locations_manager_read on locations;
create policy locations_manager_read on locations for select
  using (franchise_id = my_franchise() and i_am_manager());
-- No insert policy: locations only arrive through report_location().

-- On approval (pending -> active) record who/when and reset the token so the tablet can claim a fresh one.
-- Not security definer on purpose: current_user tells API edits apart from our own functions.
create or replace function devices_on_approve() returns trigger
language plpgsql set search_path = public, extensions as
$$
begin
  -- Edits straight through the API can't touch the token or who/where the tablet belongs.
  -- Our own functions run as the table owner, so they can.
  if current_user in ('authenticated', 'anon') then
    new.token_hash := old.token_hash;
    new.token_claimed := old.token_claimed;
    new.requested_by := old.requested_by;
    new.requested_email := old.requested_email;
    new.franchise_id := old.franchise_id;
  end if;
  if new.status = 'active' and old.status <> 'active' then
    new.approved_by := auth.uid();
    new.approved_at := now();
    new.pair_code := null;
    new.token_hash := null;        -- set when the tablet claims its token
    new.token_claimed := false;
  end if;
  if new.status = 'revoked' then
    new.token_hash := null;        -- the tablet can't report anymore
    new.token_claimed := false;
  end if;
  return new;
end $$;
drop trigger if exists devices_approve on devices;
create trigger devices_approve before update on devices for each row execute function devices_on_approve();

-- tablet RPCs
create or replace function request_pairing(p_name text, p_model text default null, p_app_version text default null)
returns table (device_id uuid, pair_code text)
language plpgsql security definer set search_path = public, extensions as
$$
declare f uuid := my_franchise(); code text := lpad((floor(random() * 1000000))::int::text, 6, '0'); d uuid;
begin
  if auth.uid() is null or f is null then raise exception 'Sign in with an account that belongs to a store first'; end if;
  insert into devices (franchise_id, name, model, app_version, status, pair_code, requested_by, requested_email)
  values (f, coalesce(nullif(trim(p_name), ''), 'Tablet'), p_model, p_app_version, 'pending', code, auth.uid(),
          (select email from auth.users where id = auth.uid()))
  returning id into d;
  return query select d, code;
end $$;

-- After approval the tablet calls this once to get its device token. Later calls return no token.
create or replace function claim_device_token(p_device_id uuid)
returns table (status text, device_token text)
language plpgsql security definer set search_path = public, extensions as
$$
declare dev devices; tok text;
begin
  select * into dev from devices where id = p_device_id and requested_by = auth.uid();
  if not found then raise exception 'Unknown device'; end if;
  if dev.status <> 'active' or dev.token_claimed then
    return query select dev.status, null::text; return;
  end if;
  tok := encode(gen_random_bytes(32), 'hex');
  update devices set token_hash = encode(digest(tok, 'sha256'), 'hex'), token_claimed = true where id = dev.id;
  return query select dev.status, tok;
end $$;

create or replace function report_location(
  p_device_id uuid, p_token text, p_lat double precision, p_lon double precision,
  p_accuracy double precision default null, p_speed double precision default null,
  p_battery int default null, p_app_version text default null)
returns void
language plpgsql security definer set search_path = public, extensions as
$$
declare dev devices;
begin
  select * into dev from devices where id = p_device_id;
  if not found or dev.status <> 'active' or dev.token_hash is null
     or dev.token_hash <> encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') then
    raise exception 'This tablet is not approved';
  end if;
  if p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Bad location'; end if;
  insert into locations (device_id, franchise_id, lat, lon, accuracy, speed, battery)
  values (dev.id, dev.franchise_id, p_lat, p_lon, p_accuracy, p_speed, p_battery);
  update devices set last_seen_at = now(), last_lat = p_lat, last_lon = p_lon, last_accuracy = p_accuracy,
    last_speed = p_speed, battery = coalesce(p_battery, battery), app_version = coalesce(p_app_version, app_version)
  where id = dev.id;
end $$;

-- Supabase lets anonymous callers run functions by default, so lock these to signed-in users.
revoke execute on function request_pairing(text, text, text), claim_device_token(uuid),
  report_location(uuid, text, double precision, double precision, double precision, double precision, int, text)
  from public, anon;
grant execute on function request_pairing(text, text, text), claim_device_token(uuid),
  report_location(uuid, text, double precision, double precision, double precision, double precision, int, text)
  to authenticated;

-- Keep 60 days of location history (run daily with pg_cron, or by hand):
--   delete from locations where at < now() - interval '60 days';
