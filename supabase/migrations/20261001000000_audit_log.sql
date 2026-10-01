-- 20261001000000_audit_log.sql
-- Cycle 8a — audit_log table + audit_log_write SECURITY DEFINER function + RLS.
--
-- Design notes:
--   - `entity_id` is text (not uuid) because some entities (semesters, courses)
--     use uuid but we want a single column that handles every entity type,
--     including composite keys if we ever need them.
--   - Writes only happen via the SECURITY DEFINER function. RLS denies INSERT
--     to authenticated/anon so the API cannot bypass the function.
--   - `user_id` is stamped server-side from auth.uid() inside the function so
--     callers cannot spoof identity.
--   - Indexes match the cycle-8b admin browse UI query patterns.

create table if not exists public.audit_log (
  id          bigserial primary key,
  action      text        not null,
  entity      text        not null,
  entity_id   text        not null,
  user_id     uuid        not null references auth.users(id),
  created_at  timestamptz not null default now(),
  old_value   jsonb,
  new_value   jsonb,
  constraint audit_log_action_check check (action in (
    'create', 'update', 'delete',
    'submit', 'approve', 'lock', 'unlock',
    'compile', 'publish'
  )),
  constraint audit_log_entity_check check (entity in (
    'attendance', 'marks', 'gradesheet', 'enrollment',
    'faculty_assignment', 'user', 'grade_scheme'
  ))
);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity, entity_id, created_at desc);

create index if not exists audit_log_user_idx
  on public.audit_log (user_id, created_at desc);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Only admins may read. The role check reads auth.uid()'s profile via the
-- existing helper (see migration 20260820100004_profiles_admin_only_writes.sql
-- for the established pattern).
create policy "audit_log_admin_select"
  on public.audit_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policy for authenticated/anon. Writes only happen
-- via the SECURITY DEFINER function below, which runs as the table owner.

create or replace function public.audit_log_write(
  p_action    text,
  p_entity    text,
  p_entity_id text,
  p_old_value jsonb,
  p_new_value jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  bigint;
begin
  if v_uid is null then
    raise exception 'audit_log_write: auth.uid() is null';
  end if;

  insert into public.audit_log
    (action, entity, entity_id, user_id, old_value, new_value)
  values
    (p_action, p_entity, p_entity_id, v_uid, p_old_value, p_new_value)
  returning id into v_id;

  return v_id;
end;
$$;

-- Allow authenticated users to call the function (it bypasses RLS internally).
grant execute on function public.audit_log_write(
  text, text, text, jsonb, jsonb
) to authenticated;
