-- Tablet QR: set up a tablet by scanning a QR code on the website. Needs 0004.
--
--   Manager (website, Download > Tablet) -> create_tablet_invite()       -> one-time token, good for 30 minutes
--   QR = https://<store site>/t/<token>  -> page shows the store and the app download (tablet_invite_info, no sign-in)
--   Tablet app opened from that page (harbor://pair?t=<token>), after the tech signs in with their emailed code
--                                        -> pair_with_invite(token)  -> the tablet is approved straight away
--                                           (the manager approved it by making the QR), then claim_device_token() as usual.
-- Only a hash of the token is stored. Each token works once.

create table if not exists tablet_invites (
  id          uuid primary key default gen_random_uuid(),
  franchise_id uuid not null references franchises(id) on delete cascade,
  token_hash  text not null unique,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users(id) on delete set null,
  device_id   uuid references devices(id) on delete set null
);
alter table tablet_invites enable row level security;   -- no policies: only the functions below touch it

create or replace function create_tablet_invite()
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as
$$
declare f uuid := my_franchise(); tok text := encode(gen_random_bytes(18), 'hex'); exp timestamptz := now() + interval '30 minutes';
begin
  if f is null or not i_am_manager() then raise exception 'Only a store manager can make a tablet QR code.' using errcode = '42501'; end if;
  delete from tablet_invites where franchise_id = f and used_at is null and tablet_invites.expires_at < now() - interval '1 day';
  insert into tablet_invites (franchise_id, token_hash, created_by, expires_at) values (f, encode(digest(tok, 'sha256'), 'hex'), auth.uid(), exp);
  return query select tok, exp;
end $$;

-- What the QR's web page shows. Anyone holding the token can see the store name and the app to download.
create or replace function tablet_invite_info(p_token text)
returns table (store text, valid boolean, expires_at timestamptz, version text, url text)
language plpgsql stable security definer set search_path = public, extensions as
$$
declare i tablet_invites; fr franchises;
begin
  select * into i from tablet_invites where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then return; end if;
  select * into fr from franchises where id = i.franchise_id;
  return query
    select fr.name, (i.used_at is null and i.expires_at > now()), i.expires_at, r.version, r.url
    from (select 1) one
    left join lateral (
      select rr.version, rr.url from releases rr
      where rr.platform = 'tablet' and rr.url is not null and (rr.channel = 'stable' or fr.is_sandbox)
      order by version_key(rr.version) desc, rr.published_at desc limit 1) r on true;
end $$;

create or replace function pair_with_invite(p_token text, p_name text default null, p_model text default null, p_app_version text default null)
returns table (device_id uuid, store text)
language plpgsql security definer set search_path = public, extensions as
$$
declare i tablet_invites; p profiles; d uuid; em text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into i from tablet_invites where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found then raise exception 'That QR code isn''t right. Ask your manager for a new one.'; end if;
  if i.used_at is not null then raise exception 'That QR code was already used. Ask your manager for a new one.'; end if;
  if i.expires_at < now() then raise exception 'That QR code has expired. Ask your manager for a new one.'; end if;
  select email into em from auth.users where id = auth.uid();
  select * into p from profiles where user_id = auth.uid();
  if not found then
    -- Not in a store yet: the QR works like the store code.
    insert into profiles (user_id, franchise_id, role, email, display_name)
    values (auth.uid(), i.franchise_id, 'tech', em, split_part(coalesce(em, ''), '@', 1)) returning * into p;
  end if;
  if p.disabled then raise exception 'This login is turned off. Ask your manager.'; end if;
  if p.franchise_id <> i.franchise_id then raise exception 'This login belongs to another store.'; end if;
  insert into devices (franchise_id, name, model, app_version, status, requested_by, requested_email, approved_by, approved_at, tech_id, tech_name)
  values (i.franchise_id, coalesce(nullif(trim(p_name), ''), 'Tablet'), p_model, p_app_version, 'active', auth.uid(), em,
          i.created_by, now(), p.tech_id, case when p.tech_id is not null then p.display_name end)
  returning id into d;
  update tablet_invites set used_at = now(), used_by = auth.uid(), device_id = d where id = i.id;
  return query select d, (select name from franchises where id = i.franchise_id);
end $$;

revoke execute on function create_tablet_invite(), tablet_invite_info(text), pair_with_invite(text, text, text, text) from public, anon;
grant execute on function create_tablet_invite(), pair_with_invite(text, text, text, text) to authenticated;
grant execute on function tablet_invite_info(text) to anon, authenticated;
