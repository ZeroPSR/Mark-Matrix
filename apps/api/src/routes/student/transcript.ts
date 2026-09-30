import { Hono, type Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../../env.js";
import { renderTranscriptPdf, type TranscriptInput, type TranscriptCourse } from "../../lib/transcriptPdf.js";

type Ctx = Context<AppEnv>;

type GradesheetRow = {
  id: string;
  sem_id: string;
  student_id: string;
  status: "draft" | "compiled" | "locked" | "published";
  sgpa: string | number | null;
  total_credits: string | number | null;
};

type CourseGradeRow = {
  student_id: string;
  course_id: string;
  total_obtained: string | number;
  total_max: string | number;
  percentage: string | number;
  grade_label: string;
  grade_point: string | number;
  courses: { code: string; title: string; credits: string | number };
};

async function buildTranscript(
  supabase: SupabaseClient,
  semId: string,
  studentId: string,
): Promise<TranscriptInput | null> {
  const { data: gsRows, error: gsErr } = await supabase
    .from("gradesheets")
    .select("id, sem_id, student_id, status, sgpa, total_credits")
    .eq("sem_id", semId)
    .eq("student_id", studentId);
  if (gsErr) throw gsErr;
  const gs = ((gsRows ?? []) as unknown as GradesheetRow[])[0];
  if (!gs || gs.status !== "published") return null;

  const { data: cgRows, error: cgErr } = await supabase
    .from("course_grades")
    .select("student_id, course_id, total_obtained, total_max, percentage, grade_label, grade_point, courses!inner(code, title, credits, semester_id)")
    .eq("student_id", studentId)
    .eq("courses.semester_id", semId);
  if (cgErr) throw cgErr;
  const grades = (cgRows ?? []) as unknown as CourseGradeRow[];
  const courses: TranscriptCourse[] = grades.map((g) => ({
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
  const profile = ((profileArr ?? []) as unknown as { roll_number: string; full_name: string }[])[0] ?? { roll_number: "", full_name: "" };

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

async function studentTranscript(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const semId = c.req.param("s");
  if (!semId) return c.json({ error: "missing_sem" }, 400);

  const input = await buildTranscript(supabase, semId, userId);
  if (!input) return c.json({ error: "not_found" }, 404);

  const bytes = await renderTranscriptPdf(input);
  const filename = `transcript-${input.student.rollNumber || "student"}-${input.semester.number}.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const studentTranscriptRoute = new Hono<AppEnv>().get("/transcript", studentTranscript);