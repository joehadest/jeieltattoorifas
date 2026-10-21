begin;

create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check(char_length(trim(full_name)) between 3 and 100),
  phone text not null default '' check(phone='' or phone ~ '^55[0-9]{10,11}$'),
  updated_at timestamptz not null default now()
);
alter table public.customer_profiles enable row level security;
revoke all on public.customer_profiles from anon,authenticated;
grant select,insert,update on public.customer_profiles to authenticated;
drop policy if exists "customer_own_profile" on public.customer_profiles;
create policy "customer_own_profile" on public.customer_profiles to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());

alter table public.orders add column if not exists customer_id uuid references auth.users(id);
create index if not exists orders_customer_idx on public.orders(customer_id,created_at desc);
drop policy if exists "customer_own_orders" on public.orders;
create policy "customer_own_orders" on public.orders for select to authenticated using(customer_id=auth.uid());

-- Novas reservas pertencem ao usuário autenticado; o cliente não escolhe o dono.
create or replace function public.reserve_order(p_campaign_id uuid,p_numbers integer[],p_name text,p_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign public.campaigns%rowtype; reservation public.orders%rowtype;
  config public.site_settings%rowtype; clean_phone text; customer uuid;
begin
  customer := auth.uid();
  if customer is null then raise exception 'Entre na sua conta para reservar seus números.'; end if;
  if p_name is null or char_length(trim(p_name)) not between 3 and 100 then raise exception 'Informe seu nome completo.'; end if;
  clean_phone := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if char_length(clean_phone) in (10,11) then clean_phone := '55'||clean_phone; end if;
  if clean_phone !~ '^55[0-9]{10,11}$' then raise exception 'Informe um WhatsApp válido com DDD.'; end if;
  if p_numbers is null or coalesce(array_length(p_numbers,1),0) not between 1 and 100
    or array_ndims(p_numbers)<>1 or array_position(p_numbers,null) is not null
    or (select count(distinct n) from unnest(p_numbers) n)<>cardinality(p_numbers)
    then raise exception 'Escolha entre 1 e 100 números diferentes.'; end if;
  select * into campaign from public.campaigns where id=p_campaign_id for update;
  if not found or campaign.status<>'active' then raise exception 'Esta campanha não está recebendo reservas.'; end if;
  if exists(select 1 from unnest(p_numbers) n where n<campaign.number_start or n>=campaign.number_start+campaign.total_numbers)
    then raise exception 'Número fora dos limites da campanha.'; end if;
  select * into config from public.site_settings where id=1;
  if trim(config.pix_key)='' or trim(config.receiver_name)='' or trim(config.receiver_city)=''
    or regexp_replace(config.whatsapp,'[^0-9]','','g') !~ '^([0-9]{10,11}|55[0-9]{10,11})$'
    then raise exception 'O organizador precisa configurar Pix e WhatsApp.'; end if;
  update public.orders set status='expired' where campaign_id=p_campaign_id and status='pending' and expires_at<=now();
  delete from public.tickets t using public.orders o where t.order_id=o.id and t.campaign_id=p_campaign_id and o.status in ('expired','cancelled');
  if exists(select 1 from public.tickets where campaign_id=p_campaign_id and number=any(p_numbers)) then raise exception 'Um dos números foi reservado. Atualize sua seleção.'; end if;
  if (select count(*) from public.orders where (customer_id=customer or phone=clean_phone) and status='pending' and expires_at>now())>=5
    then raise exception 'Você já tem 5 reservas pendentes. Conclua uma delas antes de reservar novamente.'; end if;
  insert into public.orders(campaign_id,customer_id,customer_name,phone,numbers,amount)
  values(p_campaign_id,customer,trim(p_name),clean_phone,array(select n from unnest(p_numbers) n order by n),campaign.price*cardinality(p_numbers)) returning * into reservation;
  insert into public.tickets(campaign_id,number,order_id) select p_campaign_id,n,reservation.id from unnest(p_numbers) n;
  return to_jsonb(reservation);
end; $$;
revoke all on function public.reserve_order(uuid,integer[],text,text) from public,anon;
grant execute on function public.reserve_order(uuid,integer[],text,text) to authenticated;

create or replace function public.get_account_orders() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object(
   'status',case when o.status='pending' and o.expires_at<=now() then 'expired' else o.status end,
   'campaign',to_jsonb(c)) order by o.created_at desc),'[]'::jsonb)
 from public.orders o join public.campaigns c on c.id=o.campaign_id
 where auth.uid() is not null and o.customer_id=auth.uid();
$$;
revoke all on function public.get_account_orders() from public,anon;
grant execute on function public.get_account_orders() to authenticated;

-- Tokens antigos só permitem vincular uma reserva ainda sem dono.
create or replace function public.claim_legacy_order(p_order_id uuid,p_access_token uuid) returns void
language plpgsql security definer set search_path='' as $$
declare reservation public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select * into reservation from public.orders where id=p_order_id for update;
  if not found or reservation.access_token<>p_access_token or p_access_token is null
    or (reservation.customer_id is not null and reservation.customer_id<>auth.uid()) then raise exception 'Não foi possível vincular esta reserva.'; end if;
  if reservation.customer_id=auth.uid() then return; end if;
  update public.orders set customer_id=auth.uid(),access_token=gen_random_uuid() where id=p_order_id;
end; $$;
revoke all on function public.claim_legacy_order(uuid,uuid) from public,anon;
grant execute on function public.claim_legacy_order(uuid,uuid) to authenticated;

create or replace function public.get_my_order(p_order_id uuid,p_access_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(o)||jsonb_build_object('status',case when o.status='pending' and o.expires_at<=now() then 'expired' else o.status end)
 from public.orders o where o.id=p_order_id and o.access_token=p_access_token
 and (o.customer_id is null or o.customer_id=auth.uid());
$$;

-- Atualiza apenas a orientação padrão antiga; textos personalizados são mantidos.
update public.site_settings set appearance=jsonb_set(appearance,'{faq,items,2,answer}',to_jsonb('Entre na sua conta em “Meus números” para consultar suas reservas, os números confirmados e os resultados em qualquer dispositivo. Reservas antigas deste navegador podem ser vinculadas à conta pelo comprovante de acesso.'::text))
where appearance #>> '{faq,items,2,answer}'='Em “Meus números”, você encontra as reservas realizadas neste navegador e o status de cada uma. Guarde o código da reserva para atendimento com o organizador.';

update public.site_settings set appearance=jsonb_set(appearance,'{footer,privacy_text}',to_jsonb('Nome, e-mail e WhatsApp identificam sua conta e suas reservas e permitem o atendimento. Com Supabase configurado, os dados ficam no projeto do organizador e cada participante consulta somente suas próprias reservas. A autenticação e as senhas são gerenciadas pelo Supabase Auth. Nos resultados públicos aparecem o número sorteado e o nome abreviado do ganhador. Em demonstração, os dados ficam apenas neste navegador.'::text)) where appearance #>> '{footer,privacy_text}'='Nome e WhatsApp são usados para identificar a reserva e permitir o atendimento. Em demonstração, os dados ficam somente neste navegador. Com Supabase configurado, as reservas são armazenadas no projeto do organizador, com acesso administrativo restrito.';

commit;
