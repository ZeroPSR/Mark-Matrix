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