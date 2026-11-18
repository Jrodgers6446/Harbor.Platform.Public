-- Store settings: what the website's Settings (gear) shares between every manager in a store
-- (Pre-call claim lines, the Route Planner start address, each tech's van, the Tech Dashboard goal). Needs 0004.
-- Per-browser things (visible modules, sidebar order, Home widgets) stay in the browser.
--
--   read:  GET  /rest/v1/store_settings?select=key,value
--   write: POST /rest/v1/rpc/set_store_setting { p_key, p_value }   (managers only)

create table if not exists store_settings (
  franchise_id uuid not null references franchises(id) on delete cascade,
  key          text not null check (key ~ '^[a-z0-9:._-]{1,40}$'),
  value        jsonb not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  primary key (franchise_id, key)
);
alter table store_settings enable row level security;
drop policy if exists store_settings_read on store_settings;
create policy store_settings_read on store_settings for select using (franchise_id = my_franchise() or i_am_overwatch());
grant select on store_settings to authenticated;

create or replace function set_store_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public, extensions as
$$
declare f uuid := my_franchise();
begin
  if f is null or not i_am_manager() then raise exception 'Only a store manager can change store settings.' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[a-z0-9:._-]{1,40}$' then raise exception 'Bad setting name.'; end if;
  if p_value is null or octet_length(p_value::text) > 20000 then raise exception 'Setting is too big.'; end if;
  insert into store_settings (franchise_id, key, value, updated_by) values (f, p_key, p_value, auth.uid())
  on conflict (franchise_id, key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
end $$;
revoke execute on function set_store_setting(text, jsonb) from public, anon;
grant execute on function set_store_setting(text, jsonb) to authenticated;
