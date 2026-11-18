\set ON_ERROR_STOP 0
reset role;
-- make the Example Store manager overwatch; a plain manager for Elsewhere already exists (333...)
update profiles set role = 'overwatch' where user_id = '11111111-1111-1111-1111-111111111111';
insert into auth.users values ('66666666-6666-6666-6666-666666666666','mgr2@x.com');
insert into profiles (user_id, franchise_id, role, email) values ('66666666-6666-6666-6666-666666666666','aaaaaaaa-0000-0000-0000-000000000001','manager','mgr2@x.com');
set role authenticated;
\echo manager invites a tech by email; later sign-in creates the profile automatically
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select invite_employee('New.Tech@X.com', 'tech', 'T77', 'New Tech') is not null as invited;
select invite_employee('bad email') ;
reset role;
insert into auth.users values ('77777777-7777-7777-7777-777777777777','new.tech@x.com','{"full_name":"Ignored Name"}');
select role, tech_id, display_name, franchise_id = 'aaaaaaaa-0000-0000-0000-000000000001' as right_store from profiles where user_id='77777777-7777-7777-7777-777777777777';
select used_at is not null as used from employee_invites where email='new.tech@x.com';
\echo sign-in with no invite -> no profile
insert into auth.users values ('88888888-8888-8888-8888-888888888888','stranger@x.com');
select count(*) from profiles where user_id='88888888-8888-8888-8888-888888888888';
\echo manager edits + removes; cannot touch other store or self role
set role authenticated; set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select update_employee('77777777-7777-7777-7777-777777777777', 'manager', 'T78');
reset role; select role, tech_id from profiles where user_id='77777777-7777-7777-7777-777777777777'; set role authenticated; set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select update_employee('33333333-3333-3333-3333-333333333333', 'tech');
select update_employee('66666666-6666-6666-6666-666666666666', 'tech');
select update_employee('11111111-1111-1111-1111-111111111111', 'tech');
select remove_employee('77777777-7777-7777-7777-777777777777');
reset role; select count(*) as profiles_left from profiles where user_id='77777777-7777-7777-7777-777777777777'; select count(*) as invites_left from employee_invites where email='new.tech@x.com';
\echo tech cannot invite
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select invite_employee('x@x.com');
select my_features();
\echo releases: tech can read latest stable only; overwatch publishes (needs notes + confirm)
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select publish_release('tablet','0.1.9','short','https://x/apk','sandbox','0.1.9');
select publish_release('tablet','0.1.9','Route map and repair assist added. Watch for geocoding misses.','https://x/apk','sandbox','0.1.8');
select publish_release('tablet','0.1.9','Route map and repair assist added. Watch for geocoding misses.','https://x/apk','sandbox','0.1.9') is not null as published;
select publish_release('tablet','0.1.8','Earlier stable build with pairing and location only.','https://x/apk8','stable','0.1.8') is not null as published_stable;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select version, channel from latest_release('tablet');
select count(*) as can_read_all from releases;
select publish_release('tablet','9.9.9','tech tries to publish a release here','','stable','9.9.9');
\echo sandbox franchise sees the sandbox build
select count(*) as sandboxes from franchises where is_sandbox;
reset role;
insert into auth.users values ('99999999-9999-9999-9999-999999999999','sb@x.com');
insert into profiles (user_id, franchise_id, role, email) select '99999999-9999-9999-9999-999999999999', id, 'tech', 'sb@x.com' from franchises where name='Sandbox A';
set role authenticated; set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select version, channel from latest_release('tablet');
\echo overwatch: create franchise, read codes, invite into it, feature switch; manager cannot
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select length(join_code) from create_franchise('New Franchise');
select count(*) as all_franchises from franchises;
select store_code_for((select id from franchises where name='New Franchise')) is not null as got_code;
select invite_employee_in((select id from franchises where name='New Franchise'), 'dm@x.com', 'manager') is not null;
insert into franchise_features (franchise_id, key, enabled) values ('aaaaaaaa-0000-0000-0000-000000000002', 'tablet.route', false);
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select my_features()->>'tablet.route' as route_for_elsewhere;
select create_franchise('Nope');
select count(*) as sees_franchises from franchises;
insert into franchise_features (franchise_id, key, enabled) values ('aaaaaaaa-0000-0000-0000-000000000002', 'tablet.assist', false);
\echo disabled employee loses access
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select update_employee('22222222-2222-2222-2222-222222222222', null, null, null, true);
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as sheets_visible from sheets; select my_franchise() is null as no_store;
