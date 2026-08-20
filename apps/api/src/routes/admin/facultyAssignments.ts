import { Hono } from "hono";
import {
  createFacultyAssignmentSchema,
  formatZodError,
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
    return c.json({
      data: (data ?? []).map((r) => fromRow(r as unknown as Row)),
    });
  })
  .post("/", async (c) => {
    const supabase = c.get("supabase");
    const body = await c.req.json().catch(() => null);
    const parsed = createFacultyAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation_failed", fields: formatZodError(parsed.error) },
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
