import { Hono } from "hono";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";
import type { CourseWithSemester } from "@mark-matrix/shared";

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

const fromRow = (r: Row): CourseWithSemester => ({
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

/**
 * GET / — every course, each with the semester hierarchy it sits in.
 *
 * The CRUD endpoint at `/api/admin/courses` returns a flat row carrying only
 * a `semesterId`. That is enough to list a course, but not to address
 * anything under it: the marks, attendance, analytics and approve/lock/
 * unlock URLs are all built from the batch, program and semester ids. A page
 * that needs those ids and reads the flat list gets `undefined` for the
 * whole hierarchy and cannot render.
 *
 * The shape matches `/api/faculty/courses` exactly — see
 * `CourseWithSemester` in the shared package, which both endpoints and both
 * kinds of page declare against.
 *
 * No `?semesterId=` filter here: the embedded `semesters` join makes the
 * column reference ambiguous to PostgREST, and no caller needs it.
 */
export const adminCourseHierarchyRoute = new Hono<AppEnv>().get("/", async (c) => {
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
