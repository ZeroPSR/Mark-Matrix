import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey;
const itIf = enabled ? it : it.skip;

describe("integration: login + role claim", () => {
  let client: SupabaseClient;

  beforeAll(() => {
    if (!enabled) return;
    client = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  itIf("requires SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY", () => {
    expect(url).toBeTruthy();
    expect(serviceKey).toBeTruthy();
  });

  itIf("admin.test signs in and gets role=admin", async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: "admin.test@mark-matrix.local",
      password: "TestPass!1",
    });
    expect(error).toBeNull();
    expect((data.user?.app_metadata as { role?: string }).role).toBe("admin");
  });

  itIf("faculty.test signs in and gets role=faculty", async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: "faculty.test@mark-matrix.local",
      password: "TestPass!1",
    });
    expect(error).toBeNull();
    expect((data.user?.app_metadata as { role?: string }).role).toBe("faculty");
  });

  itIf("student.test signs in and gets role=student", async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: "student.test@mark-matrix.local",
      password: "TestPass!1",
    });
    expect(error).toBeNull();
    expect((data.user?.app_metadata as { role?: string }).role).toBe("student");
  });
});
