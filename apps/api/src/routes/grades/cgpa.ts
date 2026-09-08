import { Hono, type Context } from "hono";
import {
  computeCgpa,
  computeSgpa,
  GradeInputError,
  type CourseMarks,
  type CgpaResponse,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";
import { resolveSchemeBands } from "../../lib/gradeSchemeResolver.js";
import { computeCourseGrade } from "@mark-matrix/shared";
import { upsertCourseGrade, getCachedCourseGrade } from "../../lib/courseGradesRepo.js";

type Ctx = Context<AppEnv>;

type SemesterRow = { id: string; number: number };
type CourseRow = { id: string; semester_id: string; credits: number };
type MarksRow = { course_id: string; marks_obtained: string | number; max_marks: string | number };

async function ensureCourseGrade(
  c: Ctx,
  courseId: string,
  studentId: string,
): Promise<{ gradePoint: number; credits: number } | null> {
  const supabase = c.get("supabase");
  const cached = await getCachedCourseGrade(supabase, courseId, studentId);
  if (cached) {
    const { data: course } = await supabase.from("courses").select("credits").eq("id", courseId).maybeSingle();
    if (!course) return null;
    return { gradePoint: cached.gradePoint, credits: Number((course as unknown as { credits: number }).credits) };
  }
  const { data: marks } = await supabase
    .from("marks")
    .select("marks_obtained, max_marks")
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .eq("status", "submitted");
  const marksArr = (marks ?? []) as unknown as MarksRow[];
  if (marksArr.length === 0) return null;

  const courseMarks: CourseMarks[] = marksArr.map((r) => ({
    marksObtained: Number(r.marks_obtained),
    maxMarks: Number(r.max_marks),
  }));
  const schemeBands = await resolveSchemeBands(supabase, courseId);
  if (!schemeBands) return null;
  let grade;
  try {
    grade = computeCourseGrade(courseMarks, schemeBands.bands);
  } catch (e) {
    if (e instanceof GradeInputError) {
      throw e;
    }
    throw e;
  }
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
  const { data: course } = await supabase.from("courses").select("credits").eq("id", courseId).maybeSingle();
  if (!course) return null;
  return { gradePoint: row.gradePoint, credits: Number((course as unknown as { credits: number }).credits) };
}

async function computeSemSgpa(
  c: Ctx,
  semId: string,
  studentId: string,
): Promise<number | null> {
  const supabase = c.get("supabase");
  const { data: courses } = await supabase
    .from("courses")
    .select("id, semester_id, credits")
    .eq("semester_id", semId);
  const courseList = (courses ?? []) as unknown as CourseRow[];
  if (courseList.length === 0) return null;
  const creditsMap = new Map<string, number>();
  for (const co of courseList) creditsMap.set(co.id, Number(co.credits));
  const grades: { courseId: string; gradePoint: number }[] = [];
  for (const co of courseList) {
    const ensured = await ensureCourseGrade(c, co.id, studentId);
    if (ensured) grades.push({ courseId: co.id, gradePoint: ensured.gradePoint });
  }
  if (grades.length === 0) return null;
  return computeSgpa(grades, creditsMap);
}

async function getCgpa(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const role = c.get("role");
  const userId = c.get("userId");

  const queryStudent = c.req.query("studentId");
  const studentId = role === "student" ? userId : (queryStudent ?? userId);

  const programId = c.req.query("programId");
  if (!programId) return c.json({ error: "missing_programId" }, 400);

  const { data: semesters, error: semErr } = await supabase
    .from("semesters")
    .select("id, number")
    .eq("program_id", programId)
    .order("number");
  if (semErr) {
    const m = mapPgError(semErr);
    return c.json(m.body, m.status);
  }
  const semesterList = (semesters ?? []) as unknown as SemesterRow[];
  if (semesterList.length === 0) {
    return c.json({ error: "no_semesters_in_program" }, 404);
  }

  const sgpas: number[] = [];
  let totalCredits = 0;
  for (const sem of semesterList) {
    try {
      const sgpa = await computeSemSgpa(c, sem.id, studentId);
      if (sgpa !== null) {
        sgpas.push(sgpa);
        // Sum credits across the contributing courses in this sem.
        const { data: courses } = await supabase
          .from("courses")
          .select("credits")
          .eq("semester_id", sem.id);
        for (const co of (courses ?? []) as unknown as { credits: number }[]) {
          totalCredits += Number(co.credits);
        }
      }
    } catch (e) {
      if (e instanceof GradeInputError) {
        return c.json({ error: "grade_input_error", detail: e.message }, 400);
      }
      const m = mapPgError(e as { code?: string; message?: string });
      return c.json(m.body, m.status);
    }
  }

  const cgpa = computeCgpa(sgpas);
  const resp: CgpaResponse = {
    studentId,
    programId,
    cgpa,
    semesterCount: sgpas.length,
    totalCredits,
    asOf: new Date().toISOString(),
  };
  return c.json({ data: resp });
}

export const cgpaRoute = new Hono<AppEnv>().get("/", getCgpa);
export const facultyCgpaRoute = new Hono<AppEnv>().get("/", getCgpa);
export const studentCgpaRoute = new Hono<AppEnv>().get("/", getCgpa);
