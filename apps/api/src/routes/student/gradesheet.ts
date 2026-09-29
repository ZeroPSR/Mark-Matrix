import { Hono, type Context } from "hono";
import { mapPgError } from "../../lib/pgErrors.js";
import type { GradesheetRow } from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";

type Ctx = Context<AppEnv>;

type DbRow = {
  id: string;
  sem_id: string;
  student_id: string;
  status: "draft" | "compiled" | "locked" | "published";
  sgpa: string | number | null;
  total_credits: string | number | null;
  course_count: number | null;
  compiled_at: string | null;
  compiled_by: string | null;
  locked_by: string | null;
  locked_at: string | null;
  published_by: string | null;
  published_at: string | null;
  unlock_reason: string | null;
  unlocked_by: string | null;
  unlocked_at: string | null;
};

const fromRow = (r: DbRow): GradesheetRow => ({
  id: r.id,
  semId: r.sem_id,
  studentId: r.student_id,
  status: r.status,
  sgpa: r.sgpa === null ? null : Number(r.sgpa),
  totalCredits: r.total_credits === null ? null : Number(r.total_credits),
  courseCount: r.course_count,
  compiledAt: r.compiled_at,
  compiledBy: r.compiled_by,
  lockedBy: r.locked_by,
  lockedAt: r.locked_at,
  publishedBy: r.published_by,
  publishedAt: r.published_at,
  unlockReason: r.unlock_reason,
  unlockedBy: r.unlocked_by,
  unlockedAt: r.unlocked_at,
});

const SELECT_COLS =
  "id, sem_id, student_id, status, sgpa, total_credits, course_count, compiled_at, compiled_by, locked_by, locked_at, published_by, published_at, unlock_reason, unlocked_by, unlocked_at";

async function getStudentGradesheet(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const semId = c.req.param("semId");
  if (!semId) return c.json({ error: "missing_sem" }, 400);

  const { data, error } = await supabase
    .from("gradesheets")
    .select(SELECT_COLS)
    .eq("sem_id", semId)
    .eq("student_id", userId)
    .maybeSingle();

  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) return c.json({ error: "not_found" }, 404);

  // Defence in depth: the RLS policy already filters to status='published',
  // but if a service-role-style read returns a different status, we still
  // refuse to surface it.
  const row = data as unknown as DbRow;
  if (row.status !== "published") {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ data: fromRow(row) });
}

export const studentGradesheetRoute = new Hono<AppEnv>().get(
  "/",
  getStudentGradesheet,
);