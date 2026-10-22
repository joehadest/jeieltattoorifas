-- Atualiza personalização, imagens, numeração, contas, sorteios e histórico de pagamentos.
-- Preserva configurações já preenchidas. Não ativa vendas nem executa sorteios.
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

-- Personalização do site: mantém as políticas existentes de leitura pública
-- e escrita apenas por administrador na tabela site_settings.

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

-- Dados transcritos da arte e do contato fornecidos pelo organizador.
-- Execute DEPOIS das migrações de numeração e personalização visual.
-- O rascunho não é publicado e nenhum pagamento é habilitado por este arquivo.

update public.site_settings set
  site_name = case when site_name in ('Rifa Club','') then 'Jeiel Tattoo' else site_name end,
  pix_key = case when pix_key = '' then 'jeiellimeira36@gmail.com' else pix_key end,
  receiver_city = case when receiver_city = '' then 'Alto do Rodrigues' else receiver_city end,
  whatsapp = case when whatsapp = '' then '558499540402' else whatsapp end
where id=1;

insert into public.campaigns(
  id,title,subtitle,category,image,price,total_numbers,number_start,
  draw_date,status,description,rules
) values (
  '00000000-0000-4000-a000-000000000004',
  'Rifa Tattoo',
  'Uma tattoo de R$ 1.000 ou R$ 500 no Pix.',
  'Tattoo',
  '/images/rifa-tattoo-jeiel.jpeg',
  30,100,1,null,'paused',
  'Concorra a uma tattoo no valor de R$ 1.000,00 ou escolha R$ 500,00 no Pix. Cada número custa R$ 30,00. São 100 números, de 01 a 100. Atendimento em Alto do Rodrigues/RN. A arte informa sorteio em 29/12; ano a confirmar.',
  'RASCUNHO: confirmar com o organizador o ano do sorteio de 29/12, a forma de apuração, as condições da tattoo e os prazos de entrega. Prêmio informado na arte: tattoo de R$ 1.000,00 ou R$ 500,00 no Pix. O pagamento é confirmado manualmente após a conferência do comprovante. Reservas sem confirmação expiram em 30 minutos.'
) on conflict(id) do nothing;


