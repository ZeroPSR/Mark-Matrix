import { z } from "zod";

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Report types ---------------------------------------------------------------

export const passRateReportSchema = z.object({
  courseId: z.string().uuid(),
  total: z.number().int().min(0),
  passing: z.number().int().min(0),
  rate: z.number().min(0).max(100),
});
export type PassRateReport = z.infer<typeof passRateReportSchema>;

export const topperRowSchema = z.object({
  studentId: z.string().uuid(),
  rollNumber: z.string(),
  totalObtained: z.number(),
  totalMax: z.number(),
  percentage: z.number(),
  gradeLabel: z.string(),
  gradePoint: z.number(),
});
export type TopperRow = z.infer<typeof topperRowSchema>;

export const attendanceShortageRowSchema = z.object({
  studentId: z.string().uuid(),
  rollNumber: z.string(),
  presentCount: z.number().int().min(0),
  totalSessions: z.number().int().min(0),
  percentage: z.number().min(0).max(100),
});
export type AttendanceShortageRow = z.infer<typeof attendanceShortageRowSchema>;

export const semSummaryRowSchema = z.object({
  courseId: z.string().uuid(),
  courseCode: z.string(),
  courseTitle: z.string(),
  enrolled: z.number().int().min(0),
  graded: z.number().int().min(0),
  passing: z.number().int().min(0),
  passRate: z.number().min(0).max(100),
  avgPercentage: z.number().min(0).max(100),
  avgGradePoint: z.number().min(0).max(10),
});
export type SemSummaryRow = z.infer<typeof semSummaryRowSchema>;

// Query-param schemas ---------------------------------------------------------

export const topLimitSchema = z.coerce.number().int().min(1).max(50).default(5);
export const attendanceThresholdSchema = z.coerce.number().min(0).max(100).default(75);

// Pure compute helpers --------------------------------------------------------

export function computePassRate(rows: { isPassing: boolean }[]): { total: number; passing: number; rate: number } {
  const total = rows.length;
  const passing = rows.filter((r) => r.isPassing).length;
  const rate = total === 0 ? 0 : round2((passing / total) * 100);
  return { total, passing, rate };
}

/**
 * Stable top-N by descending `by(item)`. Ties broken by the input index so
 * the result is fully deterministic regardless of the underlying sort.
 */
export function topN<T>(items: T[], by: (t: T) => number, limit: number): T[] {
  const indexed = items.map((item, i) => ({ item, score: by(item), i }));
  indexed.sort((a, b) => b.score - a.score || a.i - b.i);
  return indexed.slice(0, Math.max(0, limit)).map((x) => x.item);
}

export function computeAttendancePct(present: number, total: number): number {
  if (total === 0) return 0;
  return round2((present / total) * 100);
}