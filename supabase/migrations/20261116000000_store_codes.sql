-- Store codes: each franchise (store) gets a join code so the tablet app can ask "which store?" at sign-in.
-- Needs devices and sheets.
--
-- * A new tech signs in on the tablet, types the store code, and join_store() creates their tech profile for
--   that store. Nothing else about the store is visible before joining, and a profile never switches stores.
-- * When a manager approves a tablet and picks the linked tech, the tech's profile gets that tech_id
--   automatically so their sheet matches.
--
-- Tablet app contract (in addition to devices / sheets)
--   who am I:  GET  /rest/v1/profiles?select=role,tech_id,display_name,franchises(name)    -> [] when not joined yet
--   (website)  POST /rest/v1/rpc/my_store_code   -> the code managers hand to techs
--   join:      POST /rest/v1/rpc/join_store   { p_code }   -> { store, role }

alter table franchises add column if not exists join_code text unique;

-- 6 letters/digits, no 0/O/1/I, so it's easy to read off a card on the wall.
create or replace function make_join_code() returns text
language sql volatile set search_path = public, extensions as
$$ select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '') from generate_series(1, 6) $$;

update franchises set join_code = make_join_code() where join_code is null;

-- Nobody reads the code straight off the table. Managers use my_store_code().
revoke select on franchises from authenticated, anon;
grant select (id, name, created_at) on franchises to authenticated;

create or replace function join_store(p_code text)
returns table (store text, role text)
language plpgsql security definer set search_path = public, extensions as
$$
declare f franchises; existing profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into existing from profiles where user_id = auth.uid();
  if found then
    -- Already in a store: just say which (never move someone between stores from the tablet).
    return query select fr.name, existing.role from franchises fr where fr.id = existing.franchise_id; return;
  end if;
  select * into f from franchises where upper(join_code) = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'That store code isn''t right. Ask your manager for it.'; end if;
  insert into profiles (user_id, franchise_id, role, email, display_name)
  select auth.uid(), f.id, 'tech', u.email, split_part(coalesce(u.email, ''), '@', 1) from auth.users u where u.id = auth.uid();
  return query select f.name, 'tech'::text;
end $$;

-- Managers can read their own store's code (the Devices page shows it) and make a new one if it leaks.
create or replace function my_store_code() returns text
language sql stable security definer set search_path = public, extensions as
$$ select join_code from franchises where id = my_franchise() and i_am_manager() $$;

create or replace function new_join_code() returns text
language plpgsql security definer set search_path = public, extensions as
$$
declare c text;
begin
  if not i_am_manager() then raise exception 'Only managers can change the store code'; end if;
  c := make_join_code();
  update franchises set join_code = c where id = my_franchise();
  return c;
end $$;

revoke execute on function make_join_code(), join_store(text), new_join_code(), my_store_code() from public, anon;
grant execute on function join_store(text), new_join_code(), my_store_code() to authenticated;

-- Linking a tablet to a tech also links the person who paired it to that dispatch tech id.
create or replace function devices_link_profile() returns trigger
language plpgsql security definer set search_path = public, extensions as
$$
begin
  if new.requested_by is not null and new.status = 'active' and new.tech_id is not null
     and (old.tech_id is distinct from new.tech_id or old.status <> 'active') then
    update profiles set tech_id = new.tech_id, display_name = coalesce(new.tech_name, display_name)
    where user_id = new.requested_by and franchise_id = new.franchise_id and role = 'tech';
  end if;
  return new;
end $$;
drop trigger if exists devices_link on devices;
create trigger devices_link after update on devices for each row execute function devices_link_profile();
