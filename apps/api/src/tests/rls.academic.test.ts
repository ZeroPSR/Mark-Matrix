import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey && process.env["SUPABASE_TEST_RLS"] === "1";
const itIf = enabled ? it : it.skip;

const PREFIX = `cycle2-${Date.now()}-`;
const adminEmail = `${PREFIX}admin@test.local`;
const facultyEmail = `${PREFIX}faculty@test.local`;
const studentEmail = `${PREFIX}student@test.local`;

interface ProvisionedUser { email: string; password: string; userId: string }

let admin: SupabaseClient;
let faculty: SupabaseClient;
let student: SupabaseClient;

const users: ProvisionedUser[] = [];
let courseId = "";
let otherCourseId = "";
let semId = "";
let otherSemId = "";

async function ensureUser(s: SupabaseClient, u: { email: string; password: string }): Promise<string> {
  const { data: list } = await s.auth.admin.listUsers();
  const existing = list.users.find((x) => x.email === u.email);
  if (existing) return existing.id;
  const { data, error } = await s.auth.admin.createUser({
    email: u.email, password: u.password, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${u.email}`);
  return data.user.id;
}

async function setRole(s: SupabaseClient, userId: string, role: "admin" | "faculty" | "student"): Promise<void> {
  const { error } = await s.from("profiles").update({ role }).eq("user_id", userId);
  if (error) throw new Error(`setRole ${role} failed: ${error.message}`);
}

async function clientFor(user: { email: string; password: string }): Promise<SupabaseClient> {
  const c = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword(user);
  if (error) throw new Error(`signIn ${user.email} failed: ${error.message}`);
  return c;
}

async function semesterContext(s: SupabaseClient, sid: string): Promise<{ batchId: string; programId: string }> {
  const { data, error } = await s
    .from("semesters")
    .select("program_id, programs!inner(batch_id)")
    .eq("id", sid)
    .single();
  if (error || !data) throw new Error(`semesterContext failed: ${error?.message ?? "no data"}`);
  const row = data as unknown as { program_id: string; programs: { batch_id: string } };
  return { batchId: row.programs.batch_id, programId: row.program_id };
}

beforeAll(async () => {
  if (!enabled) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });

  const trio = [
    { email: adminEmail, password: "TestPass!1" },
    { email: facultyEmail, password: "TestPass!1" },
    { email: studentEmail, password: "TestPass!1" },
  ];
  for (const t of trio) {
    const userId = await ensureUser(admin, t);
    users.push({ ...t, userId });
  }
  await setRole(admin, users[0]!.userId, "admin");
  await setRole(admin, users[1]!.userId, "faculty");
  await setRole(admin, users[2]!.userId, "student");

  const { data: batch } = await admin.from("batches").insert({
    name: `${PREFIX}batch`, start_year: 2023,
  }).select().single();
  if (!batch) throw new Error("batch insert failed");
  const { data: program } = await admin.from("programs").insert({
    batch_id: (batch as { id: string }).id, code: "BCA", name: "BCA",
  }).select().single();
  if (!program) throw new Error("program insert failed");
  const { data: sems } = await admin.from("semesters").insert([
    { program_id: (program as { id: string }).id, number: 1 },
    { program_id: (program as { id: string }).id, number: 2 },
  ]).select();
  if (!sems || sems.length !== 2) throw new Error("sem insert failed");
  semId = (sems[0] as { id: string }).id;
  otherSemId = (sems[1] as { id: string }).id;

  const { data: courses } = await admin.from("courses").insert([
    { semester_id: semId, code: "BCA101", title: "Intro", credits: 3 },
    { semester_id: otherSemId, code: "BCA201", title: "Other", credits: 3 },
  ]).select();
  if (!courses || courses.length !== 2) throw new Error("course insert failed");
  courseId = (courses[0] as { id: string }).id;
  otherCourseId = (courses[1] as { id: string }).id;

  await admin.from("faculty_profiles").insert({
    user_id: users[1]!.userId, employee_code: `${PREFIX}EMP-F`,
  });
  await admin.from("student_profiles").insert({
    user_id: users[2]!.userId, roll_number: `${PREFIX}23BCA001`, admission_year: 2023,
  });

  faculty = await clientFor({ email: facultyEmail, password: "TestPass!1" });
  student = await clientFor({ email: studentEmail, password: "TestPass!1" });
});

afterAll(async () => {
  if (!enabled) return;
  await admin.from("faculty_assignments").delete().eq("course_id", courseId);
  await admin.from("student_enrollments").delete().eq("sem_id", semId);
  if (users[2]?.userId) await admin.from("student_profiles").delete().eq("user_id", users[2]!.userId);
  if (users[1]?.userId) await admin.from("faculty_profiles").delete().eq("user_id", users[1]!.userId);
  await admin.from("courses").delete().in("id", [courseId, otherCourseId]);
  await admin.from("semesters").delete().in("id", [semId, otherSemId]);
  await admin.from("programs").delete().eq("code", "BCA");
  await admin.from("batches").delete().like("name", `${PREFIX}%`);
});

describe("RLS: cycle-2 academic structure", () => {
  itIf("1. non-admin writes are rejected", async () => {
    const { error: e1 } = await faculty.from("batches").insert({ name: "X", start_year: 2023 });
    expect(e1).not.toBeNull();
    const { error: e2 } = await student.from("courses").insert({
      semester_id: semId, code: "X", title: "X", credits: 3,
    });
    expect(e2).not.toBeNull();
  });

  itIf("2. faculty sees a course only after assignment", async () => {
    const before = await faculty.from("courses").select("id").eq("id", courseId);
    expect(before.data).toEqual([]);

    const { error: assignErr } = await admin.from("faculty_assignments").insert({
      faculty_id: users[1]!.userId, course_id: courseId,
    });
    expect(assignErr).toBeNull();
    const after = await faculty.from("courses").select("id").eq("id", courseId);
    expect(after.data).toHaveLength(1);

    const other = await faculty.from("courses").select("id").eq("id", otherCourseId);
    expect(other.data).toEqual([]);
  });

  itIf("3. student enrollment surfaces batch/program/sem context", async () => {
    const ctx = await semesterContext(admin, semId);
    const { error: enrollErr } = await admin.from("student_enrollments").insert({
      student_id: users[2]!.userId,
      sem_id: semId,
      batch_id: ctx.batchId,
      program_id: ctx.programId,
    });
    expect(enrollErr).toBeNull();
    const { data, error } = await student
      .from("student_enrollments")
      .select("id, sem_id, batch_id, program_id, semesters!inner(id, number, program_id, programs!inner(id, batch_id))")
      .eq("sem_id", semId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect((data?.[0] as unknown as { semesters: { number: number } })?.semesters?.number).toBe(1);
  });

  itIf("4a. duplicate enrollment is rejected with 23505", async () => {
    const { error } = await admin.from("student_enrollments").insert({
      student_id: users[2]!.userId, sem_id: semId,
      batch_id: "", program_id: "",
    });
    expect(error?.code).toBe("23505");
  });

  itIf("4b. assigning faculty to a non-existent course fails with 23503", async () => {
    const { error } = await admin.from("faculty_assignments").insert({
      faculty_id: users[1]!.userId,
      course_id: "00000000-0000-0000-0000-000000000999",
    });
    expect(error?.code).toBe("23503");
  });

  itIf("4c. assigning a non-faculty user fails with 23503", async () => {
    const { error } = await admin.from("faculty_assignments").insert({
      faculty_id: users[2]!.userId,
      course_id: courseId,
    });
    expect(error?.code).toBe("23503");
  });

  itIf("5. mismatched (batch, program, sem) tuple is rejected", async () => {
    const ctx = await semesterContext(admin, semId);
    const { error } = await admin.from("student_enrollments").insert({
      student_id: users[2]!.userId,
      sem_id: otherSemId,
      program_id: ctx.programId,
      batch_id: "00000000-0000-0000-0000-000000000999",
    });
    expect(error?.code).toBe("23503");
  });

  itIf("6. wrong-role satellite insert is rejected", async () => {
    const { error } = await admin.from("faculty_profiles").insert({
      user_id: users[2]!.userId,
      employee_code: `${PREFIX}BAD`,
    });
    expect(error?.code).toBe("23514");
  });

  itIf("7. role change with a satellite is blocked", async () => {
    const { error } = await admin.from("profiles").update({ role: "student" }).eq("user_id", users[1]!.userId);
    expect(error?.code).toBe("23514");
    const { error: delErr } = await admin.from("faculty_profiles").delete().eq("user_id", users[1]!.userId);
    expect(delErr).toBeNull();
    const { error: updErr } = await admin.from("profiles").update({ role: "student" }).eq("user_id", users[1]!.userId);
    expect(updErr).toBeNull();
  });

  itIf("8. profiles is admin-write-only", async () => {
    const { data, error } = await student.from("profiles")
      .update({ name: "NotAllowed" }).eq("user_id", users[2]!.userId).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});