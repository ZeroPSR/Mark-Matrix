import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { generalRateLimit, bulkRateLimit } from "../middleware/rateLimit.js";
import type { AppEnv } from "../env.js";

// Re-enable rate limiting for these tests (the vitest config sets
// DISABLE_RATE_LIMIT=1 by default to keep the rest of the suite fast).
beforeAll(() => {
  process.env["DISABLE_RATE_LIMIT"] = "0";
});
afterAll(() => {
  process.env["DISABLE_RATE_LIMIT"] = "1";
  process.env["RATE_LIMIT_BACKEND"] = "";
});

function mountWithLimit(limit: MiddlewareHandler<AppEnv>): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", limit);
  app.get("/api/test", (c) => c.json({ ok: true }));
  return app;
}

describe("rate limiting", () => {
  it("generalRateLimit allows up to 120 requests per minute per IP", async () => {
    const app = mountWithLimit(generalRateLimit);
    for (let i = 0; i < 120; i++) {
      const res = await app.request("/api/test", { headers: { "cf-connecting-ip": "1.2.3.4" } });
      expect(res.status).toBe(200);
    }
  }, 30000);

  it("generalRateLimit returns 429 with Retry-After on the 121st request", async () => {
    const app = mountWithLimit(generalRateLimit);
    for (let i = 0; i < 120; i++) {
      await app.request("/api/test", { headers: { "cf-connecting-ip": "1.2.3.5" } });
    }
    const res = await app.request("/api/test", { headers: { "cf-connecting-ip": "1.2.3.5" } });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeDefined();
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
  }, 30000);

  it("different IPs are tracked independently", async () => {
    const app = mountWithLimit(generalRateLimit);
    for (let i = 0; i < 120; i++) {
      await app.request("/api/test", { headers: { "cf-connecting-ip": "1.2.3.6" } });
    }
    // Different IP should still be allowed.
    const res = await app.request("/api/test", { headers: { "cf-connecting-ip": "1.2.3.7" } });
    expect(res.status).toBe(200);
  }, 30000);

  it("bulkRateLimit allows up to 10 requests per minute per IP", async () => {
    const app = mountWithLimit(bulkRateLimit);
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/api/test", { headers: { "cf-connecting-ip": "1.2.3.8" } });
      expect(res.status).toBe(200);
    }
    const res = await app.request("/api/test", { headers: { "cf-connecting-ip": "1.2.3.8" } });
    expect(res.status).toBe(429);
  }, 30000);

  it("falls back to x-forwarded-for when cf-connecting-ip is missing", async () => {
    const app = mountWithLimit(generalRateLimit);
    for (let i = 0; i < 120; i++) {
      await app.request("/api/test", { headers: { "x-forwarded-for": "1.2.3.9, 10.0.0.1" } });
    }
    const res = await app.request("/api/test", { headers: { "x-forwarded-for": "1.2.3.9, 10.0.0.1" } });
    expect(res.status).toBe(429);
  }, 30000);
});

describe("KV rate limit fallback (cycle 8c)", () => {
  it("uses in-memory backend when RATE_LIMIT_BACKEND=memory even if KV binding is present (Review Focus item 1)", async () => {
    process.env["RATE_LIMIT_BACKEND"] = "memory";
    const fakeKv = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: "" })),
      getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
      delete: vi.fn(async () => undefined),
    };
    const app = new Hono<AppEnv>();
    app.use("/api/*", (c, next) => {
      c.env = { ...(c.env as object), RATE_LIMIT: fakeKv } as never;
      return generalRateLimit(c, next);
    });
    app.get("/api/test", (c) => c.json({ ok: true }));

    for (let i = 0; i < 120; i++) {
      const res = await app.request("/api/test", { headers: { "cf-connecting-ip": "9.9.9.9" } });
      expect(res.status).toBe(200);
    }
    const res = await app.request("/api/test", { headers: { "cf-connecting-ip": "9.9.9.9" } });
    expect(res.status).toBe(429);
    // The KV binding was never written to (in-memory path).
    expect(fakeKv.put).not.toHaveBeenCalled();
  }, 30000);

  it("KV rate limit increments and returns 429 on overflow", async () => {
    process.env["RATE_LIMIT_BACKEND"] = ""; // default = KV
    const store = new Map<string, string>();
    const fakeKv = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      put: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: "" })),
      getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
      delete: vi.fn(async () => undefined),
    };
    const app = new Hono<AppEnv>();
    app.use("/api/bulk", (c, next) => {
      c.env = { ...(c.env as object), RATE_LIMIT: fakeKv } as never;
      return bulkRateLimit(c, next);
    });
    app.post("/api/bulk", (c) => c.json({ ok: true }));

    for (let i = 0; i < 10; i++) {
      const res = await app.request("/api/bulk", {
        method: "POST",
        headers: { "cf-connecting-ip": "8.8.8.8" },
      });
      expect(res.status).toBe(200);
    }
    const res = await app.request("/api/bulk", {
      method: "POST",
      headers: { "cf-connecting-ip": "8.8.8.8" },
    });
    expect(res.status).toBe(429);
    // KV was written 10 times (one per request) with the running count.
    expect(fakeKv.put).toHaveBeenCalledTimes(10);
  }, 30000);
});
