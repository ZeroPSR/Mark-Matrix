import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { mapPgError } from "../../lib/pgErrors.js";
import {
  compileSemGradesheet,
  recomputeCgpas,
} from "../../lib/gradesheetCompiler.js";
import {
  formatZodError,
  unlockGradesheetSchema,
  type CompileGradesheetResponse,
  type LockGradesheetResponse,
  type PublishGradesheetResponse,
  type UnlockGradesheetResponse,
} from "@mark-matrix/shared";
import { notifyGradesheetPublished } from "../../lib/notificationStub.js";
import type { AppEnv } from "../../env.js";
import { recordAudit } from "../../lib/auditLog.js";

type Ctx = Context<AppEnv>;

async function compile(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const semId = c.req.param("semId");
  if (!semId) return c.json({ error: "missing_sem" }, 400);

  let result: CompileGradesheetResponse;
  try {
    result = await compileSemGradesheet(supabase, semId, userId);
  } catch (e) {
    const m = mapPgError(e as { code?: string; message?: string });
    return c.json(m.body, m.status);
  }

  if (result.incompleteCourses.length > 0) {
    return c.json(
      { error: "incomplete_sem", incompleteCourses: result.incompleteCourses },
      422,
    );
  }
  return c.json(result);
}

async function runStatusFlip(
  supabase: ReturnType<Ctx["get"]>,
  semId: string,
  fromStatus: "compiled" | "locked" | "published",
  toStatus: "compiled" | "locked" | "published",
  extras: Record<string, unknown>,
  clearColumns: string[],
): Promise<
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; status: ContentfulStatusCode; body: { error: string; detail?: string } }
> {
  const updateObj: Record<string, unknown> = { ...extras };
  for (const k of clearColumns) updateObj[k] = null;

  const { data, error } = await supabase
    .from("gradesheets")
    .update(updateObj)
    .eq("sem_id", semId)
    .eq("status", fromStatus)
    .select("id, sem_id, status, locked_by, locked_at, published_by, published_at, total_credits, unlock_reason, unlocked_by, unlocked_at");
  if (error) {
    if ((error.message ?? "").includes("invalid_state_transition")) {
      return {
        ok: false,
        status: 409,
        body: { error: "invalid_state_transition", detail: error.message },
      };
    }
    const m = mapPgError(error);
    return { ok: false, status: m.status, body: m.body };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "invalid_state_transition",
        detail: `no rows at ${fromStatus}`,
      },
    };
  }
  return { ok: true, rows };
}

async function lock(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const semId = c.req.param("semId");
  if (!semId) return c.json({ error: "missing_sem" }, 400);
  const now = new Date().toISOString();
  const r = await runStatusFlip(
    supabase,
    semId,
    "compiled",
    "locked",
    { status: "locked", locked_by: userId, locked_at: now },
    [],
  );
  if (!r.ok) return c.json(r.body, r.status);
  // Cycle 8a: emit lock audit keyed by semId.
  const firstRow = r.rows[0];
  if (firstRow) {
    await recordAudit(supabase, {
      action: "lock",
      entity: "gradesheet",
      entityId: semId,
      oldValue: { ...firstRow, status: "compiled", locked_by: null, locked_at: null },
      newValue: firstRow,
    });
  }
  const resp: LockGradesheetResponse = { locked: r.rows.length };
  return c.json(resp);
}

async function publish(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const semId = c.req.param("semId");
  if (!semId) return c.json({ error: "missing_sem" }, 400);
  const now = new Date().toISOString();
  const r = await runStatusFlip(
    supabase,
    semId,
    "locked",
    "published",
    { status: "published", published_by: userId, published_at: now },
    [],
  );
  if (!r.ok) return c.json(r.body, r.status);

  // Cycle 8a: emit publish audit keyed by semId BEFORE recomputeCgpas so
  // audit capture is independent of any downstream read that depends on
  // the live DB.
  const firstPubRow = r.rows[0];
  if (firstPubRow) {
    await recordAudit(supabase, {
      action: "publish",
      entity: "gradesheet",
      entityId: semId,
      oldValue: { ...firstPubRow, status: "locked", published_by: null, published_at: null },
      newValue: firstPubRow,
    });
  }

  // Recompute CGPA across all (compiled | locked | published) gradesheets so
  // the student's `scores.cgpa` reflects the latest published state.
  // The compiler's exported `recomputeCgpas` runs pure — no gradesheet
  // mutation, no status flip — so it is safe to call here after the
  // published-state transition.
  // Cycle 8a: wrap in try/catch so audit + publish state survive any
  // downstream read failure; failures are surfaced via console.error.
  try {
    await recomputeCgpas(supabase);
  } catch (e) {
    console.error("publish: recomputeCgpas failed:", e instanceof Error ? e.message : String(e));
  }

  // Fire the notification stub. Total credits = sum across the published
  // gradesheets for this sem.
  const { data: tcs, error: tcErr } = await supabase
    .from("gradesheets")
    .select("total_credits")
    .eq("sem_id", semId)
    .eq("status", "published");
  if (tcErr) {
    // Non-fatal; the publish action succeeded.
    console.error("publish: total_credits read failed:", tcErr.message);
  }
  const studentCount = r.rows.length;
  const totalCredits = (
    (tcs ?? []) as unknown as { total_credits: string | number | null }[]
  ).reduce((acc, row) => acc + Number(row.total_credits ?? 0), 0);
  notifyGradesheetPublished({ semId, studentCount, totalCredits });

  const resp: PublishGradesheetResponse = { published: r.rows.length };
  return c.json(resp);
}

async function unlock(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const semId = c.req.param("semId");
  if (!semId) return c.json({ error: "missing_sem" }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = unlockGradesheetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const now = new Date().toISOString();
  const r = await runStatusFlip(
    supabase,
    semId,
    "published",
    "compiled",
    {
      status: "compiled",
      unlock_reason: parsed.data.reason,
      unlocked_by: userId,
      unlocked_at: now,
    },
    ["published_by", "published_at", "locked_by", "locked_at"],
  );
  if (!r.ok) return c.json(r.body, r.status);
  // Cycle 8a: emit unlock audit keyed by semId; capture reason in new_value.
  const firstUnRow = r.rows[0];
  if (firstUnRow) {
    await recordAudit(supabase, {
      action: "unlock",
      entity: "gradesheet",
      entityId: semId,
      oldValue: { ...firstUnRow, status: "published", published_by: firstUnRow["published_by"], published_at: firstUnRow["published_at"], locked_by: firstUnRow["locked_by"], locked_at: firstUnRow["locked_at"] },
      newValue: { ...firstUnRow, unlock_reason: parsed.data.reason },
    });
  }
  const resp: UnlockGradesheetResponse = { unlocked: r.rows.length };
  return c.json(resp);
}

export const adminGradesheetsRoute = new Hono<AppEnv>()
  .post("/compile", compile)
  .post("/lock", lock)
  .post("/publish", publish)
  .post("/unlock", unlock);
