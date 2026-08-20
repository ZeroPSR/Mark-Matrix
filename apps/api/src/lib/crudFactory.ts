import { Hono, type Context } from "hono";
import type { AppEnv } from "../env.js";
import { mapPgError } from "./pgErrors.js";
import { formatZodError } from "@mark-matrix/shared";

interface Parser<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
}

interface CrudOptions<T, C, U> {
  table: string;
  createSchema: Parser<C>;
  updateSchema: Parser<U>;
  scope?: { column: string; queryKey: string };
  toRow: (input: C) => Record<string, unknown>;
  toPatch: (input: U) => Record<string, unknown>;
  fromRow: (row: Record<string, unknown>) => T;
}

function validationError(err: unknown) {
  // We accept anything that looks like a zod ZodError; if it isn't, surface a
  // generic 400 with no field detail.
  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown }).issues)) {
    return { error: "validation_failed", fields: formatZodError(err as Parameters<typeof formatZodError>[0]) };
  }
  return { error: "validation_failed" };
}

export function createCrudHandlers<T, C, U>(
  opts: CrudOptions<T, C, U>,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const supabase = c.get("supabase");
    let query = supabase.from(opts.table).select("*");
    if (opts.scope) {
      const v = c.req.query(opts.scope.queryKey);
      if (v) query = query.eq(opts.scope.column, v);
    }
    const { data, error } = await query;
    if (error) {
      const mapped = mapPgError(error);
      return c.json(mapped.body, mapped.status);
    }
    return c.json({ data: (data ?? []).map(opts.fromRow) });
  });

  app.post("/", async (c) => {
    const supabase = c.get("supabase");
    const body = await c.req.json().catch(() => null);
    const parsed = opts.createSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);
    const { data, error } = await supabase
      .from(opts.table)
      .insert(opts.toRow(parsed.data))
      .select()
      .single();
    if (error) {
      const mapped = mapPgError(error);
      return c.json(mapped.body, mapped.status);
    }
    return c.json({ data: opts.fromRow(data as Record<string, unknown>) }, 201);
  });

  app.get("/:id", async (c) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    const { data, error } = await supabase.from(opts.table).select("*").eq("id", id).maybeSingle();
    if (error) {
      const mapped = mapPgError(error);
      return c.json(mapped.body, mapped.status);
    }
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ data: opts.fromRow(data as Record<string, unknown>) });
  });

  app.patch("/:id", async (c) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = opts.updateSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);
    const { data, error } = await supabase
      .from(opts.table)
      .update(opts.toPatch(parsed.data))
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) {
      const mapped = mapPgError(error);
      return c.json(mapped.body, mapped.status);
    }
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ data: opts.fromRow(data as Record<string, unknown>) });
  });

  app.delete("/:id", async (c: Context<AppEnv>) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    const { error } = await supabase.from(opts.table).delete().eq("id", id);
    if (error) {
      // 23503 on DELETE is always "has_dependents" — the caller must
      // disambiguate via ctx for inserts only.
      const mapped = mapPgError(error, { hasDependents: true });
      return c.json(mapped.body, mapped.status);
    }
    return c.body(null, 204);
  });

  return app;
}
