import { Hono, type Context } from "hono";
import {
  bulkMarkAttendanceSchema,
  patchAttendanceSchema,
  formatZodError,
  type AttendanceRow,
  type AttendanceStatus,
  type AttendanceSummaryRow,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

type Ctx = Context<AppEnv>;

type Row = {
  id: string;
  course_id: string;
  student_id: string;
  session_date: string;
  status: AttendanceStatus;
  recorded_by: string;
  created_at: string;
};

const fromRow = (r: Row): AttendanceRow => ({
  id: r.id,
  courseId: r.course_id,
  studentId: r.student_id,
  sessionDate: r.session_date,
  status: r.status,
  recordedBy: r.recorded_by,
  createdAt: r.created_at,
});

// POST — bulk-mark a session. Upserts on (course_id, student_id, session_date).
async function bulkMark(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = bulkMarkAttendanceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const { sessionDate, entries } = parsed.data;

  const rows = entries.map((e) => ({
    course_id: courseId,
    student_id: e.studentId,
    session_date: sessionDate,
    status: e.status,
    recorded_by: userId,
  }));

  const { data, error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "course_id,student_id,session_date" })
    .select("id, course_id, student_id, session_date, status, recorded_by, created_at");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(
    { data: (data ?? []).map((r) => fromRow(r as unknown as Row)) },
    201,
  );
}

async function patchOne(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = patchAttendanceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const { data, error } = await supabase
    .from("attendance")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .select("id, course_id, student_id, session_date, status, recorded_by, created_at")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) return c.json({ error: "not_found" }, 404);
  return c.json({ data: fromRow(data as unknown as Row) });
}

async function listRows(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);

  const from = c.req.query("from");
  const to = c.req.query("to");
  const studentId = c.req.query("studentId");

  let query = supabase
    .from("attendance")
    .select("id, course_id, student_id, session_date, status, recorded_by, created_at")
    .eq("course_id", courseId)
    .order("session_date", { ascending: true });
  if (from) query = query.gte("session_date", from);
  if (to) query = query.lte("session_date", to);
  if (studentId) query = query.eq("student_id", studentId);

  const { data, error } = await query;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({
    data: (data ?? []).map((r) => fromRow(r as unknown as Row)),
  });
}

async function summary(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);

  const from = c.req.query("from");
  const to = c.req.query("to");

  let query = supabase
    .from("attendance")
    .select("student_id, status")
    .eq("course_id", courseId);
  if (from) query = query.gte("session_date", from);
  if (to) query = query.lte("session_date", to);

  const { data, error } = await query;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const buckets = new Map<string, { present: number; late: number; absent: number }>();
  for (const r of (data ?? []) as unknown as { student_id: string; status: AttendanceStatus }[]) {
    const b = buckets.get(r.student_id) ?? { present: 0, late: 0, absent: 0 };
    if (r.status === "present") b.present += 1;
    else if (r.status === "late") b.late += 1;
    else b.absent += 1;
    buckets.set(r.student_id, b);
  }

  const rows: AttendanceSummaryRow[] = [];
  for (const [studentId, b] of buckets) {
    const total = b.present + b.late + b.absent;
    const percent = total === 0 ? 0 : ((b.present + b.late) / total) * 100;
    rows.push({
      studentId,
      total,
      present: b.present,
      late: b.late,
      absent: b.absent,
      percent: Math.round(percent * 100) / 100,
    });
  }
  rows.sort((a, b) => a.studentId.localeCompare(b.studentId));
  return c.json({ data: rows });
}

/**
 * Full router — mounted under /api/faculty/ (writes + reads) and
 * /api/admin/ (reads). RLS does the row-level authorization.
 */
export const attendanceRoute = new Hono<AppEnv>()
  .post("/", bulkMark)
  .patch("/:id", patchOne)
  .get("/", listRows)
  .get("/summary", summary);

/**
 * Student-only router — GET and GET /summary. POST/PATCH are not registered,
 * so they return 404 for students.
 */
export const studentAttendanceRoute = new Hono<AppEnv>()
  .get("/", listRows)
  .get("/summary", summary);
