begin;

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
