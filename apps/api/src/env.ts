import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@mark-matrix/shared";

export interface Env {
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export type AppVariables = {
  userId: string;
  role: Role;
  /** Anon-key client scoped to the calling user (RLS-bound). */
  supabase: SupabaseClient;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };