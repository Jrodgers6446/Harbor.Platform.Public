\set ON_ERROR_STOP 0
\echo anon sees the stable release only
set role anon;
select version, url from public_release('tablet');
reset role;
select public, array_length(allowed_mime_types, 1) as mimes from storage.buckets where id = 'releases';
