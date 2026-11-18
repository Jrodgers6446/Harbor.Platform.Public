-- Pre-call: results of the website's Pre-call module, shared by every manager of a store. Needs 0004.
-- Texts are sent by Harbor Helper on the manager's PC (through Bridge); the website records what
-- happened per customer per day here.
--
--   read:  GET  /rest/v1/precall_results?day=eq.2026-11-15
--   write: POST /rest/v1/rpc/precall_put { p_day, p_sjn, p_patch }   (managers only; merges into the row)
--          p_patch keys: customer, status, detail, message, at, dry, reply

create table if not exists precall_results (
  franchise_id uuid not null references franchises(id) on delete cascade,
  day          date not null,
  sjn          text not null,                 -- the job's number in the scheduling system
  customer     text,
  status       text,                          -- sent | unconfirmed | skipped | error
  detail       text,
  message      text,                          -- the text that went out
  sent_at      timestamptz,
  dry          jsonb,                         -- last dry run: { status, detail, at }
  reply        jsonb,                         -- last reply check: { status, customerText, reply, flags, mismatch, at }
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  primary key (franchise_id, day, sjn)
);
alter table precall_results enable row level security;
drop policy if exists precall_read on precall_results;
create policy precall_read on precall_results for select using (i_am_manager() and franchise_id = my_franchise());
grant select on precall_results to authenticated;

create or replace function precall_put(p_day date, p_sjn text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public, extensions as
$$
declare f uuid := my_franchise();
begin
  if f is null or not i_am_manager() then raise exception 'Only a store manager can record Pre-call results.' using errcode = '42501'; end if;
  if p_sjn is null or length(p_sjn) > 80 then raise exception 'Bad job number.'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or octet_length(p_patch::text) > 20000 then raise exception 'Bad result.'; end if;
  insert into precall_results (franchise_id, day, sjn, customer, status, detail, message, sent_at, dry, reply, updated_by)
  values (f, p_day, p_sjn, p_patch->>'customer', p_patch->>'status', p_patch->>'detail', p_patch->>'message',
          case when p_patch ? 'at' and p_patch ? 'status' then (p_patch->>'at')::timestamptz end,
          p_patch->'dry', p_patch->'reply', auth.uid())
  on conflict (franchise_id, day, sjn) do update set
    customer = coalesce(excluded.customer, precall_results.customer),
    status   = case when p_patch ? 'status'  then excluded.status  else precall_results.status end,
    detail   = case when p_patch ? 'status'  then excluded.detail  else precall_results.detail end,
    message  = case when p_patch ? 'status'  then excluded.message else precall_results.message end,
    sent_at  = case when p_patch ? 'status'  then excluded.sent_at else precall_results.sent_at end,
    dry      = case when p_patch ? 'dry'     then excluded.dry     else precall_results.dry end,
    reply    = case when p_patch ? 'reply'   then excluded.reply   else precall_results.reply end,
    updated_at = now(), updated_by = auth.uid();
  delete from precall_results where franchise_id = f and day < current_date - 30;
end $$;
revoke execute on function precall_put(date, text, jsonb) from public, anon;
grant execute on function precall_put(date, text, jsonb) to authenticated;
