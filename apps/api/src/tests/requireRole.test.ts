import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireRole } from "../middleware/requireRole.js";
import type { AppEnv } from "../env.js";

function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    // Simulate supabaseAuth by setting a role from a header.
    const role = c.req.header("x-test-role");
    if (role === "admin" || role === "faculty" || role === "student") {
      c.set("role", role);
    }
    await next();
  });
  app.use("/api/admin/*", requireRole("admin"));
  app.get("/api/admin/ping", (c) => c.json({ ok: true }));
  app.use("/api/staff/*", requireRole(["admin", "faculty"]));
  app.get("/api/staff/ping", (c) => c.json({ ok: true }));
  return app;
}

describe("requireRole factory", () => {
  it("allows admin through an admin-only route", async () => {
    const app = buildApp();
    const res = await app.request("/api/admin/ping", { headers: { "x-test-role": "admin" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 403 for faculty on an admin-only route", async () => {
    const app = buildApp();
    const res = await app.request("/api/admin/ping", { headers: { "x-test-role": "faculty" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 for student on an admin-only route", async () => {
    const app = buildApp();
    const res = await app.request("/api/admin/ping", { headers: { "x-test-role": "student" } });
    expect(res.status).toBe(403);
  });

  it("returns 403 when no role is set on the context", async () => {
    const app = buildApp();
    const res = await app.request("/api/admin/ping");
    expect(res.status).toBe(403);
  });

  it("allows multiple roles when an array is provided", async () => {
    const app = buildApp();
    const adminRes = await app.request("/api/staff/ping", { headers: { "x-test-role": "admin" } });
    const facultyRes = await app.request("/api/staff/ping", { headers: { "x-test-role": "faculty" } });
    expect(adminRes.status).toBe(200);
    expect(facultyRes.status).toBe(200);
  });

  it("returns 403 for an unlisted role when an array is provided", async () => {
    const app = buildApp();
    const res = await app.request("/api/staff/ping", { headers: { "x-test-role": "student" } });
    expect(res.status).toBe(403);
  });
});
