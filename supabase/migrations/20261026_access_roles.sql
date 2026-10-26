-- Perfis da V3.13.27: administrador, gestor da área e usuário da área.
-- Rode no SQL Editor depois de conferir se as funções ainda não existem com outra assinatura.

alter table public.profiles
  add column if not exists is_manager boolean not null default false;

drop function if exists public.approve_access_request(uuid, text, boolean, boolean);

create or replace function public.approve_access_request(
  p_user_id uuid,
  p_area text,
  p_is_admin boolean default false,
  p_is_manager boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and is_admin and active
  ) then
    raise exception 'Apenas administrador pode aprovar acesso.';
  end if;

  if p_area not in ('COEMP', 'COESA', 'COTRA', 'COAFI', 'ASCOI', 'CODIP') then
    raise exception 'Coordenação inválida.';
  end if;

  update public.profiles
  set area = p_area,
      is_admin = coalesce(p_is_admin, false),
      is_manager = coalesce(p_is_manager, false) and not coalesce(p_is_admin, false),
      active = true,
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'Solicitação não encontrada.';
  end if;
end;
$$;

drop function if exists public.admin_update_user_profile(uuid, text, text, boolean, boolean, boolean);

create or replace function public.admin_update_user_profile(
  p_user_id uuid,
  p_full_name text,
  p_area text,
  p_is_admin boolean,
  p_is_manager boolean,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and is_admin and active
  ) then
    raise exception 'Apenas administrador pode alterar perfis.';
  end if;

  if p_area not in ('COEMP', 'COESA', 'COTRA', 'COAFI', 'ASCOI', 'CODIP') then
    raise exception 'Coordenação inválida.';
  end if;

  update public.profiles
  set full_name = nullif(trim(p_full_name), ''),
      area = p_area,
      is_admin = coalesce(p_is_admin, false),
      is_manager = coalesce(p_is_manager, false) and not coalesce(p_is_admin, false),
      active = coalesce(p_active, false),
      updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
end;
$$;

drop function if exists public.reject_access_request(uuid);

create or replace function public.reject_access_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and is_admin and active
  ) then
    raise exception 'Apenas administrador pode recusar acesso.';
  end if;

  update public.profiles
  set active = false,
      is_admin = false,
      is_manager = false,
      updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'Solicitação não encontrada.';
  end if;
end;
$$;

revoke all on function public.approve_access_request(uuid, text, boolean, boolean) from public, anon;
revoke all on function public.admin_update_user_profile(uuid, text, text, boolean, boolean, boolean) from public, anon;
revoke all on function public.reject_access_request(uuid) from public, anon;

grant execute on function public.approve_access_request(uuid, text, boolean, boolean) to authenticated;
grant execute on function public.admin_update_user_profile(uuid, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.reject_access_request(uuid) to authenticated;
