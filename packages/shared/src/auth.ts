/**
 * Cross-package constants for the auth subsystem.
 *
 * Imported by apps/api (route guards, Supabase queries) and apps/web
 * (validation). Keeping these in `@mark-matrix/shared` ensures the
 * API and frontend never disagree on the source-of-truth names.
 */

export const PROFILE_TABLE = "profiles" as const;

export const AUTH_HOOK_NAME = "custom_access_token" as const;