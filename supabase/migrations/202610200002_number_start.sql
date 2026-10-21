begin;
alter table public.campaigns add column if not exists number_start integer not null default 0 check(number_start in (0,1));
alter table public.campaigns drop constraint if exists campaigns_category_check;
alter table public.campaigns add constraint campaigns_category_check check(category in ('Automóveis','Motos','Eletrônicos','Tattoo','Outros'));

create or replace function public.guard_campaign_update() returns trigger
language plpgsql security definer set search_path = ''
as $$ begin
  if (old.price <> new.price or old.total_numbers <> new.total_numbers or old.number_start <> new.number_start)
     and exists(select 1 from public.orders where campaign_id = old.id) then
    raise exception 'Preço, quantidade e início da numeração não podem ser alterados após receber pedidos.';
  end if;
  return new;
end; $$;

create or replace function public.reserve_order(p_campaign_id uuid, p_numbers integer[], p_name text, p_phone text)
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
  if exists(select 1 from unnest(p_numbers) n where n < campaign.number_start or n >= campaign.number_start + campaign.total_numbers) then raise exception 'Número fora dos limites da campanha.'; end if;
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
commit;
