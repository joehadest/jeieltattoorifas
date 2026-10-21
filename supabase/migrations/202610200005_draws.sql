begin;
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
commit;
