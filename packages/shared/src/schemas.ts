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

// POST /api/admin/users — create a user.
//
// A user is three rows: the auth account, the `profiles` row (made by the
// handle_new_user trigger, with the role hardcoded to 'student'), and the
// role satellite that carries the identity fields. The satellite tables have
// NOT NULL identity columns and nothing else in the app can fill them, so
// creating a user without one leaves them invisible to the rosters.
//
// The role decides which identity fields are required; the refinement below
// is where that is enforced, so the form and the API cannot disagree.
//
// The password is capped at 72 characters because bcrypt truncates there —
// a longer password would be silently cut to its first 72 bytes.
export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    name: z.string().trim().min(1).max(120),
    role: z.enum(["admin", "faculty", "student"]),
    password: z.string().min(8).max(72),
    rollNumber: z.string().trim().toUpperCase().min(1).max(40).optional(),
    admissionYear: z.number().int().min(2000).max(3000).optional(),
    employeeCode: z.string().trim().toUpperCase().min(1).max(40).optional(),
    department: z.string().trim().max(120).optional(),
    designation: z.string().trim().max(120).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "student") {
      if (v.rollNumber === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rollNumber"],
          message: "A student needs a roll number.",
        });
      }
      if (v.admissionYear === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["admissionYear"],
          message: "A student needs an admission year.",
        });
      }
      return;
    }
    if (v.employeeCode === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employeeCode"],
        message: "An employee code is required.",
      });
    }
  });
export type CreateUser = z.infer<typeof createUserSchema>;

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