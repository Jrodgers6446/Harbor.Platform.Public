\set ON_ERROR_STOP 0
\echo a plain manager (666) cannot edit (error)
set role authenticated; set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select set_site_content('welcome', '{"title":"x"}');
\echo overwatch (the 111 manager made overwatch in website_test) edits; anon reads
reset role; select user_id from profiles where role = 'overwatch' limit 1 \gset
set role authenticated; set request.jwt.claim.sub = :'user_id';
select set_site_content('welcome', '{"title":"Hello"}');
set role anon; select value->>'title' as title from site_content where key = 'welcome';
\echo null resets to default (row gone)
set role authenticated; set request.jwt.claim.sub = :'user_id';
select set_site_content('welcome', null);
set role anon; select count(*) as rows_left from site_content;
reset role;
