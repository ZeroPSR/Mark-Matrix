import { rateLimiter } from "hono-rate-limiter";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env.js";

function clientKey(c: { req: { header: (name: string) => string | undefined } }): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf;
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "anon";
}

export const generalRateLimit: MiddlewareHandler<AppEnv> = rateLimiter<AppEnv>({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-6",
  keyGenerator: (c) => clientKey(c),
  handler: (c) => {
    c.header("retry-after", "60");
    return c.json({ error: "rate_limited", detail: "Too many requests. Try again in 60s." }, 429);
  },
});

export const bulkRateLimit: MiddlewareHandler<AppEnv> = rateLimiter<AppEnv>({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-6",
  keyGenerator: (c) => clientKey(c),
  handler: (c) => {
    c.header("retry-after", "60");
    return c.json({ error: "rate_limited", detail: "Too many requests. Try again in 60s." }, 429);
  },
});
