import { Hono } from "hono";
import { PROFILE_TABLE } from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";

export const adminUsersRoute = new Hono<AppEnv>().get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase.from(PROFILE_TABLE).select("user_id, name, role");
  if (error) {
    // Map to a stable error code for clients (do not echo raw Postgres
    // messages as the primary `error` field). The underlying detail is
    // still returned for admins debugging the route.
    console.error("admin users: profiles read failed", error.message);
    return c.json({ error: "profiles_read_failed", detail: error.message }, 500);
  }
  return c.json({ users: data });
});
