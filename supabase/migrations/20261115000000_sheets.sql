-- Sheets: the tablet's daily sheet, its jobs (for the route map) and repair guides. Needs devices.
--
-- * A signed-in manager pushes tomorrow's sheet with upsert_daily_sheet(): one sheet per tech per day, with the
--   customers, windows, addresses, devices and filed parts the dispatch system already knows.
-- * The tech's tablet reads its own sheet (matched by profiles.tech_id) and fills in what the paper sheet asks for
--   through save_sheet() / save_job(), then submit_sheet() with the manager's signature.
-- * Techs never write the tables directly; RLS only lets them read their own sheet.
--
-- Tablet app contract (in addition to devices)
--   read today:   GET  /rest/v1/sheets?sheet_date=eq.2026-11-14&select=*,sheet_jobs(*)
--   header:       POST /rest/v1/rpc/save_sheet    { p_sheet_id, p_clock_in_at, p_bod_done, p_clock_out_at, p_end_mileage, p_eod_done }
--   one customer: POST /rest/v1/rpc/save_job      { p_job_id, p_part_sku, p_bg_sku, p_battery_sku, p_rw, p_part_status, p_outcome, p_reason }
--   finish:       POST /rest/v1/rpc/submit_sheet  { p_sheet_id, p_manager_name, p_signature }
--   guides:       GET  /rest/v1/repair_guides?select=*

alter table profiles add column if not exists tech_id text;   -- technician id in the dispatch system

create or replace function my_tech_id() returns text
language sql stable security definer set search_path = public, extensions as
$$ select tech_id from profiles where user_id = auth.uid() $$;

