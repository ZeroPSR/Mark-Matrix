import { Hono } from "hono";
import {
  PROFILE_TABLE,
  formatZodError,
  patchRoleSchema,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

export const adminUsersRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const supabase = c.get("supabase");
    const { data, error } = await supabase
      .from(PROFILE_TABLE)
      .select("user_id, name, role");
    if (error) {
      // Map to a stable error code for clients (do not echo raw Postgres
      // messages as the primary `error` field). The underlying detail is
      // still returned for admins debugging the route.
      console.error("admin users: profiles read failed", error.message);
      return c.json({ error: "profiles_read_failed", detail: error.message }, 500);
    }
    return c.json({ users: data });
  })
  .patch("/:userId", async (c) => {
    const supabase = c.get("supabase");
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => null);
    const parsed = patchRoleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation_failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const update: Record<string, unknown> = {};
    if (parsed.data.role !== undefined) update["role"] = parsed.data.role;
    if (parsed.data.name !== undefined) update["name"] = parsed.data.name;
    const { data, error } = await supabase
      .from(PROFILE_TABLE)
      .update(update)
      .eq("user_id", userId)
      .select("user_id, name, role")
      .maybeSingle();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ data });
  });