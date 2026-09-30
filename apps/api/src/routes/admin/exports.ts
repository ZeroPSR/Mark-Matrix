import { Hono, type Context } from "hono";
import {
  toCsv,
  formatZodError,
  topLimitSchema,
  attendanceThresholdSchema,
} from "@mark-matrix/shared";
import {
  getPassRateForCourse,
  getToppersForCourse,
  getAttendanceShortageForCourse,
  getSemSummary,
} from "../../lib/analyticsRepo.js";
import { renderTranscriptPdf } from "../../lib/transcriptPdf.js";
import { buildTranscriptForExport } from "./transcriptExport.js";
import type { AppEnv } from "../../env.js";

type Ctx = Context<AppEnv>;

const csv = (filename: string, rows: (string | number | null)[][]): Response => {
  const body = toCsv(rows);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};

async function passRateCsv(c: Ctx): Promise<Response> {
  const courseId = c.req.param("c");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const r = await getPassRateForCourse(c.get("supabase"), courseId);
  return csv(`pass-rate-${courseId}.csv`, [
    ["course_id", "total", "passing", "rate"],
    [r.courseId, r.total, r.passing, r.rate],
  ]);
}

async function toppersCsv(c: Ctx): Promise<Response> {
  const courseId = c.req.param("c");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const parsed = topLimitSchema.safeParse({ limit: c.req.query("limit") });
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const rows = await getToppersForCourse(c.get("supabase"), courseId, parsed.data.limit);
  return csv(`toppers-${courseId}.csv`, [
    ["roll_number", "total_obtained", "total_max", "percentage", "grade_label", "grade_point"],
    ...rows.map((r) => [r.rollNumber, r.totalObtained, r.totalMax, r.percentage, r.gradeLabel, r.gradePoint]),
  ]);
}

async function attendanceShortageCsv(c: Ctx): Promise<Response> {
  const courseId = c.req.param("c");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const parsed = attendanceThresholdSchema.safeParse({ threshold: c.req.query("threshold") });
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const rows = await getAttendanceShortageForCourse(c.get("supabase"), courseId, parsed.data.threshold);
  return csv(`attendance-shortage-${courseId}.csv`, [
    ["roll_number", "present_count", "total_sessions", "percentage"],
    ...rows.map((r) => [r.rollNumber, r.presentCount, r.totalSessions, r.percentage]),
  ]);
}

async function summaryCsv(c: Ctx): Promise<Response> {
  const semId = c.req.param("s");
  if (!semId) return c.json({ error: "missing_sem" }, 400);
  const rows = await getSemSummary(c.get("supabase"), semId);
  return csv(`summary-${semId}.csv`, [
    ["course_code", "course_title", "enrolled", "graded", "passing", "pass_rate", "avg_percentage", "avg_grade_point"],
    ...rows.map((r) => [r.courseCode, r.courseTitle, r.enrolled, r.graded, r.passing, r.passRate, r.avgPercentage, r.avgGradePoint]),
  ]);
}

async function transcriptPdfExport(c: Ctx): Promise<Response> {
  const semId = c.req.param("s");
  const studentId = c.req.param("studentId");
  if (!semId || !studentId) return c.json({ error: "missing_sem_or_student" }, 400);

  const input = await buildTranscriptForExport(c.get("supabase"), semId, studentId);
  if (!input) return c.json({ error: "not_found" }, 404);

  const bytes = await renderTranscriptPdf(input);
  const filename = `transcript-${input.student.rollNumber || studentId}-${input.semester.number}.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const adminExportsRoute = new Hono<AppEnv>()
  .get("/course/:c/analytics/pass-rate/export.csv", passRateCsv)
  .get("/course/:c/analytics/toppers/export.csv", toppersCsv)
  .get("/course/:c/analytics/attendance-shortage/export.csv", attendanceShortageCsv)
  .get("/analytics/summary/export.csv", summaryCsv)
  .get("/student/:studentId/transcript/export.pdf", transcriptPdfExport);