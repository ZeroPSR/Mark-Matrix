# Cycle 2 — Academic Structure Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Admin-controlled `batch → program → sem → course` hierarchy with role-satellite profile tables, faculty assignments, student enrollments (single + bulk CSV), RLS scoping, and Admin React pages.

**Architecture:** Five SQL migrations (one is a cycle-1 fix) introduce the schema, composite FKs that make a mismatched tuple unrepresentable, two trigger functions for role consistency, and RLS policies via `SECURITY DEFINER` helpers. A Hono API exposes CRUD over flat resource routes under the existing `requireRole` guards, all routed through the per-request RLS-bound Supabase client. A small hand-rolled CSV parser lives in `shared` so the web app pre-validates and the API re-validates. The web app gains a drill-down hierarchy page, a users page that creates role-satellite rows and promotes users, an assignments page, an enrollments page with CSV upload, and a faculty courses page that demonstrates the RLS scope.

**Tech Stack:** Hono on Cloudflare Workers, Supabase (Postgres + PostgREST + RLS), React 18 + Vite, vitest + `@cloudflare/vitest-pool-workers`, zod, hand-rolled RFC4180-ish CSV parser.

**Spec:** [docs/superpowers/specs/2026-08-20-cycle-2-academic-structure-design.md](../specs/2026-08-20-cycle-2-academic-structure-design.md)

---

## Global Constraints

These apply to every task. Copied from the spec and CLAUDE.md.

- **Node** ≥ 20; use `node:` protocol for built-ins.
- **TypeScript strict mode** (`tsconfig.base.json`); `noUncheckedIndexedAccess` is on — treat `arr[i]` as `T | undefined`.
- **Imports** — `@mark-matrix/shared` for cross-package code. `import type` for type-only imports.
- **Prettier** — 2 spaces, double quotes, trailing commas. **ESLint v9 flat config.**
- **Vitest** — `apps/api/src/**/*.test.ts`, `apps/web/src/**/*.test.{ts,tsx}`. Setup files and pool are pre-wired.
- **Tests** — Workspace tests live next to source as `*.test.ts(x)`.
- **Naming** — `PascalCase` components/types, `camelCase` functions/variables, `SCREAMING_SNAKE_CASE` constants.
- **Hono middleware** — `supabaseAuth` for `/api/*`, `requireRole("admin")` for `/api/admin/*`. New in this cycle: `requireRole("faculty")` for `/api/faculty/*`, `requireRole("student")` for `/api/student/*`.
- **Client choice** — Handlers MUST use `c.get("supabase")` (RLS-bound). The service-role overload of `getSupabase` stays unused this cycle.
- **HTTP error contract** — `400 validation_failed`, `403 forbidden`, `404 not_found`, `409 invalid_reference` / `has_dependents` / `duplicate`, `500 internal_error`.
- **TDD** — Failing test first, then minimal implementation, then green, then commit. Each commit is a logical checkpoint that survives `pnpm lint && pnpm typecheck && pnpm test`.
- **Conventional commits** with the `feat:`, `fix:`, `test:`, `docs:` prefixes already used in this repo.

---

## File Structure

### Created in `packages/shared`

| Path | Purpose |
|---|---|
| `src/schemas.ts` | All zod schemas + inferred TypeScript types for academic, profile, assignment, enrollment entities. Exports `formatZodError`. |
| `src/csv.ts` | `parseCsv(text)` RFC4180-ish parser and `parseEnrollCsv(text)` for the bulk-enroll CSV shape. |
| `src/routes.ts` | Typed `API_ROUTES` map additions — every new endpoint path as a constant. |
| `src/index.ts` | Re-export everything new. |
| `src/schemas.test.ts` | Schema tests. |
| `src/csv.test.ts` | CSV parser tests. |

### Created in `apps/api/src`

| Path | Purpose |
|---|---|
| `lib/pgErrors.ts` | Maps PostgREST/PG error codes to the §5.1 error contract. |
| `lib/crudFactory.ts` | Generic factory for the 4 entity × 5 handler resources. |
| `routes/admin/batches.ts` | CRUD over `batches`. |
| `routes/admin/programs.ts` | CRUD over `programs`. |
| `routes/admin/semesters.ts` | CRUD over `semesters`. |
| `routes/admin/courses.ts` | CRUD over `courses`. |
| `routes/admin/roleProfiles.ts` | CRUD over `student_profiles`, `faculty_profiles`, `admin_profiles`. |
| `routes/admin/facultyAssignments.ts` | Faculty assignments resource. |
| `routes/admin/enrollments.ts` | Single enrollment + `DELETE`. |
| `routes/admin/bulkEnroll.ts` | `POST /api/admin/enrollments/bulk`. |
| `routes/admin/users.ts` | **Extends** cycle-1's users route with `PATCH /:userId`. |
| `routes/faculty/courses.ts` | `GET /api/faculty/courses`. |
| `routes/student/enrollment.ts` | `GET /api/student/enrollment`. |
| `tests/academic.crud.test.ts` | Each entity's handlers against mocked Supabase. |
| `tests/academic.rbac.test.ts` | Table-driven: every mutating route × role → status. |
| `tests/bulkEnroll.test.ts` | CSV body parsing, partial-success semantics. |
| `tests/rls.academic.test.ts` | Gated RLS integration tests. |

### Modified in `apps/api/src`

| Path | Change |
|---|---|
| `index.ts` | Mounts all new routes; adds the two new `requireRole` guards. |
| `env.ts` | **No change** — `AppEnv` already carries `supabase`, `userId`, `role`. |
| `routes/admin/users.ts` | Adds `PATCH /:userId`. |

### Created in `apps/web/src`

| Path | Purpose |
|---|---|
| `lib/api.ts` | `apiFetch(path, init)` wrapper attaching the Supabase access token and base URL. |
| `lib/useResource.ts` | Tiny `useState`/`useEffect` data hook — no react-query. |
| `pages/admin/AcademicStructurePage.tsx` | Drill-down master-detail. |
| `pages/admin/UsersPage.tsx` | Lists users, changes role, manages satellites. **Replaces `UsersPlaceholder`.** |
| `pages/admin/AssignmentsPage.tsx` | Faculty assignments. |
| `pages/admin/EnrollmentsPage.tsx` | Single enroll + CSV upload. |
| `pages/admin/components/EntityPanel.tsx` | Reusable list + inline create/edit form + delete. |
| `pages/admin/components/CsvEnrollUpload.tsx` | Drop zone, preview, server report. |
| `pages/faculty/FacultyCoursesPage.tsx` | **Replaces `FacultyPlaceholder`.** |
| `tests/CsvEnrollUpload.test.tsx` | Preview + report rendering. |
| `tests/AcademicStructurePage.test.tsx` | Drill-down + `409` surfacing. |

### Modified in `apps/web/src`

| Path | Change |
|---|---|
| `App.tsx` | Mounts new pages, removes `UsersPlaceholder`/`FacultyPlaceholder` imports. |
| `shell/navConfig.ts` | New entries for admin structure/users/assignments/enrollments and faculty courses. |
| `styles.css` | New BEM-ish classes for tables, forms, drill-down panels, upload zone. |

### Created in `supabase/migrations`

| File | Timestamp |
|---|---|
| `20260820100000_role_profiles.sql` | Satellites + `assert_profile_role` trigger. |
| `20260820100001_academic_structure.sql` | `batches`, `programs`, `semesters`, `courses` + `set_updated_at`. |
| `20260820100002_assignments_enrollments.sql` | `faculty_assignments`, `student_enrollments`. |
| `20260820100003_academic_rls.sql` | Helper functions + policies + grants. |
| `20260820100004_profiles_admin_only_writes.sql` | Drops `profiles_update_own`. |

### Modified outside source

| Path | Change |
|---|---|
| `packages/shared/package.json` | Add `zod ^3.23.0` to dependencies. |
| `scripts/seed-test-users.ts` | After creating profiles, create matching satellite rows for the test users. |
| `docs/superpowers/specs/2026-08-20-cycle-2-academic-structure-design.md` | Already exists. |
| `.docs/cycle-2-testing.md` | New runbook covering gated RLS tests for cycle-2 tables. |

---

## Phase 1 — Shared package

### Task 1: Add zod to shared and create API_ROUTES entries

**Files:**
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/routes.ts`

**Interfaces:**
- `API_ROUTES` gains every path consumed by this cycle's API and web apps.

The `noUncheckedIndexedAccess` flag means `arr[i]` is `T | undefined`, which causes verbose narrowing at every consumer. The API_ROUTES object is keyed by known string keys, so callers always access it with literal keys — TS still returns the union type for that access (because the key itself is a literal, not `keyof API_ROUTES`), so no narrowing is needed at call sites.

- [ ] **Step 1: Add zod to `packages/shared/package.json`**

Current `packages/shared/package.json` lists no runtime dependencies and only `typescript` and `vitest` in `devDependencies`. Change it to:

```json
{
  "name": "@mark-matrix/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install**

Run from repo root: `pnpm install`. Expected: `zod` appears in `node_modules/zod` and `pnpm-lock.yaml` is updated.

- [ ] **Step 3: Create `packages/shared/src/routes.ts`**

```ts
// Cycle 2 route additions. The cycle-1 entries live in src/index.ts.
// Add this file and re-export it from src/index.ts.

export const ROUTES_CYCLE_2 = {
  // Admin — batch/program/sem/course CRUD
  adminBatches: "/api/admin/batches",
  adminBatchById: (id: string): string => `/api/admin/batches/${id}`,
  adminPrograms: "/api/admin/programs",
  adminProgramById: (id: string): string => `/api/admin/programs/${id}`,
  adminSemesters: "/api/admin/semesters",
  adminSemesterById: (id: string): string => `/api/admin/semesters/${id}`,
  adminCourses: "/api/admin/courses",
  adminCourseById: (id: string): string => `/api/admin/courses/${id}`,

  // Admin — users (PATCH :userId is the role-change endpoint)
  adminUsers: "/api/admin/users",
  adminUserById: (id: string): string => `/api/admin/users/${id}`,

  // Admin — role satellites
  adminStudents: "/api/admin/students",
  adminStudentById: (id: string): string => `/api/admin/students/${id}`,
  adminFaculty: "/api/admin/faculty",
  adminFacultyById: (id: string): string => `/api/admin/faculty/${id}`,
  adminAdmins: "/api/admin/admins",
  adminAdminById: (id: string): string => `/api/admin/admins/${id}`,

  // Admin — assignments
  adminFacultyAssignments: "/api/admin/faculty-assignments",
  adminFacultyAssignmentById: (id: string): string =>
    `/api/admin/faculty-assignments/${id}`,

  // Admin — enrollments
  adminEnrollments: "/api/admin/enrollments",
  adminEnrollmentById: (id: string): string =>
    `/api/admin/enrollments/${id}`,
  adminBulkEnroll: "/api/admin/enrollments/bulk",

  // Faculty
  facultyCourses: "/api/faculty/courses",

  // Student
  studentEnrollment: "/api/student/enrollment",
} as const;
```

- [ ] **Step 4: Wire into `packages/shared/src/index.ts`**

Current `index.ts` exports `ROLES`, `API_ROUTES`, etc. Add `export * from "./routes.js";` at the bottom so both the existing `API_ROUTES` and the new `ROUTES_CYCLE_2` are available.

- [ ] **Step 5: Typecheck and test**

Run: `pnpm --filter @mark-matrix/shared typecheck && pnpm --filter @mark-matrix/shared test`. Expected: PASS (no new tests yet).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/package.json packages/shared/src/routes.ts packages/shared/src/index.ts pnpm-lock.yaml
git commit -m "feat(shared): add zod dependency, cycle-2 API routes"
```

---

### Task 2: Create zod schemas for academic entities

**Files:**
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/schemas.test.ts`

**Interfaces:**
- `formatZodError(error: z.ZodError): { path: string; message: string }[]` — used by every API handler that calls `safeParse`.
- Each schema and its `z.infer` type is consumed by both the API (validation) and the web (form types).

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/schemas.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `pnpm --filter @mark-matrix/shared test`. Expected: FAIL with "Cannot find module './schemas.js'".

- [ ] **Step 3: Implement `packages/shared/src/schemas.ts`**

```ts
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
```

- [ ] **Step 4: Re-export from `packages/shared/src/index.ts`**

Add `export * from "./schemas.js";` at the bottom.

- [ ] **Step 5: Run tests — verify they pass**

Run: `pnpm --filter @mark-matrix/shared test`. Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @mark-matrix/shared typecheck`.

```bash
git add packages/shared/src/schemas.ts packages/shared/src/schemas.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): zod schemas for academic, profile, enrollment entities"
```

---

### Task 3: Hand-rolled CSV parser

**Files:**
- Create: `packages/shared/src/csv.ts`
- Create: `packages/shared/src/csv.test.ts`

**Interfaces:**
- `parseCsv(text: string): string[][]` — RFC4180-ish: quoted fields, embedded commas/newlines, CRLF or LF, optional BOM, ragged trailing rows preserved, empty input → `[]`. Header row and data rows are returned together; the caller decides what is data.
- `parseEnrollCsv(text: string): { rows: { row: number; rollNumber: string }[]; errors: { row: number; reason: string }[] }` — header lookup case-insensitive, blank lines skipped, exact column set is `roll_number`.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/csv.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCsv, parseEnrollCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n4,5,6\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });
  it("handles quoted fields with embedded commas", () => {
    expect(parseCsv('a,b\n"1, 2",3\n')).toEqual([["a", "b"], ["1, 2", "3"]]);
  });
  it("handles quoted fields with embedded newlines", () => {
    expect(parseCsv('a,b\n"line1\nline2",x\n')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });
  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("strips a UTF-8 BOM if present", () => {
    expect(parseCsv("﻿a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
  it("returns a single-row result for header-only input", () => {
    expect(parseCsv("a,b,c\n")).toEqual([["a", "b", "c"]]);
  });
  it("preserves ragged trailing rows", () => {
    expect(parseCsv("a,b\n1,2,3\n4\n")).toEqual([
      ["a", "b"],
      ["1", "2", "3"],
      ["4"],
    ]);
  });
  it("treats double-quotes inside a quoted field as an escaped quote", () => {
    expect(parseCsv('a\n"he said ""hi"""\n')).toEqual([["a"], ['he said "hi"']]);
  });
});

describe("parseEnrollCsv", () => {
  it("returns the row index (1-based) and roll_number for valid rows", () => {
    const r = parseEnrollCsv("roll_number\n23BCA001\n23BCA002\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { row: 2, rollNumber: "23BCA001" },
      { row: 3, rollNumber: "23BCA002" },
    ]);
  });
  it("normalizes roll_number to uppercase and trims", () => {
    const r = parseEnrollCsv("roll_number\n  23bca001 \n");
    expect(r.rows[0]?.rollNumber).toBe("23BCA001");
  });
  it("matches the header case-insensitively by name", () => {
    const r = parseEnrollCsv("ROLL_NUMBER\n23BCA001\n");
    expect(r.rows).toHaveLength(1);
  });
  it("reports missing_required_column when no roll_number column exists", () => {
    const r = parseEnrollCsv("foo\n1\n");
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]?.reason).toBe("missing_required_column");
  });
  it("skips blank lines silently", () => {
    const r = parseEnrollCsv("roll_number\n\n23BCA001\n\n");
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
  });
  it("reports validation_failed for an empty roll number with a row number", () => {
    const r = parseEnrollCsv("roll_number\n\n");
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]?.reason).toBe("validation_failed");
    expect(r.errors[0]?.row).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `pnpm --filter @mark-matrix/shared test`. Expected: FAIL with "Cannot find module './csv.js'".

- [ ] **Step 3: Implement `packages/shared/src/csv.ts`**

```ts
// RFC4180-ish CSV parser — quoted fields, embedded commas/newlines, CRLF or
// LF, optional BOM, ragged trailing rows preserved. Empty input yields [].
//
// Embedded newlines are intentionally preserved inside quoted fields, so a single
// logical row can span multiple physical lines. The caller cannot assume line
// count == row count.

export function parseCsv(text: string): string[][] {
  if (text.length === 0) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") {
        pushRow();
        i += 2;
        continue;
      }
      pushRow();
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

export interface ParsedEnrollRow {
  row: number;
  rollNumber: string;
}
export interface ParsedEnrollError {
  row: number;
  reason: string;
}
export interface ParsedEnrollCsv {
  rows: ParsedEnrollRow[];
  errors: ParsedEnrollError[];
}

export function parseEnrollCsv(text: string): ParsedEnrollCsv {
  const all = parseCsv(text);
  if (all.length === 0) return { rows: [], errors: [] };

  const header = all[0] ?? [];
  const rollIdx = header.findIndex(
    (h) => h.trim().toLowerCase() === "roll_number",
  );
  if (rollIdx === -1) {
    return { rows: [], errors: [{ row: 1, reason: "missing_required_column" }] };
  }

  const out: ParsedEnrollCsv = { rows: [], errors: [] };
  for (let r = 1; r < all.length; r++) {
    const line = all[r] ?? [];
    if (line.length === 1 && line[0] === "") continue; // blank line
    const raw = line[rollIdx];
    if (raw === undefined) {
      out.errors.push({ row: r + 1, reason: "validation_failed" });
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      out.errors.push({ row: r + 1, reason: "validation_failed" });
      continue;
    }
    out.rows.push({ row: r + 1, rollNumber: trimmed.toUpperCase() });
  }
  return out;
}
```

- [ ] **Step 4: Re-export from `packages/shared/src/index.ts`**

Add `export * from "./csv.js";` at the bottom.

- [ ] **Step 5: Run tests — verify they pass**

Run: `pnpm --filter @mark-matrix/shared test`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/csv.ts packages/shared/src/csv.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): hand-rolled RFC4180-ish CSV parser + enroll helper"
```

---

## Phase 2 — Database migrations

### Task 4: Migration — role-satellite tables and triggers

**Files:**
- Create: `supabase/migrations/20260820100000_role_profiles.sql`

**Interfaces:**
- `public.assert_profile_role(expected public.user_role) returns trigger` — fires `BEFORE INSERT OR UPDATE OF user_id` on each satellite, raises `23503` if the user's profile row is missing and `23514` if the role doesn't match.
- `public.block_role_change_with_satellite() returns trigger` — fires `BEFORE UPDATE OF role` on `profiles`, raises `23514` if a satellite row exists for that user.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260820100000_role_profiles.sql`:

```sql
-- 20260820100000_role_profiles.sql
-- Role-satellite profile tables (student_profiles, faculty_profiles,
-- admin_profiles) plus two trigger functions enforcing role consistency.

create table public.student_profiles (
  user_id        uuid primary key
                 references public.profiles(user_id) on delete cascade,
  roll_number    text not null unique,
  admission_year integer not null check (admission_year between 2000 and 3000)
);

create table public.faculty_profiles (
  user_id       uuid primary key
                references public.profiles(user_id) on delete cascade,
  employee_code text not null unique,
  department    text,
  designation   text
);

create table public.admin_profiles (
  user_id       uuid primary key
                references public.profiles(user_id) on delete cascade,
  employee_code text not null unique,
  designation   text
);

-- Single parameterized trigger reused by all three satellites.
create or replace function public.assert_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected public.user_role := tg_argv[0]::public.user_role;
  v_actual   public.user_role;
begin
  select role into v_actual
    from public.profiles
   where user_id = new.user_id;

  if v_actual is null then
    raise exception 'no profile exists for user %', new.user_id
      using errcode = '23503';
  end if;

  if v_actual <> v_expected then
    raise exception 'user % has role %, expected %',
      new.user_id, v_actual, v_expected
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger student_profiles_role_check
  before insert or update of user_id on public.student_profiles
  for each row execute function public.assert_profile_role('student');

create trigger faculty_profiles_role_check
  before insert or update of user_id on public.faculty_profiles
  for each row execute function public.assert_profile_role('faculty');

create trigger admin_profiles_role_check
  before insert or update of user_id on public.admin_profiles
  for each row execute function public.assert_profile_role('admin');

-- Paired trigger guarding the OTHER direction: prevent changing profiles.role
-- while a satellite row still exists for the user.
create or replace function public.block_role_change_with_satellite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and (exists (select 1 from public.student_profiles where user_id = old.user_id)
       or exists (select 1 from public.faculty_profiles where user_id = old.user_id)
       or exists (select 1 from public.admin_profiles   where user_id = old.user_id))
  then
    raise exception
      'cannot change role for % while a role profile exists', old.user_id
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger profiles_block_role_change
  before update of role on public.profiles
  for each row execute function public.block_role_change_with_satellite();

-- RLS — admin full, owner SELECT. Mirrors cycle 1's profiles pattern.
alter table public.student_profiles enable row level security;
alter table public.faculty_profiles enable row level security;
alter table public.admin_profiles   enable row level security;

create policy student_profiles_select_own on public.student_profiles
  for select to authenticated using (user_id = auth.uid());
create policy student_profiles_admin_all on public.student_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy faculty_profiles_select_own on public.faculty_profiles
  for select to authenticated using (user_id = auth.uid());
create policy faculty_profiles_admin_all on public.faculty_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy admin_profiles_select_own on public.admin_profiles
  for select to authenticated using (user_id = auth.uid());
create policy admin_profiles_admin_all on public.admin_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Apply locally and verify**

Run from repo root: `pnpm db:reset`. Expected: all migrations apply cleanly. Then:

```bash
psql "$SUPABASE_DB_URL" -c "
  select user_id from public.student_profiles;
  select user_id from public.faculty_profiles;
  select user_id from public.admin_profiles;
"
```

Expected: empty results.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260820100000_role_profiles.sql
git commit -m "feat(db): role-satellite tables + role-check triggers"
```

---

### Task 5: Migration — academic structure (batches, programs, semesters, courses)

**Files:**
- Create: `supabase/migrations/20260820100001_academic_structure.sql`

**Interfaces:**
- `public.set_updated_at() returns trigger` — shared `BEFORE UPDATE` `set_updated_at` trigger function; created with `create or replace` so the migration is safe regardless of cycle-1 state.
- Hierarchy: `batches` → `programs` → `semesters` → `courses`. The `unique (id, <parent>)` constraints are FK targets for `student_enrollments`' composite FKs.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260820100001_academic_structure.sql`:

```sql
-- 20260820100001_academic_structure.sql
-- batch → program → sem → course hierarchy.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.batches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  start_year integer not null check (start_year between 2000 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger batches_set_updated_at
  before update on public.batches
  for each row execute function public.set_updated_at();

create table public.programs (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.batches(id) on delete restrict,
  code       text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, code),
  unique (id, batch_id)
);
create index programs_batch_id_idx on public.programs (batch_id);

create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

create table public.semesters (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  number     integer not null check (number between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, number),
  unique (id, program_id)
);
create index semesters_program_id_idx on public.semesters (program_id);

create trigger semesters_set_updated_at
  before update on public.semesters
  for each row execute function public.set_updated_at();

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  code        text not null,
  title       text not null,
  credits     integer not null check (credits between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (semester_id, code),
  unique (id, semester_id)
);
create index courses_semester_id_idx on public.courses (semester_id);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Apply locally**

Run: `pnpm db:reset`. Expected: all migrations apply cleanly.

- [ ] **Step 3: Smoke test — verify cascade behavior in dev**

```bash
psql "$SUPABASE_DB_URL" <<'SQL'
insert into batches (name, start_year) values ('BCA 2023', 2023) returning id \gset
insert into programs (batch_id, code, name) values (:'id', 'BCA', 'Bachelor of Computer Applications');
SQL
```

Then attempt to delete the batch — expect `23503`:

```bash
psql "$SUPABASE_DB_URL" <<'SQL'
delete from batches where name = 'BCA 2023';
SQL
```

Expected: ERROR with code `23503` and a message mentioning `programs_batch_id_fkey` (or similar).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260820100001_academic_structure.sql
git commit -m "feat(db): batch/program/sem/course hierarchy + updated_at trigger"
```

---

### Task 6: Migration — faculty assignments and student enrollments

**Files:**
- Create: `supabase/migrations/20260820100002_assignments_enrollments.sql`

**Interfaces:**
- `faculty_assignments (faculty_id, course_id, assigned_date default now())` — composite unique; FKs into `faculty_profiles` and `courses`.
- `student_enrollments (student_id, sem_id, enrollment_date default now())` plus denormalized `batch_id`/`program_id` constrained by two composite FKs. Duplicate enrollment caught by `unique (student_id, sem_id)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260820100002_assignments_enrollments.sql`:

```sql
-- 20260820100002_assignments_enrollments.sql
-- faculty_assignments + student_enrollments with composite FKs enforcing
-- tuple integrity.

create table public.faculty_assignments (
  id            uuid primary key default gen_random_uuid(),
  faculty_id    uuid not null
                references public.faculty_profiles(user_id) on delete restrict,
  course_id     uuid not null
                references public.courses(id) on delete restrict,
  assigned_date timestamptz not null default now(),
  unique (faculty_id, course_id)
);
create index faculty_assignments_course_id_idx  on public.faculty_assignments (course_id);
create index faculty_assignments_faculty_id_idx on public.faculty_assignments (faculty_id);

create table public.student_enrollments (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null
                  references public.student_profiles(user_id) on delete restrict,
  batch_id        uuid not null,
  program_id      uuid not null,
  sem_id          uuid not null
                  references public.semesters(id) on delete restrict,
  enrollment_date timestamptz not null default now(),
  unique (student_id, sem_id),
  foreign key (sem_id, program_id)
    references public.semesters(id, program_id) on delete restrict,
  foreign key (program_id, batch_id)
    references public.programs(id, batch_id) on delete restrict
);
create index student_enrollments_student_id_idx on public.student_enrollments (student_id);
create index student_enrollments_sem_id_idx     on public.student_enrollments (sem_id);
```

- [ ] **Step 2: Apply locally**

Run: `pnpm db:reset`. Expected: clean apply.

- [ ] **Step 3: Smoke test — composite FK and uniqueness**

```bash
psql "$SUPABASE_DB_URL" <<'SQL'
-- Set up two batches / programs / semesters for the tuple integrity check.
insert into batches (name, start_year) values ('B1', 2023), ('B2', 2024);
insert into programs (batch_id, code, name)
  select id, 'BCA', 'BCA' from batches where name in ('B1', 'B2');
insert into semesters (program_id, number)
  select id, 1 from programs where code = 'BCA';

-- Create a student profile to attempt enrollment with.
insert into profiles (user_id, name, role)
  values ('00000000-0000-0000-0000-000000000001', 'Alice', 'student');
insert into student_profiles (user_id, roll_number, admission_year)
  values ('00000000-0000-0000-0000-000000000001', '23BCA001', 2023);

-- Pick a (sem, program) tuple from one batch.
with s as (
  select s.id as sem_id, p.id as program_id, p.batch_id
  from semesters s
  join programs p on p.id = s.program_id
  join batches b on b.id = p.batch_id
  where b.name = 'B1' limit 1
)
insert into student_enrollments (student_id, batch_id, program_id, sem_id)
  select '00000000-0000-0000-0000-000000000001', batch_id, program_id, sem_id from s;

-- Duplicate enrollment → 23505
insert into student_enrollments (student_id, batch_id, program_id, sem_id)
  select student_id, batch_id, program_id, sem_id from student_enrollments limit 1;
SQL
```

Expected: second insert fails with `23505` (unique violation).

- [ ] **Step 4: Smoke test — mismatched batch/program tuple**

```bash
psql "$SUPABASE_DB_URL" <<'SQL'
-- Try to enroll Alice in the B2 sem while claiming B1's batch — should fail.
with s as (
  select s.id as sem_id, p.id as program_id, p.batch_id
  from semesters s
  join programs p on p.id = s.program_id
  join batches b on b.id = p.batch_id
  where b.name = 'B2' limit 1
)
insert into student_enrollments (student_id, batch_id, program_id, sem_id)
  select '00000000-0000-0000-0000-000000000001',
         (select id from batches where name = 'B1'),
         program_id, sem_id from s;
SQL
```

Expected: ERROR with `23503` from the composite FK.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820100002_assignments_enrollments.sql
git commit -m "feat(db): faculty_assignments + student_enrollments + composite FKs"
```

---

### Task 7: Migration — RLS helpers and policies

**Files:**
- Create: `supabase/migrations/20260820100003_academic_rls.sql`

**Interfaces:**
- `public.teaches_course(p_course_id uuid) returns boolean`
- `public.teaches_any_in_semester(p_semester_id uuid) returns boolean`
- `public.teaches_any_in_program(p_program_id uuid) returns boolean`
- `public.teaches_any_in_batch(p_batch_id uuid) returns boolean`
- `public.is_enrolled_in_sem(p_sem_id uuid) returns boolean`
- `public.is_enrolled_in_program(p_program_id uuid) returns boolean`
- `public.is_enrolled_in_batch(p_batch_id uuid) returns boolean`

All `stable`, `security definer`, `set search_path = public`, granted to `authenticated`. Followed by RLS policies on every cycle-2 table.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260820100003_academic_rls.sql`:

