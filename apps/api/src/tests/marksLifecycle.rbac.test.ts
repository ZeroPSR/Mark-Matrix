import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { adminMarksLifecycleRoute } from "../routes/admin/marksLifecycle.js";
import { requireRole } from "../middleware/requireRole.js";

function makeApp(role: "admin" | "faculty" | "student"): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", {} as never);
    c.set("userId", "u1");
    c.set("role", role);
    await next();
  });
  app.use("/api/admin/*", requireRole("admin"));
  app.route(
    "/api/admin/batch/:b/program/:p/sem/:s/course/:c/marks",
    adminMarksLifecycleRoute,
  );
  return app;
}

const URL = "/api/admin/batch/b1/program/p1/sem/s1/course/c1/marks";

describe("admin marks lifecycle RBAC", () => {
  it("faculty hitting /approve is rejected by requireRole (403)", async () => {
    const res = await makeApp("faculty").request(`${URL}/approve`, { method: "POST", body: "{}" });
    expect(res.status).toBe(403);
  });
  it("student hitting /lock is rejected (403)", async () => {
    const res = await makeApp("student").request(`${URL}/lock`, { method: "POST", body: "{}" });
    expect(res.status).toBe(403);
  });
  it("faculty hitting /unlock is rejected (403)", async () => {
    const res = await makeApp("faculty").request(`${URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "x" }),
    });
    expect(res.status).toBe(403);
  });
});
