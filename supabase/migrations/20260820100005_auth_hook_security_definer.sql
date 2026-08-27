-- 20260820100005_auth_hook_security_definer.sql
-- Cycle-2 hotfix: custom_access_token_hook was created SECURITY INVOKER.
-- When called from the Supabase auth context (which runs under a
-- non-superuser role), the inner `select role from public.profiles` was
-- blocked by profiles RLS, surfacing as a 500 from /auth/v1/token.
-- SECURITY DEFINER makes the function execute with its owner's
-- privileges (postgres), bypassing the RLS issue while keeping the
-- function signature, grants, and search_path unchanged.
--
-- See: docs/superpowers/specs/2026-08-20-cycle-2-academic-structure-design.md
-- §4.2 (two-layer enforcement).

alter function public.custom_access_token_hook(jsonb) security definer;