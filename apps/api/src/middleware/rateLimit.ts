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

function isDisabled(): boolean {
  return process.env["DISABLE_RATE_LIMIT"] === "1";
}

function useKvBackend(): boolean {
  return process.env["RATE_LIMIT_BACKEND"] !== "memory";
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

/**
 * Cycle 8c: KV-backed rate limit. The KV store provides a sliding window
 * keyed by `rl:<scope>:<ip>`. Falls back to in-memory when RATE_LIMIT_BACKEND=memory
 * or when c.env.RATE_LIMIT is unbound.
 */
async function kvRateLimitInner(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
  next: Parameters<MiddlewareHandler<AppEnv>>[1],
  opts: { scope: string; limit: number },
): Promise<Response | void> {
  const kv = c.env?.RATE_LIMIT;
  if (!kv) {
    return (opts.scope === "bulk" ? getRealBulk() : getRealGeneral())(c, next);
  }
  const ip = clientKey(c);
  const key = `rl:${opts.scope}:${ip}`;
  const raw = await kv.get(key);
  const count = raw ? Number(raw) : 0;
  if (count >= opts.limit) {
    c.header("retry-after", "60");
    return c.json({ error: "rate_limited", detail: "Too many requests. Try again in 60s." }, 429);
  }
  await kv.put(key, String(count + 1), { expirationTtl: 60 });
  await next();
  return undefined;
}

/**
 * Per-request wrapper: re-reads DISABLE_RATE_LIMIT and RATE_LIMIT_BACKEND
 * on every call so test env flips take effect. (Cycle 8b had the same
 * pattern; the per-call check is what makes the cycle-8b test work in
 * vitest where the module loads with DISABLE_RATE_LIMIT=1.)
 */
function makeWrapper(opts: { scope: string; limit: number }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (isDisabled()) return noop(c, next);
    if (useKvBackend()) return kvRateLimitInner(c, next, opts);
    return (opts.scope === "bulk" ? getRealBulk() : getRealGeneral())(c, next);
  };
}

export const generalRateLimit: MiddlewareHandler<AppEnv> = makeWrapper({ scope: "general", limit: 120 });
export const bulkRateLimit: MiddlewareHandler<AppEnv> = makeWrapper({ scope: "bulk", limit: 10 });
