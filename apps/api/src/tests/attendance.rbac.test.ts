import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey && process.env["SUPABASE_TEST_RLS"] === "1";
const itIf = enabled ? it : it.skip;

const PREFIX = `att-${Date.now()}-`;
const adminEmail = `${PREFIX}admin@test.local`;
const facultyEmail = `${PREFIX}faculty@test.local`;
const otherFacultyEmail = `${PREFIX}faculty2@test.local`;
const aliceEmail = `${PREFIX}alice@test.local`;
const bobEmail = `${PREFIX}bob@test.local`;

let admin: SupabaseClient;
let faculty: SupabaseClient;
let alice: SupabaseClient;

let courseA = "";
let courseB = "";
let semId = "";
let programId = "";
let batchId = "";
let facultyUserId = "";
let otherFacultyUserId = "";
let aliceUserId = "";
let bobUserId = "";

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

async function setRole(s: SupabaseClient, userId: string, role: "admin" | "faculty" | "student"): Promise<void> {
  const { error } = await s.from("profiles").update({ role }).eq("user_id", userId);
  if (error) throw new Error(`setRole ${role} failed: ${error.message}`);
}

async function clientFor(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email} failed: ${error.message}`);
  return c;
}

beforeAll(async () => {
  if (!enabled) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });

  const trio = [
    { email: adminEmail,        password: "TestPass!1" },
    { email: facultyEmail,      password: "TestPass!1" },
    { email: otherFacultyEmail, password: "TestPass!1" },
    { email: aliceEmail,        password: "TestPass!1" },
    { email: bobEmail,          password: "TestPass!1" },
  ];
  const ids: string[] = [];
  for (const t of trio) ids.push(await ensureUser(admin, t.email, t.password));
  await setRole(admin, ids[0]!, "admin");
  await setRole(admin, ids[1]!, "faculty");
  await setRole(admin, ids[2]!, "faculty");
  await setRole(admin, ids[3]!, "student");
  await setRole(admin, ids[4]!, "student");
  facultyUserId = ids[1]!;
  otherFacultyUserId = ids[2]!;
  aliceUserId = ids[3]!;
  bobUserId = ids[4]!;

  const { data: batch } = await admin.from("batches").insert({
    name: `${PREFIX}batch`, start_year: 2024,
  }).select().single();
  if (!batch) throw new Error("batch insert failed");
  batchId = (batch as { id: string }).id;

  const { data: program } = await admin.from("programs").insert({
    batch_id: batchId, code: "ATT", name: "Attendance Test",
  }).select().single();
  if (!program) throw new Error("program insert failed");
  programId = (program as { id: string }).id;

  const { data: sem } = await admin.from("semesters").insert({
    program_id: programId, number: 1,
  }).select().single();
  if (!sem) throw new Error("sem insert failed");
  semId = (sem as { id: string }).id;

  const { data: courses } = await admin.from("courses").insert([
    { semester_id: semId, code: "ATT-101", title: "Course A", credits: 3 },
    { semester_id: semId, code: "ATT-102", title: "Course B", credits: 3 },
  ]).select();
  if (!courses || courses.length !== 2) throw new Error("course insert failed");
  courseA = (courses[0] as { id: string }).id;
  courseB = (courses[1] as { id: string }).id;

  await admin.from("faculty_profiles").insert([
    { user_id: facultyUserId,      employee_code: `${PREFIX}EMP-F1` },
    { user_id: otherFacultyUserId, employee_code: `${PREFIX}EMP-F2` },
  ]);
  await admin.from("student_profiles").insert([
    { user_id: aliceUserId, roll_number: `${PREFIX}ALICE`, admission_year: 2024 },
    { user_id: bobUserId,   roll_number: `${PREFIX}BOB`,   admission_year: 2024 },
  ]);
  await admin.from("student_enrollments").insert([
    { student_id: aliceUserId, sem_id: semId, batch_id: batchId, program_id: programId },
    { student_id: bobUserId,   sem_id: semId, batch_id: batchId, program_id: programId },
  ]);
  // Assign faculty to course A only; the other faculty to course B.
  await admin.from("faculty_assignments").insert([
    { faculty_id: facultyUserId,      course_id: courseA },
    { faculty_id: otherFacultyUserId, course_id: courseB },
  ]);

  faculty      = await clientFor(facultyEmail,      "TestPass!1");
  // otherFaculty is set up in beforeAll (assigned to courseB, not courseA) so
  // we can prove RLS denies cross-course writes; we don't need a live client
  // for it in this test file.
  void otherFacultyEmail;
  alice        = await clientFor(aliceEmail,        "TestPass!1");
});

afterAll(async () => {
  if (!enabled) return;
  await admin.from("attendance").delete().eq("course_id", courseA);
  await admin.from("attendance").delete().eq("course_id", courseB);
  await admin.from("faculty_assignments").delete().in("course_id", [courseA, courseB]);
  await admin.from("student_enrollments").delete().eq("sem_id", semId);
  if (aliceUserId) await admin.from("student_profiles").delete().eq("user_id", aliceUserId);
  if (bobUserId)   await admin.from("student_profiles").delete().eq("user_id", bobUserId);
  if (facultyUserId) await admin.from("faculty_profiles").delete().eq("user_id", facultyUserId);
  if (otherFacultyUserId) await admin.from("faculty_profiles").delete().eq("user_id", otherFacultyUserId);
  await admin.from("courses").delete().in("id", [courseA, courseB]);
  await admin.from("semesters").delete().eq("id", semId);
  await admin.from("programs").delete().eq("id", programId);
  await admin.from("batches").delete().like("name", `${PREFIX}%`);
});

describe("RLS: attendance module", () => {
  itIf("1. faculty can write attendance for an assigned course and cannot for an unassigned one", async () => {
    // Assigned (course A) — should succeed.
    const ok = await faculty.from("attendance").insert({
      course_id: courseA,
      student_id: aliceUserId,
      session_date: "2026-09-01",
      status: "present",
      recorded_by: facultyUserId,
    });
    expect(ok.error).toBeNull();

    // Unassigned (course B) — should fail.
    const denied = await faculty.from("attendance").insert({
      course_id: courseB,
      student_id: aliceUserId,
      session_date: "2026-09-01",
      status: "present",
      recorded_by: facultyUserId,
    });
    expect(denied.error).not.toBeNull();
  });

  itIf("2. a student can read only their own attendance rows", async () => {
    // Add a row for Bob too.
    await faculty.from("attendance").insert({
      course_id: courseA,
      student_id: bobUserId,
      session_date: "2026-09-01",
      status: "absent",
      recorded_by: facultyUserId,
    });

    // Alice should see only her own row.
    const aliceRows = await alice.from("attendance").select("id, student_id").eq("course_id", courseA);
    expect(aliceRows.error).toBeNull();
    expect(aliceRows.data).not.toBeNull();
    for (const r of aliceRows.data ?? []) {
      expect((r as { student_id: string }).student_id).toBe(aliceUserId);
    }
  });

  itIf("3. summary computation is correct (sanity check via RLS-scoped reads)", async () => {
    // Add a second session for Alice so we have 2 of 2 = 100% for her.
    await faculty.from("attendance").insert({
      course_id: courseA,
      student_id: aliceUserId,
      session_date: "2026-09-02",
      status: "present",
      recorded_by: facultyUserId,
    });
    const rows = await faculty
      .from("attendance")
      .select("student_id, status")
      .eq("course_id", courseA);
    expect(rows.error).toBeNull();
    const buckets = new Map<string, { p: number; l: number; a: number }>();
    for (const r of (rows.data ?? []) as unknown as { student_id: string; status: string }[]) {
      const b = buckets.get(r.student_id) ?? { p: 0, l: 0, a: 0 };
      if (r.status === "present") b.p += 1;
      else if (r.status === "late") b.l += 1;
      else b.a += 1;
      buckets.set(r.student_id, b);
    }
    const aliceB = buckets.get(aliceUserId);
    expect(aliceB?.p).toBe(2);
    expect(((aliceB!.p + aliceB!.l) / (aliceB!.p + aliceB!.l + aliceB!.a)) * 100).toBe(100);
  });

  itIf("4. re-marking the same student/session upserts rather than duplicating", async () => {
    // Insert with status=present.
    const first = await faculty.from("attendance").upsert(
      {
        course_id: courseA,
        student_id: aliceUserId,
        session_date: "2026-09-03",
        status: "present",
        recorded_by: facultyUserId,
      },
      { onConflict: "course_id,student_id,session_date" },
    );
    expect(first.error).toBeNull();

    // Upsert the same key with status=absent.
    const second = await faculty.from("attendance").upsert(
      {
        course_id: courseA,
        student_id: aliceUserId,
        session_date: "2026-09-03",
        status: "absent",
        recorded_by: facultyUserId,
      },
      { onConflict: "course_id,student_id,session_date" },
    );
    expect(second.error).toBeNull();

    // Confirm: exactly one row for that key, with the new status.
    const after = await faculty
      .from("attendance")
      .select("id, status")
      .eq("course_id", courseA)
      .eq("student_id", aliceUserId)
      .eq("session_date", "2026-09-03");
    expect(after.error).toBeNull();
    expect(after.data).toHaveLength(1);
    expect((after.data?.[0] as unknown as { status: string })?.status).toBe("absent");
  });

  itIf("5. bulk-mark against a full class roster persists all rows", async () => {
    const rows = [
      {
        course_id: courseA,
        student_id: aliceUserId,
        session_date: "2026-09-04",
        status: "present" as const,
        recorded_by: facultyUserId,
      },
      {
        course_id: courseA,
        student_id: bobUserId,
        session_date: "2026-09-04",
        status: "late" as const,
        recorded_by: facultyUserId,
      },
    ];
    const r = await faculty.from("attendance").upsert(rows, { onConflict: "course_id,student_id,session_date" });
    expect(r.error).toBeNull();

    const got = await faculty
      .from("attendance")
      .select("student_id, status")
      .eq("course_id", courseA)
      .eq("session_date", "2026-09-04");
    expect(got.error).toBeNull();
    expect(got.data).toHaveLength(2);
    const byStudent = new Map(
      ((got.data ?? []) as unknown as { student_id: string; status: string }[]).map((x) => [x.student_id, x.status]),
    );
    expect(byStudent.get(aliceUserId)).toBe("present");
    expect(byStudent.get(bobUserId)).toBe("late");
  });
});
