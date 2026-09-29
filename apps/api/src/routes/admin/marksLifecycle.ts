import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { mapPgError } from "../../lib/pgErrors.js";
import {
  formatZodError,
  unlockMarksSchema,
  type ApproveMarksResponse,
  type LockMarksResponse,
  type UnlockMarksResponse,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";

type Ctx = Context<AppEnv>;

async function runStatusFlip(
  c: Ctx,
  args: {
    fromStatus: "submitted" | "approved" | "locked";
    toStatus: "approved" | "locked";
    setColumns: Record<string, unknown>;
    clearColumns: string[];
  },
): Promise<
  | { ok: true; rowsAffected: number }
  | { ok: false; status: ContentfulStatusCode; body: { error: string; detail?: string } }
> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return { ok: false, status: 400, body: { error: "missing_course" } };

  const updateObj: Record<string, unknown> = {
    ...args.setColumns,
  };
  for (const k of args.clearColumns) updateObj[k] = null;

  const { data, error } = await supabase
    .from("marks")
    .update(updateObj)
    .eq("course_id", courseId)
    .eq("status", args.fromStatus)
    .select("id");
  if (error) {
    const mapped = mapPgError(error);
    if (mapped.body.error === "internal_error" && (error.message ?? "").includes("marks_data_locked")) {
      return { ok: false, status: 409, body: { error: "marks_data_locked", detail: error.message } };
    }
    if ((error.message ?? "").includes("invalid_state_transition")) {
      return { ok: false, status: 409, body: { error: "invalid_state_transition", detail: error.message } };
    }
    return { ok: false, status: mapped.status, body: mapped.body };
  }
  const rows = (data ?? []) as unknown as { id: string }[];
  if (rows.length === 0) {
    return { ok: false, status: 409, body: { error: "invalid_state_transition", detail: `no rows at ${args.fromStatus}` } };
  }
  return { ok: true, rowsAffected: rows.length };
}

/**
 * Defence-in-depth body guard for the parameterless handlers `/approve`
 * and `/lock`. They take no body but reject malformed JSON with 400
 * rather than silently succeeding.
 */
async function rejectBadJson(c: Ctx): Promise<Response | null> {
  const raw = await c.req.text().catch(() => null);
  if (raw === null) {
    return c.json({ error: "validation_failed" }, 400);
  }
  if (raw.length === 0) return null;
  try {
    JSON.parse(raw);
  } catch {
    return c.json({ error: "validation_failed" }, 400);
  }
  return null;
}

async function approve(c: Ctx): Promise<Response> {
  const badJson = await rejectBadJson(c);
  if (badJson) return badJson;

  const userId = c.get("userId");
  const now = new Date().toISOString();
  const r = await runStatusFlip(c, {
    fromStatus: "submitted",
    toStatus: "approved",
    setColumns: { status: "approved", approved_by: userId, approved_at: now },
    clearColumns: ["locked_by", "locked_at"],
  });
  if (!r.ok) return c.json(r.body, r.status);
  const resp: ApproveMarksResponse = {
    approved: r.rowsAffected,
    approvedBy: userId,
    approvedAt: now,
  };
  return c.json(resp);
}

async function lock(c: Ctx): Promise<Response> {
  const badJson = await rejectBadJson(c);
  if (badJson) return badJson;

  const userId = c.get("userId");
  const now = new Date().toISOString();
  const r = await runStatusFlip(c, {
    fromStatus: "approved",
    toStatus: "locked",
    setColumns: { status: "locked", locked_by: userId, locked_at: now },
    clearColumns: [],
  });
  if (!r.ok) return c.json(r.body, r.status);
  const resp: LockMarksResponse = {
    locked: r.rowsAffected,
    lockedBy: userId,
    lockedAt: now,
  };
  return c.json(resp);
}

async function unlock(c: Ctx): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = unlockMarksSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const userId = c.get("userId");
  const now = new Date().toISOString();
  const r = await runStatusFlip(c, {
    fromStatus: "locked",
    toStatus: "approved",
    setColumns: { status: "approved" },
    clearColumns: ["locked_by", "locked_at"],
  });
  if (!r.ok) return c.json(r.body, r.status);
  const resp: UnlockMarksResponse = {
    unlocked: r.rowsAffected,
    unlockedBy: userId,
    unlockedAt: now,
  };
  // The reason is recorded in the API access log + (cycle 8) audit_log.
  // For now we surface it back to the caller so the UI can confirm receipt.
  return c.json({ ...resp, reason: parsed.data.reason });
}

export const adminMarksLifecycleRoute = new Hono<AppEnv>()
  .post("/approve", approve)
  .post("/lock", lock)
  .post("/unlock", unlock);
