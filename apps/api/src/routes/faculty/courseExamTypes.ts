import { Hono } from "hono";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

export interface ExamTypeView {
  examType: string;
  maxMarks: number;
}

type ExamTypeRow = { exam_type: string; max_marks: number };

const fromRow = (r: ExamTypeRow): ExamTypeView => ({
  examType: r.exam_type,
  maxMarks: Number(r.max_marks),
});

export const courseExamTypesRoute = new Hono<AppEnv>().get(
  "/:courseId/exam-types",
  async (c) => {
    const supabase = c.get("supabase");
    const courseId = c.req.param("courseId");
    if (!courseId) return c.json({ error: "missing_course" }, 400);
    const { data, error } = await supabase
      .from("course_exam_types")
      .select("exam_type, max_marks")
      .eq("course_id", courseId)
      .order("exam_type", { ascending: true });
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json({
      data: (data ?? []).map((r) => fromRow(r as unknown as ExamTypeRow)),
    });
  },
);
