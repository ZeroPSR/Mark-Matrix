-- 20260818100002_auth_hook_role_claim.sql
-- Stamps the user's role into app_metadata on every JWT mint.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims    jsonb;
  user_role public.user_role;
begin
  select role into user_role
  from public.profiles
  where user_id = (event->>'user_id')::uuid;

  claims := event->'claims';
  if jsonb_typeof(claims->'app_metadata') is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;
  claims := jsonb_set(claims, '{app_metadata,role}',
                      to_jsonb(coalesce(user_role::text, 'student')));

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
