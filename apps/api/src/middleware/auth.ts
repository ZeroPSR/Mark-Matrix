import type { MiddlewareHandler } from "hono";
import { isRole } from "@mark-matrix/shared";
import { getSupabase } from "../lib/supabase.js";
import type { AppEnv } from "../env.js";

export const supabaseAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return c.json({ error: "missing_authorization" }, 401);
  }
  const jwt = header.slice(7).trim();
  if (!jwt) {
    return c.json({ error: "missing_authorization" }, 401);
  }

  const supabase = getSupabase(c.env, jwt);
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    return c.json({ error: "invalid_session" }, 401);
  }

  const roleClaim = (data.user.app_metadata as { role?: unknown } | undefined)?.role;
  if (!isRole(roleClaim)) {
    return c.json({ error: "role_missing_or_invalid" }, 403);
  }

  c.set("userId", data.user.id);
  c.set("role", roleClaim);
  c.set("supabase", supabase);
  await next();
};
