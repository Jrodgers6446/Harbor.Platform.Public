\set ON_ERROR_STOP 0
\echo store list for the form (anon)
set role anon;
select count(*) > 0 as has_stores from signup_stores();
\echo only @example.com (error), blank name (error), then a good request
select request_signup('someone@mail.test', 'Some One', 'aaaaaaaa-0000-0000-0000-000000000001');
select request_signup('new.tech@example.com', '', 'aaaaaaaa-0000-0000-0000-000000000001');
select request_signup('New.Tech@Example.com', 'New Tech', 'aaaaaaaa-0000-0000-0000-000000000001');
reset role;
\echo login gate: pending @example.com request is allowed, other domain still blocked
select harbor_before_user_created('{"user":{"email":"new.tech@example.com"}}') as allowed;
select harbor_before_user_created('{"user":{"email":"nobody@example.com"}}')->'error'->>'http_code' as blocked;
\echo approve before the code is entered (error)
insert into auth.users values ('51515151-5151-5151-5151-515151515151', 'new.tech@example.com');
set role authenticated; set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select approve_signup((select id from signup_requests where email = 'new.tech@example.com'), 'tech', 'T9');
\echo they enter the code -> confirm
set request.jwt.claim.sub = '51515151-5151-5151-5151-515151515151'; set request.jwt.claims = '{"email":"new.tech@example.com"}';
select confirm_signup();
select count(*) as profile_before from profiles where user_id = '51515151-5151-5151-5151-515151515151';
\echo a tech cannot approve (error); the store manager can
set request.jwt.claim.sub = '13131313-1313-1313-1313-131313131313';
select approve_signup((select id from signup_requests where email = 'new.tech@example.com'));
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select count(*) as manager_sees from signup_requests;
select approve_signup((select id from signup_requests where email = 'new.tech@example.com'), 'tech', 'T9');
reset role;
select role, tech_id, display_name from profiles where user_id = '51515151-5151-5151-5151-515151515151';
select status from signup_requests where email = 'new.tech@example.com';
\echo existing user asks again (error); deny flow
set role anon; select request_signup('new.tech@example.com', 'New Tech', 'aaaaaaaa-0000-0000-0000-000000000001');
select request_signup('maybe@example.com', 'Maybe', 'aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated; set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select deny_signup((select id from signup_requests where email = 'maybe@example.com'));
set role anon; select request_signup('maybe@example.com', 'Maybe', 'aaaaaaaa-0000-0000-0000-000000000001');
\echo anon cannot read requests or approve
select count(*) from signup_requests;
select approve_signup(gen_random_uuid());
reset role;
