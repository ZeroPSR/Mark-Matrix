import { Hono, type Context } from "hono";
import type { CourseGradeResponse } from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";
import { resolveSchemeBands } from "../../lib/gradeSchemeResolver.js";
import {
  computeCourseGrade,
  GradeInputError,
  type CourseMarks,
} from "@mark-matrix/shared";
import { upsertCourseGrade, getCachedCourseGrade } from "../../lib/courseGradesRepo.js";

type Ctx = Context<AppEnv>;

type MarksRow = {
  marks_obtained: string | number;
  max_marks: string | number;
};

type SchemeJoins = { scheme_group: string };

type CourseGradeRow = {
  id: string;
  course_id: string;
  student_id: string;
  total_obtained: string | number;
  total_max: string | number;
  percentage: string | number;
  grade_label: string;
  grade_point: string | number;
  grade_scheme_id: string;
  computed_at: string;
  grade_schemes: { scheme_group: string };
};

async function getCourseGrade(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const role = c.get("role");
  const userId = c.get("userId");
  const courseId = c.req.param("courseId");
  const studentId = c.req.param("studentId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  if (!studentId) return c.json({ error: "missing_student" }, 400);

  // Students can only request their own grade.
  const effectiveStudentId = role === "student" ? userId : studentId;

  // Read submitted marks for this course/student.
  const { data: marks, error: marksErr } = await supabase
    .from("marks")
    .select("marks_obtained, max_marks")
    .eq("course_id", courseId)
    .eq("student_id", effectiveStudentId)
    .eq("status", "submitted");
  if (marksErr) {
    const m = mapPgError(marksErr);
    return c.json(m.body, m.status);
  }
  const marksArr = (marks ?? []) as unknown as MarksRow[];
  if (marksArr.length === 0) {
    return c.json({ error: "no_submitted_marks" }, 404);
  }

  const courseMarks: CourseMarks[] = marksArr.map((r) => ({
    marksObtained: Number(r.marks_obtained),
    maxMarks: Number(r.max_marks),
  }));

  let schemeBands;
  try {
    schemeBands = await resolveSchemeBands(supabase, courseId);
  } catch (e) {
    const m = mapPgError(e as { code?: string; message?: string });
    return c.json(m.body, m.status);
  }
  if (!schemeBands) {
    return c.json({ error: "no_grade_scheme" }, 422);
  }

  let grade;
  try {
    grade = computeCourseGrade(courseMarks, schemeBands.bands);
  } catch (e) {
    if (e instanceof GradeInputError) {
      return c.json({ error: "grade_input_error", detail: e.message }, 400);
    }
    throw e;
  }

  let cached;
  try {
    cached = await upsertCourseGrade(supabase, {
      courseId,
      studentId: effectiveStudentId,
      totalObtained: grade.totalObtained,
      totalMax: grade.totalMax,
      percentage: grade.percentage,
      gradeLabel: grade.gradeLabel,
      gradePoint: grade.gradePoint,
      gradeSchemeId: schemeBands.schemeId,
    });
  } catch (e) {
    const m = mapPgError(e as { code?: string; message?: string });
    return c.json(m.body, m.status);
  }

  // We need schemeGroup on the response; pull it via join.
  const { data: schemeData, error: schemeErr } = await supabase
    .from("grade_schemes")
    .select("scheme_group")
    .eq("id", schemeBands.schemeId)
    .maybeSingle();
  if (schemeErr) {
    const m = mapPgError(schemeErr);
    return c.json(m.body, m.status);
  }
  const schemeGroup = (schemeData as unknown as SchemeJoins | null)?.scheme_group ?? "";

  const resp: CourseGradeResponse = {
    courseId,
    studentId: effectiveStudentId,
    totalObtained: grade.totalObtained,
    totalMax: grade.totalMax,
    percentage: grade.percentage,
    gradeLabel: grade.gradeLabel,
    gradePoint: grade.gradePoint,
    gradeSchemeId: schemeBands.schemeId,
    schemeGroup,
    computedAt: cached.computedAt,
  };
  return c.json({ data: resp });
}

export const gradesRoute = new Hono<AppEnv>().get("/:studentId/grade", getCourseGrade);
export const facultyGradesRoute = new Hono<AppEnv>().get("/:studentId/grade", getCourseGrade);
export const studentGradesRoute = new Hono<AppEnv>().get("/:studentId/grade", getCourseGrade);
