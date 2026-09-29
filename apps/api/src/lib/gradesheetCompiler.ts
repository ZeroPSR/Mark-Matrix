import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCgpa,
  computeSgpa,
  type CompileGradesheetResponse,
  type CompileGradesheetStudentResult,
} from "@mark-matrix/shared";

type CourseRow = { id: string; semester_id: string; code: string; credits: number };
type EnrollmentRow = { student_id: string };
type CachedGradeRow = {
  course_id: string;
  grade_point: string | number;
};

/**
 * Compile a semester's gradesheet.
 *
 * Algorithm:
 *   1. List every course in `semId`.
 *   2. For each course, count `marks` rows where `status != 'locked'`. Any
 *      positive count short-circuits with the incomplete-courses list.
 *   3. List every enrolled student for `semId`.
 *   4. For each student, fetch cached `course_grades` filtered to this sem
 *      via the inline `courses!inner(semester_id)` join. Skip students with
 *      zero cached rows (no gradesheet is inserted for them).
 *   5. Compute SGPA via `computeSgpa` (cycle-5 pure compute) and upsert the
 *      `gradesheets` row with status='compiled'.
 *   6. Recompute CGPA across all `compiled|locked|published` gradesheets and
 *      upsert the `scores` row per (student, program).
 *
 * Errors propagate to the caller; Task 7 wraps this in try/catch and maps
 * via `mapPgError`.
 */
export async function compileSemGradesheet(
  supabase: SupabaseClient,
  semId: string,
  adminId: string,
): Promise<CompileGradesheetResponse> {
  // 1. List every course in this sem.
  const { data: courseRows, error: coursesErr } = await supabase
    .from("courses")
    .select("id, semester_id, code, credits")
    .eq("semester_id", semId);
  if (coursesErr) throw coursesErr;
  const courses = (courseRows ?? []) as unknown as CourseRow[];

  // 2. Per-course non-locked-marks count. We count rows with status NOT IN
  // ('locked') for each course; any positive count means compile is invalid.
  const incompleteCourses: { courseId: string; courseCode: string }[] = [];
  for (const co of courses) {
    const { count, error: countErr } = await supabase
      .from("marks")
      .select("id", { count: "exact", head: true })
      .eq("course_id", co.id)
      .neq("status", "locked");
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) {
      incompleteCourses.push({ courseId: co.id, courseCode: co.code });
    }
  }
  if (incompleteCourses.length > 0) {
    return { compiled: 0, incompleteCourses, students: [] };
  }

  // 3. Enrolled students.
  const { data: enrRows, error: enrErr } = await supabase
    .from("student_enrollments")
    .select("student_id")
    .eq("sem_id", semId);
  if (enrErr) throw enrErr;
  const enrollments = (enrRows ?? []) as unknown as EnrollmentRow[];

  const creditsMap = new Map<string, number>();
  for (const co of courses) creditsMap.set(co.id, Number(co.credits));

  // 4 + 5. Per-student SGPA via cached course_grades.
  const now = new Date().toISOString();
  const studentResults: CompileGradesheetStudentResult[] = [];
  for (const enr of enrollments) {
    const studentId = enr.student_id;
    const { data: cachedRows, error: cgErr } = await supabase
      .from("course_grades")
      .select("course_id, grade_point, courses!inner(semester_id)")
      .eq("student_id", studentId)
      .eq("courses.semester_id", semId);
    if (cgErr) throw cgErr;
    const cached = (cachedRows ?? []) as unknown as CachedGradeRow[];

    if (cached.length === 0) {
      // No gradeable courses for this student — skip; do not insert a row.
      // Rationale: a gradesheet row for a student with zero computed
      // gradesheets is meaningless. The cycle-6 policy is "compile
      // populates rows for students with at least one cached grade."
      continue;
    }

    const grades = cached.map((r) => ({
      courseId: r.course_id,
      gradePoint: Number(r.grade_point),
    }));
    const totalCredits = grades.reduce(
      (acc, g) => acc + (creditsMap.get(g.courseId) ?? 0),
      0,
    );
    const sgpa = computeSgpa(grades, creditsMap);

    const { error: upsertErr } = await supabase
      .from("gradesheets")
      .upsert(
        {
          sem_id: semId,
          student_id: studentId,
          status: "compiled",
          sgpa,
          total_credits: totalCredits,
          course_count: grades.length,
          compiled_at: now,
          compiled_by: adminId,
        },
        { onConflict: "sem_id,student_id" },
      );
    if (upsertErr) throw upsertErr;

    studentResults.push({
      studentId,
      sgpa,
      courseCount: grades.length,
      totalCredits,
    });
  }

  // 6. Recompute CGPA per (student, program) across all compiled+locked+
  // published gradesheets for that student.
  await recomputeCgpas(supabase);

  return { compiled: studentResults.length, incompleteCourses: [], students: studentResults };
}

/**
 * Recompute CGPA for every (student, program) pair that has at least one
 * gradesheet in `compiled | locked | published` status.
 *
 * Exported so Task 7's publish handler can invoke it after flipping rows to
 * 'published' without duplicating the grouping logic.
 */
export async function recomputeCgpas(supabase: SupabaseClient): Promise<void> {
  // Pull every (student, program) pair from gradesheets via the semesters join.
  const { data: rows, error: rsErr } = await supabase
    .from("gradesheets")
    .select("student_id, sgpa, total_credits, sem_id, semesters!inner(program_id, number)")
    .in("status", ["compiled", "locked", "published"]);
  if (rsErr) throw rsErr;
  type Row = {
    student_id: string;
    sgpa: string | number;
    total_credits: string | number | null;
    sem_id: string;
    semesters: { program_id: string; number: number };
  };
  const all = (rows ?? []) as unknown as Row[];

  // Group by (student_id, program_id) → sgpa list + total credits.
  const grouped = new Map<
    string,
    { studentId: string; programId: string; sgpas: number[]; totalCredits: number }
  >();
  for (const r of all) {
    const key = `${r.student_id}::${r.semesters.program_id}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        studentId: r.student_id,
        programId: r.semesters.program_id,
        sgpas: [],
        totalCredits: 0,
      };
      grouped.set(key, entry);
    }
    entry.sgpas.push(Number(r.sgpa));
    entry.totalCredits += Number(r.total_credits ?? 0);
  }
  for (const e of grouped.values()) {
    e.sgpas.sort();
    const cgpa = computeCgpa(e.sgpas);
    const { error: upErr } = await supabase.from("scores").upsert(
      {
        student_id: e.studentId,
        program_id: e.programId,
        cgpa,
        semester_count: e.sgpas.length,
        total_credits: e.totalCredits,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "student_id,program_id" },
    );
    if (upErr) throw upErr;
  }
}
