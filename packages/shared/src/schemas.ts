import { z } from "zod";

const uuid = z.string().uuid();

export const createBatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  startYear: z.number().int().min(2000).max(3000),
});
export type CreateBatch = z.infer<typeof createBatchSchema>;

export const patchBatchSchema = createBatchSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "no_fields" },
);
export type PatchBatch = z.infer<typeof patchBatchSchema>;

export const createProgramSchema = z.object({
  batchId: uuid,
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
});
export type CreateProgram = z.infer<typeof createProgramSchema>;
export const patchProgramSchema = createProgramSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "no_fields" },
);
export type PatchProgram = z.infer<typeof patchProgramSchema>;

export const createSemesterSchema = z.object({
  programId: uuid,
  number: z.number().int().min(1).max(12),
});
export type CreateSemester = z.infer<typeof createSemesterSchema>;
export const patchSemesterSchema = createSemesterSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "no_fields" },
);
export type PatchSemester = z.infer<typeof patchSemesterSchema>;

export const createCourseSchema = z.object({
  semesterId: uuid,
  code: z.string().trim().min(1).max(20),
  title: z.string().trim().min(1).max(200),
  credits: z.number().int().min(1).max(10),
});
export type CreateCourse = z.infer<typeof createCourseSchema>;
export const patchCourseSchema = createCourseSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "no_fields" },
);
export type PatchCourse = z.infer<typeof patchCourseSchema>;

export const createFacultyAssignmentSchema = z.object({
  facultyId: uuid,
  courseId: uuid,
});
export type CreateFacultyAssignment = z.infer<typeof createFacultyAssignmentSchema>;

export const createEnrollmentSchema = z.object({
  studentId: uuid,
  semId: uuid,
});
export type CreateEnrollment = z.infer<typeof createEnrollmentSchema>;

// Satellites — identity required, NOT NULL. Cycle 1 created the parent profile
// row at handle_new_user; the admin assigns identity here.
export const createStudentProfileSchema = z.object({
  userId: uuid,
  rollNumber: z.string().trim().toUpperCase().min(1).max(40),
  admissionYear: z.number().int().min(2000).max(3000),
});
export type CreateStudentProfile = z.infer<typeof createStudentProfileSchema>;

export const createFacultyProfileSchema = z.object({
  userId: uuid,
  employeeCode: z.string().trim().toUpperCase().min(1).max(40),
  department: z.string().trim().max(120).optional(),
  designation: z.string().trim().max(120).optional(),
});
export type CreateFacultyProfile = z.infer<typeof createFacultyProfileSchema>;

export const createAdminProfileSchema = z.object({
  userId: uuid,
  employeeCode: z.string().trim().toUpperCase().min(1).max(40),
  designation: z.string().trim().max(120).optional(),
});
export type CreateAdminProfile = z.infer<typeof createAdminProfileSchema>;

// PATCH /api/admin/users/:userId — role change is the only way to make
// someone faculty or admin. Name is optional and may be edited by admin.
export const patchRoleSchema = z
  .object({
    role: z.enum(["admin", "faculty", "student"]).optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => v.role !== undefined || v.name !== undefined, {
    message: "no_fields",
  });
export type PatchRole = z.infer<typeof patchRoleSchema>;

// Bulk CSV row — roll number only. batch_id/program_id are derived server-side
// from the semId on the surrounding request.
export const bulkEnrollRowSchema = z.object({
  rollNumber: z.string().trim().toUpperCase().min(1).max(40),
});
export type BulkEnrollRow = z.infer<typeof bulkEnrollRowSchema>;

export function formatZodError(
 error: z.ZodError,
): { path: string; message: string }[] {
 return error.issues.map((issue) => ({
   path: issue.path.length === 0 ? "(root)" : issue.path.join("."),
   message: issue.message,
 }));
}