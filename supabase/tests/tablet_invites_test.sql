\set ON_ERROR_STOP 0
\echo manager (666) makes a QR token
set role authenticated; set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
create temp table tok as select token from create_tablet_invite();
reset role; grant select on tok to anon, authenticated;
\echo anyone with the token sees the store; a wrong token sees nothing
set role anon;
select store, valid from tablet_invite_info((select token from tok));
select count(*) as wrong from tablet_invite_info('nope');
\echo anon cannot pair or make tokens (2 errors)
select pair_with_invite((select token from tok));
select create_tablet_invite();
\echo a brand-new login (no store yet) pairs with it: active device, tech profile in that store
reset role; insert into auth.users (id, email) values ('13131313-1313-1313-1313-131313131313','new.tab@a.example') on conflict do nothing;
delete from profiles where user_id = '13131313-1313-1313-1313-131313131313';
set role authenticated; set request.jwt.claim.sub = '13131313-1313-1313-1313-131313131313';
select store from pair_with_invite((select token from tok), 'Tablet A', 'SM-X230', '0.1.15');
reset role; select d.status, d.requested_email, p.role from devices d join profiles p on p.user_id = d.requested_by where d.requested_by = '13131313-1313-1313-1313-131313131313';
\echo the tablet can claim its token right away
create temp table dev as select device_id from tablet_invites where used_by = '13131313-1313-1313-1313-131313131313'; grant select on dev to authenticated;
set role authenticated; set request.jwt.claim.sub = '13131313-1313-1313-1313-131313131313';
select status, device_token is not null as got_token from claim_device_token((select device_id from dev));
\echo second use fails; shown as no longer valid
select pair_with_invite((select token from tok));
select valid from tablet_invite_info((select token from tok));
\echo a tech cannot make tokens (error)
select create_tablet_invite();
\echo expired token fails
reset role; update tablet_invites set used_at = null, expires_at = now() - interval '1 minute';
set role authenticated; set request.jwt.claim.sub = '13131313-1313-1313-1313-131313131313';
select pair_with_invite((select token from tok));
reset role;