-- tables
create table if not exists sheets (
  id            uuid primary key default gen_random_uuid(),
  franchise_id  uuid not null references franchises(id),
  sheet_date    date not null,
  tech_id       text not null,
  tech_name     text,
  van           text,
  clock_in_at   timestamptz,
  bod_done      boolean not null default false,
  clock_out_at  timestamptz,
  end_mileage   int check (end_mileage is null or end_mileage between 0 and 9999999),
  eod_done      boolean not null default false,
  manager_name  text,
  signature     text check (signature is null or length(signature) <= 200000),   -- SVG path data of the signature
  submitted_at  timestamptz,
  submitted_by  uuid references auth.users(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (franchise_id, tech_id, sheet_date)
);
create index if not exists sheets_tech_day on sheets(tech_id, sheet_date);

create table if not exists sheet_jobs (
  id            uuid primary key default gen_random_uuid(),
  sheet_id      uuid not null references sheets(id) on delete cascade,
  franchise_id  uuid not null references franchises(id),
  external_id   text not null,               -- job id (or work order) in the dispatch system, so re-pushes update the same row
  position      int not null default 0,
  customer_name text,
  address       text,
  phone_last4   text,
  lat           double precision,
  lon           double precision,
  window_start  timestamptz,
  window_end    timestamptz,
  device        text,
  filed_parts   text,
  problem       text,
  carrier       text,
  -- what the tech fills in (paper sheet columns)
  part_sku      text,
  bg_sku        text,
  battery_sku   text,
  rw            text,
  part_status   text check (part_status in ('used', 'rti')),
  outcome       text check (outcome in ('completed', 'rescheduled', 'unrepaired')),
  reason        text,
  done_at       timestamptz,
  updated_at    timestamptz not null default now(),
  unique (sheet_id, external_id)
);
create index if not exists sheet_jobs_sheet on sheet_jobs(sheet_id, position);

create table if not exists repair_guides (
  id            uuid primary key default gen_random_uuid(),
  franchise_id  uuid not null references franchises(id),
  device        text not null,               -- e.g. "iPhone 14"
  repair        text not null,               -- e.g. "Screen"
  steps         jsonb not null default '[]', -- [{ "title": "...", "detail": "..." }]
  warnings      text,
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists repair_guides_franchise on repair_guides(franchise_id);

-- row level security
alter table sheets        enable row level security;
alter table sheet_jobs    enable row level security;
alter table repair_guides enable row level security;

drop policy if exists sheets_read on sheets;
create policy sheets_read on sheets for select
  using (franchise_id = my_franchise() and (i_am_manager() or tech_id = my_tech_id()));
drop policy if exists sheets_manager_write on sheets;
create policy sheets_manager_write on sheets for all
  using (franchise_id = my_franchise() and i_am_manager())
  with check (franchise_id = my_franchise() and i_am_manager());

drop policy if exists jobs_read on sheet_jobs;
create policy jobs_read on sheet_jobs for select
  using (franchise_id = my_franchise() and (i_am_manager()
         or exists (select 1 from sheets s where s.id = sheet_id and s.tech_id = my_tech_id())));
drop policy if exists jobs_manager_write on sheet_jobs;
create policy jobs_manager_write on sheet_jobs for all
  using (franchise_id = my_franchise() and i_am_manager())
  with check (franchise_id = my_franchise() and i_am_manager()
              and exists (select 1 from sheets s where s.id = sheet_id and s.franchise_id = my_franchise()));

drop policy if exists guides_read on repair_guides;
create policy guides_read on repair_guides for select using (franchise_id = my_franchise());
drop policy if exists guides_manager_write on repair_guides;
create policy guides_manager_write on repair_guides for all
  using (franchise_id = my_franchise() and i_am_manager())
  with check (franchise_id = my_franchise() and i_am_manager());

-- manager push
-- p_jobs: [{ "external_id", "position", "customer_name", "address", "phone_last4", "lat", "lon", "window_start",
--            "window_end", "device", "filed_parts", "problem", "carrier" }, ...]
-- Re-pushing keeps what the tech already filled in. Jobs no longer on the list are removed unless the tech touched them.
create or replace function upsert_daily_sheet(p_date date, p_tech_id text, p_tech_name text, p_van text, p_jobs jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions as
$$
declare f uuid := my_franchise(); sid uuid; j jsonb; ids text[] := '{}';
begin
  if not i_am_manager() or f is null then raise exception 'Only managers can push sheets'; end if;
  if coalesce(trim(p_tech_id), '') = '' then raise exception 'Missing tech id'; end if;
  if jsonb_typeof(coalesce(p_jobs, '[]'::jsonb)) <> 'array' then raise exception 'p_jobs must be a list'; end if;

  insert into sheets (franchise_id, sheet_date, tech_id, tech_name, van)
  values (f, p_date, trim(p_tech_id), p_tech_name, p_van)
  on conflict (franchise_id, tech_id, sheet_date)
  do update set tech_name = coalesce(excluded.tech_name, sheets.tech_name), van = coalesce(excluded.van, sheets.van), updated_at = now()
  returning id into sid;

  for j in select * from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) loop
    if coalesce(j->>'external_id', '') = '' then continue; end if;
    ids := ids || (j->>'external_id');
    insert into sheet_jobs (sheet_id, franchise_id, external_id, position, customer_name, address, phone_last4, lat, lon,
                            window_start, window_end, device, filed_parts, problem, carrier)
    values (sid, f, j->>'external_id', coalesce((j->>'position')::int, 0), j->>'customer_name', j->>'address',
            nullif(right(regexp_replace(coalesce(j->>'phone_last4', ''), '\D', '', 'g'), 4), ''),
            (j->>'lat')::double precision, (j->>'lon')::double precision,
            (j->>'window_start')::timestamptz, (j->>'window_end')::timestamptz,
            j->>'device', j->>'filed_parts', j->>'problem', j->>'carrier')
    on conflict (sheet_id, external_id) do update set
      position = excluded.position, customer_name = excluded.customer_name, address = excluded.address,
      phone_last4 = excluded.phone_last4, lat = coalesce(excluded.lat, sheet_jobs.lat), lon = coalesce(excluded.lon, sheet_jobs.lon),
      window_start = excluded.window_start, window_end = excluded.window_end, device = excluded.device,
      filed_parts = excluded.filed_parts, problem = excluded.problem, carrier = excluded.carrier, updated_at = now();
  end loop;

  delete from sheet_jobs where sheet_id = sid and not (external_id = any(ids))
    and outcome is null and part_status is null and coalesce(part_sku, bg_sku, battery_sku, rw, reason) is null;
  return sid;
end $$;

-- tablet RPCs (techs)
create or replace function my_open_sheet(p_sheet_id uuid) returns sheets
language plpgsql stable security definer set search_path = public, extensions as
$$
declare s sheets;
begin
  select * into s from sheets where id = p_sheet_id and franchise_id = my_franchise()
    and (tech_id = my_tech_id() or i_am_manager());
  if not found then raise exception 'Unknown sheet'; end if;
  if s.submitted_at is not null then raise exception 'This sheet was already submitted'; end if;
  return s;
end $$;

create or replace function save_sheet(p_sheet_id uuid, p_clock_in_at timestamptz default null, p_bod_done boolean default false,
  p_clock_out_at timestamptz default null, p_end_mileage int default null, p_eod_done boolean default false)
returns void
language plpgsql security definer set search_path = public, extensions as
$$
begin
  perform my_open_sheet(p_sheet_id);
  update sheets set clock_in_at = p_clock_in_at, bod_done = coalesce(p_bod_done, false), clock_out_at = p_clock_out_at,
    end_mileage = p_end_mileage, eod_done = coalesce(p_eod_done, false), updated_at = now()
  where id = p_sheet_id;
end $$;

create or replace function save_job(p_job_id uuid, p_part_sku text default null, p_bg_sku text default null,
  p_battery_sku text default null, p_rw text default null, p_part_status text default null,
  p_outcome text default null, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, extensions as
$$
declare sid uuid;
begin
  select sheet_id into sid from sheet_jobs where id = p_job_id;
  if not found then raise exception 'Unknown job'; end if;
  perform my_open_sheet(sid);
  update sheet_jobs set
    part_sku = nullif(left(trim(p_part_sku), 40), ''), bg_sku = nullif(left(trim(p_bg_sku), 40), ''),
    battery_sku = nullif(left(trim(p_battery_sku), 40), ''), rw = nullif(left(trim(p_rw), 40), ''),
    part_status = nullif(p_part_status, ''), outcome = nullif(p_outcome, ''), reason = nullif(left(trim(p_reason), 500), ''),
    done_at = case when nullif(p_outcome, '') is null then null else coalesce(done_at, now()) end,
    updated_at = now()
  where id = p_job_id;
end $$;

create or replace function submit_sheet(p_sheet_id uuid, p_manager_name text, p_signature text)
returns void
language plpgsql security definer set search_path = public, extensions as
$$
begin
  perform my_open_sheet(p_sheet_id);
  if coalesce(trim(p_manager_name), '') = '' then raise exception 'Manager name is required'; end if;
  if coalesce(length(p_signature), 0) < 10 then raise exception 'Manager signature is required'; end if;
  update sheets set manager_name = trim(p_manager_name), signature = p_signature, submitted_at = now(),
    submitted_by = auth.uid(), updated_at = now()
  where id = p_sheet_id;
end $$;

-- Managers can reopen a submitted sheet if something has to be fixed.
create or replace function reopen_sheet(p_sheet_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as
$$
begin
  if not i_am_manager() then raise exception 'Only managers can reopen a sheet'; end if;
  update sheets set submitted_at = null, submitted_by = null, updated_at = now()
  where id = p_sheet_id and franchise_id = my_franchise();
end $$;

revoke execute on function my_tech_id(), my_open_sheet(uuid),
  upsert_daily_sheet(date, text, text, text, jsonb),
  save_sheet(uuid, timestamptz, boolean, timestamptz, int, boolean),
  save_job(uuid, text, text, text, text, text, text, text),
  submit_sheet(uuid, text, text), reopen_sheet(uuid)
  from public, anon;
grant execute on function my_tech_id(), my_open_sheet(uuid),
  upsert_daily_sheet(date, text, text, text, jsonb),
  save_sheet(uuid, timestamptz, boolean, timestamptz, int, boolean),
  save_job(uuid, text, text, text, text, text, text, text),
  submit_sheet(uuid, text, text), reopen_sheet(uuid)
  to authenticated;

-- A tech can't change their own tech_id/role/franchise (no tech update policy on profiles; managers set tech_id).
drop policy if exists profile_manager_update on profiles;
create policy profile_manager_update on profiles for update
  using (i_am_manager() and franchise_id = my_franchise())
  with check (i_am_manager() and franchise_id = my_franchise());
