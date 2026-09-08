import { Hono, type Context } from "hono";
import { computeSgpa, type SgpaResponse } from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";
import { resolveSchemeBands } from "../../lib/gradeSchemeResolver.js";
import { computeCourseGrade, GradeInputError, type CourseMarks } from "@mark-matrix/shared";
import { upsertCourseGrade, getCachedCourseGrade } from "../../lib/courseGradesRepo.js";

type Ctx = Context<AppEnv>;

type CourseRow = { id: string; semester_id: string; credits: number };
type MarksRow = { course_id: string; marks_obtained: string | number; max_marks: string | number };

async function ensureCourseGrade(
  c: Ctx,
  courseId: string,
  studentId: string,
): Promise<{ gradePoint: number; credits: number } | null> {
  const supabase = c.get("supabase");

  // Fast path: cached row.
  const cached = await getCachedCourseGrade(supabase, courseId, studentId);
  if (cached) {
    // We need the course credits for SGPA weighting.
    const { data: course, error: courseErr } = await supabase
      .from("courses")
      .select("credits")
      .eq("id", courseId)
      .maybeSingle();
    if (courseErr) throw courseErr;
    if (!course) return null;
    return { gradePoint: cached.gradePoint, credits: Number((course as unknown as { credits: number }).credits) };
  }

  // Slow path: compute and persist.
  const { data: marks, error: marksErr } = await supabase
    .from("marks")
    .select("marks_obtained, max_marks")
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .eq("status", "submitted");
  if (marksErr) throw marksErr;
  const marksArr = (marks ?? []) as unknown as MarksRow[];
  if (marksArr.length === 0) return null;

  const courseMarks: CourseMarks[] = marksArr.map((r) => ({
    marksObtained: Number(r.marks_obtained),
    maxMarks: Number(r.max_marks),
  }));

  const schemeBands = await resolveSchemeBands(supabase, courseId);
  if (!schemeBands) return null; // skip courses without a scheme (spec §5.3)

  const grade = computeCourseGrade(courseMarks, schemeBands.bands);
  const row = await upsertCourseGrade(supabase, {
    courseId,
    studentId,
    totalObtained: grade.totalObtained,
    totalMax: grade.totalMax,
    percentage: grade.percentage,
    gradeLabel: grade.gradeLabel,
    gradePoint: grade.gradePoint,
    gradeSchemeId: schemeBands.schemeId,
  });

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("credits")
    .eq("id", courseId)
    .maybeSingle();
  if (courseErr) throw courseErr;
  if (!course) return null;
  return { gradePoint: row.gradePoint, credits: Number((course as unknown as { credits: number }).credits) };
}

async function getSgpa(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const role = c.get("role");
  const userId = c.get("userId");
  const semId = c.req.param("semId");
  if (!semId) return c.json({ error: "missing_sem" }, 400);

  const queryStudent = c.req.query("studentId");
  const studentId = role === "student" ? userId : (queryStudent ?? userId);

  // Pull every course in this sem with the student's submitted marks.
  const { data: courses, error: courseErr } = await supabase
    .from("courses")
    .select("id, semester_id, credits")
    .eq("semester_id", semId);
  if (courseErr) {
    const m = mapPgError(courseErr);
    return c.json(m.body, m.status);
  }
  const courseList = (courses ?? []) as unknown as CourseRow[];
  if (courseList.length === 0) {
    return c.json({ error: "no_courses_in_sem" }, 404);
  }

  const creditsMap = new Map<string, number>();
  for (const co of courseList) creditsMap.set(co.id, Number(co.credits));

  const courseGrades: { courseId: string; gradePoint: number }[] = [];
  for (const co of courseList) {
    try {
      const ensured = await ensureCourseGrade(c, co.id, studentId);
      if (ensured) courseGrades.push({ courseId: co.id, gradePoint: ensured.gradePoint });
    } catch (e) {
      if (e instanceof GradeInputError) {
        return c.json({ error: "grade_input_error", detail: e.message }, 400);
      }
      const m = mapPgError(e as { code?: string; message?: string });
      return c.json(m.body, m.status);
    }
  }

  let totalCredits = 0;
  for (const g of courseGrades) totalCredits += creditsMap.get(g.courseId) ?? 0;

  const sgpa = computeSgpa(courseGrades, creditsMap);
  const resp: SgpaResponse = {
    studentId,
    semId,
    sgpa,
    courseCount: courseGrades.length,
    totalCredits,
    asOf: new Date().toISOString(),
  };
  return c.json({ data: resp });
}

export const sgpaRoute = new Hono<AppEnv>().get("/", getSgpa);
export const facultySgpaRoute = new Hono<AppEnv>().get("/", getSgpa);
export const studentSgpaRoute = new Hono<AppEnv>().get("/", getSgpa);
