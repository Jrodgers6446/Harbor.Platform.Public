\set ON_ERROR_STOP 0
reset role;
insert into auth.users values ('55555555-5555-5555-5555-555555555555','newtech@x.com');
select length(join_code) as code_len from franchises where name='Example Store';
select join_code as code from franchises where name='Example Store' \gset
\echo new tech: not joined yet (0 rows), bad code fails, good code joins as tech
set role authenticated; set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select count(*) from profiles where user_id = auth.uid();
select * from join_store('NOPE12');
select * from join_store(lower(:'code'));
select role, tech_id, display_name from profiles where user_id = auth.uid();
\echo joining again with the other store code keeps the first store
reset role; select join_code as code2 from franchises where name='Elsewhere' \gset
set role authenticated; set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select * from join_store(:'code2');
\echo tech cannot read the code (error), sees name, cannot make a new one, my_store_code null
select join_code from franchises;
select name from franchises;
select new_join_code();
select my_store_code() is null as hidden;
\echo manager approves a tablet from the new tech with tech_id T55 -> profile linked
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select device_id as nd from request_pairing('Tab 9') \gset
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update devices set status='active', tech_id='T55', tech_name='New Tech' where id = :'nd';
select tech_id, display_name from profiles where user_id='55555555-5555-5555-5555-555555555555';
update devices set tech_id='T56' where id = :'nd';
select tech_id from profiles where user_id='55555555-5555-5555-5555-555555555555';
\echo manager reads and makes a new code
select length(my_store_code()), length(new_join_code()), my_store_code() <> :'code' as changed;
\echo anon cannot join
reset role; set role anon;
select * from join_store(:'code');
