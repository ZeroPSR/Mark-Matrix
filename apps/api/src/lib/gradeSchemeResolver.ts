import type { SupabaseClient } from "@supabase/supabase-js";
import type { GradeBand } from "@mark-matrix/shared";

type SchemeRow = {
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
  updated_at: string;
};

const toBand = (r: SchemeRow): GradeBand => ({
  gradeLabel: r.grade_label,
  minMarks: Number(r.min_marks),
  maxMarks: Number(r.max_marks),
  gradePoint: Number(r.grade_point),
  isPassing: r.is_passing,
});

/** Translate a courseId to its program/semester ids. */
export async function getSchemeAnchorInfo(
  supabase: SupabaseClient,
  courseId: string,
): Promise<{ programId: string; semesterId: string } | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, semester_id, semesters!inner(program_id)")
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // Supabase returns joined relations as a nested object — narrow it.
  const row = data as unknown as {
    semester_id: string;
    semesters: { program_id: string };
  };
  return { programId: row.semesters.program_id, semesterId: row.semester_id };
}

/**
 * Resolve the applicable scheme bands for a course. Precedence:
 *   1. course-scoped schemes anchored to this course
 *   2. program-scoped schemes anchored to this course's program
 * Within a scope, the most recently updated scheme_group wins.
 * Returns null if neither scope has any scheme.
 */
export async function resolveSchemeBands(
  supabase: SupabaseClient,
  courseId: string,
): Promise<{ bands: GradeBand[]; schemeId: string; schemeGroup: string } | null> {
  const anchor = await getSchemeAnchorInfo(supabase, courseId);
  if (!anchor) return null;

  // Try course scope first.
  const courseScope = await fetchScopeBands(
    supabase,
    "course",
    courseId,
    /* programOrCourseId */ null,
    anchor,
  );
  if (courseScope) return courseScope;

  // Fall back to program scope.
  return fetchScopeBands(
    supabase,
    "program",
    null,
    anchor.programId,
    anchor,
  );
}

async function fetchScopeBands(
  supabase: SupabaseClient,
  scope: "course" | "program",
  courseId: string | null,
  programId: string | null,
  anchor: { programId: string; semesterId: string },
): Promise<{ bands: GradeBand[]; schemeId: string; schemeGroup: string } | null> {
  let query = supabase
    .from("grade_schemes")
    .select(
      "id, scheme_group, scope, course_id, program_id, grade_label, min_marks, max_marks, grade_point, is_passing, updated_at",
    )
    .eq("scope", scope)
    .order("updated_at", { ascending: false });
  if (scope === "course" && courseId !== null) {
    query = query.eq("course_id", courseId);
  } else if (scope === "program" && programId !== null) {
    query = query.eq("program_id", programId);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as SchemeRow[];
  if (rows.length === 0) return null;
  const topGroup = rows[0]!.scheme_group;
  const bands = rows
    .filter((r) => r.scheme_group === topGroup)
    .map(toBand);
  return { bands, schemeId: rows[0]!.id, schemeGroup: topGroup };
}
