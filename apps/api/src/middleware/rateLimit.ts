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

const handler429 = (c: { header: (k: string, v: string) => void; json: (body: unknown, status: number) => Response }): Response => {
  c.header("retry-after", "60");
  return c.json({ error: "rate_limited", detail: "Too many requests. Try again in 60s." }, 429);
};

/**
 * The rate limit is bypassed when `DISABLE_RATE_LIMIT=1` is in the env.
 * The check is per-request so test code can flip the env via
 * vi.stubEnv() (or direct process.env mutation in a beforeAll) to
 * re-enable the limiter for specific tests.
 */
function isDisabled(): boolean {
  return process.env["DISABLE_RATE_LIMIT"] === "1";
}

const noop: MiddlewareHandler<AppEnv> = async (_c, next) => {
  await next();
};

let _realGeneral: MiddlewareHandler<AppEnv> | null = null;
let _realBulk: MiddlewareHandler<AppEnv> | null = null;

function getRealGeneral(): MiddlewareHandler<AppEnv> {
  if (!_realGeneral) {
    _realGeneral = rateLimiter<AppEnv>({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: "draft-6",
      keyGenerator: (c) => clientKey(c),
      handler: handler429,
    });
  }
  return _realGeneral;
}

function getRealBulk(): MiddlewareHandler<AppEnv> {
  if (!_realBulk) {
    _realBulk = rateLimiter<AppEnv>({
      windowMs: 60 * 1000,
      limit: 10,
      standardHeaders: "draft-6",
      keyGenerator: (c) => clientKey(c),
      handler: handler429,
    });
  }
  return _realBulk;
}

export const generalRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (isDisabled()) return noop(c, next);
  return getRealGeneral()(c, next);
};

export const bulkRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (isDisabled()) return noop(c, next);
  return getRealBulk()(c, next);
};

