\set ON_ERROR_STOP 0
insert into auth.users values ('11111111-1111-1111-1111-111111111111','mgr@a.example'),('22222222-2222-2222-2222-222222222222','tech@a.example'),('33333333-3333-3333-3333-333333333333','other@b.example');
insert into franchises (id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','Example Store'),('aaaaaaaa-0000-0000-0000-000000000002','Elsewhere');
insert into profiles values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','manager','Mgr','mgr@a.example'),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','tech','Tech','tech@a.example'),
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-0000-0000-0000-000000000002','manager','Other','other@b.example');
-- tech asks to pair
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select device_id is not null as got_id, length(pair_code) as code_len from request_pairing('Tablet 07','SM-X230','1.0');
\echo tech tries direct insert (should fail)
insert into devices (franchise_id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','evil');
\echo tech tries to approve own tablet (0 rows)
update devices set status='active';
select status, (select count(*) from devices) as visible from devices;
select * from claim_device_token((select id from devices limit 1));
-- other franchise manager
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
\echo other franchise sees: 
select count(*) from devices;
update devices set status='active';
-- manager approves and tries to set token
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update devices set status='active', tech_name='Sam Tech', van='Van 3', token_hash='aaa', token_claimed=true returning status, approved_by is not null as approved, token_hash, token_claimed, pair_code;
-- tech claims token, reports location
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select status, length(device_token) as tok_len from claim_device_token((select id from devices limit 1)) \gset
\echo second claim gives no token:
select status, device_token from claim_device_token((select id from devices limit 1));
reset role;
select id as did from devices limit 1 \gset
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
\echo report with bad token (should fail)
select report_location(:'did', 'nope', 33.9, -83.9);
reset role;
-- get a real token by resetting and claiming as tech
update devices set token_claimed=false, token_hash=null;
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select device_token as tok from claim_device_token(:'did') \gset
select report_location(:'did', :'tok', 33.95, -83.98, 12, 0, 76, '1.0.1');
\echo tech reads locations (0 rows by policy):
select count(*) from locations;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
\echo manager sees:
select count(*) from locations; select battery, last_lat, app_version, last_seen_at is not null from devices;
\echo manager revokes; then report fails
update devices set status='revoked';
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select report_location(:'did', :'tok', 33.95, -83.98);
