import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROFILE_TABLE,
  createUserSchema,
  formatZodError,
  patchRoleSchema,
  type CreateUser,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError, type MappedPgError } from "../../lib/pgErrors.js";
import { recordAudit } from "../../lib/auditLog.js";
import { getServiceRoleClient } from "../../lib/serviceRoleClient.js";

/**
 * Give a freshly created auth user their profile role and their identity.
 *
 * The `handle_new_user` trigger makes the `profiles` row with the role
 * hardcoded to 'student', so the role is set here. The satellite row
 * carries the identity fields — roll number, employee code — and its
 * columns are NOT NULL: a user without one is invisible to the rosters.
 *
 * Returns null on success, or the error to answer with.
 */
async function attachRoleIdentity(
  service: SupabaseClient,
  userId: string,
  d: CreateUser,
): Promise<MappedPgError | null> {
  const { data: profileRow, error: profileErr } = await service
    .from(PROFILE_TABLE)
    .update({ name: d.name, role: d.role })
    .eq("user_id", userId)
    .select("user_id, role")
    .maybeSingle();
  if (profileErr) return mapPgError(profileErr);
  if (profileRow === null) {
    // The handle_new_user trigger did not make the profile row. The account
    // would exist and be able to sign in, but with no role and no profile —
    // and an update that matched nothing is not an error, so it has to be
    // looked for.
    return {
      status: 500,
      body: { error: "profile_missing" },
    };
  }

  if (d.role === "student") {
    if (d.rollNumber === undefined || d.admissionYear === undefined) {
      return { status: 400, body: { error: "validation_failed" } };
    }
    const { error } = await service
      .from("student_profiles")
      .insert({
        user_id: userId,
        roll_number: d.rollNumber,
        admission_year: d.admissionYear,
      })
      .select()
      .single();
    return error ? mapPgError(error) : null;
  }

  if (d.employeeCode === undefined) {
    return { status: 400, body: { error: "validation_failed" } };
  }
  if (d.role === "faculty") {
    const { error } = await service
      .from("faculty_profiles")
      .insert({
        user_id: userId,
        employee_code: d.employeeCode,
        department: d.department ?? null,
        designation: d.designation ?? null,
      })
      .select()
      .single();
    return error ? mapPgError(error) : null;
  }

  const { error } = await service
    .from("admin_profiles")
    .insert({
      user_id: userId,
      employee_code: d.employeeCode,
      designation: d.designation ?? null,
    })
    .select()
    .single();
  return error ? mapPgError(error) : null;
}

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
    // In test environments c.env may be unset; skip the merge gracefully
    // rather than 500 — the existing PATCH audit tests still work.
    if (!c.env) {
      return c.json({ users: data });
    }
    const service = getServiceRoleClient(c.env);
    // listUsers() answers one page — 50 by default. An account list longer
    // than that would show every user past the first page without an email,
    // so every page is read.
    const emailByUserId = new Map<string, string>();
    const PER_PAGE = 200;
    for (let page = 1; ; page += 1) {
      let authData: { users: Array<{ id: string; email?: string }> };
      try {
        const result = await service.auth.admin.listUsers({ page, perPage: PER_PAGE });
        if (result.error) {
          // Non-fatal: keep whatever emails were read, and carry on without
          // the rest.
          console.error("admin users: auth.users read failed", result.error.message);
          break;
        }
        authData = result.data;
      } catch (err) {
        // A network failure rejects rather than resolving with an error.
        console.error("admin users: auth.users read failed", (err as Error).message);
        break;
      }
      for (const u of authData.users) {
        if (u.email) emailByUserId.set(u.id, u.email);
      }
      if (authData.users.length < PER_PAGE) break;
    }
    const enriched = (data ?? []).map((row) => {
      const r = row as { user_id: string; name: string; role: string };
      return { ...r, email: emailByUserId.get(r.user_id) ?? null };
    });
    return c.json({ users: enriched });
  })
  .post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation_failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const d = parsed.data;
    const service = getServiceRoleClient(c.env);

    // The auth account. This is the one step that needs the service role:
    // only it can create a user in auth.users.
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email: d.email,
      password: d.password,
      email_confirm: true,
      user_metadata: { name: d.name },
    });
    if (createErr || created?.user == null) {
      const message = createErr?.message ?? "unknown error";
      console.error("admin users: auth create failed", message);
      // A duplicate email is the admin's mistake, not a server fault.
      const duplicate = /already|registered|exists|duplicate|taken/i.test(message);
      return c.json(
        { error: duplicate ? "email_taken" : "create_failed", detail: message },
        duplicate ? 409 : 500,
      );
    }
    const userId = created.user.id;

    const failure = await attachRoleIdentity(service, userId, d);
    if (failure !== null) {
      // Roll the auth account back. Left alone, the account could sign in
      // while having no identity — visible in no roster and missing a role.
      const { error: cleanupErr } = await service.auth.admin.deleteUser(userId);
      if (cleanupErr) {
        console.error("admin users: rollback failed", cleanupErr.message);
      }
      return c.json(failure.body, failure.status);
    }

    // The password is never part of the audit entry.
    await recordAudit(c.get("supabase"), {
      action: "create",
      entity: "user",
      entityId: userId,
      newValue: { name: d.name, email: d.email, role: d.role },
    });

    return c.json(
      { data: { userId, name: d.name, email: d.email, role: d.role } },
      201,
    );
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