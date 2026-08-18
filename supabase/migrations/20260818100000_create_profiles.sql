-- 20260818100000_create_profiles.sql
-- Creates the profiles table and auto-create trigger on auth sign-up.

create type public.user_role as enum ('admin', 'faculty', 'student');

create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       public.user_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'student'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
