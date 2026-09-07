/**
 * End-to-end smoke test for the deployed attendance module.
 *
 * Provisions an admin + faculty + student via the Supabase admin API, creates
 * a course + enrollment + assignment, then exercises the four attendance
 * endpoints against the deployed API worker.
 *
 *   pnpm exec tsx scripts/smoke-attendance.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const API = "https://mark-matrix-api.team-tractor.workers.dev";
const PREFIX = `smoke-${Date.now()}-`;

interface Keys { url: string; service_role_key: string; }
const keys = JSON.parse(readFileSync(".keys/supabase.json", "utf-8")) as Keys;
const admin: SupabaseClient = createClient(keys.url, keys.service_role_key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function expect(cond: boolean, msg: string): Promise<void> {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok — ${msg}`);
}

async function ensureUser(email: string, password: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function setRole(userId: string, role: "admin" | "faculty" | "student"): Promise<void> {
  const { error } = await admin.from("profiles").update({ role }).eq("user_id", userId);
  if (error) throw new Error(`setRole ${role}: ${error.message}`);
}

async function clientFor(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(keys.url, keys.service_role_key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message}`);
  return c;
}

async function apiGet<T>(path: string, jwt: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${jwt}` } });
  return { status: res.status, body: (await res.json()) as T };
}

async function apiPost<T>(path: string, jwt: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: T;
  try {
    parsed = text.length === 0 ? ({} as T) : (JSON.parse(text) as T);
  } catch {
    parsed = {} as T;
  }
  return { status: res.status, body: parsed };
}

async function main(): Promise<void> {
  console.log(`Provisioning users under prefix "${PREFIX}"…`);
  const adminId     = await ensureUser(`${PREFIX}admin@test.local`,   "TestPass!1");
  const facultyId   = await ensureUser(`${PREFIX}faculty@test.local`, "TestPass!1");
  const studentId   = await ensureUser(`${PREFIX}student@test.local`, "TestPass!1");
  await setRole(adminId, "admin");
  await setRole(facultyId, "faculty");
  await setRole(studentId, "student");

  const { data: batch } = await admin.from("batches").insert({
    name: `${PREFIX}batch`, start_year: 2024,
  }).select().single();
  if (!batch) throw new Error("batch insert failed");

  const { data: program } = await admin.from("programs").insert({
    batch_id: (batch as { id: string }).id, code: "SMK", name: "Smoke",
  }).select().single();
  if (!program) throw new Error("program insert failed");

  const { data: sem } = await admin.from("semesters").insert({
    program_id: (program as { id: string }).id, number: 1,
  }).select().single();
  if (!sem) throw new Error("sem insert failed");
  const semId = (sem as { id: string }).id;
  const batchId = (batch as { id: string }).id;
  const programId = (program as { id: string }).id;

  const { data: course } = await admin.from("courses").insert({
    semester_id: semId, code: "SMK101", title: "Smoke Course", credits: 3,
  }).select().single();
  if (!course) throw new Error("course insert failed");
  const courseId = (course as { id: string }).id;

  await admin.from("faculty_profiles").insert({ user_id: facultyId, employee_code: `${PREFIX}EMP` });
  await admin.from("student_profiles").insert({ user_id: studentId, roll_number: `${PREFIX}ROLL`, admission_year: 2024 });
  await admin.from("student_enrollments").insert({
    student_id: studentId, sem_id: semId, batch_id: batchId, program_id: programId,
  });
  await admin.from("faculty_assignments").insert({ faculty_id: facultyId, course_id: courseId });

  console.log("Signing in…");
  const faculty = await clientFor(`${PREFIX}faculty@test.local`, "TestPass!1");
  const student = await clientFor(`${PREFIX}student@test.local`, "TestPass!1");
  const facultyJwt = (await faculty.auth.getSession()).data.session?.access_token;
  const studentJwt = (await student.auth.getSession()).data.session?.access_token;
  if (!facultyJwt || !studentJwt) throw new Error("missing JWT after sign-in");

  console.log("\n--- Smoke tests ---");
  const base = `/api/faculty/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/attendance`;

  // POST bulk-mark
  const post = await apiPost<{ data: { id: string; status: string }[]; error?: string }>(base, facultyJwt, {
    sessionDate: "2026-09-07",
    entries: [{ studentId, status: "present" }],
  });
  await expect(post.status === 201, `POST returns 201 (got ${post.status})`);
  await expect(post.body.data.length === 1, "POST persists 1 row");
  const rowId = post.body.data[0]!.id;

  // GET list
  const list = await apiGet<{ data: { status: string }[] }>(base, facultyJwt);
  await expect(list.status === 200, `GET list returns 200 (got ${list.status})`);
  await expect(list.body.data.length === 1, "GET list shows 1 row");

  // GET summary
  const summary = await apiGet<{ data: { studentId: string; percent: number }[] }>(`${base}/summary`, facultyJwt);
  await expect(summary.status === 200, `GET /summary returns 200 (got ${summary.status})`);
  await expect(summary.body.data[0]?.percent === 100, `summary shows 100% (got ${summary.body.data[0]?.percent})`);

  // PATCH correct
  const patched = await fetch(`${API}${base}/${rowId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${facultyJwt}`, "content-type": "application/json" },
    body: JSON.stringify({ status: "late" }),
  });
  await expect(patched.status === 200, `PATCH returns 200 (got ${patched.status})`);
  const patchedBody = await patched.json() as { data: { status: string } };
  await expect(patchedBody.data.status === "late", `PATCH updates status to late (got ${patchedBody.data.status})`);

  // Student sees own row
  const studentBase = `/api/student/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/attendance`;
  const studentGet = await apiGet<{ data: unknown[] }>(studentBase, studentJwt);
  await expect(studentGet.status === 200, `Student GET returns 200 (got ${studentGet.status})`);
  await expect(studentGet.body.data.length === 1, "Student sees own 1 row");

  // Student cannot POST (the student router omits POST → 404)
  const studentPost = await apiPost<unknown>(studentBase, studentJwt, {
    sessionDate: "2026-09-08",
    entries: [{ studentId, status: "absent" }],
  });
  await expect(studentPost.status === 404, `Student POST returns 404 (got ${studentPost.status})`);

  // Cleanup
  console.log("\nCleaning up…");
  await admin.from("attendance").delete().eq("course_id", courseId);
  await admin.from("faculty_assignments").delete().eq("course_id", courseId);
  await admin.from("student_enrollments").delete().eq("sem_id", semId);
  await admin.from("faculty_profiles").delete().eq("user_id", facultyId);
  await admin.from("student_profiles").delete().eq("user_id", studentId);
  await admin.from("courses").delete().eq("id", courseId);
  await admin.from("semesters").delete().eq("id", semId);
  await admin.from("programs").delete().eq("id", programId);
  await admin.from("batches").delete().like("name", `${PREFIX}%`);

  console.log("\nAll smoke checks passed.");
}

main().catch((e: unknown) => {
  console.error("\n", e instanceof Error ? e.message : e);
  process.exit(1);
});
