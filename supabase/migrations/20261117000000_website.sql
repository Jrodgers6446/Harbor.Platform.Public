-- Website: roles, email-based onboarding, employees, sandboxes, feature switches, releases. Needs devices, sheets, store codes.
--
-- Levels
--   tech       tablet only
--   manager    the standard website for their own franchise (employees, tablets, sheets, module data)
--   overwatch  the whole platform: franchises, sandboxes, feature switches, releases (version notes + confirm)
--
-- The first time a work email signs in, on_auth_user_created() looks for an invite from a manager
-- (employee_invites) and makes the profile. No invite -> no profile, and the tablet asks for the store code
-- instead (see store codes migration).

-- roles
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('tech', 'manager', 'overwatch'));
alter table profiles add column if not exists disabled boolean not null default false;

create or replace function i_am_overwatch() returns boolean
language sql stable security definer set search_path = public, extensions as
$$ select exists (select 1 from profiles where user_id = auth.uid() and role = 'overwatch' and not disabled) $$;

-- Managers (and overwatch) count as managers everywhere the earlier migrations check i_am_manager().
create or replace function i_am_manager() returns boolean
language sql stable security definer set search_path = public, extensions as
$$ select exists (select 1 from profiles where user_id = auth.uid() and role in ('manager', 'overwatch') and not disabled) $$;

-- franchises: sandboxes, settings
alter table franchises add column if not exists is_sandbox boolean not null default false;
alter table franchises add column if not exists timezone text not null default 'America/New_York';
alter table franchises add column if not exists store_address text;

-- Overwatch reads every franchise (the old policy only showed your own).
drop policy if exists franchise_read on franchises;
create policy franchise_read on franchises for select using (id = my_franchise() or i_am_overwatch());
drop policy if exists franchise_overwatch_write on franchises;
create policy franchise_overwatch_write on franchises for all using (i_am_overwatch()) with check (i_am_overwatch());
grant select (id, name, created_at, is_sandbox, timezone, store_address) on franchises to authenticated;
grant insert (name, is_sandbox, timezone, store_address), update (name, is_sandbox, timezone, store_address), delete on franchises to authenticated;

-- Overwatch can read and manage every profile; managers their own franchise (earlier policies stay).
drop policy if exists profile_overwatch_all on profiles;
create policy profile_overwatch_all on profiles for all using (i_am_overwatch()) with check (i_am_overwatch());
drop policy if exists devices_overwatch_all on devices;
create policy devices_overwatch_all on devices for select using (i_am_overwatch());
drop policy if exists sheets_overwatch_read on sheets;
create policy sheets_overwatch_read on sheets for select using (i_am_overwatch());
drop policy if exists jobs_overwatch_read on sheet_jobs;
create policy jobs_overwatch_read on sheet_jobs for select using (i_am_overwatch());

-- employees: invites by work email
create table if not exists employee_invites (
  id            uuid primary key default gen_random_uuid(),
  franchise_id  uuid not null references franchises(id) on delete cascade,
  email         text not null,
  role          text not null default 'tech' check (role in ('tech', 'manager')),
  tech_id       text,
  display_name  text,
  invited_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  used_at       timestamptz,
  unique (email)
);
alter table employee_invites enable row level security;
drop policy if exists invites_manager on employee_invites;
create policy invites_manager on employee_invites for all
  using (i_am_overwatch() or (i_am_manager() and franchise_id = my_franchise()))
  with check (i_am_overwatch() or (i_am_manager() and franchise_id = my_franchise()));

-- Normalise emails so "Jane.Tech@Example.com" matches.
create or replace function norm_email(e text) returns text language sql immutable as $$ select lower(trim(coalesce(e, ''))) $$;

