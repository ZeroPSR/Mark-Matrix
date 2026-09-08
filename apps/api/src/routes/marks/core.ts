import { Hono, type Context } from "hono";
import {
  formatZodError,
  parseMarksCsv,
  type BulkMarksResponse,
  type MarksRow,
  type MarksStatus,
  upsertMarksSchema,
  patchMarksSchema,
  bulkMarksSchema,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

type Ctx = Context<AppEnv>;

type DbMarksRow = {
  id: string;
  course_id: string;
  student_id: string;
  exam_type: string;
  marks_obtained: number;
  max_marks: number;
  entered_by: string;
  status: MarksStatus;
  updated_at: string;
};

const fromRow = (r: DbMarksRow): MarksRow => ({
  id: r.id,
  courseId: r.course_id,
  studentId: r.student_id,
  examType: r.exam_type,
  marksObtained: Number(r.marks_obtained),
  maxMarks: Number(r.max_marks),
  enteredBy: r.entered_by,
  status: r.status,
  updatedAt: r.updated_at,
});

type ExamTypeRow = { exam_type: string; max_marks: number };

async function loadCourseExamTypes(
  c: Ctx,
  courseId: string,
): Promise<Map<string, number>> {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("course_exam_types")
    .select("exam_type, max_marks")
    .eq("course_id", courseId);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const r of (data ?? []) as unknown as ExamTypeRow[]) {
    map.set(r.exam_type, Number(r.max_marks));
  }
  return map;
}

/**
 * POST / — bulk-upsert marks for a course. Each entry is validated against
 * the course's defined exam types (exam_type must exist, marks_obtained
 * within [0, max_marks]). max_marks is copied from course_exam_types into
 * the marks row as a snapshot.
 */
async function bulkUpsert(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = upsertMarksSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }

  let examTypes: Map<string, number>;
  try {
    examTypes = await loadCourseExamTypes(c, courseId);
  } catch (e) {
    const m = mapPgError(e as { code?: string; message?: string });
    return c.json(m.body, m.status);
  }

  // Reject the whole batch if any row violates the per-course rules.
  for (const e of parsed.data.entries) {
    const max = examTypes.get(e.examType);
    if (max === undefined) {
      return c.json(
        { error: "unknown_exam_type", detail: e.examType },
        400,
      );
    }
    if (e.marksObtained > max) {
      return c.json(
        { error: "marks_exceed_max", detail: `${e.examType} max=${max}` },
        400,
      );
    }
  }

  const rows = parsed.data.entries.map((e) => ({
    course_id: courseId,
    student_id: e.studentId,
    exam_type: e.examType,
    marks_obtained: e.marksObtained,
    max_marks: examTypes.get(e.examType)!,
    entered_by: userId,
  }));

  const { data, error } = await supabase
    .from("marks")
    .upsert(rows, { onConflict: "course_id,student_id,exam_type" })
    .select(
      "id, course_id, student_id, exam_type, marks_obtained, max_marks, entered_by, status, updated_at",
    );
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(
    { data: (data ?? []).map((r) => fromRow(r as unknown as DbMarksRow)) },
    201,
  );
}

/**
 * PATCH /:id — correct marks_obtained on a single draft row.
 * The DB trigger marks_lock_when_submitted raises an error if anyone tries
 * to change marks_obtained on a submitted row; we surface that as 409.
 */
async function patchOne(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = patchMarksSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }

  // Look up the row to fetch its exam_type and course, so we can validate
  // marks_obtained against the snapshot max_marks.
  const { data: existing, error: fetchErr } = await supabase
    .from("marks")
    .select("id, course_id, exam_type, max_marks")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    const m = mapPgError(fetchErr);
    return c.json(m.body, m.status);
  }
  if (!existing) return c.json({ error: "not_found" }, 404);

  const row = existing as unknown as { max_marks: number };
  if (parsed.data.marksObtained > Number(row.max_marks)) {
    return c.json({ error: "marks_exceed_max" }, 400);
  }

  const { data, error } = await supabase
    .from("marks")
    .update({ marks_obtained: parsed.data.marksObtained })
    .eq("id", id)
    .select(
      "id, course_id, student_id, exam_type, marks_obtained, max_marks, entered_by, status, updated_at",
    )
    .maybeSingle();
  if (error) {
    const message = error.message ?? "";
    // Trigger raises "submitted_marks_are_locked" with errcode P0001.
    if (message.includes("submitted_marks_are_locked") || error.code === "P0001") {
      return c.json({ error: "submitted_marks_locked" }, 409);
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) return c.json({ error: "not_found" }, 404);
  return c.json({ data: fromRow(data as unknown as DbMarksRow) });
}

/**
 * POST /submit — flip every draft row of this course to submitted.
 * Idempotent: re-submitting is a no-op (only draft rows are touched).
 * The DB trigger + RLS prevent any other column from changing.
 */
async function submitCourse(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);

  const { data, error } = await supabase
    .from("marks")
    .update({ status: "submitted" })
    .eq("course_id", courseId)
    .eq("status", "draft")
    .select("id");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ submitted: (data ?? []).length });
}

/**
 * GET / — list marks rows. Role-scoped via RLS (faculty/admin see their
 * course, student sees only their own).
 */
