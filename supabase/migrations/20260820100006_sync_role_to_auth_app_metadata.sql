-- 20260820100006_sync_role_to_auth_app_metadata.sql
-- Mirrors public.profiles.role into auth.users.raw_app_meta_data.role so that
-- supabase.auth.getUser() (which reads auth.users) surfaces the role on
-- data.user.app_metadata. Without this, the JWT-side hook still injects the
-- role into the access token, but any API path that calls getUser() to read
-- app_metadata sees only {provider,providers} and rejects the request.
--
-- SECURITY DEFINER is required because the trigger must write to auth.users,
-- which the calling role cannot do directly under the standard RLS posture.
-- The function targets the auth schema by search_path to keep grants scoped.
--
-- Backfills existing users in the same migration so the fix takes effect
-- immediately for the 4 seeded test users.

create or replace function public.sync_profile_role_to_auth_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_meta jsonb;
  updated_meta jsonb;
begin
  select raw_app_meta_data into current_meta
  from auth.users
  where id = new.user_id;

  if current_meta is null then
    return new;
  end if;

  updated_meta := current_meta || jsonb_build_object('role', new.role::text);

  update auth.users
  set raw_app_meta_data = updated_meta
  where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_role_to_auth_app_metadata on public.profiles;
create trigger trg_sync_profile_role_to_auth_app_metadata
  after insert or update of role on public.profiles
  for each row
  execute function public.sync_profile_role_to_auth_app_metadata();

-- One-shot backfill for users created before this trigger existed.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
                       || jsonb_build_object('role', p.role::text)
from public.profiles p
where p.user_id = u.id;
