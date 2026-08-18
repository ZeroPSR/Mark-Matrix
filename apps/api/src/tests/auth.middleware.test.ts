import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";

const mockGetUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  }),
}));

// Import after vi.mock so the middleware picks up the mocked client.
const { supabaseAuth } = await import("../middleware/auth.js");

const env = {
  ENVIRONMENT: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-svc",
};

function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", supabaseAuth);
  app.get("/api/me", (c) => c.json({ userId: c.get("userId"), role: c.get("role") }));
  return app;
}

beforeEach(() => mockGetUser.mockReset());

describe("supabaseAuth middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const app = buildApp();
    const res = await app.request("/api/me", { headers: {} }, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "missing_authorization" });
  });

  it("returns 401 when Authorization header is malformed", async () => {
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "NotBearer xxx" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when JWT is invalid/expired", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "jwt expired" },
    });
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer expired.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "invalid_session" });
  });

  it("returns 403 when role claim is missing", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: {} } },
      error: null,
    });
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "role_missing_or_invalid" });
  });

  it("returns 403 when role claim is invalid", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "wizard" } } },
      error: null,
    });
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with userId and role when token is valid", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "admin" } } },
      error: null,
    });
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u1", role: "admin" });
  });

  it("attaches a Supabase client to the context", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "student" } } },
      error: null,
    });
    const app = new Hono<AppEnv>();
    app.use("/api/*", supabaseAuth);
    app.get("/api/me", (c) => {
      const client = c.get("supabase");
      return c.json({ hasClient: typeof client?.auth?.getUser === "function" });
    });
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasClient: true });
  });
});
