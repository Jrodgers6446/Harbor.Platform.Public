-- Email codes: sign in with a 6-digit code emailed to you (no passwords). Needs website.
--
-- * The website, tablet app and extension all use Supabase email OTP:
--     POST /auth/v1/otp     { email, create_user: true }      -> emails a 6-digit code
--     POST /auth/v1/verify  { type: "email", email, token }   -> session
-- * New logins are only created for emails a manager (or Overwatch) added under Employees, or that already have
--   a profile. Everyone else gets "This email hasn't been added to a store yet" and no account is made.
--   This runs as Supabase's "Before User Created" auth hook (Dashboard > Authentication > Hooks).
-- * on_auth_user_created() from the website migration then turns the invite into the profile, as before.

create or replace function harbor_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as
$$
declare e text := norm_email(event->'user'->>'email');
begin
  if e = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Sign in with your work email.'));
  end if;
  if exists (select 1 from employee_invites i where norm_email(i.email) = e)
     or exists (select 1 from profiles p where norm_email(p.email) = e) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403,
    'message', 'This email hasn''t been added to a store yet. Ask your manager to add you under Employees.'));
end $$;

-- Only Supabase Auth may call the hook.
revoke execute on function harbor_before_user_created(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function harbor_before_user_created(jsonb) to supabase_auth_admin;
    grant select on table employee_invites, profiles to supabase_auth_admin;
  end if;
end $$;
