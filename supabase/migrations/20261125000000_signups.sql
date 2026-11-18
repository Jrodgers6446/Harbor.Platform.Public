-- Sign-up requests: anyone with a work email on the allowed domain can ask to join their store.
-- Needs 0004, 0006. The domain is set in signup_domain_ok() below (example.com is a placeholder).
--
--   1. The sign-up form lists the stores (signup_stores) and files a request (request_signup: name, email, store).
--      Only emails on the allowed domain are accepted.
--   2. The person gets an emailed 6-digit code (the "Before User Created" hook now lets an email with a pending
--      request make its login). After the code, confirm_signup() marks the request confirmed: the email is theirs.
--   3. A manager of that store (or Overwatch) approves it under Employees (approve_signup: role + tech id), which
--      gives them their profile, or denies it. Until then they see "waiting for approval".

create table if not exists signup_requests (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  display_name  text not null,
  franchise_id  uuid not null references franchises(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  confirmed_at  timestamptz,                 -- they entered the emailed code
  created_at    timestamptz not null default now(),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz
);
alter table signup_requests enable row level security;
drop policy if exists signup_read on signup_requests;
create policy signup_read on signup_requests for select
  using (i_am_overwatch() or (i_am_manager() and franchise_id = my_franchise()) or user_id = auth.uid());
revoke all on signup_requests from anon;
grant select on signup_requests to authenticated;

create or replace function signup_domain_ok(e text) returns boolean language sql immutable as
$$ select norm_email(e) ~ '^[a-z0-9._%+''-]+@example\.com$' $$;

-- The store list for the sign-up form (names only).
create or replace function signup_stores() returns table (id uuid, name text)
language sql stable security definer set search_path = public, extensions as
$$ select f.id, f.name from franchises f where not f.is_sandbox order by f.name $$;

create or replace function request_signup(p_email text, p_name text, p_franchise uuid) returns void
language plpgsql security definer set search_path = public, extensions as
$$
declare e text := norm_email(p_email); n text := left(trim(coalesce(p_name, '')), 80);
begin
  if not signup_domain_ok(e) then raise exception 'Use your @example.com work email.' using errcode = '22023'; end if;
  if length(n) < 2 then raise exception 'Enter your name.' using errcode = '22023'; end if;
  if not exists (select 1 from franchises where id = p_franchise and not is_sandbox) then raise exception 'Pick your store.' using errcode = '22023'; end if;
  if exists (select 1 from profiles where norm_email(email) = e) or exists (select 1 from employee_invites where norm_email(email) = e) then
    raise exception 'This email already has access. Use Sign in instead.' using errcode = '22023';
  end if;
  if exists (select 1 from signup_requests where email = e and status = 'denied' and decided_at > now() - interval '7 days') then
    raise exception 'A manager declined this request. Ask your manager to add you.' using errcode = '22023';
  end if;
  -- keep the table small: at most 50 open requests per store
  if (select count(*) from signup_requests where franchise_id = p_franchise and status = 'pending') >= 50
     and not exists (select 1 from signup_requests where email = e) then
    raise exception 'Too many open requests for this store. Ask your manager.' using errcode = '22023';
  end if;
  insert into signup_requests (email, display_name, franchise_id) values (e, n, p_franchise)
  on conflict (email) do update set display_name = excluded.display_name, franchise_id = excluded.franchise_id,
    status = 'pending', created_at = now(), decided_by = null, decided_at = null,
    confirmed_at = case when signup_requests.franchise_id = excluded.franchise_id then signup_requests.confirmed_at end;
end $$;

-- After the emailed code: this email is really theirs.
create or replace function confirm_signup() returns text
language plpgsql security definer set search_path = public, extensions as
$$
declare e text := norm_email(auth.jwt()->>'email'); r signup_requests;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  update signup_requests set confirmed_at = coalesce(confirmed_at, now()), user_id = auth.uid() where email = e and status = 'pending' returning * into r;
  if not found then return 'none'; end if;
  return 'pending';
end $$;

create or replace function approve_signup(p_id uuid, p_role text default 'tech', p_tech_id text default null) returns void
language plpgsql security definer set search_path = public, extensions as
$$
declare r signup_requests;
begin
  select * into r from signup_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'That request is gone or already handled.'; end if;
  if not (i_am_overwatch() or (i_am_manager() and r.franchise_id = my_franchise())) then raise exception 'Only a manager of that store can approve.' using errcode = '42501'; end if;
  if r.confirmed_at is null then raise exception 'They haven''t entered their emailed code yet.'; end if;
  if p_role not in ('tech', 'manager') then raise exception 'Role must be tech or manager'; end if;
  if r.user_id is not null then
    insert into profiles (user_id, franchise_id, role, email, display_name, tech_id)
    values (r.user_id, r.franchise_id, p_role, r.email, r.display_name, nullif(trim(p_tech_id), ''))
    on conflict (user_id) do update set role = excluded.role, tech_id = coalesce(excluded.tech_id, profiles.tech_id), disabled = false
      where profiles.franchise_id = r.franchise_id;
  end if;
  insert into employee_invites (franchise_id, email, role, tech_id, display_name, invited_by, used_at)
  values (r.franchise_id, r.email, p_role, nullif(trim(p_tech_id), ''), r.display_name, auth.uid(), case when r.user_id is null then null else now() end)
  on conflict (email) do nothing;
  update signup_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = p_id;
end $$;

create or replace function deny_signup(p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as
$$
declare r signup_requests;
begin
  select * into r from signup_requests where id = p_id;
  if not found then raise exception 'That request is gone.'; end if;
  if not (i_am_overwatch() or (i_am_manager() and r.franchise_id = my_franchise())) then raise exception 'Only a manager of that store can decline.' using errcode = '42501'; end if;
  update signup_requests set status = 'denied', decided_by = auth.uid(), decided_at = now() where id = p_id;
end $$;

-- The login gate: also lets an email with an open sign-up request make its login (it still needs the emailed code).
create or replace function harbor_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as
$$
declare e text := norm_email(event->'user'->>'email');
begin
  if e = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Sign in with your work email.'));
  end if;
  if exists (select 1 from employee_invites i where norm_email(i.email) = e)
     or exists (select 1 from profiles p where norm_email(p.email) = e)
     or (signup_domain_ok(e) and exists (select 1 from signup_requests s where s.email = e and s.status = 'pending')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403,
    'message', 'This email hasn''t been added to a store yet. Use Sign up to ask your store, or ask your manager to add you under Employees.'));
end $$;

revoke execute on function harbor_before_user_created(jsonb) from public, anon, authenticated;
revoke execute on function approve_signup(uuid, text, text), deny_signup(uuid), confirm_signup() from public, anon;
grant execute on function signup_stores(), request_signup(text, text, uuid) to anon, authenticated;
grant execute on function approve_signup(uuid, text, text), deny_signup(uuid), confirm_signup() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function harbor_before_user_created(jsonb), signup_domain_ok(text), norm_email(text) to supabase_auth_admin;
    grant select on table signup_requests to supabase_auth_admin;
  end if;
end $$;
notify pgrst, 'reload schema';