-- Persiste a identidade da arte somente se o visual ainda não foi configurado.
update public.site_settings set appearance = '{"identity":{"logo":"","logo_width":160,"favicon":"/favicon.svg","logo_alt":"Logo do organizador"},"theme":{"accent":"#e7bd35","background":"#101010","surface":"#191919","text":"#f1f0eb","muted":"#a5a196","border":"#34322c","font":"DM Sans","heading_font":"Space Grotesk","radius":8},"header":{"announcement_enabled":true,"announcement":"JEIEL TATTOO · ALTO DO RODRIGUES / RN","side_text":"Arte que fica na pele","campaigns_label":"Campanhas","how_label":"Como participar","faq_label":"Dúvidas","results_label":"Resultados","orders_label":"Meus números"},"hero":{"eyebrow":"SEU PRÓXIMO TRAÇO COMEÇA AQUI","title":"Uma tattoo.\nA sua história.","highlight":"O seu número.","description":"Concorra a uma tattoo de R$ 1.000\nou escolha R$ 500 no Pix. Cada número, R$ 30.","button":"Escolher meu número","caption":"100 números, de 01 a 100.","caption_emphasis":"Uma nova história na pele.","image":"","image_alt":"Arte da campanha em destaque","image_fit":"contain","badge":"RIFA TATTOO","side_text":"JEIEL TATTOO · ARTE AUTORAL","credit":"Arte enviada pelo organizador","featured_id":"","empty_title":"Novas possibilidades vêm aí.","empty_text":"Em breve, novas campanhas por aqui."},"campaigns":{"eyebrow":"RIFA JEIEL TATTOO","title":"Um número. Um novo traço.","search":"Buscar campanha","button":"Participar","footnote":"Confira o regulamento de cada campanha antes de participar."},"how":{"eyebrow":"SEM COMPLICAÇÃO","title":"Da escolha ao Pix.\nÉ simples assim.","description":"Você está a poucos passos\nda sua próxima possibilidade.","steps":[{"title":"Encontre seu prêmio","text":"Escolha uma campanha e selecione os números que combinam com você."},{"title":"Reserve e faça o Pix","text":"Preencha seus dados e pague usando a chave Pix do organizador."},{"title":"Envie o comprovante","text":"Abra o WhatsApp, anexe o comprovante e aguarde a confirmação."}]},"faq":{"eyebrow":"TUDO ÀS CLARAS","title":"Ficou com alguma dúvida?","description":"A gente te ajuda a dar o próximo passo.","items":[{"question":"Como meus números são confirmados?","answer":"Depois de reservar, faça o Pix e envie o comprovante pelo WhatsApp indicado na campanha. O organizador confere o pagamento e confirma seus números no painel. Abrir o WhatsApp não confirma o pagamento automaticamente."},{"question":"Por quanto tempo meus números ficam reservados?","answer":"A reserva dura 30 minutos. Sem confirmação, os números voltam a ficar disponíveis. Se você já pagou e a reserva expirou, fale com o organizador antes de pagar novamente."},{"question":"Onde acompanho a minha participação?","answer":"Entre na sua conta em “Meus números” para consultar suas reservas, os números confirmados e os resultados em qualquer dispositivo. Reservas antigas deste navegador podem ser vinculadas à conta pelo comprovante de acesso."},{"question":"Quando e como acontece o sorteio?","answer":"Na data cadastrada, o organizador realiza o sorteio no próprio site entre os números com pagamento confirmado. Cada número confirmado tem a mesma chance. O resultado e o registro do conjunto participante ficam disponíveis na campanha e em Resultados."}]},"trust":["Pix direto ao organizador","Você escolhe seus números","Atendimento pelo WhatsApp","Simples do início ao fim"],"footer":{"tagline":"Sua pele. Sua história. Seu próximo traço.","location":"Alto do Rodrigues / RN","copyright":"Todos os direitos reservados.","privacy_label":"Privacidade","terms_label":"Termos de participação","privacy_text":"Nome, e-mail e WhatsApp identificam sua conta e suas reservas e permitem o atendimento. Com Supabase configurado, os dados ficam no projeto do organizador e cada participante consulta somente suas próprias reservas. A autenticação e as senhas são gerenciadas pelo Supabase Auth. Nos resultados públicos aparecem o número sorteado e o nome abreviado do ganhador. Em demonstração, os dados ficam apenas neste navegador.","terms_text":"As condições de participação, o prêmio, a data, a forma de apuração e a entrega são definidos pelo organizador no regulamento de cada campanha. O pagamento é conferido manualmente. Consulte o regulamento antes de reservar.","notice":"Os dados do responsável e os textos finais serão definidos pelo organizador antes da publicação comercial."},"checkout":{"title":"Falta pouco para participar.","name_label":"Nome completo","phone_label":"WhatsApp com DDD","reserve_button":"Reservar meus números","pix_title":"Faça o Pix e envie o comprovante","whatsapp_button":"Enviar comprovante no WhatsApp","instructions":"O WhatsApp abrirá com os dados da reserva. Anexe o comprovante na conversa; o organizador fará a confirmação no painel."},"details":{"back":"Todas as campanhas","eyebrow":"FAÇA A SUA ESCOLHA","title":"Qual é o seu número da sorte?","rules_title":"Informações e regulamento","art_caption":"Arte de divulgação · reserve na grade abaixo","continue_button":"Continuar com Pix"},"meta":{"title":"{site_name} — Sua próxima tattoo começa aqui","description":"Rifa Jeiel Tattoo: concorra a uma tattoo de R$ 1.000 ou R$ 500 no Pix. São 100 números por R$ 30 cada."},"sections":{"order":["hero","trust","campaigns","how","faq"],"visible":{"hero":true,"trust":true,"campaigns":true,"how":true,"faq":true}}}'::jsonb where id=1 and appearance='{}'::jsonb;

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



create table if not exists public.campaign_draws (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id),
  winner_order_id uuid not null references public.orders(id),
  winning_number integer not null,
  winner_label text not null,
  eligible_numbers integer[] not null check(cardinality(eligible_numbers)>0),
  random_sample bigint not null check(random_sample>=0 and random_sample<4294967296),
  selected_index integer not null,
  pool_hash text not null,
  drawn_at timestamptz not null default now(),
  drawn_by uuid not null references auth.users(id),
  method text not null default 'postgres-uuid-v4-rejection-v1'
);
alter table public.campaign_draws enable row level security;
revoke all on public.campaign_draws from anon,authenticated;
grant select on public.campaign_draws to authenticated;
drop policy if exists "admin_read_draws" on public.campaign_draws;
create policy "admin_read_draws" on public.campaign_draws for select to authenticated using(public.is_admin());

