\set ON_ERROR_STOP 0
\echo manager (666) saves and reads a setting
set role authenticated; set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select set_store_setting('precall', '{"lineA":"Line A"}');
select set_store_setting('precall', '{"lineA":"Line B"}');
select key, value->>'lineA' as line_a from store_settings;
\echo bad key (error)
select set_store_setting('Bad Key!', '{}');
\echo tech reads its store, cannot write (error)
set request.jwt.claim.sub = '13131313-1313-1313-1313-131313131313';
select count(*) as tech_reads from store_settings;
select set_store_setting('precall', '{}');
\echo anon cannot
set role anon; select set_store_setting('precall', '{}');
reset role;
