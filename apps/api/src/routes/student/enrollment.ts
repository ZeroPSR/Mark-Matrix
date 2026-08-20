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
