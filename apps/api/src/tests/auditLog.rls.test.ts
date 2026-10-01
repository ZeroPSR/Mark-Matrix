import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey && process.env["SUPABASE_TEST_RLS"] === "1";
const itIf = enabled ? it : it.skip;

interface TestUser {
  email: string;
  password: string;
  userId?: string;
  role: "admin" | "faculty" | "student";
}

describe("RLS: audit_log table", () => {
  let admin: SupabaseClient;
  let adminUser: TestUser;
  let facultyUser: TestUser;
  let studentUser: TestUser;
  let auditClient: SupabaseClient; // signed in as adminUser

  beforeAll(async () => {
    if (!enabled) return;
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    adminUser = { email: "audit-admin@mark-matrix.local", password: "TestPass!1", role: "admin" };
    facultyUser = { email: "audit-faculty@mark-matrix.local", password: "TestPass!1", role: "faculty" };
    studentUser = { email: "audit-student@mark-matrix.local", password: "TestPass!1", role: "student" };

    for (const u of [adminUser, facultyUser, studentUser]) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((x) => x.email === u.email);
      if (existing) {
        u.userId = existing.id;
        await admin.from("profiles").update({ role: u.role }).eq("user_id", u.userId);
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: u.email, password: u.password, email_confirm: true,
        });
        if (error || !data.user) throw new Error(`createUser failed for ${u.email}: ${error?.message}`);
        u.userId = data.user.id;
        await admin.from("profiles").insert({ user_id: u.userId, role: u.role, name: u.email });
      }
    }

    auditClient = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: adminSignInErr } = await auditClient.auth.signInWithPassword({
      email: adminUser.email, password: adminUser.password,
    });
    if (adminSignInErr) throw new Error(`admin signIn failed: ${adminSignInErr.message}`);
  });

  itIf("requires SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, SUPABASE_TEST_RLS=1", () => {
    expect(url).toBeTruthy();
    expect(serviceKey).toBeTruthy();
    expect(process.env["SUPABASE_TEST_RLS"]).toBe("1");
  });

  itIf("admin can SELECT from audit_log", async () => {
    const { data, error } = await auditClient.from("audit_log").select("id, action, entity").limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  itIf("faculty cannot SELECT from audit_log", async () => {
    const facultyClient = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await facultyClient.auth.signInWithPassword({
      email: facultyUser.email, password: facultyUser.password,
    });
    const { data, error } = await facultyClient.from("audit_log").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  itIf("student cannot SELECT from audit_log", async () => {
    const studentClient = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await studentClient.auth.signInWithPassword({
      email: studentUser.email, password: studentUser.password,
    });
    const { data, error } = await studentClient.from("audit_log").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  itIf("authenticated user cannot INSERT directly into audit_log (RLS denies)", async () => {
    const { error } = await auditClient.from("audit_log").insert({
      action: "create",
      entity: "user",
      entity_id: "fake",
      user_id: adminUser.userId,
    });
    expect(error).not.toBeNull();
  });

  itIf("audit_log_write RPC succeeds for authenticated user and stamps user_id from auth.uid()", async () => {
    const { data, error } = await auditClient.rpc("audit_log_write", {
      p_action: "create",
      p_entity: "user",
      p_entity_id: `rls-test-${Date.now()}`,
      p_old_value: null,
      p_new_value: { hello: "world" },
    });
    expect(error).toBeNull();
    expect(typeof data).toBe("number");

    const { data: row, error: readErr } = await auditClient
      .from("audit_log")
      .select("user_id, action, entity, new_value")
      .eq("id", data as number)
      .single();
    expect(readErr).toBeNull();
    expect(row?.user_id).toBe(adminUser.userId);
    expect(row?.action).toBe("create");
    expect(row?.entity).toBe("user");
    expect(row?.new_value).toEqual({ hello: "world" });
  });

  itIf("audit_log_write rejects when auth.uid() is null (Review Focus item 1)", async () => {
    const { error } = await admin.rpc("audit_log_write", {
      p_action: "create",
      p_entity: "user",
      p_entity_id: "should-fail",
      p_old_value: null,
      p_new_value: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/auth\.uid\(\) is null/);
  });
});
