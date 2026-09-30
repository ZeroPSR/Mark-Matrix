import type { SupabaseClient } from "@supabase/supabase-js";
import type { TranscriptInput } from "../../lib/transcriptPdf.js";

type GradesheetRow = {
  status: "draft" | "compiled" | "locked" | "published";
  sgpa: string | number | null;
};

type CourseGradeRow = {
  course_id: string;
  total_obtained: string | number;
  total_max: string | number;
  percentage: string | number;
  grade_label: string;
  grade_point: string | number;
  courses: { code: string; title: string; credits: string | number };
};

/**
 * Same shape as student/transcript.ts `buildTranscript`, but kept in its own
 * file so admin/exports.ts doesn't have to import from a student-scoped file.
 * The behaviour is identical (same SQL, same gating); duplication is small
 * and intentional to keep the student and admin route files independent.
 */
export async function buildTranscriptForExport(
  supabase: SupabaseClient,
  semId: string,
  studentId: string,
): Promise<TranscriptInput | null> {
  const { data: gsRows, error: gsErr } = await supabase
    .from("gradesheets")
    .select("status, sgpa")
    .eq("sem_id", semId)
    .eq("student_id", studentId);
  if (gsErr) throw gsErr;
  const gs = ((gsRows ?? []) as unknown as GradesheetRow[])[0];
  if (!gs || gs.status !== "published") return null;

  const { data: cgRows, error: cgErr } = await supabase
    .from("course_grades")
    .select("course_id, total_obtained, total_max, percentage, grade_label, grade_point, courses!inner(code, title, credits, semester_id)")
    .eq("student_id", studentId)
    .eq("courses.semester_id", semId);
  if (cgErr) throw cgErr;
  const grades = (cgRows ?? []) as unknown as CourseGradeRow[];
  const courses = grades.map((g) => ({
    code: g.courses.code,
    title: g.courses.title,
    credits: Number(g.courses.credits),
    gradeLabel: g.grade_label,
    gradePoint: Number(g.grade_point),
  }));
  const totalCredits = courses.reduce((acc, c) => acc + c.credits, 0);

  const { data: scoreArr, error: scErr } = await supabase
    .from("scores")
    .select("cgpa")
    .eq("student_id", studentId);
  if (scErr) throw scErr;
  const cgpa = Number(((scoreArr ?? []) as unknown as { cgpa: string | number }[])[0]?.cgpa ?? 0);

  const { data: profileArr, error: pErr } = await supabase
    .from("student_profiles")
    .select("roll_number, full_name")
    .eq("user_id", studentId);
  if (pErr) throw pErr;
  const profile = ((profileArr ?? []) as unknown as { roll_number: string; full_name: string }[])[0]
    ?? { roll_number: "", full_name: "" };

  return {
    institutionName: "Mark-Matrix Institute of Technology",
    student: { fullName: profile.full_name, rollNumber: profile.roll_number, programName: "BCA", batchLabel: "" },
    semester: { number: 1 },
    courses,
    sgpa: Number(gs.sgpa ?? 0),
    cgpa,
    totalCredits,
    generatedAt: new Date().toISOString(),
  };
}