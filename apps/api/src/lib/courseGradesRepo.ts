import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseGradeRow } from "@mark-matrix/shared";

type Cached = {
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
};

const fromRow = (r: Cached): CourseGradeRow => ({
  id: r.id,
  courseId: r.course_id,
  studentId: r.student_id,
  totalObtained: Number(r.total_obtained),
  totalMax: Number(r.total_max),
  percentage: Number(r.percentage),
  gradeLabel: r.grade_label,
  gradePoint: Number(r.grade_point),
  gradeSchemeId: r.grade_scheme_id,
  computedAt: r.computed_at,
});

export async function getCachedCourseGrade(
  supabase: SupabaseClient,
  courseId: string,
  studentId: string,
): Promise<CourseGradeRow | null> {
  const { data, error } = await supabase
    .from("course_grades")
    .select(
      "id, course_id, student_id, total_obtained, total_max, percentage, grade_label, grade_point, grade_scheme_id, computed_at",
    )
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as unknown as Cached) : null;
}

export async function upsertCourseGrade(
  supabase: SupabaseClient,
  args: {
    courseId: string;
    studentId: string;
    totalObtained: number;
    totalMax: number;
    percentage: number;
    gradeLabel: string;
    gradePoint: number;
    gradeSchemeId: string;
  },
): Promise<CourseGradeRow> {
  const row = {
    course_id: args.courseId,
    student_id: args.studentId,
    total_obtained: args.totalObtained,
    total_max: args.totalMax,
    percentage: args.percentage,
    grade_label: args.gradeLabel,
    grade_point: args.gradePoint,
    grade_scheme_id: args.gradeSchemeId,
  };
  const { data, error } = await supabase
    .from("course_grades")
    .upsert(row, { onConflict: "course_id,student_id" })
    .select(
      "id, course_id, student_id, total_obtained, total_max, percentage, grade_label, grade_point, grade_scheme_id, computed_at",
    )
    .single();
  if (error) throw error;
  return fromRow(data as unknown as Cached);
}

/**
 * For SGPA reuse: returns one entry per course where the student has a cached
 * grade, restricted to courses belonging to the given semester.
 */
export async function getCachedCourseGradesForSem(
  supabase: SupabaseClient,
  studentId: string,
  semId: string,
): Promise<{ courseId: string; gradePoint: number; credits: number }[]> {
  const { data, error } = await supabase
    .from("course_grades")
    .select(
      "course_id, grade_point, courses!inner(semester_id, credits)",
    )
    .eq("student_id", studentId)
    .eq("courses.semester_id", semId);
  if (error) throw error;
  return ((data ?? []) as unknown as {
    course_id: string;
    grade_point: string | number;
    courses: { credits: number };
  }[]).map((r) => ({
    courseId: r.course_id,
    gradePoint: Number(r.grade_point),
    credits: Number(r.courses.credits),
  }));
}
