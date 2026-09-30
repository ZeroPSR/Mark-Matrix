import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPassRateForCourse,
  getToppersForCourse,
  getAttendanceShortageForCourse,
  getSemSummary,
} from "../lib/analyticsRepo.js";

/**
 * A mock Supabase client. We dispatch on `from(table)` and on the chain of
 * `.eq()`/`.select()`/etc. Each test sets the `responses` map keyed by
 * table; calls outside the map return empty arrays. RLS is NOT modelled — the
 * test mocks return everything as if the caller were admin.
 */
function makeMockSupabase(opts: {
  courseGrades?: { course_id: string; student_id: string; is_passing: boolean; total_obtained: string | number; total_max: string | number; percentage: string | number; grade_label: string; grade_point: string | number }[];
  studentProfiles?: { user_id: string; roll_number: string }[];
  attendance?: { student_id: string; status: "present" | "absent" | "late"; session_date: string }[];
  distinctSessions?: { session_date: string }[];
  courses?: { id: string; code: string; title: string; semester_id: string }[];
  enrollments?: { student_id: string; sem_id: string }[];
} = {}): SupabaseClient {
  const R = {
    course_grades: opts.courseGrades ?? [],
    student_profiles: opts.studentProfiles ?? [],
    attendance: opts.attendance ?? [],
    sessions: opts.distinctSessions ?? [],
    courses: opts.courses ?? [],
    student_enrollments: opts.enrollments ?? [],
  };

  const builder = (table: keyof typeof R): unknown => {
    const b: Record<string, unknown> = {
      select(_cols?: unknown) { return b; },
      eq(_col?: unknown, _val?: unknown) { return b; },
      in(_col?: unknown, _vals?: unknown) { return b; },
      order(_col?: unknown, _opts?: unknown) { return b; },
      gte(_col?: unknown, _val?: unknown) { return b; },
      then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
        if (table === "courses") {
          return Promise.resolve({ data: R.courses, error: null }).then(onFulfilled);
        }
        if (table === "sessions") {
          return Promise.resolve({ data: R.sessions, error: null }).then(onFulfilled);
        }
        return Promise.resolve({ data: R[table], error: null }).then(onFulfilled);
      },
    };
    return b;
  };
  return { from: (t: string) => builder(t as keyof typeof R) } as unknown as SupabaseClient;
}

beforeEach(() => {});

describe("getPassRateForCourse", () => {
  it("returns 0/0/0 when no rows exist", async () => {
    const supabase = makeMockSupabase();
    const out = await getPassRateForCourse(supabase, "c1");
    expect(out).toEqual({ courseId: "c1", total: 0, passing: 0, rate: 0 });
  });

  it("counts passing rows and computes rate rounded to 2 decimals", async () => {
    const supabase = makeMockSupabase({
      courseGrades: [
        { course_id: "c1", student_id: "s1", is_passing: true,  total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9 },
        { course_id: "c1", student_id: "s2", is_passing: true,  total_obtained: 80, total_max: 100, percentage: 80, grade_label: "B", grade_point: 8 },
        { course_id: "c1", student_id: "s3", is_passing: true,  total_obtained: 70, total_max: 100, percentage: 70, grade_label: "C", grade_point: 7 },
        { course_id: "c1", student_id: "s4", is_passing: false, total_obtained: 35, total_max: 100, percentage: 35, grade_label: "F", grade_point: 0 },
      ],
    });
    const out = await getPassRateForCourse(supabase, "c1");
    expect(out).toEqual({ courseId: "c1", total: 4, passing: 3, rate: 75 });
  });

  it("Review Focus 2 — students with no cached grade are excluded (no rows => 0/0/0)", async () => {
    const supabase = makeMockSupabase({ courseGrades: [] });
    const out = await getPassRateForCourse(supabase, "c1");
    expect(out.total).toBe(0);
  });
});

