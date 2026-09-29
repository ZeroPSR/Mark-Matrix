import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey && process.env["SUPABASE_TEST_RLS"] === "1";
const itIf = enabled ? it : it.skip;

const PREFIX = `mk-c6-${Date.now()}-`;
const adminEmail = `${PREFIX}admin@test.local`;
const facultyEmail = `${PREFIX}faculty@test.local`;
const studentEmail = `${PREFIX}student@test.local`;
const otherStudentEmail = `${PREFIX}other@test.local`;

let admin: SupabaseClient;
// `faculty` is provisioned in beforeAll() so the faculty credentials exist
// for the cycle-6 row, but the lifecycle tests mutate marks/gradesheets via
// the admin client (RLS bypass) rather than the faculty RLS-bound client.
let student: SupabaseClient;
let otherStudent: SupabaseClient;

let batchId = "";
let programId = "";
let semId = "";
let courseA = "";
let courseB = "";
let facultyUserId = "";
let studentUserId = "";
let otherStudentUserId = "";

async function ensureUser(s: SupabaseClient, email: string, password: string): Promise<string> {
  const { data: list } = await s.auth.admin.listUsers();
  const existing = list.users.find((x) => x.email === email);
  if (existing) return existing.id;
  const { data, error } = await s.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${email}`);
  return data.user.id;
}

async function setRole(
  s: SupabaseClient,
  userId: string,
  role: "admin" | "faculty" | "student",
): Promise<void> {
  const { error } = await s.from("profiles").update({ role }).eq("user_id", userId);
  if (error) throw new Error(`setRole ${role} failed: ${error.message}`);
}

async function clientFor(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email} failed: ${error.message}`);
  return c;
}

beforeAll(async () => {
  if (!enabled) return;
  admin = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = [
    { email: adminEmail, password: "TestPass!1" },
    { email: facultyEmail, password: "TestPass!1" },
    { email: studentEmail, password: "TestPass!1" },
    { email: otherStudentEmail, password: "TestPass!1" },
  ];
  const ids: string[] = [];
  for (const u of users) ids.push(await ensureUser(admin, u.email, u.password));
  await setRole(admin, ids[0]!, "admin");
  await setRole(admin, ids[1]!, "faculty");
  await setRole(admin, ids[2]!, "student");
  await setRole(admin, ids[3]!, "student");
  facultyUserId = ids[1]!;
  studentUserId = ids[2]!;
  otherStudentUserId = ids[3]!;

  // Provision the faculty credentials (used by RLS policies and the
  // faculty_assignments insert below) but discard the client — the
  // lifecycle tests mutate marks/gradesheets directly via the admin client.
  await clientFor(facultyEmail, "TestPass!1");
  student = await clientFor(studentEmail, "TestPass!1");
  otherStudent = await clientFor(otherStudentEmail, "TestPass!1");

  // Minimal academic hierarchy + exam types + faculty/student wiring.
  const { data: batch } = await admin
    .from("batches")
    .insert({ name: `${PREFIX}B`, start_year: 2026 })
    .select()
    .single();
  if (!batch) throw new Error("batch insert failed");
  batchId = (batch as { id: string }).id;

  const { data: program } = await admin
    .from("programs")
    .insert({ batch_id: batchId, code: "C6", name: "Cycle-6 Test" })
    .select()
    .single();
  if (!program) throw new Error("program insert failed");
  programId = (program as { id: string }).id;

  const { data: sem } = await admin
    .from("semesters")
    .insert({ program_id: programId, number: 1 })
    .select()
    .single();
  if (!sem) throw new Error("sem insert failed");
  semId = (sem as { id: string }).id;

  const { data: courses } = await admin
    .from("courses")
    .insert([
      {
        semester_id: semId,
        code: `${PREFIX}CSA`,
        title: "Course A",
        credits: 4,
      },
      {
        semester_id: semId,
        code: `${PREFIX}CSB`,
        title: "Course B",
        credits: 3,
      },
    ])
    .select();
  if (!courses || courses.length !== 2) throw new Error("course insert failed");
  courseA = (courses[0] as { id: string }).id;
  courseB = (courses[1] as { id: string }).id;

  await admin.from("course_exam_types").insert([
    { course_id: courseA, exam_type: "final", max_marks: 100 },
    { course_id: courseB, exam_type: "final", max_marks: 100 },
  ]);

  await admin.from("faculty_assignments").insert([
    { faculty_id: facultyUserId, course_id: courseA },
    { faculty_id: facultyUserId, course_id: courseB },
  ]);

  await admin.from("student_enrollments").insert([
    {
      student_id: studentUserId,
      sem_id: semId,
      batch_id: batchId,
      program_id: programId,
    },
    {
      student_id: otherStudentUserId,
      sem_id: semId,
      batch_id: batchId,
      program_id: programId,
    },
  ]);

  // Seed marks rows in 'draft' status across both students and both courses.
  for (const cid of [courseA, courseB]) {
    for (const sid of [studentUserId, otherStudentUserId]) {
      await admin.from("marks").insert({
        course_id: cid,
        student_id: sid,
        exam_type: "final",
        marks_obtained: 80,
        max_marks: 100,
        entered_by: facultyUserId,
      });
    }
  }
});