create or replace function public.prevent_draw_changes() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'O resultado do sorteio não pode ser alterado ou excluído.'; end; $$;
revoke all on function public.prevent_draw_changes() from public;
drop trigger if exists immutable_draw on public.campaign_draws;
create trigger immutable_draw before update or delete on public.campaign_draws for each row execute function public.prevent_draw_changes();

create or replace function public.guard_campaign_update() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if exists(select 1 from public.campaign_draws where campaign_id=old.id) and to_jsonb(new)<>to_jsonb(old)
    then raise exception 'Esta campanha já foi sorteada e não pode ser alterada.'; end if;
  if (old.price<>new.price or old.total_numbers<>new.total_numbers or old.number_start<>new.number_start)
    and exists(select 1 from public.orders where campaign_id=old.id) then raise exception 'Preço, quantidade e início da numeração não podem ser alterados após receber pedidos.'; end if;
  return new;
end; $$;

create or replace function public.get_draw_results(p_campaign_id uuid default null)
returns table(id uuid,campaign_id uuid,winning_number integer,winner_label text,drawn_at timestamptz,eligible_count integer,eligible_numbers integer[],pool_hash text,random_sample bigint,selected_index integer,method text)
language sql stable security definer set search_path='' as $$
 select d.id,d.campaign_id,d.winning_number,d.winner_label,d.drawn_at,cardinality(d.eligible_numbers),d.eligible_numbers,d.pool_hash,d.random_sample,d.selected_index,d.method
 from public.campaign_draws d join public.campaigns c on c.id=d.campaign_id
 where c.status='finished' and (p_campaign_id is null or d.campaign_id=p_campaign_id) order by d.drawn_at desc;
$$;
revoke all on function public.get_draw_results(uuid) from public;
grant execute on function public.get_draw_results(uuid) to anon,authenticated;

