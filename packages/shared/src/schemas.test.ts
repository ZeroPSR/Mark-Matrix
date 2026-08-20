import { describe, it, expect } from "vitest";
import {
  createBatchSchema,
  createProgramSchema,
  createSemesterSchema,
  createCourseSchema,
  createFacultyAssignmentSchema,
  createEnrollmentSchema,
  createStudentProfileSchema,
  createFacultyProfileSchema,
  createAdminProfileSchema,
  patchRoleSchema,
  bulkEnrollRowSchema,
  formatZodError,
} from "./schemas.js";

describe("createBatchSchema", () => {
  it("accepts a valid batch", () => {
    const r = createBatchSchema.safeParse({ name: "BCA 2023", startYear: 2023 });
    expect(r.success).toBe(true);
  });
  it("rejects a year outside 2000-3000", () => {
    const r = createBatchSchema.safeParse({ name: "X", startYear: 1999 });
    expect(r.success).toBe(false);
  });
  it("rejects empty name", () => {
    const r = createBatchSchema.safeParse({ name: "", startYear: 2023 });
    expect(r.success).toBe(false);
  });
});

describe("createProgramSchema", () => {
  it("accepts a valid program with a batchId uuid", () => {
    const r = createProgramSchema.safeParse({
      batchId: "11111111-1111-1111-1111-111111111111",
      code: "BCA",
      name: "Bachelor of Computer Applications",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a non-uuid batchId", () => {
    const r = createProgramSchema.safeParse({ batchId: "not-a-uuid", code: "X", name: "Y" });
    expect(r.success).toBe(false);
  });
});

describe("createSemesterSchema", () => {
  it("accepts a valid semester", () => {
    const r = createSemesterSchema.safeParse({
      programId: "11111111-1111-1111-1111-111111111111",
      number: 3,
    });
    expect(r.success).toBe(true);
  });
  it("rejects semester number 0 or 13", () => {
    expect(createSemesterSchema.safeParse({
      programId: "11111111-1111-1111-1111-111111111111", number: 0,
    }).success).toBe(false);
    expect(createSemesterSchema.safeParse({
      programId: "11111111-1111-1111-1111-111111111111", number: 13,
    }).success).toBe(false);
  });
});

describe("createCourseSchema", () => {
  it("accepts a valid course", () => {
    const r = createCourseSchema.safeParse({
      semesterId: "11111111-1111-1111-1111-111111111111",
      code: "BCA301",
      title: "Data Structures",
      credits: 4,
    });
    expect(r.success).toBe(true);
  });
  it("rejects credits outside 1..10", () => {
    const r = createCourseSchema.safeParse({
      semesterId: "11111111-1111-1111-1111-111111111111",
      code: "X", title: "Y", credits: 11,
    });
    expect(r.success).toBe(false);
  });
});

describe("createFacultyAssignmentSchema", () => {
  it("accepts a valid assignment", () => {
    const r = createFacultyAssignmentSchema.safeParse({
      facultyId: "11111111-1111-1111-1111-111111111111",
      courseId: "22222222-2222-2222-2222-222222222222",
    });
    expect(r.success).toBe(true);
  });
});

describe("createEnrollmentSchema", () => {
  it("accepts a valid enrollment", () => {
    const r = createEnrollmentSchema.safeParse({
      studentId: "11111111-1111-1111-1111-111111111111",
      semId: "22222222-2222-2222-2222-222222222222",
    });
    expect(r.success).toBe(true);
  });
});

describe("createStudentProfileSchema — roll number normalization", () => {
  it("normalizes roll number to uppercase after trimming", () => {
    const r = createStudentProfileSchema.safeParse({
      userId: "11111111-1111-1111-1111-111111111111",
      rollNumber: "  23bca001  ",
      admissionYear: 2023,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rollNumber).toBe("23BCA001");
  });
});

describe("createFacultyProfileSchema", () => {
  it("normalizes employee_code to uppercase", () => {
    const r = createFacultyProfileSchema.safeParse({
      userId: "11111111-1111-1111-1111-111111111111",
      employeeCode: "  emp-42  ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.employeeCode).toBe("EMP-42");
  });
});

describe("createAdminProfileSchema", () => {
  it("requires employeeCode", () => {
    const r = createAdminProfileSchema.safeParse({
      userId: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(false);
  });
});

describe("patchRoleSchema", () => {
  it("accepts admin/faculty/student", () => {
    for (const role of ["admin", "faculty", "student"] as const) {
      expect(patchRoleSchema.safeParse({ role }).success).toBe(true);
    }
  });
  it("rejects other strings", () => {
    expect(patchRoleSchema.safeParse({ role: "owner" }).success).toBe(false);
  });
  it("accepts an optional name patch", () => {
    expect(patchRoleSchema.safeParse({ name: "Alice" }).success).toBe(true);
  });
  it("rejects an empty patch", () => {
    expect(patchRoleSchema.safeParse({}).success).toBe(false);
  });
});

describe("bulkEnrollRowSchema", () => {
  it("accepts a roll number row", () => {
    const r = bulkEnrollRowSchema.safeParse({ rollNumber: "23BCA001" });
    expect(r.success).toBe(true);
  });
  it("normalizes roll number", () => {
    const r = bulkEnrollRowSchema.safeParse({ rollNumber: "  23bca001 " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rollNumber).toBe("23BCA001");
  });
  it("rejects missing roll number", () => {
    expect(bulkEnrollRowSchema.safeParse({}).success).toBe(false);
  });
});

describe("formatZodError", () => {
  it("returns one entry per issue, dot-joined path", () => {
    const r = createCourseSchema.safeParse({ semesterId: "x", code: "", title: "Y", credits: 0 });
    if (r.success) throw new Error("expected failure");
    const out = formatZodError(r.error);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.some((f) => f.path === "credits")).toBe(true);
    expect(out.every((f) => typeof f.message === "string" && f.message.length > 0)).toBe(true);
  });
});