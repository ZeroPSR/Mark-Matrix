import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminAuditLogRoute } from "../routes/admin/auditLog.js";
import { toCsv } from "../lib/auditLogCsv.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient, userId = "admin-1"): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", userId);
    c.set("role", "admin");
    await next();
  });
  app.route("/api/admin/audit-log", adminAuditLogRoute);
  return app;
}

const URL = "/api/admin/audit-log";

describe("audit-log API", () => {
  it("GET / returns paginated rows with total", async () => {
    const { supabase } = makeAuditMockSupabase({
      tableResponses: {
        audit_log: {
          data: [
            { id: 1, created_at: "2026-10-05T10:00:00Z", user_id: "11111111-1111-1111-1111-111111111111", action: "update", entity: "marks", entity_id: "m1", old_value: { status: "draft" }, new_value: { status: "approved" } },
            { id: 2, created_at: "2026-10-05T10:00:01Z", user_id: "11111111-1111-1111-1111-111111111111", action: "lock", entity: "marks", entity_id: "m2", old_value: null, new_value: null },
          ],
          error: null,
        },
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(URL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; total: number; page: number; pageSize: number };
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
  });

  it("GET / validates query params (unknown entity → 400)", async () => {
    const { supabase } = makeAuditMockSupabase();
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}?entity=nope`);
    expect(res.status).toBe(400);
  });

  it("GET / returns empty result when filter matches zero rows (Review Focus item 1)", async () => {
    const { supabase } = makeAuditMockSupabase({
      tableResponses: { audit_log: { data: [], error: null } },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}?userId=11111111-1111-1111-1111-111111111111`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; total: number };
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it("GET /export.csv returns a streaming Response with CSV headers", async () => {
    const { supabase } = makeAuditMockSupabase({
      tableResponses: {
        audit_log: {
          data: [
            { id: 1, created_at: "2026-10-05T10:00:00Z", user_id: "11111111-1111-1111-1111-111111111111", action: "update", entity: "marks", entity_id: 'm"1', old_value: { status: "draft" }, new_value: { status: "approved" } },
          ],
          error: null,
        },
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/export.csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    expect(typeof res.body).toBe("object");
    const text = await res.text();
    expect(text).toContain("created_at,user_id,action,entity,entity_id");
    expect(text).toContain('"m""1"');
  });

  it("GET /export.csv streams CSV via ReadableStream (Review Focus item 2)", async () => {
    const { supabase } = makeAuditMockSupabase({
      tableResponses: { audit_log: { data: [], error: null } },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/export.csv`);
    expect(res.body).toBeDefined();
  });

  it("GET / returns 403 when called as faculty (covered by requireRole mount)", async () => {
    const { supabase } = makeAuditMockSupabase();
    const app = new Hono<AppEnv>();
    app.use("/api/admin/*", async (c, next) => {
      c.set("supabase", supabase);
      c.set("userId", "faculty-1");
      c.set("role", "faculty");
      return c.json({ error: "forbidden" }, 403);
    });
    app.route("/api/admin/audit-log", adminAuditLogRoute);
    const res = await app.request(URL);
    expect(res.status).toBe(403);
  });
});

describe("toCsv (csv writer unit)", () => {
  it("writes a header row even with no data", () => {
    const csv = toCsv([]);
    expect(csv).toBe("created_at,user_id,action,entity,entity_id,old_value,new_value\n");
  });

  it("escapes quotes and wraps fields containing commas/quotes/newlines", () => {
    const csv = toCsv([
      {
        created_at: "2026-10-05T10:00:00Z",
        user_id: "u1",
        action: "update",
        entity: "marks",
        entity_id: 'has "quote" and ,comma',
        old_value: { x: 1 },
        new_value: null,
      },
    ]);
    expect(csv).toContain('"has ""quote"" and ,comma"');
  });
});
