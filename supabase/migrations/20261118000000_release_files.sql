-- Release files: a public storage bucket for APKs and extension zips, plus the sign-in-free download lookup.
-- Needs website.
--
-- * CI uploads each tablet build to releases/tablet/harbor-tech-<run>.apk using the service key.
-- * Overwatch picks one of those files when publishing a release; its public URL goes in releases.url.
-- * The website's /get page shows the stable tablet release to anyone (the APK is public anyway).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('releases', 'releases', true, 209715200, array['application/vnd.android.package-archive', 'application/zip', 'application/octet-stream'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can download (public bucket); only Overwatch (or CI with the service key, which bypasses RLS) can add or remove files.
drop policy if exists releases_public_read on storage.objects;
create policy releases_public_read on storage.objects for select using (bucket_id = 'releases');
drop policy if exists releases_overwatch_write on storage.objects;
create policy releases_overwatch_write on storage.objects for insert with check (bucket_id = 'releases' and i_am_overwatch());
drop policy if exists releases_overwatch_update on storage.objects;
create policy releases_overwatch_update on storage.objects for update using (bucket_id = 'releases' and i_am_overwatch());
drop policy if exists releases_overwatch_delete on storage.objects;
create policy releases_overwatch_delete on storage.objects for delete using (bucket_id = 'releases' and i_am_overwatch());

-- Stable release for the public download page (no sign-in). Never returns sandbox builds.
create or replace function public_release(p_platform text)
returns table (version text, notes text, url text, published_at timestamptz)
language sql stable security definer set search_path = public, extensions as
$$ select r.version, r.notes, r.url, r.published_at from releases r
   where r.platform = p_platform and r.channel = 'stable' and r.url is not null
   order by version_key(r.version) desc, r.published_at desc limit 1 $$;
revoke execute on function public_release(text) from public;
grant execute on function public_release(text) to anon, authenticated;
