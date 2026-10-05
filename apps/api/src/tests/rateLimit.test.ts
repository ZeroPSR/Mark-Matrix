import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { generalRateLimit, bulkRateLimit } from "../middleware/rateLimit.js";
import type { AppEnv } from "../env.js";

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
