-- Personalização do site: mantém as políticas existentes de leitura pública
-- e escrita apenas por administrador na tabela site_settings.
begin;
alter table public.site_settings add column if not exists appearance jsonb not null default '{}'::jsonb;
alter table public.site_settings drop constraint if exists site_appearance_object;
alter table public.site_settings add constraint site_appearance_object check(jsonb_typeof(appearance)='object' and octet_length(appearance::text) <= 250000);

-- Apenas imagens que serão exibidas publicamente no site ficam neste bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('site-assets','site-assets',true,5000000,array['image/png','image/jpeg','image/webp','image/avif'])
on conflict(id) do nothing;

drop policy if exists "site_assets_admin_upload" on storage.objects;
create policy "site_assets_admin_upload" on storage.objects for insert to authenticated
with check(bucket_id='site-assets' and public.is_admin());
drop policy if exists "site_assets_admin_read" on storage.objects;
create policy "site_assets_admin_read" on storage.objects for select to authenticated
using(bucket_id='site-assets' and public.is_admin());
commit;
