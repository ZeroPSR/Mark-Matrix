import { Hono } from "hono";
import type { HealthResponse } from "@mark-matrix/shared";

/**
 * Bindings available to the Worker.
 *
 * SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY live as
 * Wrangler secrets (`wrangler secret put <NAME>`) in production and as
 * `.dev.vars` entries locally. ENVIRONMENT is a non-secret var.
 */
export interface Env {
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
  return c.json(body);
});

export default app;
