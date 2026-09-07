import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { adminGradeSchemesRoute } from "../routes/admin/gradeSchemes.js";
import { requireRole } from "../middleware/requireRole.js";

function makeApp(role: "admin" | "faculty" | "student" | null): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  if (role !== null) {
    app.use("/api/*", async (c, next) => {
      c.set("supabase", {} as never);
      c.set("userId", "u1");
      c.set("role", role);
      await next();
    });
  }
  app.use("/api/admin/*", requireRole("admin"));
  app.route("/api/admin/grade-schemes", adminGradeSchemesRoute);
  return app;
}

describe("admin grade-schemes RBAC", () => {
  it("anonymous (no role) → 401/403", async () => {
    const res = await makeApp(null).request("/api/admin/grade-schemes");
    expect([401, 403]).toContain(res.status);
  });

  it("faculty → 403", async () => {
    const res = await makeApp("faculty").request("/api/admin/grade-schemes");
    expect(res.status).toBe(403);
  });

  it("student → 403", async () => {
    const res = await makeApp("student").request("/api/admin/grade-schemes");
    expect(res.status).toBe(403);
  });

  it("faculty cannot POST a scheme", async () => {
    const res = await makeApp("faculty").request("/api/admin/grade-schemes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schemeGroup: "g", scope: "course", courseId: "c", gradeLabel: "A", minMarks: 80, maxMarks: 100, gradePoint: 9 }),
    });
    expect(res.status).toBe(403);
  });

  it("admin reaches the handler (200/4xx but not 403)", async () => {
    const res = await makeApp("admin").request("/api/admin/grade-schemes");
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
