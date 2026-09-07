import { Hono, type Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createGradeSchemeSchema,
  patchGradeSchemeSchema,
  formatZodError,
  type GradeSchemeRow,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

type Ctx = Context<AppEnv>;

type DbRow = {
  id: string;
  scheme_group: string;
  scope: "course" | "program";
  course_id: string | null;
  program_id: string | null;
  grade_label: string;
  min_marks: string | number;
  max_marks: string | number;
  grade_point: string | number;
  is_passing: boolean;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: DbRow): GradeSchemeRow => ({
  id: r.id,
  schemeGroup: r.scheme_group,
  scope: r.scope,
  courseId: r.course_id,
  programId: r.program_id,
  gradeLabel: r.grade_label,
  minMarks: Number(r.min_marks),
  maxMarks: Number(r.max_marks),
  gradePoint: Number(r.grade_point),
  isPassing: r.is_passing,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_COLS =
  "id, scheme_group, scope, course_id, program_id, grade_label, min_marks, max_marks, grade_point, is_passing, created_at, updated_at";

/**
 * Two bands overlap when both share scheme_group + scope + anchor and their
 * numeric ranges intersect strictly. Equality at a boundary is allowed
 * (so A can end at 80 and B can start at 80, with 80 belonging to A).
 */
function bandsOverlap(
  a: { min: number; max: number },
  b: { min: number; max: number },
): boolean {
  return a.min < b.max && b.min < a.max;
}

async function findSiblingBands(
  supabase: SupabaseClient,
  args: {
    schemeGroup: string;
    scope: "course" | "program";
    courseId?: string;
    programId?: string;
  },
): Promise<DbRow[]> {
  let q = supabase
    .from("grade_schemes")
    .select(SELECT_COLS)
    .eq("scheme_group", args.schemeGroup)
    .eq("scope", args.scope);
  if (args.scope === "course" && args.courseId !== undefined) {
    q = q.eq("course_id", args.courseId);
  } else if (args.scope === "program" && args.programId !== undefined) {
    q = q.eq("program_id", args.programId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as DbRow[];
}

async function listSchemes(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  let q = supabase.from("grade_schemes").select(SELECT_COLS).order("scheme_group").order("min_marks", { ascending: false });
  const scope = c.req.query("scope");
  const courseId = c.req.query("courseId");
  const programId = c.req.query("programId");
  const schemeGroup = c.req.query("schemeGroup");
  if (scope === "course") q = q.eq("scope", "course");
  else if (scope === "program") q = q.eq("scope", "program");
  if (courseId) q = q.eq("course_id", courseId);
  if (programId) q = q.eq("program_id", programId);
  if (schemeGroup) q = q.eq("scheme_group", schemeGroup);

  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data: (data ?? []).map((r) => fromRow(r as unknown as DbRow)) });
}

async function createScheme(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const body = await c.req.json().catch(() => null);
  const parsed = createGradeSchemeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", fields: formatZodError(parsed.error) }, 400);
  }
  const v = parsed.data;

  let siblings: DbRow[];
  try {
    siblings = await findSiblingBands(supabase as never, {
      schemeGroup: v.schemeGroup,
      scope: v.scope,
      courseId: v.courseId,
      programId: v.programId,
    });
  } catch (e) {
    const m = mapPgError(e as { code?: string; message?: string });
    return c.json(m.body, m.status);
  }

  for (const s of siblings) {
    if (bandsOverlap({ min: v.minMarks, max: v.maxMarks }, { min: Number(s.min_marks), max: Number(s.max_marks) })) {
      return c.json(
        { error: "overlapping_band", detail: `overlaps ${s.grade_label} [${s.min_marks}, ${s.max_marks}]` },
        409,
      );
    }
  }

  const { data, error } = await supabase
    .from("grade_schemes")
    .insert({
      scheme_group: v.schemeGroup,
      scope: v.scope,
      course_id: v.courseId ?? null,
      program_id: v.programId ?? null,
      grade_label: v.gradeLabel,
      min_marks: v.minMarks,
      max_marks: v.maxMarks,
      grade_point: v.gradePoint,
      is_passing: v.isPassing ?? true,
    })
    .select(SELECT_COLS)
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data: fromRow(data as unknown as DbRow) }, 201);
}

async function patchScheme(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = patchGradeSchemeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", fields: formatZodError(parsed.error) }, 400);
  }

  // Build update object with snake_case keys.
  const upd: Record<string, unknown> = {};
  if (parsed.data.gradeLabel !== undefined) upd["grade_label"] = parsed.data.gradeLabel;
  if (parsed.data.minMarks !== undefined) upd["min_marks"] = parsed.data.minMarks;
  if (parsed.data.maxMarks !== undefined) upd["max_marks"] = parsed.data.maxMarks;
  if (parsed.data.gradePoint !== undefined) upd["grade_point"] = parsed.data.gradePoint;
  if (parsed.data.isPassing !== undefined) upd["is_passing"] = parsed.data.isPassing;

  // If min/max changed, check overlap against siblings.
  if (parsed.data.minMarks !== undefined || parsed.data.maxMarks !== undefined) {
    const { data: existing, error: fetchErr } = await supabase
      .from("grade_schemes")
      .select(SELECT_COLS)
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      const m = mapPgError(fetchErr);
      return c.json(m.body, m.status);
    }
    if (!existing) return c.json({ error: "not_found" }, 404);
    const ex = existing as unknown as DbRow;
    const newMin = parsed.data.minMarks ?? Number(ex.min_marks);
    const newMax = parsed.data.maxMarks ?? Number(ex.max_marks);
    if (newMin > newMax) {
      return c.json({ error: "min_exceeds_max" }, 400);
    }
    const siblings = await findSiblingBands(supabase as never, {
      schemeGroup: ex.scheme_group,
      scope: ex.scope,
      courseId: ex.course_id ?? undefined,
      programId: ex.program_id ?? undefined,
    });
    for (const s of siblings) {
      if (s.id === id) continue;
      if (bandsOverlap({ min: newMin, max: newMax }, { min: Number(s.min_marks), max: Number(s.max_marks) })) {
        return c.json(
          { error: "overlapping_band", detail: `overlaps ${s.grade_label} [${s.min_marks}, ${s.max_marks}]` },
          409,
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("grade_schemes")
    .update(upd)
    .eq("id", id)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) return c.json({ error: "not_found" }, 404);
  return c.json({ data: fromRow(data as unknown as DbRow) });
}

async function deleteScheme(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  // Check dependents first.
  const { count, error: countErr } = await supabase
    .from("course_grades")
    .select("id", { count: "exact", head: true })
    .eq("grade_scheme_id", id);
  if (countErr) {
    const m = mapPgError(countErr);
    return c.json(m.body, m.status);
  }
  if ((count ?? 0) > 0) {
    return c.json({ error: "has_dependents", detail: `${count} course_grades reference this scheme` }, 409);
  }
  const { error } = await supabase.from("grade_schemes").delete().eq("id", id);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ deleted: id });
}

export const adminGradeSchemesRoute = new Hono<AppEnv>()
  .get("/", listSchemes)
  .post("/", createScheme)
  .patch("/:id", patchScheme)
  .delete("/:id", deleteScheme);