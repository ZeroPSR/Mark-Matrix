import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// RLS for the faculty roster mounts (20261001000001_faculty_students_read.sql).
//
// Faculty may read a student row only when that student is enrolled in a
// semester in which the faculty member teaches a course. The roster query
// inner-joins `profiles`, so both tables need the faculty-select policy —
// this file pins that both halves hold, and that the negative case holds.

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey && process.env["SUPABASE_TEST_RLS"] === "1";
const itIf = enabled ? it : it.skip;

const PREFIX = `rost-${Date.now()}-`;
const adminEmail = `${PREFIX}admin@test.local`;
const facultyEmail = `${PREFIX}faculty@test.local`;
const otherFacultyEmail = `${PREFIX}faculty2@test.local`;
const aliceEmail = `${PREFIX}alice@test.local`;
const bobEmail = `${PREFIX}bob@test.local`;

const ROSTER_SELECT =
  "user_id, roll_number, admission_year, profiles!inner(name, role)";

let admin: SupabaseClient;
let adminClient: SupabaseClient;
let faculty: SupabaseClient;
let otherFaculty: SupabaseClient;
let alice: SupabaseClient;

let batchId = "";
let programId = "";
let semA = "";
let semB = "";
let courseA = "";
let courseB = "";
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

  const people = [
    { email: adminEmail, password: "TestPass!1" },
    { email: facultyEmail, password: "TestPass!1" },
    { email: otherFacultyEmail, password: "TestPass!1" },
    { email: aliceEmail, password: "TestPass!1" },
    { email: bobEmail, password: "TestPass!1" },
  ];
  const ids: string[] = [];
  for (const p of people) ids.push(await ensureUser(admin, p.email, p.password));
  await setRole(admin, ids[0]!, "admin");
  await setRole(admin, ids[1]!, "faculty");
  await setRole(admin, ids[2]!, "faculty");
  await setRole(admin, ids[3]!, "student");
  await setRole(admin, ids[4]!, "student");
  facultyUserId = ids[1]!;
  otherFacultyUserId = ids[2]!;
  aliceUserId = ids[3]!;
  bobUserId = ids[4]!;

  const { data: batch } = await admin
    .from("batches")
    .insert({ name: `${PREFIX}batch`, start_year: 2024 })
    .select()
    .single();
  if (!batch) throw new Error("batch insert failed");
  batchId = (batch as { id: string }).id;

  const { data: program } = await admin
    .from("programs")
    .insert({ batch_id: batchId, code: "ROST", name: "Roster Test" })
    .select()
    .single();
  if (!program) throw new Error("program insert failed");
  programId = (program as { id: string }).id;

  const { data: sems } = await admin
    .from("semesters")
    .insert([
      { program_id: programId, number: 1 },
      { program_id: programId, number: 2 },
    ])
    .select();
  if (!sems || sems.length !== 2) throw new Error("semester insert failed");
  semA = (sems[0] as { id: string }).id;
  semB = (sems[1] as { id: string }).id;

  const { data: courses } = await admin
    .from("courses")
    .insert([
      { semester_id: semA, code: "ROST-101", title: "Course A", credits: 3 },
      { semester_id: semB, code: "ROST-201", title: "Course B", credits: 3 },
    ])
    .select();
  if (!courses || courses.length !== 2) throw new Error("course insert failed");
  courseA = (courses[0] as { id: string }).id;
  courseB = (courses[1] as { id: string }).id;

  await admin.from("faculty_profiles").insert([
    { user_id: facultyUserId, employee_code: `${PREFIX}EMP-F1` },
    { user_id: otherFacultyUserId, employee_code: `${PREFIX}EMP-F2` },
  ]);
  await admin.from("student_profiles").insert([
    { user_id: aliceUserId, roll_number: `${PREFIX}ALICE`, admission_year: 2024 },
    { user_id: bobUserId, roll_number: `${PREFIX}BOB`, admission_year: 2024 },
  ]);
  // Alice is in the faculty member's semester; Bob is in the other faculty's.
  await admin.from("student_enrollments").insert([
    { student_id: aliceUserId, sem_id: semA, batch_id: batchId, program_id: programId },
    { student_id: bobUserId, sem_id: semB, batch_id: batchId, program_id: programId },
  ]);
  await admin.from("faculty_assignments").insert([
    { faculty_id: facultyUserId, course_id: courseA },
    { faculty_id: otherFacultyUserId, course_id: courseB },
  ]);

  faculty = await clientFor(facultyEmail, "TestPass!1");
  otherFaculty = await clientFor(otherFacultyEmail, "TestPass!1");
  alice = await clientFor(aliceEmail, "TestPass!1");
  // An *authenticated* admin client. The service-role `admin` client bypasses
  // RLS entirely, so it cannot prove the policies leave admins unaffected.
  adminClient = await clientFor(adminEmail, "TestPass!1");
});

