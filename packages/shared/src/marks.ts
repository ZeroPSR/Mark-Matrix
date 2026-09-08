import { z } from "zod";

export const marksStatusSchema = z.enum(["draft", "submitted"]);
export type MarksStatus = z.infer<typeof marksStatusSchema>;

const uuid = z.string().uuid();

// One entry in a bulk upsert or single-row create.
export const upsertMarksItemSchema = z.object({
  studentId: uuid,
  examType: z.string().trim().min(1).max(40),
  // .finite() rejects NaN and ±Infinity; .nonnegative() rejects negatives.
  marksObtained: z.number().finite().nonnegative(),
});
export type UpsertMarksItem = z.infer<typeof upsertMarksItemSchema>;

// POST /marks body — bulk upsert.
export const upsertMarksSchema = z.object({
  entries: z.array(upsertMarksItemSchema).min(1).max(500),
});
export type UpsertMarks = z.infer<typeof upsertMarksSchema>;

// PATCH /marks/:id body.
export const patchMarksSchema = z.object({
  marksObtained: z.number().finite().nonnegative(),
});
export type PatchMarks = z.infer<typeof patchMarksSchema>;

// POST /marks/bulk body — CSV payload.
export const bulkMarksSchema = z.object({
  csv: z.string().min(1),
});
export type BulkMarks = z.infer<typeof bulkMarksSchema>;

// Row returned by the API.
export interface MarksRow {
  id: string;
  courseId: string;
  studentId: string;
  examType: string;
  marksObtained: number;
  maxMarks: number;
  status: MarksStatus;
  enteredBy: string;
  updatedAt: string;
}

// Bulk response shape.
export interface BulkMarksResponse {
  succeeded: number;
  errors: { row: number; rollNumber?: string; reason: string }[];
}