create or replace function invite_employee(p_email text, p_role text default 'tech', p_tech_id text default null, p_display_name text default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as
$$
declare f uuid := my_franchise(); e text := norm_email(p_email); u uuid; iid uuid;
begin
  if not i_am_manager() then raise exception 'Only managers can add employees'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That doesn''t look like an email'; end if;
  if p_role not in ('tech', 'manager') then raise exception 'Role must be tech or manager'; end if;
  -- Already signed in before? Attach straight away.
  select id into u from auth.users where norm_email(email) = e;
  if u is not null then
    insert into profiles (user_id, franchise_id, role, email, display_name, tech_id)
    values (u, f, p_role, e, coalesce(p_display_name, split_part(e, '@', 1)), p_tech_id)
    on conflict (user_id) do update set role = excluded.role, tech_id = coalesce(excluded.tech_id, profiles.tech_id),
      display_name = coalesce(excluded.display_name, profiles.display_name), disabled = false
      where profiles.franchise_id = f;   -- never pull someone out of another store
  end if;
  insert into employee_invites (franchise_id, email, role, tech_id, display_name, invited_by, used_at)
  values (f, e, p_role, p_tech_id, p_display_name, auth.uid(), case when u is null then null else now() end)
  on conflict (email) do update set role = excluded.role, tech_id = excluded.tech_id, display_name = excluded.display_name,
    invited_by = excluded.invited_by, created_at = now(), used_at = excluded.used_at
    where employee_invites.franchise_id = f
  returning id into iid;
  return iid;
end $$;

-- Runs when Supabase Auth creates a user (first email sign-in).
create or replace function on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public, extensions as
$$
declare inv employee_invites;
begin
  select * into inv from employee_invites where norm_email(email) = norm_email(new.email) and used_at is null;
  if found then
    insert into profiles (user_id, franchise_id, role, email, display_name, tech_id)
    values (new.id, inv.franchise_id, inv.role, norm_email(new.email),
            coalesce(inv.display_name, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), inv.tech_id)
    on conflict (user_id) do nothing;
    update employee_invites set used_at = now() where id = inv.id;
  end if;
  return new;
end $$;
drop trigger if exists harbor_on_auth_user_created on auth.users;
create trigger harbor_on_auth_user_created after insert on auth.users for each row execute function on_auth_user_created();

-- Managers change a colleague's role / tech link / name, or remove them (profile gone, tablets revoked, invite gone).
create or replace function update_employee(p_user_id uuid, p_role text default null, p_tech_id text default null, p_display_name text default null, p_disabled boolean default null)
returns void
language plpgsql security definer set search_path = public, extensions as
$$
declare f uuid := my_franchise(); target profiles;
begin
  if not i_am_manager() then raise exception 'Only managers can change employees'; end if;
  select * into target from profiles where user_id = p_user_id;
  if not found or (target.franchise_id <> f and not i_am_overwatch()) then raise exception 'Unknown employee'; end if;
  if target.role = 'overwatch' and not i_am_overwatch() then raise exception 'That account is managed by Overwatch'; end if;
  if p_role is not null and p_role not in ('tech', 'manager') then raise exception 'Role must be tech or manager'; end if;
  if p_user_id = auth.uid() and (p_role is not null or p_disabled) then raise exception 'You can''t change your own access'; end if;
  update profiles set role = coalesce(p_role, role), tech_id = case when p_tech_id is null then tech_id else nullif(p_tech_id, '') end,
    display_name = coalesce(p_display_name, display_name), disabled = coalesce(p_disabled, disabled)
  where user_id = p_user_id;
  if coalesce(p_disabled, false) then update devices set status = 'revoked' where requested_by = p_user_id and status = 'active'; end if;
end $$;

create or replace function remove_employee(p_user_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as
$$
declare f uuid := my_franchise(); target profiles;
begin
  if not i_am_manager() then raise exception 'Only managers can remove employees'; end if;
  if p_user_id = auth.uid() then raise exception 'You can''t remove yourself'; end if;
  select * into target from profiles where user_id = p_user_id;
  if not found or (target.franchise_id <> f and not i_am_overwatch()) then raise exception 'Unknown employee'; end if;
  if target.role = 'overwatch' and not i_am_overwatch() then raise exception 'That account is managed by Overwatch'; end if;
  update devices set status = 'revoked', token_hash = null, token_claimed = false where requested_by = p_user_id;
  delete from employee_invites where norm_email(email) = norm_email(target.email);
  delete from profiles where user_id = p_user_id;
  -- The login itself stays in Auth (it belongs to the person); without a profile it can't see anything.
end $$;

-- feature switches (per franchise; sandboxes try things first)
create table if not exists features (
  key          text primary key,                 -- e.g. 'tablet.route', 'web.sheets', 'extension.devices'
  name         text not null,
  description  text,
  default_on   boolean not null default false,
  created_at   timestamptz not null default now()
);
create table if not exists franchise_features (
  franchise_id uuid not null references franchises(id) on delete cascade,
  key          text not null references features(key) on delete cascade,
  enabled      boolean not null,
  set_by       uuid references auth.users(id),
  set_at       timestamptz not null default now(),
  primary key (franchise_id, key)
);
alter table features enable row level security;
alter table franchise_features enable row level security;
drop policy if exists features_read on features;
create policy features_read on features for select using (auth.uid() is not null);
drop policy if exists features_overwatch on features;
create policy features_overwatch on features for all using (i_am_overwatch()) with check (i_am_overwatch());
drop policy if exists ff_read on franchise_features;
create policy ff_read on franchise_features for select using (franchise_id = my_franchise() or i_am_overwatch());
drop policy if exists ff_overwatch on franchise_features;
create policy ff_overwatch on franchise_features for all using (i_am_overwatch()) with check (i_am_overwatch());

-- What's on for the caller's store: { key: bool }
create or replace function my_features() returns jsonb
language sql stable security definer set search_path = public, extensions as
$$ select coalesce(jsonb_object_agg(f.key, coalesce(ff.enabled, f.default_on)), '{}'::jsonb)
   from features f left join franchise_features ff on ff.key = f.key and ff.franchise_id = my_franchise() $$;

insert into features (key, name, description, default_on) values
  ('tablet.route',  'Tablet: Route map',     'The jobs map with Fastest / On time ordering', true),
  ('tablet.assist', 'Tablet: Repair assist', 'Step-by-step guides, parts, checklist, notes', true),
  ('web.sheets',    'Website: Daily forms', 'See and print submitted daily forms with the manager signature', true),
  ('web.guides',    'Website: Repair guides editor', 'Managers write their store''s own repair guides', true)
on conflict (key) do nothing;

-- releases (Overwatch pushes updates)
create table if not exists releases (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null check (platform in ('tablet', 'extension', 'web')),
  version       text not null,
  notes         text not null check (length(trim(notes)) >= 10),
  url           text,                            -- APK download, extension zip, or site URL
  channel       text not null default 'sandbox' check (channel in ('sandbox', 'stable')),
  min_supported text,                            -- clients older than this must update
  published_by  uuid references auth.users(id),
  published_at  timestamptz not null default now(),
  unique (platform, version)
);
alter table releases enable row level security;
drop policy if exists releases_read on releases;
create policy releases_read on releases for select using (auth.uid() is not null);
drop policy if exists releases_overwatch on releases;
create policy releases_overwatch on releases for all using (i_am_overwatch()) with check (i_am_overwatch());

-- Publishing needs notes and the typed confirmation (the version, typed again) so nothing goes out by accident.
create or replace function publish_release(p_platform text, p_version text, p_notes text, p_url text, p_channel text, p_confirm text, p_min_supported text default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as
$$
declare rid uuid;
begin
  if not i_am_overwatch() then raise exception 'Only Overwatch can publish releases'; end if;
  if length(trim(coalesce(p_notes, ''))) < 10 then raise exception 'Write version notes first (what changed, what to watch for)'; end if;
  if trim(coalesce(p_confirm, '')) <> trim(p_version) then raise exception 'Type the version to confirm the push'; end if;
  if p_channel not in ('sandbox', 'stable') then raise exception 'Channel must be sandbox or stable'; end if;
  insert into releases (platform, version, notes, url, channel, min_supported, published_by)
  values (p_platform, trim(p_version), trim(p_notes), nullif(trim(p_url), ''), p_channel, nullif(trim(p_min_supported), ''), auth.uid())
  on conflict (platform, version) do update set notes = excluded.notes, url = coalesce(excluded.url, releases.url),
    channel = case when releases.channel = 'stable' then 'stable' else excluded.channel end,   -- stable never goes back to sandbox
    min_supported = coalesce(excluded.min_supported, releases.min_supported), published_by = auth.uid(), published_at = now()
  returning id into rid;
  return rid;
end $$;

-- Sorts '0.1.10' after '0.1.9'.
create or replace function version_key(v text) returns int[]
language sql immutable as $$ select array(select coalesce(nullif(regexp_replace(x, '\D', '', 'g'), ''), '0')::int from unnest(string_to_array(v, '.')) x) $$;

-- The highest release a client should run: sandboxes also get the sandbox channel, everyone else stable only.
create or replace function latest_release(p_platform text)
returns table (version text, notes text, url text, channel text, min_supported text, published_at timestamptz)
language sql stable security definer set search_path = public, extensions as
$$
  select r.version, r.notes, r.url, r.channel, r.min_supported, r.published_at
  from releases r
  where r.platform = p_platform
    and (r.channel = 'stable' or exists (select 1 from franchises f where f.id = my_franchise() and f.is_sandbox))
  order by version_key(r.version) desc, r.published_at desc limit 1
$$;

-- overwatch: franchises
create or replace function create_franchise(p_name text, p_is_sandbox boolean default false, p_timezone text default 'America/New_York')
returns table (id uuid, join_code text)
language plpgsql security definer set search_path = public, extensions as
$$
declare fid uuid; code text := make_join_code();
begin
  if not i_am_overwatch() then raise exception 'Only Overwatch can add franchises'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Give the franchise a name'; end if;
  insert into franchises (name, is_sandbox, timezone, join_code) values (trim(p_name), coalesce(p_is_sandbox, false), p_timezone, code) returning franchises.id into fid;
  return query select fid, code;
end $$;

-- Overwatch can read any store's code (to hand to a new manager).
create or replace function store_code_for(p_franchise uuid) returns text
language sql stable security definer set search_path = public, extensions as
$$ select join_code from franchises where id = p_franchise and i_am_overwatch() $$;

-- Overwatch can act as a franchise's manager. my_franchise() stays the caller's home store;
-- overwatch pages pass p_franchise explicitly to the admin RPCs.
create or replace function invite_employee_in(p_franchise uuid, p_email text, p_role text default 'tech', p_tech_id text default null, p_display_name text default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as
$$
declare e text := norm_email(p_email); u uuid; iid uuid;
begin
  if not i_am_overwatch() then raise exception 'Only Overwatch'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That doesn''t look like an email'; end if;
  if p_role not in ('tech', 'manager') then raise exception 'Role must be tech or manager'; end if;
  select id into u from auth.users where norm_email(email) = e;
  if u is not null then
    insert into profiles (user_id, franchise_id, role, email, display_name, tech_id)
    values (u, p_franchise, p_role, e, coalesce(p_display_name, split_part(e, '@', 1)), p_tech_id)
    on conflict (user_id) do update set franchise_id = excluded.franchise_id, role = excluded.role, tech_id = coalesce(excluded.tech_id, profiles.tech_id), disabled = false;
  end if;
  insert into employee_invites (franchise_id, email, role, tech_id, display_name, invited_by, used_at)
  values (p_franchise, e, p_role, p_tech_id, p_display_name, auth.uid(), case when u is null then null else now() end)
  on conflict (email) do update set franchise_id = excluded.franchise_id, role = excluded.role, tech_id = excluded.tech_id,
    display_name = excluded.display_name, invited_by = excluded.invited_by, created_at = now(), used_at = excluded.used_at
  returning id into iid;
  return iid;
end $$;

-- grants
revoke execute on function i_am_overwatch(), norm_email(text), on_auth_user_created(), version_key(text),
  invite_employee(text, text, text, text), update_employee(uuid, text, text, text, boolean), remove_employee(uuid),
  my_features(), publish_release(text, text, text, text, text, text, text), latest_release(text),
  create_franchise(text, boolean, text), store_code_for(uuid), invite_employee_in(uuid, text, text, text, text)
  from public, anon;
grant execute on function i_am_overwatch(), invite_employee(text, text, text, text), update_employee(uuid, text, text, text, boolean),
  remove_employee(uuid), my_features(), publish_release(text, text, text, text, text, text, text), latest_release(text),
  create_franchise(text, boolean, text), store_code_for(uuid), invite_employee_in(uuid, text, text, text, text)
  to authenticated;

-- Disabled people can't do anything (every policy goes through my_franchise / i_am_manager).
create or replace function my_franchise() returns uuid
language sql stable security definer set search_path = public, extensions as
$$ select franchise_id from profiles where user_id = auth.uid() and not disabled $$;
create or replace function my_tech_id() returns text
language sql stable security definer set search_path = public, extensions as
$$ select tech_id from profiles where user_id = auth.uid() and not disabled $$;

-- The two sandboxes Overwatch plays in (each gets its own store code; pair one tablet to each).
insert into franchises (name, is_sandbox, join_code)
select 'Sandbox A', true, make_join_code() where not exists (select 1 from franchises where name = 'Sandbox A');
insert into franchises (name, is_sandbox, join_code)
select 'Sandbox B', true, make_join_code() where not exists (select 1 from franchises where name = 'Sandbox B');

-- First Overwatch account. Replace the placeholder with the auth.users id of your own admin
-- (or leave it and promote someone later by setting profiles.role = 'overwatch'). It matches no one as shipped.
update profiles set role = 'overwatch' where user_id = '00000000-0000-0000-0000-000000000000';
