import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";

/**
 * Build a Supabase client.
 *
 * - With `jwt`: anon-key client scoped to the calling user (RLS-bound).
 * - Without `jwt`: service-role client (bypasses RLS) — admin handlers only.
 *   The web bundle must never call this overload.
 */
export function getSupabase(env: Env, jwt?: string): SupabaseClient {
  if (jwt !== undefined) {
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}