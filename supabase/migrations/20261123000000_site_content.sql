-- Site content: text on the public front page (hero, features, how it works, demo, sign-in), edited by
-- Overwatch on the website (Overwatch > Front page). Anyone can read it. Needs 0004.
-- No row means the website's built-in default text.

create table if not exists site_content (
  key         text primary key check (key ~ '^[a-z0-9_-]{1,40}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
alter table site_content enable row level security;
drop policy if exists site_content_read on site_content;
create policy site_content_read on site_content for select using (true);
grant select on site_content to anon, authenticated;

create or replace function set_site_content(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public, extensions as
$$
begin
  if not i_am_overwatch() then raise exception 'Only Overwatch can edit the front page.' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[a-z0-9_-]{1,40}$' then raise exception 'Bad key.'; end if;
  if p_value is null then delete from site_content where key = p_key; return; end if;   -- back to the default text
  if jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text) > 50000 then raise exception 'Content must be an object under 50 KB.'; end if;
  insert into site_content (key, value, updated_by) values (p_key, p_value, auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
end $$;
revoke execute on function set_site_content(text, jsonb) from public, anon;
grant execute on function set_site_content(text, jsonb) to authenticated;
