import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEnrollmentSchema,
  formatZodError,
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

/**
 * Walk semesters -> programs to derive the denormalized (batch, program)
 * tuple required by the composite FKs. The client only supplies `semId`.
 */
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
    return c.json({
      data: (data ?? []).map((r) => fromRow(r as unknown as Row)),
    });
  })
  .post("/", async (c) => {
    const supabase = c.get("supabase");
    const body = await c.req.json().catch(() => null);
    const parsed = createEnrollmentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation_failed", fields: formatZodError(parsed.error) },
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
