import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { generalRateLimit } from "../middleware/rateLimit.js";
import type { AppEnv } from "../env.js";

beforeAll(() => {
  process.env["DISABLE_RATE_LIMIT"] = "0";
});
afterAll(() => {
  process.env["DISABLE_RATE_LIMIT"] = "1";
});

describe("rate limit integration", () => {
  it("returns 429 before 401 for unauthenticated flood (Review Focus item 3)", async () => {
    // Simulate the middleware order: rate limit BEFORE supabaseAuth.
    // If a flood of unauthenticated requests lands, the rate limit
    // short-circuits the auth check (so we don't burn cycles on JWT
    // verification for blocked IPs).
    const app = new Hono<AppEnv>();
    app.use("/api/*", generalRateLimit);
    // No supabaseAuth mounted here — if the rate limit lets the request
    // through, the unauthenticated case would be 401, but the rate limit
    // caps at 120/min and the test fires 121 unauthenticated requests.
    for (let i = 0; i < 120; i++) {
      const res = await app.request("/api/anything", {
        headers: { "cf-connecting-ip": "5.6.7.8" },
      });
      expect([200, 401, 404]).toContain(res.status);
    }
    const res = await app.request("/api/anything", {
      headers: { "cf-connecting-ip": "5.6.7.8" },
    });
    expect(res.status).toBe(429);
  }, 30000);
});
