import { z } from "zod";

export type AuditAction =
  | "create" | "update" | "delete"
  | "submit" | "approve" | "lock" | "unlock"
  | "compile" | "publish";

export type AuditEntity =
  | "attendance"
  | "marks"
  | "gradesheet"
  | "enrollment"
  | "faculty_assignment"
  | "user"
  | "grade_scheme";

export const auditLogListQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  entity: z.enum([
    "attendance",
    "marks",
    "gradesheet",
    "enrollment",
    "faculty_assignment",
    "user",
    "grade_scheme",
  ] satisfies [AuditEntity, ...AuditEntity[]]).optional(),
  action: z.enum([
    "create",
    "update",
    "delete",
    "submit",
    "approve",
    "lock",
    "unlock",
    "compile",
    "publish",
  ] satisfies [AuditAction, ...AuditAction[]]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;

export const auditLogRowSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  user_id: z.string().uuid(),
  action: z.string(),
  entity: z.string(),
  entity_id: z.string(),
  old_value: z.unknown().nullable(),
  new_value: z.unknown().nullable(),
});

export type AuditLogRow = z.infer<typeof auditLogRowSchema>;

export const auditLogListResponseSchema = z.object({
  data: z.array(auditLogRowSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;
