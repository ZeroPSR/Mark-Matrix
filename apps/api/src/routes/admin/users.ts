import { Hono } from "hono";
import {
  PROFILE_TABLE,
  formatZodError,
  patchRoleSchema,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";
import { recordAudit } from "../../lib/auditLog.js";
import { getServiceRoleClient } from "../../lib/serviceRoleClient.js";

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
    // Cycle 8b: read emails from auth.users via the service-role client
    // (the RLS-bound client cannot read other users' auth.users rows).
    // The service-role key is server-side only; verified by the cycle-8b
    // security review's secret-scan section.
    const service = getServiceRoleClient(c.env);
    const { data: authData, error: authErr } = await service.auth.admin.listUsers();
    if (authErr) {
      console.error("admin users: auth.users read failed", authErr.message);
      // Non-fatal: return profiles without emails.
      return c.json({ users: data });
    }
    const emailByUserId = new Map<string, string>();
    for (const u of authData.users) {
      if (u.email) emailByUserId.set(u.id, u.email);
    }
    const enriched = (data ?? []).map((row) => {
      const r = row as { user_id: string; name: string; role: string };
      return { ...r, email: emailByUserId.get(r.user_id) ?? null };
    });
    return c.json({ users: enriched });
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

    // Cycle 8a: fetch before for oldValue.
    const { data: before } = await supabase
      .from(PROFILE_TABLE)
      .select("user_id, name, role")
      .eq("user_id", userId)
      .maybeSingle();

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

    // Cycle 8a: emit update audit.
    await recordAudit(supabase, {
      action: "update",
      entity: "user",
      entityId: userId,
      oldValue: before,
      newValue: data,
    });

    return c.json({ data });
  });