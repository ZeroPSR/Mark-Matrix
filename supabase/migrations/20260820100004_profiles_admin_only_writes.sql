-- 20260820100004_profiles_admin_only_writes.sql
-- Tighten profiles to admin-write-only, matching every other cycle-2 table.

drop policy if exists "profiles_update_own" on public.profiles;
