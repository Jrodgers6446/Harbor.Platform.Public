\set ON_ERROR_STOP 0
reset role;
insert into employee_invites (franchise_id, email, role) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Invited.Person@A.example', 'tech');
\echo invited (allow {}), existing profile (allow), stranger (403), blank (403)
select harbor_before_user_created('{"user":{"email":"invited.person@a.example"}}');
select harbor_before_user_created('{"user":{"email":"MGR@a.example"}}');
select harbor_before_user_created('{"user":{"email":"stranger2@a.example"}}')->'error'->>'http_code' as stranger;
select harbor_before_user_created('{"user":{}}')->'error'->>'http_code' as blank;
\echo authenticated cannot call it
set role authenticated;
select harbor_before_user_created('{"user":{"email":"x@a.example"}}');