create or replace function public.admin_draw_campaign(p_campaign_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare campaign public.campaigns%rowtype; pool integer[]; sample bigint; ceiling bigint;
  chosen integer; selected_order public.orders%rowtype; result_id uuid; position integer;
begin
  if not public.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  select * into campaign from public.campaigns where id=p_campaign_id for update;
  if not found then raise exception 'Campanha não encontrada.'; end if;
  if exists(select 1 from public.campaign_draws where campaign_id=p_campaign_id) then raise exception 'Esta campanha já possui um sorteio registrado.'; end if;
  if campaign.status='finished' then raise exception 'Esta campanha está encerrada.'; end if;
  if campaign.draw_date is null or campaign.draw_date>(now() at time zone 'America/Sao_Paulo')::date
    then raise exception 'O sorteio só pode ocorrer a partir da data cadastrada.'; end if;
  if trim(campaign.rules)='' then raise exception 'Cadastre o regulamento antes de sortear.'; end if;
  if exists(select 1 from public.orders where campaign_id=p_campaign_id and status='pending' and expires_at>now())
    then raise exception 'Confira as reservas pendentes antes de sortear.'; end if;
  select array_agg(t.number order by t.number) into pool from public.tickets t join public.orders o on o.id=t.order_id
  where t.campaign_id=p_campaign_id and o.campaign_id=p_campaign_id and o.status='paid';
  if coalesce(cardinality(pool),0)=0 then raise exception 'Não há números com pagamento confirmado para sortear.'; end if;
  -- Os primeiros 32 bits de UUID v4 não incluem os bits fixos de versão/variante.
  -- Rejeitar a sobra evita favorecer números quando a quantidade não divide 2^32.
  ceiling := 4294967296 - mod(4294967296,cardinality(pool)::bigint);
  loop
    sample := ('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint;
    exit when sample<ceiling;
  end loop;
  position := mod(sample,cardinality(pool))::integer+1;
  chosen := pool[position];
  select o.* into selected_order from public.orders o join public.tickets t on t.order_id=o.id where t.campaign_id=p_campaign_id and t.number=chosen;
  -- Campanha e confirmação de pagamento usam o mesmo lock; o conjunto fica estável.
  update public.campaigns set status='finished' where id=p_campaign_id;
  insert into public.campaign_draws(campaign_id,winner_order_id,winning_number,winner_label,eligible_numbers,random_sample,selected_index,pool_hash,drawn_by)
  values(p_campaign_id,selected_order.id,chosen,left(trim(selected_order.customer_name),1)||'***',pool,sample,position,
    encode(sha256(convert_to(array_to_string(pool,','),'UTF8')),'hex'),auth.uid()) returning id into result_id;
  return (select to_jsonb(r) from public.get_draw_results(p_campaign_id) r where r.id=result_id);
end; $$;
revoke all on function public.admin_draw_campaign(uuid) from public,anon;
grant execute on function public.admin_draw_campaign(uuid) to authenticated;

-- Impede que uma confirmação tardia altere o conjunto de uma campanha encerrada.
create or replace function public.admin_order_status(p_order_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare reservation public.orders%rowtype; selected_campaign uuid;
begin
  if not public.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  if p_status is null or p_status not in ('paid','cancelled') then raise exception 'Status inválido.'; end if;
  select campaign_id into selected_campaign from public.orders where id=p_order_id;
  if not found then raise exception 'Reserva não encontrada.'; end if;
  perform 1 from public.campaigns where id=selected_campaign for update;
  if exists(select 1 from public.campaign_draws where campaign_id=selected_campaign) then raise exception 'Esta campanha já foi sorteada.'; end if;
  select * into reservation from public.orders where id=p_order_id for update;
  if reservation.status<>'pending' or reservation.expires_at<=now() then raise exception 'Esta reserva expirou ou já foi processada.'; end if;
  update public.orders set status=p_status where id=p_order_id;
  if p_status='cancelled' then delete from public.tickets where order_id=p_order_id; end if;
end; $$;

update public.site_settings set appearance=jsonb_set(appearance,'{faq,items,3,answer}',to_jsonb('Na data cadastrada, o organizador realiza o sorteio no próprio site entre os números com pagamento confirmado. Cada número confirmado tem a mesma chance. O resultado e o registro do conjunto participante ficam disponíveis na campanha e em Resultados.'::text))
where appearance #>> '{faq,items,3,answer}'='A data, a forma de apuração e as condições do prêmio devem estar no regulamento de cada campanha. Consulte essas informações antes de participar.';


-- Não altera status de pedidos existentes nem inventa datas de pagamentos antigos.
alter table public.orders add column if not exists payment_snapshot jsonb;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  event_type text not null check(event_type in ('created','paid','cancelled','expired')),
  source text not null check(source in ('system','manual')),
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id)
);
create index if not exists order_events_order_idx on public.order_events(order_id,occurred_at);
alter table public.order_events enable row level security;
revoke all on public.order_events from public,anon,authenticated;
grant select on public.order_events to authenticated;
drop policy if exists admin_read_order_events on public.order_events;
create policy admin_read_order_events on public.order_events for select to authenticated using(public.is_admin());

-- Somente os dados públicos do recebedor são congelados, nunca credenciais.
create or replace function public.snapshot_order_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='INSERT' then
    select jsonb_build_object('pix_key',pix_key,'receiver_name',receiver_name,
      'receiver_city',receiver_city,'whatsapp',whatsapp) into new.payment_snapshot
      from public.site_settings where id=1;
  else
    new.payment_snapshot := old.payment_snapshot;
    new.paid_at := old.paid_at;
    new.cancelled_at := old.cancelled_at;
    if old.status='pending' and new.status='paid' then new.paid_at := now(); end if;
    if old.status='pending' and new.status='cancelled' then new.cancelled_at := now(); end if;
  end if;
  return new;
end; $$;
revoke all on function public.snapshot_order_payment() from public,anon,authenticated;
drop trigger if exists snapshot_order_payment on public.orders;
create trigger snapshot_order_payment before insert or update on public.orders
  for each row execute function public.snapshot_order_payment();

create or replace function public.record_order_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text;
begin
  if TG_OP='INSERT' then kind := 'created';
  elsif old.status is not distinct from new.status then return new;
  else kind := new.status; end if;
  insert into public.order_events(order_id,event_type,source,actor_id)
  values(new.id,kind,case when kind in ('paid','cancelled') then 'manual' else 'system' end,
    case when kind in ('paid','cancelled') then auth.uid() else null end);
  return new;
end; $$;
revoke all on function public.record_order_event() from public,anon,authenticated;
drop trigger if exists record_order_event on public.orders;
create trigger record_order_event after insert or update of status on public.orders
  for each row execute function public.record_order_event();

create or replace function public.prevent_order_event_changes() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'O histórico de pagamentos não pode ser alterado ou excluído.'; end; $$;
revoke all on function public.prevent_order_event_changes() from public,anon,authenticated;
drop trigger if exists immutable_order_events on public.order_events;
create trigger immutable_order_events before update or delete on public.order_events
  for each row execute function public.prevent_order_event_changes();



create table if not exists public.admin_access_invites (
  email text primary key check(email=lower(trim(email)) and char_length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
alter table public.admin_access_invites enable row level security;
revoke all on public.admin_access_invites from public,anon,authenticated;

create or replace function public.admin_list_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(access) order by access.email),'[]'::jsonb) from (
    select u.email,u.id as user_id,'active'::text as status,u.id=auth.uid() as is_current,
      i.invited_at,i.expires_at
    from public.admin_users a join auth.users u on u.id=a.user_id
    left join public.admin_access_invites i on i.email=lower(u.email)
    union all
    select i.email,null::uuid,case when i.expires_at<=now() then 'expired' else 'pending' end,false,i.invited_at,i.expires_at
    from public.admin_access_invites i
    where i.revoked_at is null and i.accepted_at is null
      and not exists(select 1 from public.admin_users a join auth.users u on u.id=a.user_id where lower(u.email)=i.email)
  ) access);