```sql
-- 20260820100003_academic_rls.sql
-- Helper functions and RLS policies for batches/programs/semesters/courses/
-- faculty_assignments/student_enrollments.

-- Helpers (must be SECURITY DEFINER — a non-definer policy that reads
-- faculty_assignments from inside courses' policy would recurse).
create or replace function public.teaches_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.faculty_assignments fa
    where fa.course_id = p_course_id
      and fa.faculty_id = auth.uid()
  );
$$;

create or replace function public.teaches_any_in_semester(p_semester_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.faculty_assignments fa
    join public.courses c on c.id = fa.course_id
    where c.semester_id = p_semester_id
      and fa.faculty_id = auth.uid()
  );
$$;

create or replace function public.teaches_any_in_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.faculty_assignments fa
    join public.courses c on c.id = fa.course_id
    join public.semesters s on s.id = c.semester_id
    where s.program_id = p_program_id
      and fa.faculty_id = auth.uid()
  );
$$;

create or replace function public.teaches_any_in_batch(p_batch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.faculty_assignments fa
    join public.courses c on c.id = fa.course_id
    join public.semesters s on s.id = c.semester_id
    join public.programs p on p.id = s.program_id
    where p.batch_id = p_batch_id
      and fa.faculty_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled_in_sem(p_sem_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_enrollments se
    where se.sem_id = p_sem_id
      and se.student_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled_in_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_enrollments se
    join public.semesters s on s.id = se.sem_id
    where s.program_id = p_program_id
      and se.student_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled_in_batch(p_batch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_enrollments se
    join public.semesters s on s.id = se.sem_id
    join public.programs p on p.id = s.program_id
    where p.batch_id = p_batch_id
      and se.student_id = auth.uid()
  );
$$;

revoke all on function public.teaches_course(uuid)              from public;
revoke all on function public.teaches_any_in_semester(uuid)    from public;
revoke all on function public.teaches_any_in_program(uuid)    from public;
revoke all on function public.teaches_any_in_batch(uuid)      from public;
revoke all on function public.is_enrolled_in_sem(uuid)        from public;
revoke all on function public.is_enrolled_in_program(uuid)    from public;
revoke all on function public.is_enrolled_in_batch(uuid)      from public;

grant execute on function public.teaches_course(uuid)           to authenticated;
grant execute on function public.teaches_any_in_semester(uuid) to authenticated;
grant execute on function public.teaches_any_in_program(uuid) to authenticated;
grant execute on function public.teaches_any_in_batch(uuid)   to authenticated;
grant execute on function public.is_enrolled_in_sem(uuid)     to authenticated;
grant execute on function public.is_enrolled_in_program(uuid) to authenticated;
grant execute on function public.is_enrolled_in_batch(uuid)   to authenticated;

-- Policies — OR-ed across roles per table.
alter table public.batches      enable row level security;
alter table public.programs     enable row level security;
alter table public.semesters    enable row level security;
alter table public.courses      enable row level security;
alter table public.faculty_assignments enable row level security;
alter table public.student_enrollments enable row level security;

create policy batches_admin_all on public.batches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy batches_faculty_select on public.batches
  for select to authenticated using (public.teaches_any_in_batch(id));
create policy batches_student_select on public.batches
  for select to authenticated using (public.is_enrolled_in_batch(id));

create policy programs_admin_all on public.programs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy programs_faculty_select on public.programs
  for select to authenticated using (public.teaches_any_in_program(id));
create policy programs_student_select on public.programs
  for select to authenticated using (public.is_enrolled_in_program(id));

create policy semesters_admin_all on public.semesters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy semesters_faculty_select on public.semesters
  for select to authenticated using (public.teaches_any_in_semester(id));
create policy semesters_student_select on public.semesters
  for select to authenticated using (public.is_enrolled_in_sem(id));

create policy courses_admin_all on public.courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy courses_faculty_select on public.courses
  for select to authenticated using (public.teaches_course(id));

create policy faculty_assignments_admin_all on public.faculty_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy faculty_assignments_select_own on public.faculty_assignments
  for select to authenticated using (faculty_id = auth.uid());

create policy student_enrollments_admin_all on public.student_enrollments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy student_enrollments_select_own on public.student_enrollments
  for select to authenticated using (student_id = auth.uid());
```

- [ ] **Step 2: Apply locally**

Run: `pnpm db:reset`. Expected: clean apply.

- [ ] **Step 3: Smoke test — admin still sees everything; faculty/student see nothing yet**

```bash
psql "$SUPABASE_DB_URL" -c "
  -- is_admin() returns true for the admin we seeded
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select user_id from profiles where role='admin' limit 1)::text,
                      'app_metadata', json_build_object('role','admin'))::text,
    true);
  select count(*) from public.batches;
"
```

Expected: count is whatever rows are present (likely 0 on a fresh DB). Just verifies the policy permits admin access.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260820100003_academic_rls.sql
git commit -m "feat(db): RLS helpers + policies for cycle-2 tables"
```

---

### Task 8: Migration — drop profiles_update_own + fix cycle-1 test

**Files:**
- Create: `supabase/migrations/20260820100004_profiles_admin_only_writes.sql`
- Modify: `apps/api/src/tests/rls.profiles.test.ts`

**Interfaces:** None — pure policy tightening and a test fix.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260820100004_profiles_admin_only_writes.sql`:

```sql
-- 20260820100004_profiles_admin_only_writes.sql
-- Tighten profiles to admin-write-only, matching every other cycle-2 table.

drop policy if exists "profiles_update_own" on public.profiles;
```

- [ ] **Step 2: Update the cycle-1 RLS test that now produces different output**

The test in `apps/api/src/tests/rls.profiles.test.ts` that asserts `"alice cannot promote herself to admin"` reads:

```ts
itIf("alice cannot promote herself to admin", async () => {
  const { error } = await alice.from("profiles").update({ role: "admin" }).eq("user_id", aliceUser.userId!);
  expect(error).not.toBeNull();
});
```

Replace it with:

```ts
itIf("alice cannot promote herself to admin", async () => {
  // With profiles_update_own dropped, alice's update matches no policy at
  // all — PostgREST returns 0 rows and no error. Asserting on data length
  // rather than error reflects the correct behaviour: a non-matching USING
  // silently affects nothing, while a failed WITH CHECK would raise.
  const { data, error } = await alice.from("profiles")
    .update({ role: "admin" }).eq("user_id", aliceUser.userId!).select();
  expect(error).toBeNull();
  expect(data).toHaveLength(0);
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @mark-matrix/api test`. Expected: PASS. The gated test is skipped without creds, so the fix only matters when run with `SUPABASE_TEST_RLS=1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260820100004_profiles_admin_only_writes.sql apps/api/src/tests/rls.profiles.test.ts
git commit -m "fix(db): drop profiles_update_own, tighten profiles writes to admin"
```

---

## Phase 3 — API layer

### Task 9: Postgres error mapper

**Files:**
- Create: `apps/api/src/lib/pgErrors.ts`
- Create: `apps/api/src/lib/pgErrors.test.ts`

**Interfaces:**
- `mapPgError(err: { code?: string; message?: string } | null, ctx?: { hasDependents?: boolean }): { status: number; body: { error: string; detail?: string } }` — converts PostgREST/PG error codes to the §5.1 contract. Returns `500 internal_error` for unknown codes.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/lib/pgErrors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapPgError } from "./pgErrors.js";