describe("getToppersForCourse", () => {
  it("returns top N ordered by grade_point desc, joined with roll_number", async () => {
    const supabase = makeMockSupabase({
      courseGrades: [
        { course_id: "c1", student_id: "s2", is_passing: true,  total_obtained: 80, total_max: 100, percentage: 80, grade_label: "B", grade_point: 8 },
        { course_id: "c1", student_id: "s1", is_passing: true,  total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9 },
        { course_id: "c1", student_id: "s3", is_passing: false, total_obtained: 35, total_max: 100, percentage: 35, grade_label: "F", grade_point: 0 },
      ],
      studentProfiles: [
        { user_id: "s1", roll_number: "23BCA001" },
        { user_id: "s2", roll_number: "23BCA002" },
        { user_id: "s3", roll_number: "23BCA003" },
      ],
    });
    const out = await getToppersForCourse(supabase, "c1", 2);
    expect(out).toEqual([
      { studentId: "s1", rollNumber: "23BCA001", totalObtained: 90, totalMax: 100, percentage: 90, gradeLabel: "A", gradePoint: 9 },
      { studentId: "s2", rollNumber: "23BCA002", totalObtained: 80, totalMax: 100, percentage: 80, gradeLabel: "B", gradePoint: 8 },
    ]);
  });

  it("returns empty array when no students are graded", async () => {
    const supabase = makeMockSupabase();
    const out = await getToppersForCourse(supabase, "c1", 5);
    expect(out).toEqual([]);
  });
});

describe("getAttendanceShortageForCourse", () => {
  it("returns only students below threshold; late counts as present", async () => {
    const supabase = makeMockSupabase({
      attendance: [
          { student_id: "sA", status: "present", session_date: "2026-09-01" },
          { student_id: "sA", status: "present", session_date: "2026-09-02" },
          { student_id: "sA", status: "present", session_date: "2026-09-03" },
          { student_id: "sA", status: "late",    session_date: "2026-09-04" },
          { student_id: "sB", status: "present", session_date: "2026-09-01" },
          { student_id: "sB", status: "present", session_date: "2026-09-02" },
          { student_id: "sB", status: "present", session_date: "2026-09-03" },
          { student_id: "sB", status: "absent",  session_date: "2026-09-04" },
          { student_id: "sC", status: "present", session_date: "2026-09-01" },
          { student_id: "sC", status: "present", session_date: "2026-09-02" },
          { student_id: "sC", status: "absent",  session_date: "2026-09-03" },
          { student_id: "sC", status: "absent",  session_date: "2026-09-04" },
      ],
      distinctSessions: [
        { session_date: "2026-09-01" }, { session_date: "2026-09-02" },
        { session_date: "2026-09-03" }, { session_date: "2026-09-04" },
      ],
      studentProfiles: [
        { user_id: "sA", roll_number: "R-A" },
        { user_id: "sB", roll_number: "R-B" },
        { user_id: "sC", roll_number: "R-C" },
      ],
    });
    const out = await getAttendanceShortageForCourse(supabase, "c1", 75);
    expect(out).toEqual([
      { studentId: "sC", rollNumber: "R-C", presentCount: 2, totalSessions: 4, percentage: 50 },
    ]);
  });

  it("returns empty array when no sessions exist", async () => {
    const supabase = makeMockSupabase({ distinctSessions: [] });
    const out = await getAttendanceShortageForCourse(supabase, "c1", 75);
    expect(out).toEqual([]);
  });
});

describe("getSemSummary", () => {
  it("returns one row per course with the aggregated stats", async () => {
    const supabase = makeMockSupabase({
      courses: [
        { id: "c1", code: "CS101", title: "Intro to Programming", semester_id: "s1" },
        { id: "c2", code: "CS102", title: "Discrete Maths",       semester_id: "s1" },
      ],
      enrollments: [
        { student_id: "st1", sem_id: "s1" }, { student_id: "st2", sem_id: "s1" },
        { student_id: "st3", sem_id: "s1" }, { student_id: "st4", sem_id: "s1" },
      ],
      courseGrades: [
        { course_id: "c1", student_id: "st1", is_passing: true,  total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9 },
        { course_id: "c1", student_id: "st2", is_passing: true,  total_obtained: 80, total_max: 100, percentage: 80, grade_label: "B", grade_point: 8 },
        { course_id: "c2", student_id: "st1", is_passing: true,  total_obtained: 85, total_max: 100, percentage: 85, grade_label: "B", grade_point: 8 },
      ],
    });
    const out = await getSemSummary(supabase, "s1");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ courseId: "c1", courseCode: "CS101", enrolled: 4 });
    expect(out[1]).toMatchObject({ courseId: "c2", courseCode: "CS102", enrolled: 4 });
  });

  it("returns empty array when sem has no courses", async () => {
    const supabase = makeMockSupabase({ courses: [] });
    const out = await getSemSummary(supabase, "s1");
    expect(out).toEqual([]);
  });
});