afterAll(async () => {
  if (!enabled) return;
  await admin.from("faculty_assignments").delete().in("course_id", [courseA, courseB]);
  await admin.from("student_enrollments").delete().eq("sem_id", semA);
  await admin.from("student_enrollments").delete().eq("sem_id", semB);
  if (aliceUserId) await admin.from("student_profiles").delete().eq("user_id", aliceUserId);
  if (bobUserId) await admin.from("student_profiles").delete().eq("user_id", bobUserId);
  if (facultyUserId)
    await admin.from("faculty_profiles").delete().eq("user_id", facultyUserId);
  if (otherFacultyUserId)
    await admin.from("faculty_profiles").delete().eq("user_id", otherFacultyUserId);
  await admin.from("courses").delete().in("id", [courseA, courseB]);
  await admin.from("semesters").delete().in("id", [semA, semB]);
  await admin.from("programs").delete().eq("id", programId);
  await admin.from("batches").delete().like("name", `${PREFIX}%`);
});

describe("RLS: faculty roster read", () => {
  itIf("1. faculty can read the students in a semester they teach", async () => {
    const { data, error } = await faculty
      .from("student_profiles")
      .select(ROSTER_SELECT);
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => (r as { user_id: string }).user_id);
    expect(ids).toContain(aliceUserId);
  });

  itIf("2. faculty cannot read students outside the semesters they teach", async () => {
    const { data, error } = await faculty
      .from("student_profiles")
      .select(ROSTER_SELECT);
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => (r as { user_id: string }).user_id);
    expect(ids).not.toContain(bobUserId);
  });

  itIf("3. the other faculty member sees their own student, not this one's", async () => {
    const { data, error } = await otherFaculty
      .from("student_profiles")
      .select(ROSTER_SELECT);
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => (r as { user_id: string }).user_id);
    expect(ids).toContain(bobUserId);
    expect(ids).not.toContain(aliceUserId);
  });

  itIf("4. faculty can read enrollments for the semester they teach", async () => {
    const { data, error } = await faculty
      .from("student_enrollments")
      .select("id, student_id, sem_id");
    expect(error).toBeNull();
    const rows = data ?? [];
    expect(rows.some((r) => (r as { student_id: string }).student_id === aliceUserId)).toBe(
      true,
    );
    expect(rows.some((r) => (r as { student_id: string }).student_id === bobUserId)).toBe(
      false,
    );
  });

  itIf("5. a student can read their own row but not another student's", async () => {
    const { data, error } = await alice.from("student_profiles").select(ROSTER_SELECT);
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => (r as { user_id: string }).user_id);
    // Own row is readable (student_profiles_select_own).
    expect(ids).toContain(aliceUserId);
    // Another student's row is not.
    expect(ids).not.toContain(bobUserId);
  });

  itIf("6. admin is unaffected — sees every student", async () => {
    // The authenticated admin client, not the service-role one: the service
    // role bypasses RLS, so reading through it would pass whether or not the
    // new policies work. This assertion goes through the admin's real
    // RLS-scoped path (`student_profiles_admin_all` → `public.is_admin()`).
    const { data, error } = await adminClient.from("student_profiles").select(ROSTER_SELECT);
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => (r as { user_id: string }).user_id);
    expect(ids).toContain(aliceUserId);
    expect(ids).toContain(bobUserId);
  });
});
