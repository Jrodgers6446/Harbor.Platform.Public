\set ON_ERROR_STOP 0
\echo manager records a dry run, then a send, then a reply; the row merges
set role authenticated; set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select precall_put(current_date + 1, 'SJ1', '{"customer":"Dana W","dry":{"status":"dry-run"}}');
select precall_put(current_date + 1, 'SJ1', '{"status":"sent","message":"Hi Dana","at":"2026-11-14T18:00:00Z"}');
select precall_put(current_date + 1, 'SJ1', '{"reply":{"status":"replied","customerText":"yes"}}');
select customer, status, message, dry->>'status' as dry, reply->>'status' as reply, sent_at is not null as has_sent from precall_results;
\echo tech cannot write (error) or read
set request.jwt.claim.sub = '13131313-1313-1313-1313-131313131313';
select precall_put(current_date, 'SJ2', '{}');
select count(*) as tech_reads from precall_results;
\echo anon cannot
set role anon; select precall_put(current_date, 'SJ2', '{}');
reset role;
