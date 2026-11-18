\set ON_ERROR_STOP 0
\echo manager (666, Example Store) writes and reads its own store
set role authenticated; set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select bridge_put('honeycomb', current_date + 1, '{"jobs":[{"n":"A"}]}') is not null as wrote;
select bridge_put('honeycomb', current_date + 1, '{"jobs":[{"n":"B"}]}') is not null as replaced;
select source, payload->'jobs'->0->>'n' as n from bridge_snapshots;
\echo bad source / bad day / non-object (3 errors)
select bridge_put('samsara', current_date, '{}');
select bridge_put('portal', current_date + 90, '{}');
select bridge_put('portal', current_date, '[1]');
\echo tech cannot write (error) and reads nothing
reset role; insert into auth.users (id, email) values ('12121212-1212-1212-1212-121212121212','tt@x.com') on conflict do nothing; insert into profiles (user_id, franchise_id, role, email) values ('12121212-1212-1212-1212-121212121212','aaaaaaaa-0000-0000-0000-000000000001','tech','tt@x.com') on conflict do nothing;
set role authenticated; set request.jwt.claim.sub = '12121212-1212-1212-1212-121212121212';
select bridge_put('portal', current_date, '{}');
select count(*) as tech_sees from bridge_snapshots;
\echo anon cannot call it
set role anon; select bridge_put('portal', current_date, '{}');
reset role;
