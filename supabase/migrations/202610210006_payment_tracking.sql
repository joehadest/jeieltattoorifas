begin;

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

commit;
