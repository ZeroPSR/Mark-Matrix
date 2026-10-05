import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@mark-matrix/shared";

export interface Env {
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // Cycle 8c: KV namespace binding for the rate-limit middleware.
  RATE_LIMIT?: KVNamespace;
}

export type KVNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
  list: (options?: { prefix?: string; limit?: number; cursor?: string }) => Promise<{ keys: { name: string }[]; list_complete: boolean; cursor: string }>;
  getWithMetadata: <T = unknown>(key: string) => Promise<{ value: T | null; metadata: T | null }>;
};

export type AppVariables = {
  userId: string;
  role: Role;
  /** Anon-key client scoped to the calling user (RLS-bound). */
  supabase: SupabaseClient;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };