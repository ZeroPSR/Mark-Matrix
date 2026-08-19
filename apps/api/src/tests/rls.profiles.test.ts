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
}

describe("RLS: profiles table", () => {
  let admin: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  const aliceUser: TestUser = { email: "alice.rls@mark-matrix.local", password: "TestPass!1" };
  const bobUser: TestUser = { email: "bob.rls@mark-matrix.local", password: "TestPass!1" };

  beforeAll(async () => {
    if (!enabled) return;
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Create two student users via Admin API.
    for (const u of [aliceUser, bobUser]) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((x) => x.email === u.email);
      if (existing) {
        u.userId = existing.id;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: u.email, password: u.password, email_confirm: true,
          user_metadata: { name: u.email },
        });
        if (error || !data.user) throw new Error(`createUser failed for ${u.email}`);
        u.userId = data.user.id;
      }
    }

    alice = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: aliceErr } = await alice.auth.signInWithPassword({
      email: aliceUser.email, password: aliceUser.password,
    });
    if (aliceErr) throw new Error(`alice signIn failed: ${aliceErr.message}`);

    bob = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: bobErr } = await bob.auth.signInWithPassword({
      email: bobUser.email, password: bobUser.password,
    });
    if (bobErr) throw new Error(`bob signIn failed: ${bobErr.message}`);
  });

  itIf("requires SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, SUPABASE_TEST_RLS=1", () => {
    expect(url).toBeTruthy();
    expect(serviceKey).toBeTruthy();
    expect(process.env["SUPABASE_TEST_RLS"]).toBe("1");
  });

  itIf("alice can read her own profile row", async () => {
    const { data, error } = await alice.from("profiles").select("user_id, name, role")
      .eq("user_id", aliceUser.userId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.role).toBe("student");
  });

  itIf("alice cannot read bob's profile row", async () => {
    const { data, error } = await alice.from("profiles").select("user_id, name, role")
      .eq("user_id", bobUser.userId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  itIf("alice cannot promote herself to admin", async () => {
    const { error } = await alice.from("profiles").update({ role: "admin" })
      .eq("user_id", aliceUser.userId!);
    // RLS rejects: expect a non-null error OR zero rows affected.
    expect(error).not.toBeNull();
  });
});
