-- Adds user-managed profile photos backed by Supabase Storage.

begin;

alter table public.profiles
add column if not exists avatar_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view profile photos" on storage.objects;
create policy "Public can view profile photos"
on storage.objects for select
to public
using (bucket_id = 'profile-photos');

drop policy if exists "Users can upload their profile photos" on storage.objects;
create policy "Users can upload their profile photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can replace their profile photos" on storage.objects;
create policy "Users can replace their profile photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their profile photos" on storage.objects;
create policy "Users can delete their profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
