import { Hono, type Context } from "hono";
import { auditLogListQuerySchema, type AuditLogRow } from "@mark-matrix/shared";
import { mapPgError } from "../../lib/pgErrors.js";
import { toCsvStream } from "../../lib/auditLogCsv.js";
import type { AppEnv } from "../../env.js";

type Ctx = Context<AppEnv>;

async function list(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const parsed = auditLogListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "validation_failed" }, 400);
  }
  const q = parsed.data;
  const from = (q.page - 1) * q.pageSize;
  const to = from + q.pageSize - 1;

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (q.userId) query = query.eq("user_id", q.userId);
  if (q.entity) query = query.eq("entity", q.entity);
  if (q.action) query = query.eq("action", q.action);
  if (q.from) query = query.gte("created_at", q.from);
  if (q.to) query = query.lte("created_at", q.to);

  const { data, error, count } = await query;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data: data ?? [], page: q.page, pageSize: q.pageSize, total: count ?? 0 });
}

async function exportCsv(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const parsed = auditLogListQuerySchema
    .omit({ page: true, pageSize: true })
    .safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "validation_failed" }, 400);
  }
  const q = parsed.data;

  let query = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (q.userId) query = query.eq("user_id", q.userId);
  if (q.entity) query = query.eq("entity", q.entity);
  if (q.action) query = query.eq("action", q.action);
  if (q.from) query = query.gte("created_at", q.from);
  if (q.to) query = query.lte("created_at", q.to);

  const { data, error } = await query;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // The Supabase JS client does not expose a server-side cursor, so we
  // read the full result set and stream it. A future cycle can switch
  // to a server-side cursor via RPC if the audit_log grows past ~10k rows.
  const rows = (data ?? []) as unknown as AuditLogRow[];
  const stream = toCsvStream((async function* () {
    for (const row of rows) yield row;
  })());

  const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const adminAuditLogRoute = new Hono<AppEnv>()
  .get("/", list)
  .get("/export.csv", exportCsv);
