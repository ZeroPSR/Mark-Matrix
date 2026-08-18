import type { MiddlewareHandler } from "hono";
import { type Role } from "@mark-matrix/shared";
import type { AppEnv } from "../env.js";

export function requireRole(
  allowed: Role | readonly Role[],
): MiddlewareHandler<AppEnv> {
  const allowedSet = new Set<Role>(Array.isArray(allowed) ? allowed : [allowed]);
  return async (c, next) => {
    const role = c.get("role");
    if (!role || !allowedSet.has(role)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  };
}
