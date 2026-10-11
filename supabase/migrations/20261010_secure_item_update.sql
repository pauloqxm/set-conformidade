-- Grava pendência no servidor: preenche quem validou, bloqueia validação
-- de quem recebeu a solicitação e recusa gravação se outra pessoa alterou o item.
-- Rode este arquivo no SQL Editor do Supabase.

create or replace function public.update_checklist_item(
  p_id uuid,
  p_status text,
  p_suite_page text,
  p_finding text,
  p_resolution_area text,
  p_technician_name text,
  p_deadline_start date,
  p_deadline_end date,
  p_procedure_adopted text,
  p_pending_observation text,
  p_validated boolean,
  p_extra_drive_url text,
  p_expected_updated_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.checklist_items%rowtype;
  v_assignee boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_item from public.checklist_items where id = p_id;
  if not found then
    raise exception 'Item não encontrado.';
  end if;

  if p_expected_updated_at is not null and v_item.updated_at is distinct from p_expected_updated_at then
    raise exception 'Este item foi alterado por outra pessoa. Atualize a tela e tente de novo.';
  end if;

  v_assignee := exists (
    select 1 from public.pending_assignments a
    where a.checklist_item_id = v_item.id
      and a.assigned_to = auth.uid()
      and a.status <> 'Cancelada'
  );

  if not (public.can_manage_process(v_item.process_id) or v_assignee) then
    raise exception 'Sem permissão para alterar este item.';
  end if;

  if p_validated and not coalesce(v_item.validated, false) and v_assignee and not public.current_user_is_admin() then
    raise exception 'Quem recebeu a solicitação não pode validar o próprio item.';
  end if;

  update public.checklist_items set
    status = p_status,
    suite_page = nullif(p_suite_page, ''),
    finding = nullif(p_finding, ''),
    resolution_area = nullif(p_resolution_area, ''),
    technician_name = nullif(p_technician_name, ''),
    deadline_start = p_deadline_start,
    deadline_end = p_deadline_end,
    procedure_adopted = nullif(p_procedure_adopted, ''),
    pending_observation = nullif(p_pending_observation, ''),
    validated = coalesce(p_validated, false),
    validated_at = case when coalesce(p_validated, false) then coalesce(v_item.validated_at, now()) else null end,
    validated_by = case when coalesce(p_validated, false) then coalesce(v_item.validated_by, auth.uid()) else null end,
    extra_drive_url = nullif(p_extra_drive_url, ''),
    updated_at = now()
  where id = p_id;
end;
$$;

revoke all on function public.update_checklist_item(
  uuid, text, text, text, text, text, date, date, text, text, boolean, text, timestamptz
) from public, anon;

grant execute on function public.update_checklist_item(
  uuid, text, text, text, text, text, date, date, text, text, boolean, text, timestamptz
) to authenticated;

revoke truncate on all tables in schema public from anon, authenticated;
