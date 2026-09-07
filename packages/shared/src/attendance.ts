import { z } from "zod";

export const attendanceStatusSchema = z.enum(["present", "absent", "late"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// One entry in a bulk-mark request.
export const markAttendanceItemSchema = z.object({
  studentId: uuid,
  status: attendanceStatusSchema,
});
export type MarkAttendanceItem = z.infer<typeof markAttendanceItemSchema>;

// POST body — date is shared across the whole session.
export const bulkMarkAttendanceSchema = z.object({
  sessionDate: isoDate,
  entries: z.array(markAttendanceItemSchema).min(1).max(500),
});
export type BulkMarkAttendance = z.infer<typeof bulkMarkAttendanceSchema>;

// PATCH body — correcting a single row's status.
export const patchAttendanceSchema = z.object({
  status: attendanceStatusSchema,
});
export type PatchAttendance = z.infer<typeof patchAttendanceSchema>;

// Row returned by the API.
export interface AttendanceRow {
  id: string;
  courseId: string;
  studentId: string;
  sessionDate: string;
  status: AttendanceStatus;
  recordedBy: string;
  createdAt: string;
}

// Per-student rollup returned by /summary.
export interface AttendanceSummaryRow {
  studentId: string;
  total: number;
  present: number;
  late: number;
  absent: number;
  // Late counts as present (you showed up). Computed as (present + late) / total.
  percent: number;
}
