\set ON_ERROR_STOP 0
-- needs devices_test.sql users/franchises (run after it)
reset role;
update profiles set tech_id = 'T22' where user_id = '22222222-2222-2222-2222-222222222222';
insert into auth.users values ('44444444-4444-4444-4444-444444444444','tech2@a.example');
insert into profiles (user_id, franchise_id, role, display_name, email, tech_id) values
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-0000-0000-0000-000000000001','tech','Tech2','tech2@a.example','T44');
set role authenticated;
\echo tech pushes a sheet (should fail)
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select upsert_daily_sheet('2026-11-14','T22','Me','Van 1','[]');
\echo manager pushes sheets for T22 and T44
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select upsert_daily_sheet('2026-11-14','T22','Jane Tech','Van 3','[{"external_id":"J1","position":1,"customer_name":"Customer A","address":"1 Main","phone_last4":"(555) 555-1234","window_start":"2026-11-14T08:00:00-05","window_end":"2026-11-14T10:00:00-05","device":"iPhone 15"},{"external_id":"J2","position":2,"customer_name":"Customer B"},{"external_id":"J3","position":3,"customer_name":"Gone"}]') is not null as pushed;
select upsert_daily_sheet('2026-11-14','T44','Other','Van 4','[{"external_id":"K1","customer_name":"Theirs"}]') is not null as pushed2;
select phone_last4 from sheet_jobs where external_id='J1';
\echo tech sees only own sheet + jobs (1, 3)
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) from sheets; select count(*) from sheet_jobs;
\echo tech direct update (0 rows)
update sheet_jobs set customer_name='x';
update sheets set van='x';
\echo tech saves job J1 + header
select save_job((select id from sheet_jobs where external_id='J1'),'46896','10032',null,'','used','completed',null);
select save_sheet((select id from sheets limit 1), now(), true, null, null, false);
select part_sku, bg_sku, rw, part_status, outcome, done_at is not null as done from sheet_jobs where external_id='J1';
\echo tech saves other tech job (should fail)
reset role; select id as kid from sheet_jobs where external_id='K1' \gset
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select save_job(:'kid','evil');
\echo bad status (should fail)
select save_job((select id from sheet_jobs where external_id='J2'),null,null,null,null,'stolen');
\echo manager re-pushes without J1, J3: J1 kept (touched), J3 removed
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select upsert_daily_sheet('2026-11-14','T22','Jane Tech','Van 3','[{"external_id":"J2","position":1,"customer_name":"Customer B2"}]') is not null;
select external_id, customer_name, part_sku from sheet_jobs where sheet_id=(select id from sheets where tech_id='T22') order by external_id;
\echo submit without signature (fail), then ok, then edit after submit (fail)
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select submit_sheet((select id from sheets limit 1),'Jane Manager','');
select submit_sheet((select id from sheets limit 1),'Jane Manager','M10 10 L 50 50 L 90 20');
select save_job((select id from sheet_jobs where external_id='J1'),'1');
\echo tech reopen (fail), tech changes own tech_id (0 rows)
select reopen_sheet((select id from sheets limit 1));
update profiles set tech_id='T44' where user_id=auth.uid();
reset role; select tech_id from profiles where user_id='22222222-2222-2222-2222-222222222222';
\echo other franchise manager sees nothing
set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) from sheets; select count(*) from sheet_jobs;
select save_job(:'kid','evil');
\echo anon cannot call
reset role; set role anon;
select save_job(:'kid','evil');