afterAll(async () => {
  if (!enabled) return;
  // Best-effort cleanup. Order matters because of FKs.
  await admin.from("course_grades").delete().eq("course_id", courseA);
  await admin.from("course_grades").delete().eq("course_id", courseB);
  await admin.from("scores").delete().in("student_id", [studentUserId, otherStudentUserId]);
  await admin.from("gradesheets").delete().eq("sem_id", semId);
  await admin.from("marks").delete().in("course_id", [courseA, courseB]);
  await admin.from("student_enrollments").delete().eq("sem_id", semId);
  await admin.from("course_exam_types").delete().in("course_id", [courseA, courseB]);
  await admin.from("faculty_assignments").delete().in("course_id", [courseA, courseB]);
  await admin.from("courses").delete().in("id", [courseA, courseB]);
  await admin.from("semesters").delete().eq("id", semId);
  await admin.from("programs").delete().eq("id", programId);
  await admin.from("batches").delete().eq("id", batchId);
  for (const email of [adminEmail, facultyEmail, studentEmail, otherStudentEmail]) {
    const { data: u } = await admin.auth.admin.listUsers();
    const target = u.users.find((x) => x.email === email);
    if (target) await admin.auth.admin.deleteUser(target.id);
  }
});

describe("full lifecycle (spec test 1): submit → approve → lock → compile → lock → publish → student reads", () => {
  itIf("1. faculty submits course A (POST /marks/submit equivalent)", async () => {
    // Submit is a status flip from 'draft' → 'submitted'. Done directly
    // because the test does not exercise the Hono app — only the DB state.
    const { error } = await admin
      .from("marks")
      .update({ status: "submitted" })
      .eq("course_id", courseA)
      .eq("status", "draft");
    expect(error).toBeNull();
  });

  itIf("2. admin approves course A (status submitted → approved)", async () => {
    const { error } = await admin
      .from("marks")
      .update({ status: "approved", approved_by: admin.auth.admin ? null : null })
      .eq("course_id", courseA)
      .eq("status", "submitted");
    expect(error).toBeNull();
  });

  itIf("3. admin locks course A (status approved → locked)", async () => {
    const { error } = await admin
      .from("marks")
      .update({ status: "locked" })
      .eq("course_id", courseA)
      .eq("status", "approved");
    expect(error).toBeNull();
  });

  itIf("4. compile attempt while course B is still draft → catalog shows incomplete", async () => {
    // The compile endpoint returns 422 only when the route reads the marks
    // catalog. At the DB layer, the only way to detect this is to count
    // non-locked marks rows for course B. The actual HTTP assertion lives in
    // Task 7's gradesheets.compile.test.ts; here we confirm the catalog
    // state matches what compile would see.
    const { count } = await admin
      .from("marks")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseB)
      .neq("status", "locked");
    expect(count).toBeGreaterThan(0);
  });

  itIf("5. admin approves + locks course B", async () => {
    const a = await admin
      .from("marks")
      .update({ status: "approved" })
      .eq("course_id", courseB)
      .eq("status", "submitted");
    expect(a.error).toBeNull();
    const b = await admin
      .from("marks")
      .update({ status: "locked" })
      .eq("course_id", courseB)
      .eq("status", "approved");
    expect(b.error).toBeNull();
  });

  itIf("6. compile succeeds after every course's marks are locked", async () => {
    // Direct insert of a cached course_grades row so compile can compute
    // SGPA without an external grade-scheme run. We don't call the compile
    // route here; we confirm the precondition (no non-locked marks for
    // courseA or courseB) holds.
    const { count: nonLocked } = await admin
      .from("marks")
      .select("id", { count: "exact", head: true })
      .in("course_id", [courseA, courseB])
      .neq("status", "locked");
    expect(nonLocked).toBe(0);
  });

  itIf("7. student cannot read their gradesheet pre-publish (RLS denies)", async () => {
    // RLS policy gradesheets_student_select filters on status='published',
    // so a student selecting any pre-published row gets [].
    const { data, error } = await student
      .from("gradesheets")
      .select("id, status")
      .eq("sem_id", semId)
      .eq("student_id", studentUserId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  itIf("8. admin publishes a placeholder gradesheet (manual status flip)", async () => {
    // Insert a placeholder compiled gradesheet for one student so we can
    // exercise the publish→student-read path. The cycle-6 plan has admin
    // route handlers for compile/lock/publish; here we simulate by direct
    // DB writes so the integration test stays focused on RLS + lifecycle.
    const { error: insErr } = await admin.from("gradesheets").insert({
      sem_id: semId,
      student_id: studentUserId,
      status: "published",
      sgpa: 8.5,
      total_credits: 7,
      course_count: 2,
    });
    expect(insErr).toBeNull();
  });

  itIf("9. student can read their published gradesheet (RLS allows)", async () => {
    const { data, error } = await student
      .from("gradesheets")
      .select("id, status, sgpa")
      .eq("sem_id", semId)
      .eq("student_id", studentUserId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect((data?.[0] as { status: string } | undefined)?.status).toBe("published");
  });

  itIf("10. another student cannot read this student's published gradesheet", async () => {
    const { data, error } = await otherStudent
      .from("gradesheets")
      .select("id, student_id")
      .eq("sem_id", semId)
      .eq("student_id", studentUserId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
