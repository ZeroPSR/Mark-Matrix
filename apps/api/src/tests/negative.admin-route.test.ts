import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index.js";

const mockGetUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  }),
}));

const env = {
  ENVIRONMENT: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-svc",
};

beforeEach(() => mockGetUser.mockReset());

describe("admin route auth", () => {
  it("returns 403 for a faculty user", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "f1", app_metadata: { role: "faculty" } } },
      error: null,
    });
    const res = await app.request(
      "/api/admin/users",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 for a student user", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "s1", app_metadata: { role: "student" } } },
      error: null,
    });
    const res = await app.request(
      "/api/admin/users",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when Authorization is missing", async () => {
    const res = await app.request("/api/admin/users", { headers: {} }, env);
    expect(res.status).toBe(401);
  });
});
