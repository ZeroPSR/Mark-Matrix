-- 20260818100001_profiles_rls.sql
-- RLS policies on profiles + is_admin() SECURITY DEFINER helper.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and role = (select role from public.profiles where user_id = (select auth.uid()))
  );

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin());