end; $$;

create or replace function public.admin_add_access(p_email text) returns text
language plpgsql security definer set search_path='' as $$
declare address text:=lower(trim(p_email)); target auth.users%rowtype; activated boolean;
begin
  perform pg_advisory_xact_lock(hashtext('admin-access-management'));
  if not public.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  if address is null or char_length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Informe um e-mail válido.'; end if;
  select * into target from auth.users where lower(email)=address limit 1;
  if exists(select 1 from public.admin_users where user_id=target.id) then raise exception 'Este e-mail já é administrador.'; end if;
  if exists(select 1 from public.admin_access_invites where email=address and revoked_at is null and accepted_at is null and expires_at>now()) then raise exception 'Este e-mail já tem uma autorização pendente.'; end if;
  activated:=target.id is not null and target.email_confirmed_at is not null;
  insert into public.admin_access_invites(email,invited_by,accepted_by,accepted_at)
  values(address,auth.uid(),case when activated then target.id end,case when activated then now() end)
  on conflict(email) do update set invited_by=auth.uid(),invited_at=now(),expires_at=now()+interval '7 days',
    accepted_by=excluded.accepted_by,accepted_at=excluded.accepted_at,revoked_at=null;
  if activated then insert into public.admin_users(user_id) values(target.id) on conflict do nothing; end if;
  return case when activated then 'active' else 'pending' end;
end; $$;

-- Só o titular de um e-mail confirmado pode usar uma autorização ainda válida.
create or replace function public.activate_admin_access() returns boolean
language plpgsql security definer set search_path='' as $$
declare target auth.users%rowtype; invitation public.admin_access_invites%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('admin-access-management'));
  if auth.uid() is null then return false; end if;
  if public.is_admin() then return true; end if;
  select * into target from auth.users where id=auth.uid();
  if target.email_confirmed_at is null or target.email is null then return false; end if;
  select * into invitation from public.admin_access_invites
    where email=lower(target.email) and revoked_at is null and accepted_at is null and expires_at>now() for update;
  if not found then return false; end if;
  insert into public.admin_users(user_id) values(target.id) on conflict do nothing;
  update public.admin_access_invites set accepted_by=target.id,accepted_at=now() where email=invitation.email;
  return true;
end; $$;

create or replace function public.admin_revoke_access(p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare address text:=lower(trim(p_email)); target_id uuid; affected integer;
begin
  perform pg_advisory_xact_lock(hashtext('admin-access-management'));
  if not public.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  select a.user_id into target_id from public.admin_users a join auth.users u on u.id=a.user_id where lower(u.email)=address;
  if target_id=auth.uid() then raise exception 'Você não pode remover seu próprio acesso.'; end if;
  if target_id is not null and (select count(*) from public.admin_users)<=1 then raise exception 'Mantenha pelo menos um administrador.'; end if;
  delete from public.admin_users where user_id=target_id;
  update public.admin_access_invites set revoked_at=now() where (email=address or accepted_by=target_id) and revoked_at is null;
  get diagnostics affected=row_count;
  if target_id is null and affected=0 then raise exception 'Acesso não encontrado.'; end if;
end; $$;

revoke all on function public.admin_list_access(),public.admin_add_access(text),public.activate_admin_access(),public.admin_revoke_access(text) from public,anon;
grant execute on function public.admin_list_access(),public.admin_add_access(text),public.activate_admin_access(),public.admin_revoke_access(text) to authenticated;

commit;
