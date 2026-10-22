begin;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar_path text not null default '',
  updated_at timestamptz not null default now(),
  constraint admin_avatar_own_path check(avatar_path='' or (
    split_part(avatar_path,'/',1)=user_id::text and
    avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|avif)$'
  ))
);
alter table public.admin_profiles enable row level security;
revoke all on public.admin_profiles from public,anon,authenticated;
grant select,insert,update on public.admin_profiles to authenticated;
drop policy if exists admin_own_profile on public.admin_profiles;
create policy admin_own_profile on public.admin_profiles to authenticated
using(user_id=auth.uid() and public.is_admin())
with check(user_id=auth.uid() and public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('admin-avatars','admin-avatars',false,2000000,array['image/png','image/jpeg','image/webp','image/avif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists admin_avatar_upload on storage.objects;
create policy admin_avatar_upload on storage.objects for insert to authenticated
with check(bucket_id='admin-avatars' and public.is_admin() and split_part(name,'/',1)=auth.uid()::text);
drop policy if exists admin_avatar_read on storage.objects;
create policy admin_avatar_read on storage.objects for select to authenticated
using(bucket_id='admin-avatars' and public.is_admin() and split_part(name,'/',1)=auth.uid()::text);
commit;
