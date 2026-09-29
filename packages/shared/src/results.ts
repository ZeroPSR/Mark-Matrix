import { z } from "zod";

// Status enums ---------------------------------------------------------------

export const gradesheetStatusSchema = z.enum([
  "draft",
  "compiled",
  "locked",
  "published",
]);
export type GradesheetStatus = z.infer<typeof gradesheetStatusSchema>;

// Unlock requests — admin must provide a non-empty reason.
export const unlockMarksSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});
export type UnlockMarks = z.infer<typeof unlockMarksSchema>;

export const unlockGradesheetSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});
export type UnlockGradesheet = z.infer<typeof unlockGradesheetSchema>;

// Response types -------------------------------------------------------------

export interface CompileGradesheetStudentResult {
  studentId: string;
  sgpa: number;
  courseCount: number;
  totalCredits: number;
}

export interface CompileGradesheetResponse {
  compiled: number;
  incompleteCourses: { courseId: string; courseCode: string }[];
  students: CompileGradesheetStudentResult[];
}

export interface LockGradesheetResponse {
  locked: number;
}

export interface PublishGradesheetResponse {
  published: number;
}

export interface UnlockGradesheetResponse {
  unlocked: number;
}

export interface GradesheetRow {
  id: string;
  semId: string;
  studentId: string;
  status: GradesheetStatus;
  sgpa: number | null;
  totalCredits: number | null;
  courseCount: number | null;
  compiledAt: string | null;
  compiledBy: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  unlockReason: string | null;
  unlockedBy: string | null;
  unlockedAt: string | null;
}

export interface ScoreRow {
  id: string;
  studentId: string;
  programId: string;
  cgpa: number;
  semesterCount: number;
  totalCredits: number | null;
  computedAt: string;
}