describe("mapPgError", () => {
  it("maps 23503 on DELETE to 409 has_dependents", () => {
    const { status, body } = mapPgError(
      { code: "23503", message: "violates foreign key constraint" },
      { hasDependents: true },
    );
    expect(status).toBe(409);
    expect(body.error).toBe("has_dependents");
    expect(body.detail).toContain("foreign key");
  });
  it("maps 23503 on INSERT to 409 invalid_reference", () => {
    const { status, body } = mapPgError({ code: "23503", message: "violates foreign key constraint" });
    expect(status).toBe(409);
    expect(body.error).toBe("invalid_reference");
  });
  it("maps 23505 to 409 duplicate", () => {
    const { status, body } = mapPgError({ code: "23505", message: "duplicate key" });
    expect(status).toBe(409);
    expect(body.error).toBe("duplicate");
  });
  it("maps 23514 to 409 invalid_reference (trigger CHECK violations)", () => {
    const { status, body } = mapPgError({ code: "23514", message: "user has wrong role" });
    expect(status).toBe(409);
    expect(body.error).toBe("invalid_reference");
  });
  it("maps PGRST116 to 404 not_found", () => {
    const { status, body } = mapPgError({ code: "PGRST116", message: "row not found" });
    expect(status).toBe(404);
    expect(body.error).toBe("not_found");
  });
  it("maps unknown errors to 500", () => {
    const { status, body } = mapPgError({ code: "XX999", message: "weird" });
    expect(status).toBe(500);
    expect(body.error).toBe("internal_error");
  });
  it("returns 500 for null input", () => {
    const { status, body } = mapPgError(null);
    expect(status).toBe(500);
    expect(body.error).toBe("internal_error");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `pnpm --filter @mark-matrix/api test`. Expected: FAIL with "Cannot find module './pgErrors.js'".

- [ ] **Step 3: Implement `apps/api/src/lib/pgErrors.ts`**

```ts
export interface MappedPgError {
  status: number;
  body: { error: string; detail?: string };
}

export function mapPgError(
  err: { code?: string; message?: string } | null,
  ctx: { hasDependents?: boolean } = {},
): MappedPgError {
  const code = err?.code ?? "";
  const message = err?.message ?? "unknown error";
  if (code === "23503") {
    if (ctx.hasDependents) {
      return { status: 409, body: { error: "has_dependents", detail: message } };
    }
    return { status: 409, body: { error: "invalid_reference", detail: message } };
  }
  if (code === "23505") {
    return { status: 409, body: { error: "duplicate", detail: message } };
  }
  if (code === "23514") {
    return { status: 409, body: { error: "invalid_reference", detail: message } };
  }
  if (code === "PGRST116") {
    return { status: 404, body: { error: "not_found" } };
  }
  return { status: 500, body: { error: "internal_error", detail: message } };
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `pnpm --filter @mark-matrix/api test pgErrors`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/pgErrors.ts apps/api/src/lib/pgErrors.test.ts
git commit -m "feat(api): Postgres error → API error mapper"
```

---

### Task 10: CRUD factory

**Files:**
- Create: `apps/api/src/lib/crudFactory.ts`

**Interfaces:**
- `createCrudHandlers<T, C, U>(opts)` returns a Hono sub-router with `GET /` (list with optional `scopeQuery`), `POST /` (create), `GET /:id`, `PATCH /:id`, `DELETE /:id`.
- Input payloads are parsed by `createSchema` / `updateSchema` (which MUST expose `.safeParse`); the schema does not need to be a zod schema, but in this codebase it always is. The factory does not import zod directly — it only requires `safeParse`.
- Output: `{ data: T[] }` for list, `{ data: T }` for single.
- All errors flow through `mapPgError`. The factory returns `c.json(body, status)`.

The factory handles four resources (batches, semesters, courses, programs) × five handlers each = 20 near-identical handlers. Non-uniform routes (assignments, enrollments, bulk, role satellites) are written out longhand in later tasks.

- [ ] **Step 1: Write `apps/api/src/lib/crudFactory.ts`**

```ts
import { Hono, type Context } from "hono";
import type { AppEnv } from "../env.js";
import { mapPgError } from "./pgErrors.js";
import { formatZodError } from "@mark-matrix/shared";

interface Parser<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
}

interface CrudOptions<T, C, U> {
  table: string;
  createSchema: Parser<C>;
  updateSchema: Parser<U>;
  scope?: { column: string; queryKey: string };
  toRow: (input: C) => Record<string, unknown>;
  toPatch: (input: U) => Record<string, unknown>;
  fromRow: (row: Record<string, unknown>) => T;
}

function validationError(err: unknown) {
  // We accept anything that looks like a zod ZodError; if it isn't, surface a
  // generic 400 with no field detail.
  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown }).issues)) {
    return { error: "validation_failed", fields: formatZodError(err as Parameters<typeof formatZodError>[0]) };
  }
  return { error: "validation_failed" };
}

export function createCrudHandlers<T, C, U>(
  opts: CrudOptions<T, C, U>,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const supabase = c.get("supabase");
    let query = supabase.from(opts.table).select("*");
    if (opts.scope) {
      const v = c.req.query(opts.scope.queryKey);
      if (v) query = query.eq(opts.scope.column, v);
    }
    const { data, error } = await query;
    if (error) {
      const mapped = mapPgError(error);
      return c.json(mapped.body, mapped.status);
    }
    return c.json({ data: (data ?? []).map(opts.fromRow) });
  });

  app.post("/", async (c) => {
    const supabase = c.get("supabase");
    const body = await c.req.json().catch(() => null);
    const parsed = opts.createSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);
    const { data, error } = await supabase
      .from(opts.table)
      .insert(opts.toRow(parsed.data))
      .select()
      .single();
    if (error) {
      const mapped = mapPgError(error);
      return c.json(mapped.body, mapped.status);
    }
    return c.json({ data: opts.fromRow(data as Record<string, unknown>) }, 201);
  });

  app.get("/:id", async (c) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    const { data, error } = await supabase.from(opts.table).select("*").eq("id", id).maybeSingle();
    if (error) {
      const mapped = mapPgError(error);
      return c.json(mapped.body, mapped.status);
    }
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ data: opts.fromRow(data as Record<string, unknown>) });
  });

  app.patch("/:id", async (c) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = opts.updateSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);
    const { data, error } = await supabase
      .from(opts.table)
      .update(opts.toPatch(parsed.data))
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) {
      const mapped = mapPgError(error);
      return c.json(mapped.body, mapped.status);
    }
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ data: opts.fromRow(data as Record<string, unknown>) });
  });

  app.delete("/:id", async (c: Context<AppEnv>) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    const { error } = await supabase.from(opts.table).delete().eq("id", id);
    if (error) {
      // 23503 on DELETE is always "has_dependents" — the caller must
      // disambiguate via ctx for inserts only.
      const mapped = mapPgError(error, { hasDependents: true });
      return c.json(mapped.body, mapped.status);
    }
    return c.body(null, 204);
  });

  return app;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mark-matrix/api typecheck`. Expected: PASS — no callers yet, but the factory compiles against existing types.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/crudFactory.ts
git commit -m "feat(api): generic CRUD factory for hierarchy resources"
```

---
### Task 11: Admin batch, program, semester, course routes

**Files:**
- Create: `apps/api/src/routes/admin/batches.ts`
- Create: `apps/api/src/routes/admin/programs.ts`
- Create: `apps/api/src/routes/admin/semesters.ts`
- Create: `apps/api/src/routes/admin/courses.ts`

**Interfaces:** Each route is mounted at its `ROUTES_CYCLE_2` constant. Every route uses the CRUD factory from Task 10 with the schemas from Task 2.

DB column names are snake_case; API JSON is camelCase. Each route defines `toRow` (camelCase → snake_case) and `fromRow` (snake_case → camelCase). The lists endpoint returns `{ data: T[] }`; single endpoints return `{ data: T }`; creation returns `201`; deletes return `204` (or `409` on `has_dependents`).

- [ ] **Step 1: Write `apps/api/src/routes/admin/batches.ts`**

```ts
import {
  createBatchSchema,
  patchBatchSchema,
  type CreateBatch,
  type PatchBatch,
} from "@mark-matrix/shared";
import { createCrudHandlers } from "../../lib/crudFactory.js";

export interface Batch {
  id: string;
  name: string;
  startYear: number;
  createdAt: string;
  updatedAt: string;
}

interface BatchRow {
  id: string;
  name: string;
  start_year: number;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Record<string, unknown>): Batch => {
  const row = r as unknown as BatchRow;
  return {
    id: row.id,
    name: row.name,
    startYear: row.start_year,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toRow = (c: CreateBatch): Record<string, unknown> => ({
  name: c.name,
  start_year: c.startYear,
});

const toPatch = (p: PatchBatch): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (p.name !== undefined) out["name"] = p.name;
  if (p.startYear !== undefined) out["start_year"] = p.startYear;
  return out;
};

export const adminBatchesRoute = createCrudHandlers<Batch, CreateBatch, PatchBatch>({
  table: "batches",
  createSchema: createBatchSchema,
  updateSchema: patchBatchSchema,
  toRow,
  toPatch,
  fromRow,
});
```

- [ ] **Step 2: Write `apps/api/src/routes/admin/programs.ts`**

```ts
import {
  createProgramSchema,
  patchProgramSchema,
  type CreateProgram,
  type PatchProgram,
} from "@mark-matrix/shared";
import { createCrudHandlers } from "../../lib/crudFactory.js";

export interface Program {
  id: string;
  batchId: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

type ProgramRow = {
  id: string;
  batch_id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: Record<string, unknown>): Program => {
  const row = r as unknown as ProgramRow;
  return {
    id: row.id,
    batchId: row.batch_id,
    code: row.code,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toRow = (c: CreateProgram): Record<string, unknown> => ({
  batch_id: c.batchId,
  code: c.code,
  name: c.name,
});

const toPatch = (p: PatchProgram): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (p.batchId !== undefined) out["batch_id"] = p.batchId;
  if (p.code !== undefined) out["code"] = p.code;
  if (p.name !== undefined) out["name"] = p.name;
  return out;
};

export const adminProgramsRoute = createCrudHandlers<Program, CreateProgram, PatchProgram>({
  table: "programs",
  createSchema: createProgramSchema,
  updateSchema: patchProgramSchema,
  scope: { column: "batch_id", queryKey: "batchId" },
  toRow,
  toPatch,
  fromRow,
});
```

- [ ] **Step 3: Write `apps/api/src/routes/admin/semesters.ts`**

```ts
import {
  createSemesterSchema,
  patchSemesterSchema,
  type CreateSemester,
  type PatchSemester,
} from "@mark-matrix/shared";
import { createCrudHandlers } from "../../lib/crudFactory.js";

export interface Semester {
  id: string;
  programId: string;
  number: number;
  createdAt: string;
  updatedAt: string;
}

type SemesterRow = {
  id: string;
  program_id: string;
  number: number;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: Record<string, unknown>): Semester => {
  const row = r as unknown as SemesterRow;
  return {
    id: row.id,
    programId: row.program_id,
    number: row.number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toRow = (c: CreateSemester): Record<string, unknown> => ({
  program_id: c.programId,
  number: c.number,
});

const toPatch = (p: PatchSemester): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (p.programId !== undefined) out["program_id"] = p.programId;
  if (p.number !== undefined) out["number"] = p.number;
  return out;
};

export const adminSemestersRoute = createCrudHandlers<Semester, CreateSemester, PatchSemester>({
  table: "semesters",
  createSchema: createSemesterSchema,
  updateSchema: patchSemesterSchema,
  scope: { column: "program_id", queryKey: "programId" },
  toRow,
  toPatch,
  fromRow,
});
```

- [ ] **Step 4: Write `apps/api/src/routes/admin/courses.ts`**

```ts
import {
  createCourseSchema,
  patchCourseSchema,
  type CreateCourse,
  type PatchCourse,
} from "@mark-matrix/shared";
import { createCrudHandlers } from "../../lib/crudFactory.js";

export interface Course {
  id: string;
  semesterId: string;
  code: string;
  title: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
}

type CourseRow = {
  id: string;
  semester_id: string;
  code: string;
  title: string;
  credits: number;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: Record<string, unknown>): Course => {
  const row = r as unknown as CourseRow;
  return {
    id: row.id,
    semesterId: row.semester_id,
    code: row.code,
    title: row.title,
    credits: row.credits,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toRow = (c: CreateCourse): Record<string, unknown> => ({
  semester_id: c.semesterId,
  code: c.code,
  title: c.title,
  credits: c.credits,
});

const toPatch = (p: PatchCourse): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (p.semesterId !== undefined) out["semester_id"] = p.semesterId;
  if (p.code !== undefined) out["code"] = p.code;
  if (p.title !== undefined) out["title"] = p.title;
  if (p.credits !== undefined) out["credits"] = p.credits;
  return out;
};

export const adminCoursesRoute = createCrudHandlers<Course, CreateCourse, PatchCourse>({
  table: "courses",
  createSchema: createCourseSchema,
  updateSchema: patchCourseSchema,
  scope: { column: "semester_id", queryKey: "semesterId" },
  toRow,
  toPatch,
  fromRow,
});
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @mark-matrix/api typecheck`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/batches.ts apps/api/src/routes/admin/programs.ts apps/api/src/routes/admin/semesters.ts apps/api/src/routes/admin/courses.ts
git commit -m "feat(api): admin batch/program/semester/course routes"
```

---

### Task 12: Admin role-satellite routes (students, faculty, admins)

**Files:**
- Create: `apps/api/src/routes/admin/roleProfiles.ts`

**Interfaces:** Three near-identical resources sharing one route file. Satellite tables do not have `created_at`/`updated_at` (D5), so the row shapes are simpler. Selection joins `profiles` for the user's `name`. `DELETE` removes the satellite row, which is required by the role-change workflow in §5.3.

- [ ] **Step 1: Write `apps/api/src/routes/admin/roleProfiles.ts`**

```ts
import { Hono } from "hono";
import {
  createStudentProfileSchema,
  createFacultyProfileSchema,
  createAdminProfileSchema,
  type CreateStudentProfile,
  type CreateFacultyProfile,
  type CreateAdminProfile,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

export interface ProfileWithSatellite {
  userId: string;
  name: string;
  role: "admin" | "faculty" | "student";
  rollNumber?: string;
  admissionYear?: number;
  employeeCode?: string;
  department?: string;
  designation?: string;
}

interface StudentRow {
  user_id: string;
  roll_number: string;
  admission_year: number;
}
interface FacultyRow {
  user_id: string;
  employee_code: string;
  department: string | null;
  designation: string | null;
}
interface AdminRow {
  user_id: string;
  employee_code: string;
  designation: string | null;
}
interface ProfileJoinRow {
  user_id: string;
  name: string;
  role: "admin" | "faculty" | "student";
}

const buildSatellite = (
  p: ProfileJoinRow,
  s: StudentRow | FacultyRow | AdminRow | null,
): ProfileWithSatellite => {
  const base: ProfileWithSatellite = {
    userId: p.user_id,
    name: p.name,
    role: p.role,
  };
  if (s && "roll_number" in s) {
    base.rollNumber = s.roll_number;
    base.admissionYear = s.admission_year;
  }
  if (s && "employee_code" in s) {
    base.employeeCode = s.employee_code;
    if ("department" in s && s.department) base.department = s.department;
    if ("designation" in s && s.designation) base.designation = s.designation;
  }
  return base;
};

const students = new Hono<AppEnv>();
students.get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("student_profiles")
    .select("user_id, roll_number, admission_year, profiles!inner(name, role)");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const out: ProfileWithSatellite[] = (data ?? []).map((row) => {
    const r = row as unknown as StudentRow & { profiles: ProfileJoinRow };
    return buildSatellite(r.profiles, r);
  });
  return c.json({ data: out });
});
students.post("/", async (c) => {
  const supabase = c.get("supabase");
  const body = await c.req.json().catch(() => null);
  const parsed = createStudentProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", fields: parsed.error.issues }, 400);
  }
  const d: CreateStudentProfile = parsed.data;
  const { data, error } = await supabase
    .from("student_profiles")
    .insert({ user_id: d.userId, roll_number: d.rollNumber, admission_year: d.admissionYear })
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data }, 201);
});
students.delete("/:userId", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.req.param("userId");
  const { error } = await supabase.from("student_profiles").delete().eq("user_id", userId);
  if (error) {
    const m = mapPgError(error, { hasDependents: true });
    return c.json(m.body, m.status);
  }
  return c.body(null, 204);
});

const faculty = new Hono<AppEnv>();
faculty.get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("faculty_profiles")
    .select("user_id, employee_code, department, designation, profiles!inner(name, role)");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const out: ProfileWithSatellite[] = (data ?? []).map((row) => {
    const r = row as unknown as FacultyRow & { profiles: ProfileJoinRow };
    return buildSatellite(r.profiles, r);
  });
  return c.json({ data: out });
});
faculty.post("/", async (c) => {
  const supabase = c.get("supabase");
  const body = await c.req.json().catch(() => null);
  const parsed = createFacultyProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", fields: parsed.error.issues }, 400);
  }
  const d: CreateFacultyProfile = parsed.data;
  const { data, error } = await supabase
    .from("faculty_profiles")
    .insert({
      user_id: d.userId,
      employee_code: d.employeeCode,
      department: d.department ?? null,
      designation: d.designation ?? null,
    })
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data }, 201);
});
faculty.delete("/:userId", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.req.param("userId");
  const { error } = await supabase.from("faculty_profiles").delete().eq("user_id", userId);
  if (error) {
    const m = mapPgError(error, { hasDependents: true });
    return c.json(m.body, m.status);
  }
  return c.body(null, 204);
});

const admins = new Hono<AppEnv>();
admins.get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("user_id, employee_code, designation, profiles!inner(name, role)");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const out: ProfileWithSatellite[] = (data ?? []).map((row) => {
    const r = row as unknown as AdminRow & { profiles: ProfileJoinRow };
    return buildSatellite(r.profiles, r);
  });
  return c.json({ data: out });
});
admins.post("/", async (c) => {
  const supabase = c.get("supabase");
  const body = await c.req.json().catch(() => null);
  const parsed = createAdminProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", fields: parsed.error.issues }, 400);
  }
  const d: CreateAdminProfile = parsed.data;
  const { data, error } = await supabase
    .from("admin_profiles")
    .insert({
      user_id: d.userId,
      employee_code: d.employeeCode,
      designation: d.designation ?? null,
    })
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data }, 201);
});
admins.delete("/:userId", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.req.param("userId");
  const { error } = await supabase.from("admin_profiles").delete().eq("user_id", userId);
  if (error) {
    const m = mapPgError(error, { hasDependents: true });
    return c.json(m.body, m.status);
  }
  return c.body(null, 204);
});

export const adminStudentsRoute = students;
export const adminFacultyRoute = faculty;
export const adminAdminsRoute = admins;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mark-matrix/api typecheck`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin/roleProfiles.ts
git commit -m "feat(api): admin role-satellite routes (students, faculty, admins)"
```

---

### Task 13: Admin users PATCH (role/name) and existing GET extension

**Files:**
- Modify: `apps/api/src/routes/admin/users.ts`

**Interfaces:** Existing `GET /` preserved. New `PATCH /:userId` accepts `{ role?, name? }` and updates `profiles`. A `404` from PostgREST means the user does not exist; a `23514` from the trigger means a satellite row blocks the role change.

- [ ] **Step 1: Update `apps/api/src/routes/admin/users.ts`**

```ts
import { Hono } from "hono";
import { patchRoleSchema, PROFILE_TABLE } from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

export const adminUsersRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const supabase = c.get("supabase");
    const { data, error } = await supabase
      .from(PROFILE_TABLE)
      .select("user_id, name, role");
    if (error) {
      console.error("admin users: profiles read failed", error.message);
      return c.json({ error: "profiles_read_failed", detail: error.message }, 500);
    }
    return c.json({ users: data });
  })
  .patch("/:userId", async (c) => {
    const supabase = c.get("supabase");
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => null);
    const parsed = patchRoleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation_failed", fields: parsed.error.issues },
        400,
      );
    }
    const update: Record<string, unknown> = {};
    if (parsed.data.role !== undefined) update["role"] = parsed.data.role;
    if (parsed.data.name !== undefined) update["name"] = parsed.data.name;
    const { data, error } = await supabase
      .from(PROFILE_TABLE)
      .update(update)
      .eq("user_id", userId)
      .select("user_id, name, role")
      .maybeSingle();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ data });
  });
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mark-matrix/api typecheck`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin/users.ts
git commit -m "feat(api): PATCH /api/admin/users/:userId for role/name"
```

---

### Task 14: Admin faculty assignment and enrollment routes

**Files:**
- Create: `apps/api/src/routes/admin/facultyAssignments.ts`
- Create: `apps/api/src/routes/admin/enrollments.ts`

**Interfaces:** Both expose `GET` (with optional `?courseId=&facultyId=` / `?semId=&studentId=` scoping), `POST` (create), `DELETE /:id`. Enrollments derive `batch_id` and `program_id` from `sem_id` server-side, then insert; that derivation happens inside the route, not the schema, because the request body carries only `studentId` + `semId`.

- [ ] **Step 1: Write `apps/api/src/routes/admin/facultyAssignments.ts`**

```ts
import { Hono } from "hono";
import {
  createFacultyAssignmentSchema,
  type CreateFacultyAssignment,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

export interface FacultyAssignment {
  id: string;
  facultyId: string;
  courseId: string;
  assignedDate: string;
}

type Row = {
  id: string;
  faculty_id: string;
  course_id: string;
  assigned_date: string;
};

const fromRow = (r: Row): FacultyAssignment => ({
  id: r.id,
  facultyId: r.faculty_id,
  courseId: r.course_id,
  assignedDate: r.assigned_date,
});

const toRow = (c: CreateFacultyAssignment): Record<string, unknown> => ({
  faculty_id: c.facultyId,
  course_id: c.courseId,
});

export const adminFacultyAssignmentsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const supabase = c.get("supabase");
    let query = supabase
      .from("faculty_assignments")
      .select("id, faculty_id, course_id, assigned_date");
    const courseId = c.req.query("courseId");
    if (courseId) query = query.eq("course_id", courseId);
    const facultyId = c.req.query("facultyId");
    if (facultyId) query = query.eq("faculty_id", facultyId);
    const { data, error } = await query;
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json({ data: (data ?? []).map((r) => fromRow(r as unknown as Row)) });
  })
  .post("/", async (c) => {
    const supabase = c.get("supabase");
    const body = await c.req.json().catch(() => null);
    const parsed = createFacultyAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation_failed", fields: parsed.error.issues },
        400,
      );
    }
    const { data, error } = await supabase
      .from("faculty_assignments")
      .insert(toRow(parsed.data))
      .select()
      .single();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json({ data: fromRow(data as unknown as Row) }, 201);
  })
  .delete("/:id", async (c) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    const { error } = await supabase
      .from("faculty_assignments")
      .delete()
      .eq("id", id);
    if (error) {
      const m = mapPgError(error, { hasDependents: true });
      return c.json(m.body, m.status);
    }
    return c.body(null, 204);
  });
```

- [ ] **Step 2: Write `apps/api/src/routes/admin/enrollments.ts`**

```ts
import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEnrollmentSchema,
  type CreateEnrollment,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

export interface Enrollment {
  id: string;
  studentId: string;
  batchId: string;
  programId: string;
  semId: string;
  enrollmentDate: string;
}

type Row = {
  id: string;
  student_id: string;
  batch_id: string;
  program_id: string;
  sem_id: string;
  enrollment_date: string;
};

const fromRow = (r: Row): Enrollment => ({
  id: r.id,
  studentId: r.student_id,
  batchId: r.batch_id,
  programId: r.program_id,
  semId: r.sem_id,
  enrollmentDate: r.enrollment_date,
});

async function deriveContext(
  supabase: SupabaseClient,
  semId: string,
): Promise<{ batchId: string; programId: string }> {
  const { data, error } = await supabase
    .from("semesters")
    .select("id, program_id, programs!inner(batch_id)")
    .eq("id", semId)
    .maybeSingle();
  if (error || !data) {
    throw new Error(error?.message ?? "semester not found");
  }
  const row = data as unknown as {
    id: string;
    program_id: string;
    programs: { batch_id: string };
  };
  return { batchId: row.programs.batch_id, programId: row.program_id };
}

export const adminEnrollmentsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const supabase = c.get("supabase");
    let query = supabase
      .from("student_enrollments")
      .select("id, student_id, batch_id, program_id, sem_id, enrollment_date");
    const semId = c.req.query("semId");
    if (semId) query = query.eq("sem_id", semId);
    const studentId = c.req.query("studentId");
    if (studentId) query = query.eq("student_id", studentId);
    const { data, error } = await query;
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json({ data: (data ?? []).map((r) => fromRow(r as unknown as Row)) });
  })
  .post("/", async (c) => {
    const supabase = c.get("supabase");
    const body = await c.req.json().catch(() => null);
    const parsed = createEnrollmentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation_failed", fields: parsed.error.issues },
        400,
      );
    }
    const d: CreateEnrollment = parsed.data;
    let ctx: { batchId: string; programId: string };
    try {
      ctx = await deriveContext(supabase, d.semId);
    } catch (e) {
      return c.json(
        { error: "invalid_reference", detail: (e as Error).message },
        409,
      );
    }
    const { data, error } = await supabase
      .from("student_enrollments")
      .insert({
        student_id: d.studentId,
        sem_id: d.semId,
        batch_id: ctx.batchId,
        program_id: ctx.programId,
      })
      .select()
      .single();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json({ data: fromRow(data as unknown as Row) }, 201);
  })
  .delete("/:id", async (c) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    const { error } = await supabase
      .from("student_enrollments")
      .delete()
      .eq("id", id);
    if (error) {
      const m = mapPgError(error, { hasDependents: true });
      return c.json(m.body, m.status);
    }
    return c.body(null, 204);
  });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mark-matrix/api typecheck`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/admin/facultyAssignments.ts apps/api/src/routes/admin/enrollments.ts
git commit -m "feat(api): admin faculty assignment + enrollment routes"
```

---

### Task 15: Bulk enroll route

**Files:**
- Create: `apps/api/src/routes/admin/bulkEnroll.ts`

**Interfaces:** `POST /api/admin/enrollments/bulk` with body `{ semId, csv }`. Per-row processing: parse → roll number lookup → individual insert. Returns `{ enrolled: number, errors: { row, rollNumber, reason }[] }`. The route never fails the batch on a per-row error; only schema-level validation of `semId` and a missing `csv` field produce `400`.

Reasons used in errors: `validation_failed`, `no_such_student`, `already_enrolled`, `fk_violation` (catches unexpected `23503`s, e.g. the student row was deleted mid-batch).

- [ ] **Step 1: Write `apps/api/src/routes/admin/bulkEnroll.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import { parseEnrollCsv } from "@mark-matrix/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

const bulkEnrollBodySchema = z.object({
  semId: z.string().uuid(),
  csv: z.string().min(1),
});
type BulkEnrollBody = z.infer<typeof bulkEnrollBodySchema>;

export interface BulkEnrollResponse {
  enrolled: number;
  errors: { row: number; rollNumber?: string; reason: string }[];
}

interface LookupRow {
  user_id: string;
  roll_number: string;
}

async function deriveContext(
  supabase: SupabaseClient,
  semId: string,
): Promise<{ batchId: string; programId: string }> {
  const { data, error } = await supabase
    .from("semesters")
    .select("id, program_id, programs!inner(batch_id)")
    .eq("id", semId)
    .maybeSingle();
  if (error || !data) {
    throw new Error(error?.message ?? "semester not found");
  }
  const row = data as unknown as {
    id: string;
    program_id: string;
    programs: { batch_id: string };
  };
  return { batchId: row.programs.batch_id, programId: row.program_id };
}

export const adminBulkEnrollRoute = new Hono<AppEnv>().post("/", async (c) => {
  const supabase = c.get("supabase");
  const body = await c.req.json().catch(() => null);
  const parsed = bulkEnrollBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: parsed.error.issues },
      400,
    );
  }
  const { semId, csv }: BulkEnrollBody = parsed.data;

  const { rows, errors: parseErrors } = parseEnrollCsv(csv);
  const out: BulkEnrollResponse = { enrolled: 0, errors: [] };
  for (const e of parseErrors) {
    out.errors.push({ row: e.row, reason: e.reason });
  }

  let batchId: string;
  let programId: string;
  try {
    const ctx = await deriveContext(supabase, semId);
    batchId = ctx.batchId;
    programId = ctx.programId;
  } catch (e) {
    return c.json(
      { error: "invalid_reference", detail: (e as Error).message },
      409,
    );
  }

  const { data: existing, error: existingErr } = await supabase
    .from("student_enrollments")
    .select("student_id")
    .eq("sem_id", semId);
  if (existingErr) {
    const m = mapPgError(existingErr);
    return c.json(m.body, m.status);
  }
  const alreadyEnrolled = new Set(
    (existing ?? []).map((r) => (r as unknown as { student_id: string }).student_id),
  );

  const rollNumbers = Array.from(new Set(rows.map((r) => r.rollNumber)));
  const { data: students, error: studentsErr } = await supabase
    .from("student_profiles")
    .select("user_id, roll_number")
    .in("roll_number", rollNumbers);
  if (studentsErr) {
    const m = mapPgError(studentsErr);
    return c.json(m.body, m.status);
  }
  const byRoll = new Map<string, string>();
  for (const s of (students ?? []) as unknown as LookupRow[]) {
    byRoll.set(s.roll_number, s.user_id);
  }

  for (const r of rows) {
    const userId = byRoll.get(r.rollNumber);
    if (!userId) {
      out.errors.push({ row: r.row, rollNumber: r.rollNumber, reason: "no_such_student" });
      continue;
    }
    if (alreadyEnrolled.has(userId)) {
      out.errors.push({ row: r.row, rollNumber: r.rollNumber, reason: "already_enrolled" });
      continue;
    }
    const { error: insertErr } = await supabase
      .from("student_enrollments")
      .insert({
        student_id: userId,
        sem_id: semId,
        batch_id: batchId,
        program_id: programId,
      });
    if (insertErr) {
      const mapped = mapPgError(insertErr);
      out.errors.push({
        row: r.row,
        rollNumber: r.rollNumber,
        reason: mapped.body.error === "duplicate" ? "already_enrolled" : "fk_violation",
      });
      continue;
    }
    out.enrolled += 1;
    alreadyEnrolled.add(userId);
  }
  return c.json(out);
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mark-matrix/api typecheck`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin/bulkEnroll.ts
git commit -m "feat(api): POST /api/admin/enrollments/bulk with per-row report"
```

---

### Task 16: Faculty courses and student enrollment read routes

**Files:**
- Create: `apps/api/src/routes/faculty/courses.ts`
- Create: `apps/api/src/routes/student/enrollment.ts`

**Interfaces:** Both routes are RLS-filtered reads. Faculty: list courses they're assigned to, joined with semester/program/batch. Student: own enrollment(s), joined with semester/program/batch. Both return `{ data: ... }`.

`student_enrollments` has composite FKs to `semesters` and `programs`, which can confuse PostgREST's auto-detected relationships. Using `!inner` with explicit foreign keys in the select string is the safest approach.

- [ ] **Step 1: Write `apps/api/src/routes/faculty/courses.ts`**

```ts
import { Hono } from "hono";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

export interface FacultyCourseView {
  id: string;
  code: string;
  title: string;
  credits: number;
  semester: { id: string; number: number; programId: string; batchId: string };
}

type Row = {
  id: string;
  code: string;
  title: string;
  credits: number;
  semesters: {
    id: string;
    number: number;
    program_id: string;
    programs: { id: string; batch_id: string };
  };
};

const fromRow = (r: Row): FacultyCourseView => ({
  id: r.id,
  code: r.code,
  title: r.title,
  credits: r.credits,
  semester: {
    id: r.semesters.id,
    number: r.semesters.number,
    programId: r.semesters.program_id,
    batchId: r.semesters.programs.batch_id,
  },
});

export const facultyCoursesRoute = new Hono<AppEnv>().get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("courses")
    .select(
      "id, code, title, credits, semesters!inner(id, number, program_id, programs!inner(id, batch_id))",
    );
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data: (data ?? []).map((r) => fromRow(r as unknown as Row)) });
});
```

- [ ] **Step 2: Write `apps/api/src/routes/student/enrollment.ts`**

```ts
import { Hono } from "hono";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

export interface StudentEnrollmentView {
  id: string;
  enrollmentDate: string;
  batchId: string;
  programId: string;
  semId: string;
  semester: { id: string; number: number; programId: string; batchId: string };
}

type Row = {
  id: string;
  enrollment_date: string;
  batch_id: string;
  program_id: string;
  sem_id: string;
  semesters: {
    id: string;
    number: number;
    program_id: string;
    programs: { id: string; batch_id: string };
  };
};

const fromRow = (r: Row): StudentEnrollmentView => ({
  id: r.id,
  enrollmentDate: r.enrollment_date,
  batchId: r.batch_id,
  programId: r.program_id,
  semId: r.sem_id,
  semester: {
    id: r.semesters.id,
    number: r.semesters.number,
    programId: r.semesters.program_id,
    batchId: r.semesters.programs.batch_id,
  },
});

export const studentEnrollmentRoute = new Hono<AppEnv>().get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("student_enrollments")
    .select(
      "id, enrollment_date, batch_id, program_id, sem_id, semesters!inner(id, number, program_id, programs!inner(id, batch_id))",
    );
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data: (data ?? []).map((r) => fromRow(r as unknown as Row)) });
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mark-matrix/api typecheck`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/faculty/courses.ts apps/api/src/routes/student/enrollment.ts
git commit -m "feat(api): faculty courses + student enrollment RLS-filtered reads"
```

---

### Task 17: Wire all new routes into the Hono app and extend auth

**Files:**
- Modify: `apps/api/src/index.ts`

**Interfaces:** Two new role guards, all new routes mounted at the constants from Task 1.

- [ ] **Step 1: Replace `apps/api/src/index.ts`**

```ts
import { Hono } from "hono";
import { API_ROUTES, ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { supabaseAuth } from "./middleware/auth.js";
import { requireRole } from "./middleware/requireRole.js";
import { adminUsersRoute } from "./routes/admin/users.js";
import { adminBatchesRoute } from "./routes/admin/batches.js";
import { adminProgramsRoute } from "./routes/admin/programs.js";
import { adminSemestersRoute } from "./routes/admin/semesters.js";
import { adminCoursesRoute } from "./routes/admin/courses.js";
import { adminFacultyAssignmentsRoute } from "./routes/admin/facultyAssignments.js";
import { adminEnrollmentsRoute } from "./routes/admin/enrollments.js";
import { adminBulkEnrollRoute } from "./routes/admin/bulkEnroll.js";
import {
  adminStudentsRoute,
  adminFacultyRoute,
  adminAdminsRoute,
} from "./routes/admin/roleProfiles.js";
import { facultyCoursesRoute } from "./routes/faculty/courses.js";
import { studentEnrollmentRoute } from "./routes/student/enrollment.js";
import type { AppEnv } from "./env.js";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/*", supabaseAuth);
app.get(API_ROUTES.me, (c) => c.json({ userId: c.get("userId"), role: c.get("role") }));

app.use("/api/admin/*", requireRole("admin"));
app.route(API_ROUTES.adminUsers, adminUsersRoute);
app.route(ROUTES_CYCLE_2.adminBatches, adminBatchesRoute);
app.route(ROUTES_CYCLE_2.adminPrograms, adminProgramsRoute);
app.route(ROUTES_CYCLE_2.adminSemesters, adminSemestersRoute);
app.route(ROUTES_CYCLE_2.adminCourses, adminCoursesRoute);
app.route(ROUTES_CYCLE_2.adminStudents, adminStudentsRoute);
app.route(ROUTES_CYCLE_2.adminFaculty, adminFacultyRoute);
app.route(ROUTES_CYCLE_2.adminAdmins, adminAdminsRoute);
app.route(ROUTES_CYCLE_2.adminFacultyAssignments, adminFacultyAssignmentsRoute);
app.route(ROUTES_CYCLE_2.adminEnrollments, adminEnrollmentsRoute);
app.route(ROUTES_CYCLE_2.adminBulkEnroll, adminBulkEnrollRoute);

app.use("/api/faculty/*", requireRole("faculty"));
app.route(ROUTES_CYCLE_2.facultyCourses, facultyCoursesRoute);

app.use("/api/student/*", requireRole("student"));
app.route(ROUTES_CYCLE_2.studentEnrollment, studentEnrollmentRoute);

export default app;
```

- [ ] **Step 2: Typecheck and test**

Run: `pnpm --filter @mark-matrix/api typecheck && pnpm --filter @mark-matrix/api test`. Expected: PASS — the existing tests still pass because the new routes don't shadow anything.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): wire cycle-2 routes + faculty/student role guards"
```

---

### Task 18: API tests — CRUD, RBAC matrix, bulk enroll

**Files:**
- Create: `apps/api/src/tests/academic.crud.test.ts`
- Create: `apps/api/src/tests/academic.rbac.test.ts`
- Create: `apps/api/src/tests/bulkEnroll.test.ts`

**Interfaces:** Tests mount the route under a `Hono` app with `supabaseAuth` and `requireRole` stubbed to a fixed role and a fake Supabase client, then call `app.request(...)` directly. The existing `negative.admin-route.test.ts` is the reference for the wiring shape — read it first.

The `noUncheckedIndexedAccess` flag means every test must use non-null assertions (`!`) or guard against `undefined` when indexing arrays.

- [ ] **Step 1: Read the reference test**

Read `apps/api/src/tests/negative.admin-route.test.ts` end-to-end.

- [ ] **Step 2: Write `apps/api/src/tests/academic.crud.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminBatchesRoute } from "../routes/admin/batches.js";

function makeFakeSupabase(): SupabaseClient {
  const created: Record<string, unknown> = {};
  const builder = {
    select() { return builder; },
    insert(row: Record<string, unknown>) {
      const id = `id-${Math.random().toString(36).slice(2, 8)}`;
      const out = { id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
      Object.assign(created, out);
      return {
        select() { return Promise.resolve({ data: out, error: null }); },
        single() { return Promise.resolve({ data: out, error: null }); },
      };
    },
    update() { return { eq() { return { select() { return { maybeSingle() { return Promise.resolve({ data: null, error: null }); } }; } }; } }; },
    delete() { return { eq() { return Promise.resolve({ data: null, error: null }); } }; },
    eq() { return builder; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
  };
  return builder as unknown as SupabaseClient;
}

function makeApp(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("userId", "test-user");
    c.set("role", "admin");
    c.set("supabase", supabase);
    await next();
  });
  app.route("/api/admin/batches", adminBatchesRoute);
  return app;
}

describe("admin /api/admin/batches CRUD", () => {
  let supabase: SupabaseClient;
  let app: Hono<AppEnv>;
  beforeEach(() => { supabase = makeFakeSupabase(); app = makeApp(supabase); });

  it("POST creates a batch and returns 201", async () => {
    const res = await app.request("/api/admin/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "BCA 2023", startYear: 2023 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { name: string; startYear: number } };
    expect(body.data.name).toBe("BCA 2023");
    expect(body.data.startYear).toBe(2023);
  });

  it("POST rejects an invalid year with 400 validation_failed", async () => {
    const res = await app.request("/api/admin/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", startYear: 1999 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("validation_failed");
  });
});
```

The fake Supabase is deliberately thin — the goal is to assert the route's parse/branch logic, not the SDK. Real Supabase is exercised in the gated RLS tests (Task 19).

- [ ] **Step 3: Write `apps/api/src/tests/academic.rbac.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminBatchesRoute } from "../routes/admin/batches.js";
import { requireRole } from "../middleware/requireRole.js";

function makeFakeSupabase(): SupabaseClient {
  return {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  } as unknown as SupabaseClient;
}

function makeApp(role: "admin" | "faculty" | "student" | null): Hono<AppEnv> {
  const supabase = makeFakeSupabase();
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    if (role !== null) {
      c.set("userId", "user-1");
      c.set("role", role);
      c.set("supabase", supabase);
    }
    await next();
  });
  app.use("/api/admin/*", requireRole("admin"));
  app.route("/api/admin/batches", adminBatchesRoute);
  return app;
}

describe("admin routes are admin-only", () => {
  it.each([
    ["faculty"],
    ["student"],
  ] as const)("forbids %s from POSTing", async (role) => {
    const app = makeApp(role);
    const res = await app.request("/api/admin/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", startYear: 2023 }),
    });
    expect(res.status).toBe(403);
  });

  it("forbids anonymous POSTs", async () => {
    const app = makeApp(null);
    const res = await app.request("/api/admin/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", startYear: 2023 }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 4: Write `apps/api/src/tests/bulkEnroll.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminBulkEnrollRoute } from "../routes/admin/bulkEnroll.js";

function makeFakeSupabase(opts: {
  sem?: { id: string; program_id: string; batch_id: string } | null;
  students?: { user_id: string; roll_number: string }[];
  existing?: { student_id: string }[];
}): SupabaseClient {
  const sem = opts.sem ?? null;
  const students = opts.students ?? [];
  const existing = opts.existing ?? [];

  const from = (t: string): unknown => {
    if (t === "semesters") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: sem, error: null }),
          }),
        }),
      };
    }
    if (t === "student_enrollments") {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: existing, error: null }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    }
    if (t === "student_profiles") {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: students, error: null }),
        }),
      };
    }
    return null;
  };

  return { from } as unknown as SupabaseClient;
}

function makeApp(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("userId", "admin");
    c.set("role", "admin");
    c.set("supabase", supabase);
    await next();
  });
  app.route("/api/admin/enrollments/bulk", adminBulkEnrollRoute);
  return app;
}

describe("POST /api/admin/enrollments/bulk", () => {
  it("enrolls valid rows and reports missing students per row", async () => {
    const supabase = makeFakeSupabase({
      sem: { id: "sem-1", program_id: "p-1", batch_id: "b-1" },
      students: [{ user_id: "u-1", roll_number: "23BCA001" }],
    });
    const app = makeApp(supabase);
    const csv = "roll_number\n23BCA001\n23BCA999\n";
    const res = await app.request("/api/admin/enrollments/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ semId: "sem-1", csv }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enrolled: number; errors: { row: number; reason: string }[] };
    expect(body.enrolled).toBe(1);
    expect(body.errors).toEqual([
      { row: 3, rollNumber: "23BCA999", reason: "no_such_student" },
    ]);
  });

  it("flags already-enrolled students as errors", async () => {
    const supabase = makeFakeSupabase({
      sem: { id: "sem-1", program_id: "p-1", batch_id: "b-1" },
      students: [{ user_id: "u-1", roll_number: "23BCA001" }],
      existing: [{ student_id: "u-1" }],
    });
    const app = makeApp(supabase);
    const csv = "roll_number\n23BCA001\n";
    const res = await app.request("/api/admin/enrollments/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ semId: "sem-1", csv }),
    });
    const body = (await res.json()) as { enrolled: number; errors: { reason: string }[] };
    expect(body.enrolled).toBe(0);
    expect(body.errors[0]?.reason).toBe("already_enrolled");
  });

  it("returns 400 when semId is missing", async () => {
    const supabase = makeFakeSupabase();
    const app = makeApp(supabase);
    const res = await app.request("/api/admin/enrollments/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "roll_number\n23BCA001\n" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 5: Run tests, fix any wiring**

Run: `pnpm --filter @mark-matrix/api test`. Iterate until green. If a route's call shape doesn't match, extend the fake rather than rewriting the route.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tests/academic.crud.test.ts apps/api/src/tests/academic.rbac.test.ts apps/api/src/tests/bulkEnroll.test.ts
git commit -m "test(api): CRUD, RBAC matrix, bulk enroll coverage"
```

---

### Task 19: Gated RLS integration tests

**Files:**
- Create: `apps/api/src/tests/rls.academic.test.ts`

**Interfaces:** Gated by `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_RLS=1`. The existing `rls.profiles.test.ts` is the structural reference — it provisions users via the Admin API in `beforeAll`, builds per-user clients, and asserts against the real database.

The test provisions: one batch with one program and two semesters, two courses, one admin, one faculty user (promoted and given a faculty profile), one student user (with student profile), then exercises the scenarios in §7.2 of the spec.

- [ ] **Step 1: Read the reference test**

Read `apps/api/src/tests/rls.profiles.test.ts` to copy the gating, Admin API provisioning, and `itIf` pattern exactly.

- [ ] **Step 2: Write `apps/api/src/tests/rls.academic.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey && process.env["SUPABASE_TEST_RLS"] === "1";
const itIf = enabled ? it : it.skip;

const PREFIX = `cycle2-${Date.now()}-`;
const adminEmail = `${PREFIX}admin@test.local`;
const facultyEmail = `${PREFIX}faculty@test.local`;
const studentEmail = `${PREFIX}student@test.local`;

interface ProvisionedUser { email: string; password: string; userId: string }

let admin: SupabaseClient;
let faculty: SupabaseClient;
let student: SupabaseClient;

let users: ProvisionedUser[] = [];
let courseId = "";
let otherCourseId = "";
let semId = "";
let otherSemId = "";

async function ensureUser(s: SupabaseClient, u: { email: string; password: string }): Promise<string> {
  const { data: list } = await s.auth.admin.listUsers();
  const existing = list.users.find((x) => x.email === u.email);
  if (existing) return existing.id;
  const { data, error } = await s.auth.admin.createUser({
    email: u.email, password: u.password, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${u.email}`);
  return data.user.id;
}

async function setRole(s: SupabaseClient, userId: string, role: "admin" | "faculty" | "student"): Promise<void> {
  const { error } = await s.from("profiles").update({ role }).eq("user_id", userId);
  if (error) throw new Error(`setRole ${role} failed: ${error.message}`);
}

async function clientFor(user: { email: string; password: string }): Promise<SupabaseClient> {
  const c = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword(user);
  if (error) throw new Error(`signIn ${user.email} failed: ${error.message}`);
  return c;
}

async function semesterContext(s: SupabaseClient, sid: string): Promise<{ batchId: string; programId: string }> {
  const { data, error } = await s
    .from("semesters")
    .select("program_id, programs!inner(batch_id)")
    .eq("id", sid)
    .single();
  if (error || !data) throw new Error(`semesterContext failed: ${error?.message ?? "no data"}`);
  const row = data as unknown as { program_id: string; programs: { batch_id: string } };
  return { batchId: row.programs.batch_id, programId: row.program_id };
}

beforeAll(async () => {
  if (!enabled) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });

  const trio = [
    { email: adminEmail, password: "TestPass!1" },
    { email: facultyEmail, password: "TestPass!1" },
    { email: studentEmail, password: "TestPass!1" },
  ];
  for (const t of trio) {
    const userId = await ensureUser(admin, t);
    users.push({ ...t, userId });
  }
  await setRole(admin, users[0]!.userId, "admin");
  await setRole(admin, users[1]!.userId, "faculty");
  await setRole(admin, users[2]!.userId, "student");

  const { data: batch } = await admin.from("batches").insert({
    name: `${PREFIX}batch`, start_year: 2023,
  }).select().single();
  if (!batch) throw new Error("batch insert failed");
  const { data: program } = await admin.from("programs").insert({
    batch_id: (batch as { id: string }).id, code: "BCA", name: "BCA",
  }).select().single();
  if (!program) throw new Error("program insert failed");
  const { data: sems } = await admin.from("semesters").insert([
    { program_id: (program as { id: string }).id, number: 1 },
    { program_id: (program as { id: string }).id, number: 2 },
  ]).select();
  if (!sems || sems.length !== 2) throw new Error("sem insert failed");
  semId = (sems[0] as { id: string }).id;
  otherSemId = (sems[1] as { id: string }).id;

  const { data: courses } = await admin.from("courses").insert([
    { semester_id: semId, code: "BCA101", title: "Intro", credits: 3 },
    { semester_id: otherSemId, code: "BCA201", title: "Other", credits: 3 },
  ]).select();
  if (!courses || courses.length !== 2) throw new Error("course insert failed");
  courseId = (courses[0] as { id: string }).id;
  otherCourseId = (courses[1] as { id: string }).id;

  await admin.from("faculty_profiles").insert({
    user_id: users[1]!.userId, employee_code: `${PREFIX}EMP-F`,
  });
  await admin.from("student_profiles").insert({
    user_id: users[2]!.userId, roll_number: `${PREFIX}23BCA001`, admission_year: 2023,
  });

  faculty = await clientFor({ email: facultyEmail, password: "TestPass!1" });
  student = await clientFor({ email: studentEmail, password: "TestPass!1" });
});

afterAll(async () => {
  if (!enabled) return;
  await admin.from("faculty_assignments").delete().eq("course_id", courseId);
  await admin.from("student_enrollments").delete().eq("sem_id", semId);
  if (users[2]?.userId) await admin.from("student_profiles").delete().eq("user_id", users[2]!.userId);
  if (users[1]?.userId) await admin.from("faculty_profiles").delete().eq("user_id", users[1]!.userId);
  await admin.from("courses").delete().in("id", [courseId, otherCourseId]);
  await admin.from("semesters").delete().in("id", [semId, otherSemId]);
  await admin.from("programs").delete().eq("code", "BCA");
  await admin.from("batches").delete().like("name", `${PREFIX}%`);
});

describe("RLS: cycle-2 academic structure", () => {
  itIf("1. non-admin writes are rejected", async () => {
    const { error: e1 } = await faculty.from("batches").insert({ name: "X", start_year: 2023 });
    expect(e1).not.toBeNull();
    const { error: e2 } = await student.from("courses").insert({
      semester_id: semId, code: "X", title: "X", credits: 3,
    });
    expect(e2).not.toBeNull();
  });

  itIf("2. faculty sees a course only after assignment", async () => {
    const before = await faculty.from("courses").select("id").eq("id", courseId);
    expect(before.data).toEqual([]);

    const { error: assignErr } = await admin.from("faculty_assignments").insert({
      faculty_id: users[1]!.userId, course_id: courseId,
    });
    expect(assignErr).toBeNull();
    const after = await faculty.from("courses").select("id").eq("id", courseId);
    expect(after.data).toHaveLength(1);

    const other = await faculty.from("courses").select("id").eq("id", otherCourseId);
    expect(other.data).toEqual([]);
  });

  itIf("3. student enrollment surfaces batch/program/sem context", async () => {
    const ctx = await semesterContext(admin, semId);
    const { error: enrollErr } = await admin.from("student_enrollments").insert({
      student_id: users[2]!.userId,
      sem_id: semId,
      batch_id: ctx.batchId,
      program_id: ctx.programId,
    });
    expect(enrollErr).toBeNull();
    const { data, error } = await student
      .from("student_enrollments")
      .select("id, sem_id, batch_id, program_id, semesters!inner(id, number, program_id, programs!inner(id, batch_id))")
      .eq("sem_id", semId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect((data?.[0] as unknown as { semesters: { number: number } })?.semesters?.number).toBe(1);
  });

  itIf("4a. duplicate enrollment is rejected with 23505", async () => {
    const { error } = await admin.from("student_enrollments").insert({
      student_id: users[2]!.userId, sem_id: semId,
      batch_id: "", program_id: "",
    });
    expect(error?.code).toBe("23505");
  });

  itIf("4b. assigning faculty to a non-existent course fails with 23503", async () => {
    const { error } = await admin.from("faculty_assignments").insert({
      faculty_id: users[1]!.userId,
      course_id: "00000000-0000-0000-0000-000000000999",
    });
    expect(error?.code).toBe("23503");
  });

  itIf("4c. assigning a non-faculty user fails with 23503", async () => {
    const { error } = await admin.from("faculty_assignments").insert({
      faculty_id: users[2]!.userId,
      course_id: courseId,
    });
    expect(error?.code).toBe("23503");
  });

  itIf("5. mismatched (batch, program, sem) tuple is rejected", async () => {
    const ctx = await semesterContext(admin, semId);
    const { error } = await admin.from("student_enrollments").insert({
      student_id: users[2]!.userId,
      sem_id: otherSemId,
      program_id: ctx.programId,
      batch_id: "00000000-0000-0000-0000-000000000999",
    });
    expect(error?.code).toBe("23503");
  });

  itIf("6. wrong-role satellite insert is rejected", async () => {
    const { error } = await admin.from("faculty_profiles").insert({
      user_id: users[2]!.userId,
      employee_code: `${PREFIX}BAD`,
    });
    expect(error?.code).toBe("23514");
  });

  itIf("7. role change with a satellite is blocked", async () => {
    const { error } = await admin.from("profiles").update({ role: "student" }).eq("user_id", users[1]!.userId);
    expect(error?.code).toBe("23514");
    const { error: delErr } = await admin.from("faculty_profiles").delete().eq("user_id", users[1]!.userId);
    expect(delErr).toBeNull();
    const { error: updErr } = await admin.from("profiles").update({ role: "student" }).eq("user_id", users[1]!.userId);
    expect(updErr).toBeNull();
  });

  itIf("8. profiles is admin-write-only", async () => {
    const { data, error } = await student.from("profiles")
      .update({ name: "NotAllowed" }).eq("user_id", users[2]!.userId).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run ungated first — must skip cleanly**

Run: `pnpm --filter @mark-matrix/api test`. Expected: all `itIf` cases are skipped because creds aren't set. Other tests pass.

- [ ] **Step 4: Create the runbook**

Create `.docs/cycle-2-testing.md`:

```markdown
# Cycle 2 — Testing Runbook

## Ungated unit / handler tests

\`\`\`bash
pnpm install
pnpm --filter @mark-matrix/shared test
pnpm --filter @mark-matrix/api test
pnpm --filter @mark-matrix/web test
\`\`\`

Expected: all tests pass; the rls.academic and rls.profiles test files are
skipped without credentials.

## Gated RLS integration tests

Against a local Supabase:

\`\`\`bash
pnpm db:reset
pnpm db:seed:test-users

export SUPABASE_TEST_URL=http://127.0.0.1:54321
export SUPABASE_TEST_SERVICE_ROLE_KEY=$(supabase status --output env | grep SERVICE_ROLE_KEY | cut -d= -f2)
export SUPABASE_TEST_RLS=1
pnpm --filter @mark-matrix/api test rls.academic
pnpm --filter @mark-matrix/api test rls.profiles
\`\`\`

Expected: all 8 cycle-2 scenarios + 4 cycle-1 scenarios pass.

## Manual smoke (local)

1. `pnpm db:reset && pnpm db:seed:admin`
2. `pnpm dev` — API on 8787, web on 5173.
3. Sign in as `admin@mark-matrix.local` (default password `changeme`).
4. Promote `student.test` to faculty (Users page), create a faculty profile
   for them, then create a course, then assign them to it. Sign in as
   `faculty.test` and confirm the course appears in `/faculty/courses`.
5. Upload a CSV with three rows (one valid, one unknown roll, one duplicate)
   to the enrollments page and confirm the per-row report.
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tests/rls.academic.test.ts .docs/cycle-2-testing.md
git commit -m "test(api): gated RLS scenarios for cycle-2 tables + runbook"
```

---

## Phase 4 — Web layer

### Task 20: Web API client and useResource hook

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/useResource.ts`

**Interfaces:** `apiFetch<T>(path, init): Promise<T>` attaches the Supabase access token and base URL, throws on non-2xx with the typed body. `useResource<T>(path): { data: T | null; loading: boolean; error: string | null; refetch: () => void }`.

`apiFetch` uses `supabase.auth.getSession()` to get the token. `useResource` is responsible for awaiting the session in its effect.

- [ ] **Step 1: Write `apps/web/src/lib/api.ts`**

```ts
import { supabase } from "./supabase.js";

export interface ApiError extends Error {
  status: number;
  body: { error: string; detail?: string; fields?: { path: string; message: string }[] };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  if (token) cachedToken = { token, expiresAt: Date.now() + 60_000 };
  return token;
}

const BASE_URL = import.meta.env["VITE_API_ORIGIN"] ?? "";

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text.length > 0 ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`API ${res.status}`) as ApiError;
    err.status = res.status;
    err.body = body ?? { error: "unknown" };
    throw err;
  }
  return body as T;
}
```

- [ ] **Step 2: Write `apps/web/src/lib/useResource.ts`**

```ts
import { useEffect, useState, useCallback } from "react";
import { apiFetch, type ApiError } from "./api.js";

export interface UseResourceResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useResource<T>(path: string | null): UseResourceResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<T>(path)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: ApiError) => {
        if (!cancelled) {
          setError(e.body?.error ?? "load_failed");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [path, nonce]);

  return { data, loading, error, refetch };
}
```

- [ ] **Step 3: Lint and typecheck**

Run: `pnpm --filter @mark-matrix/web typecheck && ppnpm --filter @mark-matrix/web lint`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/useResource.ts
git commit -m "feat(web): apiFetch wrapper and useResource hook"
```

---

### Task 21: Admin pages — academic structure, users, assignments, enrollments

**Files:**
- Create: `apps/web/src/pages/admin/components/EntityPanel.tsx`
- Create: `apps/web/src/pages/admin/AcademicStructurePage.tsx`
- Create: `apps/web/src/pages/admin/UsersPage.tsx`
- Create: `apps/web/src/pages/admin/AssignmentsPage.tsx`
- Create: `apps/web/src/pages/admin/EnrollmentsPage.tsx`
- Create: `apps/web/src/pages/admin/components/CsvEnrollUpload.tsx`
- Create: `apps/web/src/pages/faculty/FacultyCoursesPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/shell/navConfig.ts`
- Modify: `apps/web/src/styles.css`

This is the largest single task. The pages are intentionally simple — they use `useState` and the new `useResource` hook, render tables of `data`, and POST/PATCH/DELETE through `apiFetch`. No form library, no UI components, no drag-and-drop; consistent with the existing `LoginPage` style.

- [ ] **Step 1: Write `EntityPanel.tsx`**

```tsx
import { useState, type FormEvent } from "react";

export interface Column<T> { key: keyof T & string; label: string; }
export interface EntityPanelProps<T extends { id: string }> {
  title: string;
  rows: T[] | null;
  columns: Column<T>[];
  emptyForm: Record<string, string>;
  onCreate: (input: Record<string, string>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function EntityPanel<T extends { id: string }>({
  title, rows, columns, emptyForm, onCreate, onDelete,
}: EntityPanelProps<T>) {
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate(form);
      setForm(emptyForm);
    } catch (err) {
      setError((err as { body?: { error?: string } }).body?.error ?? "create_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="entity-panel">
      <h2 className="entity-panel__title">{title}</h2>
      {error !== null && <p className="entity-panel__error">{error}</p>}
      <form className="entity-panel__form" onSubmit={submit}>
        {Object.keys(emptyForm).map((k) => (
          <label className="entity-panel__field" key={k}>
            <span>{k}</span>
            <input
              value={form[k] ?? ""}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              disabled={busy}
            />
          </label>
        ))}
        <button type="submit" disabled={busy}>Create</button>
      </form>
      <table className="entity-panel__table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key}>{c.label}</th>)}
            {onDelete && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              {columns.map((c) => <td key={c.key}>{String(r[c.key])}</td>)}
              {onDelete && (
                <td>
                  <button onClick={() => onDelete(r.id)} disabled={busy}>Delete</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Write `AcademicStructurePage.tsx`**

Drill-down master-detail: a left column lists batches, the right column shows programs/semesters/courses for the selected batch. Selecting a program reveals semesters; selecting a semester reveals courses.

```tsx
import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";

interface Batch { id: string; name: string; startYear: number; }
interface Program { id: string; batchId: string; code: string; name: string; }
interface Semester { id: string; programId: string; number: number; }
interface Course { id: string; semesterId: string; code: string; title: string; credits: number; }

export function AcademicStructurePage() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<string | null>(null);

  const batches = useResource<{ data: Batch[] }>(ROUTES_CYCLE_2.adminBatches);
  const programs = useResource<{ data: Program[] }>(
    batchId !== null ? `${ROUTES_CYCLE_2.adminPrograms}?batchId=${batchId}` : null,
  );
  const semesters = useResource<{ data: Semester[] }>(
    programId !== null ? `${ROUTES_CYCLE_2.adminSemesters}?programId=${programId}` : null,
  );
  const courses = useResource<{ data: Course[] }>(
    semesterId !== null ? `${ROUTES_CYCLE_2.adminCourses}?semesterId=${semesterId}` : null,
  );

  return (
    <main className="academic-page">
      <h1>Academic Structure</h1>
      <div className="academic-page__grid">
        <nav className="academic-page__col">
          <h2>Batches</h2>
          <ul>
            {(batches.data?.data ?? []).map((b) => (
              <li key={b.id}>
                <button
                  className={b.id === batchId ? "active" : ""}
                  onClick={() => { setBatchId(b.id); setProgramId(null); setSemesterId(null); }}
                >{b.name} ({b.startYear})</button>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="academic-page__col">
          <h2>Programs</h2>
          <ul>
            {(programs.data?.data ?? []).map((p) => (
              <li key={p.id}>
                <button
                  className={p.id === programId ? "active" : ""}
                  onClick={() => { setProgramId(p.id); setSemesterId(null); }}
                >{p.code} — {p.name}</button>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="academic-page__col">
          <h2>Semesters</h2>
          <ul>
            {(semesters.data?.data ?? []).map((s) => (
              <li key={s.id}>
                <button
                  className={s.id === semesterId ? "active" : ""}
                  onClick={() => setSemesterId(s.id)}
                >Semester {s.number}</button>
              </li>
            ))}
          </ul>
        </nav>
        <section className="academic-page__col academic-page__col--wide">
          <h2>Courses</h2>
          <ul>
            {(courses.data?.data ?? []).map((c) => (
              <li key={c.id}>{c.code} — {c.title} ({c.credits} cr)</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Write `UsersPage.tsx`**

```tsx
import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { API_ROUTES, ROUTES_CYCLE_2 } from "@mark-matrix/shared";

interface Profile { user_id: string; name: string; role: "admin" | "faculty" | "student"; }

export function UsersPage() {
  const profiles = useResource<{ users: Profile[] }>(API_ROUTES.adminUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setRole = async (userId: string, role: "admin" | "faculty" | "student"): Promise<void> => {
    setBusy(userId);
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminUserById(userId), {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "role_change_failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="users-page">
      <h1>Users</h1>
      {error !== null && <p className="users-page__error">{error}</p>}
      <table>
        <thead>
          <tr><th>Name</th><th>Role</th><th>Set role</th></tr>
        </thead>
        <tbody>
          {(profiles.data?.users ?? []).map((u) => (
            <tr key={u.user_id}>
              <td>{u.name}</td>
              <td>{u.role}</td>
              <td>
                {(["admin", "faculty", "student"] as const).map((r) => (
                  <button
                    key={r}
                    disabled={busy === u.user_id || u.role === r}
                    onClick={() => setRole(u.user_id, r)}
                  >{r}</button>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 4: Write `AssignmentsPage.tsx`**

```tsx
import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";

interface Assignment { id: string; facultyId: string; courseId: string; assignedDate: string; }
interface Course { id: string; code: string; title: string; }
interface FacultySat { userId: string; name: string; employeeCode?: string; }

export function AssignmentsPage() {
  const courses = useResource<{ data: Course[] }>(ROUTES_CYCLE_2.adminCourses);
  const faculty = useResource<{ data: FacultySat[] }>(ROUTES_CYCLE_2.adminFaculty);
  const assignments = useResource<{ data: Assignment[] }>(ROUTES_CYCLE_2.adminFacultyAssignments);
  const [facultyId, setFacultyId] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminFacultyAssignments, {
        method: "POST",
        body: JSON.stringify({ facultyId, courseId }),
      });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "assign_failed");
    }
  };

  const remove = async (id: string): Promise<void> => {
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminFacultyAssignmentById(id), { method: "DELETE" });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "delete_failed");
    }
  };

  return (
    <main className="assignments-page">
      <h1>Faculty Assignments</h1>
      {error !== null && <p className="assignments-page__error">{error}</p>}
      <div className="assignments-page__form">
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">— pick a course —</option>
          {(courses.data?.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
          ))}
        </select>
        <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
          <option value="">— pick a faculty member —</option>
          {(faculty.data?.data ?? []).map((f) => (
            <option key={f.userId} value={f.userId}>{f.name} ({f.employeeCode ?? "no code"})</option>
          ))}
        </select>
        <button onClick={submit} disabled={!courseId || !facultyId}>Assign</button>
      </div>
      <table>
        <thead><tr><th>Course</th><th>Faculty</th><th>Assigned</th><th>Actions</th></tr></thead>
        <tbody>
          {(assignments.data?.data ?? []).map((a) => (
            <tr key={a.id}>
              <td>{a.courseId}</td>
              <td>{a.facultyId}</td>
              <td>{a.assignedDate}</td>
              <td><button onClick={() => remove(a.id)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 5: Write `CsvEnrollUpload.tsx` and `EnrollmentsPage.tsx`**

```tsx
// pages/admin/components/CsvEnrollUpload.tsx
import { useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import { parseEnrollCsv, ROUTES_CYCLE_2 } from "@mark-matrix/shared";

export interface CsvEnrollUploadProps {
  semId: string;
  onComplete?: () => void;
}

export function CsvEnrollUpload({ semId, onComplete }: CsvEnrollUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ rows: unknown[]; errors: unknown[] } | null>(null);
  const [serverReport, setServerReport] = useState<{ enrolled: number; errors: unknown[] } | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const onPick = async (f: File): Promise<void> => {
    setFile(f);
    const text = await f.text();
    setPreview(parseEnrollCsv(text));
    setServerReport(null);
  };

  const submit = async (): Promise<void> => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const report = await apiFetch<{ enrolled: number; errors: unknown[] }>(
        ROUTES_CYCLE_2.adminBulkEnroll,
        { method: "POST", body: JSON.stringify({ semId, csv: text }) },
      );
      setServerReport(report);
      onComplete?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="csv-enroll">
      <input
        type="file"
        accept=".csv,text/csv"
        data-testid="csv-input"
        onChange={(e) => { if (e.target.files?.[0]) void onPick(e.target.files[0]); }}
      />
      {preview && (
        <div className="csv-enroll__preview">
          <p>{preview.rows.length} valid rows, {preview.errors.length} parse errors</p>
        </div>
      )}
      <button onClick={() => void submit()} disabled={!file || busy}>Upload</button>
      {serverReport && (
        <div className="csv-enroll__report">
          <p>Enrolled: {serverReport.enrolled}</p>
          <ul>
            {serverReport.errors.map((e, i) => <li key={i}>{JSON.stringify(e)}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
```

```tsx
// pages/admin/EnrollmentsPage.tsx
import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { CsvEnrollUpload } from "./components/CsvEnrollUpload.js";

interface Semester { id: string; programId: string; number: number; }
interface StudentSat { userId: string; name: string; rollNumber?: string; }
interface Enrollment { id: string; studentId: string; semId: string; enrollmentDate: string; }

export function EnrollmentsPage() {
  const semesters = useResource<{ data: Semester[] }>(ROUTES_CYCLE_2.adminSemesters);
  const students = useResource<{ data: StudentSat[] }>(ROUTES_CYCLE_2.adminStudents);
  const enrollments = useResource<{ data: Enrollment[] }>(ROUTES_CYCLE_2.adminEnrollments);
  const [semId, setSemId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminEnrollments, {
        method: "POST",
        body: JSON.stringify({ studentId, semId }),
      });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "enroll_failed");
    }
  };

  return (
    <main className="enrollments-page">
      <h1>Enrollments</h1>
      {error !== null && <p className="enrollments-page__error">{error}</p>}
      <section className="enrollments-page__single">
        <h2>Single enrollment</h2>
        <select value={semId} onChange={(e) => setSemId(e.target.value)}>
          <option value="">— pick a semester —</option>
          {(semesters.data?.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>Semester {s.number}</option>
          ))}
        </select>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">— pick a student —</option>
          {(students.data?.data ?? []).map((s) => (
            <option key={s.userId} value={s.userId}>{s.name} ({s.rollNumber ?? "no roll"})</option>
          ))}
        </select>
        <button onClick={() => void submit()} disabled={!semId || !studentId}>Enroll</button>
      </section>
      <section className="enrollments-page__bulk">
        <h2>Bulk enroll (CSV)</h2>
        {semId !== "" ? (
          <CsvEnrollUpload semId={semId} onComplete={() => window.location.reload()} />
        ) : (
          <p>Pick a semester above to enable bulk upload.</p>
        )}
      </section>
      <table>
        <thead><tr><th>Student</th><th>Semester</th><th>Date</th></tr></thead>
        <tbody>
          {(enrollments.data?.data ?? []).map((e) => (
            <tr key={e.id}><td>{e.studentId}</td><td>{e.semId}</td><td>{e.enrollmentDate}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 6: Write `FacultyCoursesPage.tsx`**

```tsx
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";

interface FacultyCourseView {
  id: string;
  code: string;
  title: string;
  credits: number;
  semester: { id: string; number: number; programId: string; batchId: string };
}

export function FacultyCoursesPage() {
  const courses = useResource<{ data: FacultyCourseView[] }>(ROUTES_CYCLE_2.facultyCourses);
  return (
    <main className="faculty-courses">
      <h1>My Courses</h1>
      {courses.loading && <p>Loading…</p>}
      {courses.error !== null && <p>Error: {courses.error}</p>}
      <ul>
        {(courses.data?.data ?? []).map((c) => (
          <li key={c.id}>
            <strong>{c.code}</strong> — {c.title} ({c.credits} cr)
            <br />Semester {c.semester.number} · Batch {c.semester.batchId} · Program {c.semester.programId}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 7: Update `App.tsx`**

Replace the existing placeholder routes with the new ones. Final shape:

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
    <Route path="/" element={<DashboardPlaceholder />} />
    <Route path="admin/users" element={<ProtectedRoute roles={["admin"]}><UsersPage /></ProtectedRoute>} />
    <Route path="admin/academic" element={<ProtectedRoute roles={["admin"]}><AcademicStructurePage /></ProtectedRoute>} />
    <Route path="admin/assignments" element={<ProtectedRoute roles={["admin"]}><AssignmentsPage /></ProtectedRoute>} />
    <Route path="admin/enrollments" element={<ProtectedRoute roles={["admin"]}><EnrollmentsPage /></ProtectedRoute>} />
    <Route path="faculty/courses" element={<ProtectedRoute roles={["faculty"]}><FacultyCoursesPage /></ProtectedRoute>} />
    <Route path="student/results" element={<ProtectedRoute roles={["student"]}><StudentPlaceholder /></ProtectedRoute>} />
  </Route>
  <Route path="/forbidden" element={<ForbiddenPage />} />
  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

Add the imports at the top and remove `UsersPlaceholder`/`FacultyPlaceholder` imports. The student placeholder stays — the student course-list view is a future cycle.

- [ ] **Step 8: Update `shell/navConfig.ts`**

Add the new admin entries (under the admin role) and update the faculty entry to point to `FacultyCoursesPage`. The exact shape already in the file dictates the structure; mirror it.

- [ ] **Step 9: Update `styles.css`**

Append new BEM-ish classes used by the pages: `.academic-page__grid`, `.academic-page__col`, `.users-page__error`, `.assignments-page__form`, `.csv-enroll__preview`, `.csv-enroll__report`, `.enrollments-page__single`, `.enrollments-page__bulk`, `.faculty-courses`, `.entity-panel__title`, `.entity-panel__form`, `.entity-panel__field`, `.entity-panel__error`, `.entity-panel__table`. Keep the existing hand-written style consistent — no Tailwind, no modules.

- [ ] **Step 10: Lint, typecheck, and unit tests**

Run: `pnpm --filter @mark-matrix/web typecheck && pnpm --filter @mark-matrix/web lint && pnpm --filter @mark-matrix/web test`. Expected: PASS. The existing `App.test.tsx` may need its snapshot updated if it referenced the old placeholders.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): admin hierarchy, users, assignments, enrollments, faculty courses"
```

---

### Task 22: Web component tests for CSV upload and academic structure

**Files:**
- Create: `apps/web/src/tests/CsvEnrollUpload.test.tsx`
- Create: `apps/web/src/tests/AcademicStructurePage.test.tsx`

**Interfaces:** Use `@testing-library/react`'s `render` and `screen`. Mock `apiFetch` from `../../lib/api.js` with `vi.mock`.

- [ ] **Step 1: Write `CsvEnrollUpload.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CsvEnrollUpload } from "../pages/admin/components/CsvEnrollUpload.js";

vi.mock("../../lib/api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({ enrolled: 2, errors: [] }),
}));

describe("CsvEnrollUpload", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("parses and previews valid rows", async () => {
    render(<CsvEnrollUpload semId="sem-1" />);
    const file = new File(["roll_number\n23BCA001\n23BCA002\n"], "enroll.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/2 valid rows/)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Write `AcademicStructurePage.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AcademicStructurePage } from "../pages/admin/AcademicStructurePage.js";

vi.mock("../../lib/api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
}));

describe("AcademicStructurePage", () => {
  it("renders the four-column layout with empty lists", () => {
    render(<AcademicStructurePage />);
    expect(screen.getByText("Batches")).toBeTruthy();
    expect(screen.getByText("Programs")).toBeTruthy();
    expect(screen.getByText("Semesters")).toBeTruthy();
    expect(screen.getByText("Courses")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests, iterate**

Run: `pnpm --filter @mark-matrix/web test`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/tests
git commit -m "test(web): CsvEnrollUpload + AcademicStructurePage"
```

---

## Phase 5 — Seeds, runbook, and final pass

### Task 23: Extend seed-test-users to provision satellite rows

**Files:**
- Modify: `scripts/seed-test-users.ts`

**Interfaces:** After creating each `auth.users` + `profiles` row, the script also inserts the matching satellite row. The faculty and admin satellites require the user to have `role = 'faculty'` / `'admin'` first, which is what the script already sets.

- [ ] **Step 1: Read the existing script**

Read `scripts/seed-test-users.ts` end-to-end. Note the user-provisioning pattern and the role-setting step.

- [ ] **Step 2: Append the satellite provisioning block**

After the existing role-setting block, add:

```ts
const satellites = [
  { userId: userIds["admin.test"],   table: "admin_profiles",   row: { employee_code: "TEST-ADMIN-001" } },
  { userId: userIds["faculty.test"], table: "faculty_profiles", row: { employee_code: "TEST-FAC-001", department: "CS", designation: "Lecturer" } },
  { userId: userIds["student.test"], table: "student_profiles", row: { roll_number: "TEST-23BCA001", admission_year: 2023 } },
] as const;

for (const s of satellites) {
  const { error } = await admin
    .from(s.table)
    .upsert({ user_id: s.userId, ...s.row }, { onConflict: "user_id" });
  if (error) throw new Error(`satellite upsert failed: ${error.message}`);
}
```

Read the script to confirm the variable names (`userIds`, `admin`) match what's already there. If the script uses different names, adapt.

- [ ] **Step 3: Run the seed against a fresh database**

Run: `pnpm db:reset && pnpm db:seed:test-users`. Expected: completes without error.

Verify:

```bash
psql "$SUPABASE_DB_URL" -c "select user_id, employee_code from admin_profiles;"
psql "$SUPABASE_DB_URL" -c "select user_id, roll_number, admission_year from student_profiles;"
```

Expected: one row each.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-test-users.ts
git commit -m "chore(seeds): provision role-satellite rows for test users"
```

---

### Task 24: Self-review and final pass

This is a self-review task, not a code change. The writer of the plan walks it against the spec and the repo state, looking for gaps and placeholder leftovers.

- [ ] **Step 1: Spec coverage**

Walk each numbered section of the spec and confirm a task implements it. Each spec decision and section is covered; see the spec table of contents against the task list.

- [ ] **Step 2: Placeholder scan**

```bash
grep -nE "TBD|TODO|fill in|implement later" docs/superpowers/plans/2026-08-20-cycle-2-academic-structure.md
```

Expected: no matches.

- [ ] **Step 3: Type consistency**

Spot-check the names and shapes used in later tasks against earlier ones:
- `Batch` interface: declared in task 11 step 1, used in task 21 step 2. ✓
- `Course`: declared in task 11 step 4, used in task 21 step 2. ✓
- `CreateEnrollment`: imported in task 14 step 2. ✓
- `ROUTES_CYCLE_2.adminBulkEnroll`: declared in task 1 step 3, used in task 15 and task 21 step 5. ✓
- `mapPgError` signature: task 9 step 3 → task 11 factory + every route. ✓

- [ ] **Step 4: Final repo pass**

Run from repo root: `pnpm install && pnpm lint && pnpm typecheck && pnpm test`. Expected: PASS. The RLS tests are skipped without credentials — that's the contract.

- [ ] **Step 5: Smoke runbook**

Walk `.docs/cycle-2-testing.md` from start to finish against a fresh `pnpm db:reset`. Confirm the manual smoke section's claims still hold after the implementation.

- [ ] **Step 6: Final commit**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore(cycle-2): final pass"
```

If nothing changed, no commit. If something did, commit it.

---

## Acceptance criteria recap

A reviewer running through this plan should be able to verify:

1. `pnpm db:reset` applies all five migrations cleanly.
2. `pnpm lint && pnpm typecheck && pnpm test` passes without credentials; gated tests skip.
3. `SUPABASE_TEST_RLS=1 pnpm test:rls` exercises the eight cycle-2 RLS scenarios plus the four cycle-1 ones.
4. An admin can, through the UI alone, build a full hierarchy, assign a faculty member, enroll a student, and bulk-enroll a CSV, seeing per-row feedback.
5. A faculty member sees a course only after being assigned to it.
6. Deleting a parent with children returns `409 has_dependents` and the message is visible in the UI.
7. A freshly signed-up user can be taken to teaching a course entirely through the API/UI without any direct database or service-role access beyond the initial admin bootstrap.
