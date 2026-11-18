-- Bridge: the Chrome extension copies what the dispatch system and the work orders system show into Harbor,
-- so the website modules (Pre-call list, Tech Dashboard, Home widgets) have live data. Needs 0004.
--
--   Bridge -> POST /rest/v1/rpc/bridge_put { p_source: 'dispatch' | 'workorders', p_day: 'YYYY-MM-DD', p_payload: {...} }
--             with the signed-in manager's own website session (the site hands its token to the Bridge for each refresh).
--   Website -> GET /rest/v1/bridge_snapshots?source=eq.dispatch&day=eq.2026-11-15
--
-- One row per store + source + day; a refresh replaces it. Only managers (and Overwatch) can write or read,
-- and only for their own store. Rows older than 14 days are dropped on each write (they hold customer names).

create table if not exists bridge_snapshots (
  franchise_id uuid not null references franchises(id) on delete cascade,
  source       text not null check (source in ('dispatch', 'workorders')),
  day          date not null,
  payload      jsonb not null,
  captured_at  timestamptz not null default now(),
  captured_by  uuid,
  primary key (franchise_id, source, day)
);
alter table bridge_snapshots enable row level security;

drop policy if exists bridge_read on bridge_snapshots;
create policy bridge_read on bridge_snapshots for select
  using (i_am_manager() and franchise_id = my_franchise());
grant select on bridge_snapshots to authenticated;

create or replace function bridge_put(p_source text, p_day date, p_payload jsonb)
returns timestamptz language plpgsql security definer set search_path = public, extensions as
$$
declare f uuid := my_franchise(); t timestamptz := now();
begin
  if f is null or not i_am_manager() then raise exception 'Only a store manager can send Bridge data.' using errcode = '42501'; end if;
  if p_source not in ('dispatch', 'workorders') then raise exception 'Unknown source %', p_source; end if;
  if p_day is null or p_day < current_date - 30 or p_day > current_date + 30 then raise exception 'Day is out of range.'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Payload must be an object.'; end if;
  if octet_length(p_payload::text) > 2000000 then raise exception 'Too much data for one refresh.'; end if;
  insert into bridge_snapshots (franchise_id, source, day, payload, captured_at, captured_by)
  values (f, p_source, p_day, p_payload, t, auth.uid())
  on conflict (franchise_id, source, day) do update set payload = excluded.payload, captured_at = t, captured_by = excluded.captured_by;
  delete from bridge_snapshots where franchise_id = f and day < current_date - 14;
  return t;
end $$;
revoke execute on function bridge_put(text, date, jsonb) from public, anon;
grant execute on function bridge_put(text, date, jsonb) to authenticated;
