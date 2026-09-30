import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePassRate,
  topN,
  computeAttendancePct,
  type PassRateReport,
  type TopperRow,
  type AttendanceShortageRow,
  type SemSummaryRow,
} from "@mark-matrix/shared";

type CourseGradeDbRow = {
  course_id: string;
  student_id: string;
  is_passing: boolean;
  total_obtained: string | number;
  total_max: string | number;
  percentage: string | number;
  grade_label: string;
  grade_point: string | number;
};

type StudentProfileRow = { user_id: string; roll_number: string };

type AttendanceRow = {
  student_id: string;
  status: "present" | "absent" | "late";
  session_date: string;
};

type SessionDateRow = { session_date: string };

type CourseRow = { id: string; code: string; title: string; semester_id: string };
type EnrollmentRow = { student_id: string; sem_id: string };

export async function getPassRateForCourse(
  supabase: SupabaseClient,
  courseId: string,
): Promise<PassRateReport> {
  const { data, error } = await supabase
    .from("course_grades")
    .select("is_passing")
    .eq("course_id", courseId);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as { is_passing: boolean }[]).map((r) => ({
    isPassing: r.is_passing,
  }));
  const computed = computePassRate(rows);
  return { ...computed, courseId };
}

export async function getToppersForCourse(
  supabase: SupabaseClient,
  courseId: string,
  limit: number,
): Promise<TopperRow[]> {
  const { data, error } = await supabase
    .from("course_grades")
    .select("student_id, total_obtained, total_max, percentage, grade_label, grade_point")
    .eq("course_id", courseId)
    .order("grade_point", { ascending: false });
  if (error) throw error;
  const grades = (data ?? []) as unknown as CourseGradeDbRow[];
  if (grades.length === 0) return [];

  const studentIds = [...new Set(grades.map((g) => g.student_id))];
  const { data: profileRows, error: pErr } = await supabase
    .from("student_profiles")
    .select("user_id, roll_number")
    .in("user_id", studentIds);
  if (pErr) throw pErr;
  const rollMap = new Map<string, string>(
    ((profileRows ?? []) as unknown as StudentProfileRow[]).map((p) => [p.user_id, p.roll_number]),
  );

  const rows: TopperRow[] = grades.map((g) => ({
    studentId: g.student_id,
    rollNumber: rollMap.get(g.student_id) ?? "",
    totalObtained: Number(g.total_obtained),
    totalMax: Number(g.total_max),
    percentage: Number(g.percentage),
    gradeLabel: g.grade_label,
    gradePoint: Number(g.grade_point),
  }));
  return topN(rows, (r) => r.gradePoint, limit);
}

export async function getAttendanceShortageForCourse(
  supabase: SupabaseClient,
  courseId: string,
  threshold: number,
): Promise<AttendanceShortageRow[]> {
  // 1. Get total sessions for the course.
  const { data: sessRows, error: sessErr } = await supabase
    .from("attendance")
    .select("session_date")
    .eq("course_id", courseId);
  if (sessErr) throw sessErr;
  const sessions = (sessRows ?? []) as unknown as SessionDateRow[];
  const totalSessions = new Set(sessions.map((s) => s.session_date)).size;
  if (totalSessions === 0) return [];

  // 2. Get every attendance row for the course.
  const { data: attRows, error: attErr } = await supabase
    .from("attendance")
    .select("student_id, status, session_date")
    .eq("course_id", courseId);
  if (attErr) throw attErr;
  const att = (attRows ?? []) as unknown as AttendanceRow[];

  // 3. Aggregate per student. `late` counts as present.
  const perStudent = new Map<string, { present: number }>();
  for (const r of att) {
    let entry = perStudent.get(r.student_id);
    if (!entry) {
      entry = { present: 0 };
      perStudent.set(r.student_id, entry);
    }
    if (r.status === "present" || r.status === "late") entry.present += 1;
  }

  // 4. Filter to students below threshold.
  const below: { studentId: string; presentCount: number; percentage: number }[] = [];
  for (const [studentId, e] of perStudent.entries()) {
    const pct = computeAttendancePct(e.present, totalSessions);
    if (pct < threshold) {
      below.push({ studentId, presentCount: e.present, percentage: pct });
    }
  }

  // 5. Fetch roll numbers.
  const studentIds = below.map((b) => b.studentId);
  const rollMap = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: profileRows, error: pErr } = await supabase
      .from("student_profiles")
      .select("user_id, roll_number")
      .in("user_id", studentIds);
    if (pErr) throw pErr;
    for (const p of (profileRows ?? []) as unknown as StudentProfileRow[]) {
      rollMap.set(p.user_id, p.roll_number);
    }
  }

  return below.map((b) => ({
    studentId: b.studentId,
    rollNumber: rollMap.get(b.studentId) ?? "",
    presentCount: b.presentCount,
    totalSessions,
    percentage: b.percentage,
  }));
}

export async function getSemSummary(
  supabase: SupabaseClient,
  semId: string,
): Promise<SemSummaryRow[]> {
  const { data: courseRows, error: cErr } = await supabase
    .from("courses")
    .select("id, code, title, semester_id")
    .eq("semester_id", semId);
  if (cErr) throw cErr;
  const courses = (courseRows ?? []) as unknown as CourseRow[];
  if (courses.length === 0) return [];

  const { data: enrRows, error: eErr } = await supabase
    .from("student_enrollments")
    .select("student_id, sem_id")
    .eq("sem_id", semId);
  if (eErr) throw eErr;
  const enrolled = ((enrRows ?? []) as unknown as EnrollmentRow[]).length;

  const courseIds = courses.map((c) => c.id);
  const { data: gradeRows, error: gErr } = await supabase
    .from("course_grades")
    .select("course_id, is_passing, percentage, grade_point")
    .in("course_id", courseIds);
  if (gErr) throw gErr;
  const grades = (gradeRows ?? []) as unknown as {
    course_id: string;
    is_passing: boolean;
    percentage: string | number;
    grade_point: string | number;
  }[];

  const byCourse = new Map<string, { passing: number; totalPct: number; totalGp: number; graded: number }>();
  for (const c of courses) byCourse.set(c.id, { passing: 0, totalPct: 0, totalGp: 0, graded: 0 });
  for (const g of grades) {
    const entry = byCourse.get(g.course_id);
    if (!entry) continue;
    entry.graded += 1;
    if (g.is_passing) entry.passing += 1;
    entry.totalPct += Number(g.percentage);
    entry.totalGp += Number(g.grade_point);
  }

  const out: SemSummaryRow[] = [];
  for (const c of courses) {
    const e = byCourse.get(c.id)!;
    const passRate = e.graded === 0 ? 0 : Math.round((e.passing / e.graded) * 10000) / 100;
    const avgPct = e.graded === 0 ? 0 : Math.round((e.totalPct / e.graded) * 100) / 100;
    const avgGp = e.graded === 0 ? 0 : Math.round((e.totalGp / e.graded) * 100) / 100;
    out.push({
      courseId: c.id,
      courseCode: c.code,
      courseTitle: c.title,
      enrolled,
      graded: e.graded,
      passing: e.passing,
      passRate,
      avgPercentage: avgPct,
      avgGradePoint: avgGp,
    });
  }
  return out;
}