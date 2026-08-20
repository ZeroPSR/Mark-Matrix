-- 20260820100000_role_profiles.sql
-- Role-satellite profile tables (student_profiles, faculty_profiles,
-- admin_profiles) plus two trigger functions enforcing role consistency.

create table public.student_profiles (
  user_id        uuid primary key
                 references public.profiles(user_id) on delete cascade,
  roll_number    text not null unique,
  admission_year integer not null check (admission_year between 2000 and 3000)
);

create table public.faculty_profiles (
  user_id       uuid primary key
                references public.profiles(user_id) on delete cascade,
  employee_code text not null unique,
  department    text,
  designation   text
);

create table public.admin_profiles (
  user_id       uuid primary key
                references public.profiles(user_id) on delete cascade,
  employee_code text not null unique,
  designation   text
);

-- Single parameterized trigger reused by all three satellites.
create or replace function public.assert_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected public.user_role := tg_argv[0]::public.user_role;
  v_actual   public.user_role;
begin
  select role into v_actual
    from public.profiles
   where user_id = new.user_id;

  if v_actual is null then
    raise exception 'no profile exists for user %', new.user_id
      using errcode = '23503';
  end if;

  if v_actual <> v_expected then
    raise exception 'user % has role %, expected %',
      new.user_id, v_actual, v_expected
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger student_profiles_role_check
  before insert or update of user_id on public.student_profiles
  for each row execute function public.assert_profile_role('student');

create trigger faculty_profiles_role_check
  before insert or update of user_id on public.faculty_profiles
  for each row execute function public.assert_profile_role('faculty');

create trigger admin_profiles_role_check
  before insert or update of user_id on public.admin_profiles
  for each row execute function public.assert_profile_role('admin');

-- Paired trigger guarding the OTHER direction: prevent changing profiles.role
-- while a satellite row still exists for the user.
create or replace function public.block_role_change_with_satellite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and (exists (select 1 from public.student_profiles where user_id = old.user_id)
       or exists (select 1 from public.faculty_profiles where user_id = old.user_id)
       or exists (select 1 from public.admin_profiles   where user_id = old.user_id))
  then
    raise exception
      'cannot change role for % while a role profile exists', old.user_id
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger profiles_block_role_change
  before update of role on public.profiles
  for each row execute function public.block_role_change_with_satellite();

-- RLS — admin full, owner SELECT. Mirrors cycle 1's profiles pattern.
alter table public.student_profiles enable row level security;
alter table public.faculty_profiles enable row level security;
alter table public.admin_profiles   enable row level security;

create policy student_profiles_select_own on public.student_profiles
  for select to authenticated using (user_id = auth.uid());
create policy student_profiles_admin_all on public.student_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy faculty_profiles_select_own on public.faculty_profiles
  for select to authenticated using (user_id = auth.uid());
create policy faculty_profiles_admin_all on public.faculty_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy admin_profiles_select_own on public.admin_profiles
  for select to authenticated using (user_id = auth.uid());
create policy admin_profiles_admin_all on public.admin_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
