import { Hono } from "hono";
import { PROFILE_TABLE } from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";

export const adminUsersRoute = new Hono<AppEnv>().get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select("user_id, name, role");
  if (error) {
    return c.json({ error: error.message }, 500);
  }
  return c.json({ users: data });
});
