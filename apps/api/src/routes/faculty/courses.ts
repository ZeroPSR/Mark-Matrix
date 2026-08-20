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