async function listRows(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);

  const examType = c.req.query("examType");
  const studentId = c.req.query("studentId");

  let query = supabase
    .from("marks")
    .select(
      "id, course_id, student_id, exam_type, marks_obtained, max_marks, entered_by, status, updated_at",
    )
    .eq("course_id", courseId)
    .order("exam_type", { ascending: true });
  if (examType) query = query.eq("exam_type", examType);
  if (studentId) query = query.eq("student_id", studentId);

  const { data, error } = await query;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({
    data: (data ?? []).map((r) => fromRow(r as unknown as DbMarksRow)),
  });
}

/**
 * POST /bulk — CSV upload. Same shape as the admin bulk-enroll endpoint:
 * parse, resolve roll_number -> student_id, validate against the course's
 * exam types and roster, then upsert valid rows. Returns per-row errors.
 */
async function bulkUpload(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = bulkMarksSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }

  const { rows: parsedRows, errors: parseErrors } = parseMarksCsv(parsed.data.csv);
  const out: BulkMarksResponse = { succeeded: 0, errors: [] };
  for (const e of parseErrors) {
    out.errors.push({ row: e.row, reason: e.reason });
  }
  if (parsedRows.length === 0) {
    return c.json(out);
  }

  let examTypes: Map<string, number>;
  try {
    examTypes = await loadCourseExamTypes(c, courseId);
  } catch (e) {
    const m = mapPgError(e as { code?: string; message?: string });
    return c.json(m.body, m.status);
  }

  // Roster for this course — we resolve the course's semester via the courses
  // table, then look up enrollments in that sem. Without a direct link from
  // courses to enrollments, the easiest path is to read the course's
  // semester_id and then filter enrollments by it.
  const { data: courseRow, error: courseErr } = await supabase
    .from("courses")
    .select("id, semester_id")
    .eq("id", courseId)
    .maybeSingle();
  if (courseErr) {
    const m = mapPgError(courseErr);
    return c.json(m.body, m.status);
  }
  if (!courseRow) return c.json({ error: "course_not_found" }, 404);
  const semId = (courseRow as unknown as { semester_id: string }).semester_id;

  const { data: enrollments, error: enrErr } = await supabase
    .from("student_enrollments")
    .select("student_id")
    .eq("sem_id", semId);
  if (enrErr) {
    const m = mapPgError(enrErr);
    return c.json(m.body, m.status);
  }
  const enrolledSet = new Set(
    ((enrollments ?? []) as unknown as { student_id: string }[]).map(
      (r) => r.student_id,
    ),
  );

  const rollNumbers = Array.from(new Set(parsedRows.map((r) => r.rollNumber)));
  const { data: students, error: stuErr } = await supabase
    .from("student_profiles")
    .select("user_id, roll_number")
    .in("roll_number", rollNumbers);
  if (stuErr) {
    const m = mapPgError(stuErr);
    return c.json(m.body, m.status);
  }
  const byRoll = new Map<string, string>();
  for (const s of (students ?? []) as unknown as { user_id: string; roll_number: string }[]) {
    byRoll.set(s.roll_number, s.user_id);
  }

  // Validate every row first; only attempt the upsert if every row passes.
  type Valid = (typeof parsedRows)[number] & { maxMarks: number; userId: string };
  const valid: Valid[] = [];
  for (const r of parsedRows) {
    const max = examTypes.get(r.examType);
    if (max === undefined) {
      out.errors.push({ row: r.row, rollNumber: r.rollNumber, reason: "unknown_exam_type" });
      continue;
    }
    if (r.marksObtained > max) {
      out.errors.push({ row: r.row, rollNumber: r.rollNumber, reason: "exceeds_max" });
      continue;
    }
    const userId2 = byRoll.get(r.rollNumber);
    if (!userId2) {
      out.errors.push({ row: r.row, rollNumber: r.rollNumber, reason: "no_such_student" });
      continue;
    }
    if (!enrolledSet.has(userId2)) {
      out.errors.push({ row: r.row, rollNumber: r.rollNumber, reason: "not_in_roster" });
      continue;
    }
    valid.push({ ...r, maxMarks: max, userId: userId2 });
  }

  if (valid.length === 0) return c.json(out);

  const upsertRows = valid.map((v) => ({
    course_id: courseId,
    student_id: v.userId,
    exam_type: v.examType,
    marks_obtained: v.marksObtained,
    max_marks: v.maxMarks,
    entered_by: userId,
  }));

  const { data: upserted, error: upErr } = await supabase
    .from("marks")
    .upsert(upsertRows, { onConflict: "course_id,student_id,exam_type" })
    .select("id");
  if (upErr) {
    const m = mapPgError(upErr);
    return c.json(m.body, m.status);
  }
  out.succeeded = (upserted ?? []).length;
  return c.json(out);
}

/**
 * Full router — mounted under /api/faculty/ and /api/admin/. RLS does
 * row-level authorization.
 */
export const marksRoute = new Hono<AppEnv>()
  .post("/", bulkUpsert)
  .patch("/:id", patchOne)
  .post("/submit", submitCourse)
  .get("/", listRows)
  .post("/bulk", bulkUpload);

/**
 * Student-only router — GET only. POST/PATCH/PATCH /:id/POST /submit and
 * POST /bulk return 404 for students.
 */
export const studentMarksRoute = new Hono<AppEnv>().get("/", listRows);
