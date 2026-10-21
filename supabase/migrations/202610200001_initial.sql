-- Execute no SQL Editor do seu projeto Supabase. Esta migração cria o esquema
-- e mantém dados de participantes protegidos por RLS e funções específicas.
begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.site_settings (
  id integer primary key default 1 check(id = 1),
  site_name text not null default 'Rifa Club' check(char_length(site_name) between 2 and 50),
  pix_key text not null default '' check(char_length(pix_key) <= 77),
  receiver_name text not null default '' check(char_length(receiver_name) <= 100),
  receiver_city text not null default '' check(char_length(receiver_city) <= 50),
  whatsapp text not null default '' check(char_length(whatsapp) <= 25)
);
insert into public.site_settings(id) values(1);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;
create policy "public_settings" on public.site_settings for select to anon, authenticated using(true);
create policy "admin_settings" on public.site_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(title) between 3 and 100),
  subtitle text not null default '' check(char_length(subtitle) <= 150),
  category text not null default 'Outros' check(category in ('Automóveis','Motos','Eletrônicos','Outros')),
  image text not null default '/images/fallback.svg' check(char_length(image) <= 2000 and (image like '/%' or image like 'https://%')),
  price numeric(10,2) not null check(price >= 0.01),
  total_numbers integer not null check(total_numbers between 10 and 10000),
  draw_date date,
  status text not null default 'paused' check(status in ('active','paused','finished')),
  description text not null default '' check(char_length(description) <= 3000),
  rules text not null default '' check(char_length(rules) <= 8000),
  created_at timestamptz not null default now(),
  check(status <> 'active' or (draw_date is not null and char_length(trim(rules)) > 0))
);
alter table public.campaigns enable row level security;
revoke all on public.campaigns from anon, authenticated;
grant select on public.campaigns to anon, authenticated;
grant insert, update on public.campaigns to authenticated;
create policy "visible_campaigns" on public.campaigns for select to anon, authenticated using(status in ('active','finished') or public.is_admin());
create policy "admin_create_campaigns" on public.campaigns for insert to authenticated with check(public.is_admin());
create policy "admin_update_campaigns" on public.campaigns for update to authenticated using(public.is_admin()) with check(public.is_admin());

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  access_token uuid not null default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  customer_name text not null check(char_length(customer_name) between 3 and 100),
  phone text not null check(phone ~ '^55[0-9]{10,11}$'),
  numbers integer[] not null check(cardinality(numbers) between 1 and 100),
  amount numeric(12,2) not null check(amount > 0),
  status text not null default 'pending' check(status in ('pending','paid','cancelled','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);
create index orders_campaign_idx on public.orders(campaign_id);
create index orders_pending_expiry_idx on public.orders(expires_at) where status = 'pending';
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
create policy "admin_read_orders" on public.orders for select to authenticated using(public.is_admin());

-- Uma linha por número ocupado. A chave primária é a última barreira contra
-- reserva duplicada. Operações de reserva/baixa também travam a campanha.
create table public.tickets (
  campaign_id uuid not null references public.campaigns(id),
  number integer not null check(number >= 0),
  order_id uuid not null references public.orders(id),
  primary key(campaign_id,number)
);
create index tickets_order_idx on public.tickets(order_id);
alter table public.tickets enable row level security;
revoke all on public.tickets from anon, authenticated;

create function public.guard_campaign_update() returns trigger
language plpgsql security definer set search_path = ''
as $$ begin
  if (old.price <> new.price or old.total_numbers <> new.total_numbers)
     and exists(select 1 from public.orders where campaign_id = old.id) then
    raise exception 'Preço e quantidade não podem ser alterados após receber pedidos.';
  end if;
  return new;
end; $$;
revoke all on function public.guard_campaign_update() from public;
create trigger guard_campaign_update before update on public.campaigns for each row execute function public.guard_campaign_update();

create function public.get_campaign_tickets(p_campaign_id uuid)
returns table(campaign_id uuid, number integer, status text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select t.campaign_id,t.number,o.status,o.expires_at from public.tickets t
  join public.orders o on o.id=t.order_id join public.campaigns c on c.id=t.campaign_id
  where t.campaign_id=p_campaign_id and (c.status in ('active','finished') or public.is_admin())
  and (o.status='paid' or (o.status='pending' and o.expires_at > now()));
$$;
revoke all on function public.get_campaign_tickets(uuid) from public;
grant execute on function public.get_campaign_tickets(uuid) to anon, authenticated;

create function public.reserve_order(p_campaign_id uuid, p_numbers integer[], p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = ''
as $$ declare
  campaign public.campaigns%rowtype;
  reservation public.orders%rowtype;
  config public.site_settings%rowtype;
  clean_phone text;
begin
  if p_name is null or char_length(trim(p_name)) not between 3 and 100 then raise exception 'Informe seu nome completo.'; end if;
  clean_phone := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if char_length(clean_phone) in (10,11) then clean_phone := '55' || clean_phone; end if;
  if clean_phone !~ '^55[0-9]{10,11}$' then raise exception 'Informe um WhatsApp válido com DDD.'; end if;
  if p_numbers is null or coalesce(array_length(p_numbers,1),0) not between 1 and 100
    or array_ndims(p_numbers) <> 1 or array_position(p_numbers,null) is not null
    or (select count(distinct n) from unnest(p_numbers) n) <> cardinality(p_numbers)
    then raise exception 'Escolha entre 1 e 100 números diferentes.'; end if;
  select * into campaign from public.campaigns where id=p_campaign_id for update;
  if not found or campaign.status <> 'active' then raise exception 'Esta campanha não está recebendo reservas.'; end if;
  if exists(select 1 from unnest(p_numbers) n where n < 0 or n >= campaign.total_numbers) then raise exception 'Número fora dos limites da campanha.'; end if;
  select * into config from public.site_settings where id=1;
  if trim(config.pix_key)='' or trim(config.receiver_name)='' or trim(config.receiver_city)='' or regexp_replace(config.whatsapp,'[^0-9]','','g') !~ '^([0-9]{10,11}|55[0-9]{10,11})$' then raise exception 'O organizador precisa configurar Pix e WhatsApp.'; end if;
  update public.orders set status='expired' where campaign_id=p_campaign_id and status='pending' and expires_at <= now();
  delete from public.tickets t using public.orders o where t.order_id=o.id and t.campaign_id=p_campaign_id and o.status in ('expired','cancelled');
  if exists(select 1 from public.tickets where campaign_id=p_campaign_id and number=any(p_numbers)) then raise exception 'Um dos números foi reservado. Atualize sua seleção.'; end if;
  -- Limite por contato para reduzir o bloqueio de estoque por reservas sem pagamento.
  if (select count(*) from public.orders where phone=clean_phone and status='pending' and expires_at>now()) >= 5 then raise exception 'Você já tem 5 reservas pendentes. Conclua uma delas antes de reservar novamente.'; end if;
  insert into public.orders(campaign_id,customer_name,phone,numbers,amount)
    values(p_campaign_id,trim(p_name),clean_phone,array(select n from unnest(p_numbers) n order by n),campaign.price*cardinality(p_numbers)) returning * into reservation;
  insert into public.tickets(campaign_id,number,order_id) select p_campaign_id,n,reservation.id from unnest(p_numbers) n;
  return to_jsonb(reservation);
end; $$;
revoke all on function public.reserve_order(uuid,integer[],text,text) from public;
grant execute on function public.reserve_order(uuid,integer[],text,text) to anon, authenticated;

create function public.get_my_order(p_order_id uuid,p_access_token uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select to_jsonb(o) || jsonb_build_object('status',case when o.status='pending' and o.expires_at<=now() then 'expired' else o.status end)
from public.orders o where o.id=p_order_id and o.access_token=p_access_token; $$;
revoke all on function public.get_my_order(uuid,uuid) from public;
grant execute on function public.get_my_order(uuid,uuid) to anon, authenticated;

create function public.admin_order_status(p_order_id uuid,p_status text)
returns void language plpgsql security definer set search_path = ''
as $$ declare reservation public.orders%rowtype; selected_campaign uuid; begin
  if not public.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  if p_status is null or p_status not in ('paid','cancelled') then raise exception 'Status inválido.'; end if;
  select campaign_id into selected_campaign from public.orders where id=p_order_id;
  if not found then raise exception 'Reserva não encontrada.'; end if;
  -- Mesmo ordenamento de locks de reserve_order para evitar deadlocks.
  perform 1 from public.campaigns where id=selected_campaign for update;
  select * into reservation from public.orders where id=p_order_id for update;
  if reservation.status <> 'pending' or reservation.expires_at <= now() then raise exception 'Esta reserva expirou ou já foi processada.'; end if;
  update public.orders set status=p_status where id=p_order_id;
  if p_status='cancelled' then delete from public.tickets where order_id=p_order_id; end if;
end; $$;
revoke all on function public.admin_order_status(uuid,text) from public;
grant execute on function public.admin_order_status(uuid,text) to authenticated;

commit;
