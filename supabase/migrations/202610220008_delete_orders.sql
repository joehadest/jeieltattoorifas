begin;

-- Contexto transitório privado: nunca aceita dados do navegador nem fica
-- preenchido após a transação. Evita um sinal de sessão que possa ser forjado.
create table if not exists public.order_deletion_context (
  order_id uuid primary key,
  actor_id uuid not null
);
alter table public.order_deletion_context enable row level security;
revoke all on public.order_deletion_context from public,anon,authenticated;

create or replace function public.prevent_order_event_changes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='DELETE' and public.is_admin() and exists(
    select 1 from public.order_deletion_context where order_id=old.order_id and actor_id=auth.uid()
  ) then return old; end if;
  raise exception 'O histórico de pagamentos não pode ser alterado ou excluído.';
end; $$;
revoke all on function public.prevent_order_event_changes() from public,anon,authenticated;

create or replace function public.admin_delete_order(p_order_id uuid,p_confirmation text) returns void
language plpgsql security definer set search_path='' as $$
declare selected_campaign uuid; reservation public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  select campaign_id into selected_campaign from public.orders where id=p_order_id;
  if not found then raise exception 'Reserva não encontrada ou já excluída.'; end if;
  -- Mesmo lock das reservas, das confirmações e do sorteio.
  perform 1 from public.campaigns where id=selected_campaign for update;
  if exists(select 1 from public.campaign_draws where campaign_id=selected_campaign)
    then raise exception 'Reservas de uma campanha já sorteada não podem ser excluídas.'; end if;
  select * into reservation from public.orders where id=p_order_id for update;
  if not found then raise exception 'Reserva não encontrada ou já excluída.'; end if;
  if upper(trim(coalesce(p_confirmation,'')))<>upper(left(p_order_id::text,8))
    then raise exception 'Digite o código da reserva para confirmar a exclusão.'; end if;
  insert into public.order_deletion_context(order_id,actor_id) values(p_order_id,auth.uid());
  delete from public.tickets where order_id=p_order_id;
  delete from public.order_events where order_id=p_order_id;
  delete from public.orders where id=p_order_id;
  delete from public.order_deletion_context where order_id=p_order_id;
end; $$;
revoke all on function public.admin_delete_order(uuid,text) from public,anon;
grant execute on function public.admin_delete_order(uuid,text) to authenticated;
commit;
