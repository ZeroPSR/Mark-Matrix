/**
 * Dummy data for testing the CSV imports and the flows around them.
 *
 *   pnpm seed:dummy              # write the CSV files and seed the database
 *   pnpm seed:dummy --csv-only   # write the CSV files only
 *   pnpm seed:dummy --no-csv     # seed the database only
 *
 * It creates 100 students, 10 faculty and 2 admins, with emails of the
 * form `{AA}@{role}.matrix.com` — the local part is letters: a, b, … z, aa,
 * ab, … dv. Every account gets the same password so a tester can sign in as
 * any of them: **Matrix@2026**.
 *
 * It also creates the academic structure the other flows need — a batch, a
 * program, two semesters, courses, exam types and faculty assignments — and
 * a little attendance and marks history, so the roster, attendance and
 * marks pages have something to show.
 *
 * The script is idempotent: it skips anything that already exists, so it
 * can be re-run after adding to it.
 *
 * It writes to whichever database the API's `.dev.vars` points at. That is
 * the live Supabase project in this repository's setup, so the accounts
 * this creates are real accounts on it.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnrollCsv, toCsv } from "../packages/shared/src/index.js";

loadEnv({ path: ".env" });
loadEnv({ path: "apps/api/.dev.vars", quiet: true });

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------- config ---

const PASSWORD = "Matrix@2026";
const STUDENT_COUNT = 100;
const FACULTY_COUNT = 10;
const ADMIN_COUNT = 2;
const ADMISSION_YEAR = 2023;

const BATCH_NAME = "BCA 2023";
const BATCH_START_YEAR = 2023;
const PROGRAM_CODE = "BCA";
const PROGRAM_NAME = "Bachelor of Computer Applications";

const SEMESTERS = [
  { number: 1, courses: [
    { code: "CS101", title: "Programming Fundamentals", credits: 4 },
    { code: "CS102", title: "Data Structures", credits: 4 },
    { code: "MA101", title: "Discrete Mathematics", credits: 3 },
    { code: "EN101", title: "Technical Communication", credits: 2 },
  ] },
  { number: 2, courses: [
    { code: "CS201", title: "Database Management Systems", credits: 4 },
    { code: "CS202", title: "Operating Systems", credits: 4 },
  ] },
];

/** Which faculty teaches which course in semester 1, by index. */
const FACULTY_ASSIGNMENTS: Array<[number, number]> = [
  [0, 0], [0, 1], [1, 2], [2, 3],
];

const EXAM_TYPES: Array<{ examType: string; maxMarks: number }> = [
  { examType: "midterm", maxMarks: 50 },
  { examType: "final", maxMarks: 100 },
];

const SESSION_DATES = ["2026-11-09", "2026-11-10"];

/**
 * The repository root, found by walking up from the working directory until
 * the workspace file appears.
 *
 * The root package is CommonJS, so `import.meta` is not available here the
 * way it is in the apps — and the script should not care where it is run
 * from.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not find the repository root (no pnpm-workspace.yaml above this directory).");
    }
    dir = parent;
  }
}

const OUT_DIR = join(findRepoRoot(), "scripts", "dummy-data");

// ------------------------------------------------------------- generation ---

/**
 * The local part of an email: letters only.
 *
 * a, b, … z, aa, ab, … az, ba, … — so index 0 is "a" and index 26 is "aa".
 */
function letterLocalPart(index: number): string {
  const first = Math.floor(index / 26);
  const second = index % 26;
  const a = "a".charCodeAt(0);
  if (first === 0) return String.fromCharCode(a + second);
  return String.fromCharCode(a + first - 1) + String.fromCharCode(a + second);
}

interface DummyUser {
  local: string;
  email: string;
  name: string;
  role: "student" | "faculty" | "admin";
  rollNumber?: string;
  admissionYear?: number;
  employeeCode?: string;
  department?: string;
  designation?: string;
}

function buildUsers(): DummyUser[] {
  const out: DummyUser[] = [];

  for (let i = 0; i < STUDENT_COUNT; i += 1) {
    const local = letterLocalPart(i);
    out.push({
      local,
      email: `${local}@student.matrix.com`,
      name: `Student ${local.toUpperCase()}`,
      role: "student",
      rollNumber: `23BCA${String(i + 1).padStart(3, "0")}`,
      admissionYear: ADMISSION_YEAR,
    });
  }

  for (let i = 0; i < FACULTY_COUNT; i += 1) {
    const local = letterLocalPart(i);
    out.push({
      local,
      email: `${local}@faculty.matrix.com`,
      name: `Faculty ${local.toUpperCase()}`,
      role: "faculty",
      employeeCode: `EMP-F${String(i + 1).padStart(3, "0")}`,
      department: "Computer Science",
      designation: "Lecturer",
    });
  }

  for (let i = 0; i < ADMIN_COUNT; i += 1) {
    const local = letterLocalPart(i);
    out.push({
      local,
      email: `${local}@admin.matrix.com`,
      name: `Admin ${local.toUpperCase()}`,
      role: "admin",
      employeeCode: `EMP-A${String(i + 1).padStart(3, "0")}`,
      designation: "Administrator",
    });
  }

  return out;
}

const USERS = buildUsers();
const STUDENTS = USERS.filter((u) => u.role === "student");
const FACULTY = USERS.filter((u) => u.role === "faculty");
const ADMINS = USERS.filter((u) => u.role === "admin");

// ------------------------------------------------------------- CSV files ---

/**
 * The enrollment CSV the admin bulk-enroll upload takes.
 *
 * Only `roll_number` is required; the parser finds that column wherever it
 * sits, so the extra columns are there to be read by a human.
 */
function enrollCsv(students: DummyUser[]): string {
  return toCsv([
    ["roll_number", "email", "name"],
    ...students.map((s) => [s.rollNumber ?? "", s.email, s.name]),
  ]);
}

/** The marks CSV the faculty bulk upload takes. */
function marksCsv(students: DummyUser[], examType: string, marks: number[]): string {
  return toCsv([
    ["roll_number", "exam_type", "marks_obtained"],
    ...students.map((s, i) => [s.rollNumber ?? "", examType, String(marks[i] ?? 0)]),
  ]);
}

/**
 * The same enrollment CSV with a few rows that cannot work, so the error
 * report has something to report: a roll number nobody owns, a blank one,
 * and a duplicate.
 */
function enrollCsvWithErrors(students: DummyUser[]): string {
  const first = students[0];
  const second = students[1];
  return toCsv([
    ["roll_number", "email", "name"],
    [first?.rollNumber ?? "", first?.email ?? "", first?.name ?? ""],
    ["99ZZZ999", "nobody@student.matrix.com", "Nobody At All"],
    ["", "", ""],
    [second?.rollNumber ?? "", second?.email ?? "", second?.name ?? ""],
    [first?.rollNumber ?? "", first?.email ?? "", first?.name ?? ""],
  ]);
}

/** Every account, as a table — what the Add user form would need. */
function usersCsv(): string {
  return toCsv([
    ["email", "name", "role", "password", "roll_number", "admission_year", "employee_code", "department", "designation"],
    ...USERS.map((u) => [
      u.email,
      u.name,
      u.role,
      PASSWORD,
      u.rollNumber ?? "",
      u.admissionYear === undefined ? "" : String(u.admissionYear),
      u.employeeCode ?? "",
      u.department ?? "",
      u.designation ?? "",
    ]),
  ]);
}

function writeCsvFiles(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const firstCourse = SEMESTERS[0]?.courses[0];
  const marks = STUDENTS.map((_s, i) => (i * 7) % 46 + 4);

  const files: Array<[string, string]> = [
    ["users.csv", usersCsv()],
    ["enroll-sem2.csv", enrollCsv(STUDENTS)],
    ["enroll-sem2-with-errors.csv", enrollCsvWithErrors(STUDENTS)],
    [
      `marks-${(firstCourse?.code ?? "cs101").toLowerCase()}-midterm.csv`,
      marksCsv(STUDENTS, "midterm", marks),
    ],
  ];
  for (const [name, content] of files) {
    writeFileSync(join(OUT_DIR, name), content, "utf8");
    console.log(`wrote ${join("scripts", "dummy-data", name)}`);
  }
}

// ------------------------------------------------------------- db helpers ---

/** Every auth user, by email. Paginated — there are more than 50. */
async function listAuthUsers(): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) {
      if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < perPage) break;
  }
  return byEmail;
}

interface Row {
  id: string;
}

async function insertRow(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data as Row).id;
}

// ------------------------------------------------------------------- seed ---

async function seedUsers(existing: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  let created = 0;

  for (const u of USERS) {
    const key = u.email.toLowerCase();
    const existingId = existing.get(key);
    let userId = existingId;

    if (existingId === undefined) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: u.name },
      });
      if (error) {
        // A user that exists but was not in the listing (created between the
        // listing and now) is fine; anything else is not.
        if (!/already|registered|exists/i.test(error.message)) {
          throw new Error(`createUser ${u.email}: ${error.message}`);
        }
        continue;
      }
      userId = data.user.id;
      created += 1;
    }
    // Only ever record a user we have an id for.
    if (userId === undefined) continue;
    ids.set(key, userId);
  }
  console.log(`users: ${created} created, ${ids.size - created} already there`);
  return ids;
}

/**
 * Give each user their role and their satellite row.
 *
 * The `handle_new_user` trigger makes the profile row with the role
 * hardcoded to 'student', so the role is set here — and the trigger on
 * `profiles` mirrors it into the auth app_metadata, which is where the API
 * reads the role from.
 */
async function seedProfilesAndSatellites(ids: Map<string, string>): Promise<void> {
  let profiles = 0;
  let satellites = 0;

  for (const u of USERS) {
    const userId = ids.get(u.email.toLowerCase());
    if (userId === undefined) continue;

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .update({ name: u.name, role: u.role })
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
    if (profileErr) throw new Error(`profiles ${u.email}: ${profileErr.message}`);
    if (profile === null) {
      // The trigger did not make the row. Make it here rather than leaving
      // an account that can sign in with no role.
      const { error } = await supabase
        .from("profiles")
        .insert({ user_id: userId, name: u.name, role: u.role });
      if (error) throw new Error(`profiles ${u.email}: ${error.message}`);
    }
    profiles += 1;

    const table =
      u.role === "student" ? "student_profiles" : u.role === "faculty" ? "faculty_profiles" : "admin_profiles";
    const satellite =
      u.role === "student"
        ? { user_id: userId, roll_number: u.rollNumber, admission_year: u.admissionYear }
        : u.role === "faculty"
          ? {
              user_id: userId,
              employee_code: u.employeeCode,
              department: u.department ?? null,
              designation: u.designation ?? null,
            }
          : {
              user_id: userId,
              employee_code: u.employeeCode,
              designation: u.designation ?? null,
            };

    const { data: existing } = await supabase
      .from(table)
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing === null) {
      const { error } = await supabase.from(table).insert(satellite);
      if (error) throw new Error(`${table} ${u.email}: ${error.message}`);
      satellites += 1;
    }
  }
  console.log(`profiles: ${profiles} set, satellites: ${satellites} written`);
}

interface Structure {
  batchId: string;
  programId: string;
  semesters: Array<{ id: string; number: number }>;
  courses: Array<{ id: string; code: string; semNumber: number }>;
}

async function seedStructure(): Promise<Structure> {
  let batchId: string | null;
  {
    const { data, error } = await supabase
      .from("batches")
      .select("id")
      .eq("name", BATCH_NAME)
      .maybeSingle();
    if (error) throw new Error(`batches: ${error.message}`);
    batchId = data?.id ?? null;
  }
  if (batchId === null) {
    batchId = await insertRow("batches", { name: BATCH_NAME, start_year: BATCH_START_YEAR });
  }

  let programId: string | null;
  {
    const { data, error } = await supabase
      .from("programs")
      .select("id")
      .eq("batch_id", batchId)
      .eq("code", PROGRAM_CODE)
      .maybeSingle();
    if (error) throw new Error(`programs: ${error.message}`);
    programId = data?.id ?? null;
  }
  if (programId === null) {
    programId = await insertRow("programs", {
      batch_id: batchId,
      code: PROGRAM_CODE,
      name: PROGRAM_NAME,
    });
  }

  const semesters: Array<{ id: string; number: number }> = [];
  const courses: Array<{ id: string; code: string; semNumber: number }> = [];

  for (const sem of SEMESTERS) {
    let semId: string | null;
    {
      const { data, error } = await supabase
        .from("semesters")
        .select("id")
        .eq("program_id", programId)
        .eq("number", sem.number)
        .maybeSingle();
      if (error) throw new Error(`semesters: ${error.message}`);
      semId = data?.id ?? null;
    }
    if (semId === null) {
      semId = await insertRow("semesters", { program_id: programId, number: sem.number });
    }
    semesters.push({ id: semId, number: sem.number });

    for (const course of sem.courses) {
      let courseId: string | null;
      {
        const { data, error } = await supabase
          .from("courses")
          .select("id")
          .eq("semester_id", semId)
          .eq("code", course.code)
          .maybeSingle();
        if (error) throw new Error(`courses: ${error.message}`);
        courseId = data?.id ?? null;
      }
      if (courseId === null) {
        courseId = await insertRow("courses", {
          semester_id: semId,
          code: course.code,
          title: course.title,
          credits: course.credits,
        });
      }
      courses.push({ id: courseId, code: course.code, semNumber: sem.number });

      for (const et of EXAM_TYPES) {
        const { data: existing } = await supabase
          .from("course_exam_types")
          .select("course_id")
          .eq("course_id", courseId)
          .eq("exam_type", et.examType)
          .maybeSingle();
        if (existing === null) {
          const { error } = await supabase
            .from("course_exam_types")
            .insert({ course_id: courseId, exam_type: et.examType, max_marks: et.maxMarks });
          if (error) throw new Error(`course_exam_types ${course.code}: ${error.message}`);
        }
      }
    }
  }

  console.log(
    `structure: batch ${batchId}, program ${programId}, ${semesters.length} semesters, ${courses.length} courses`,
  );
  return { batchId, programId, semesters, courses };
}

async function seedAssignments(
  structure: Structure,
  ids: Map<string, string>,
): Promise<void> {
  let written = 0;
  const sem1Courses = structure.courses.filter((c) => c.semNumber === 1);

  for (const [facultyIndex, courseIndex] of FACULTY_ASSIGNMENTS) {
    const faculty = FACULTY[facultyIndex];
    const course = sem1Courses[courseIndex];
    if (faculty === undefined || course === undefined) continue;
    const facultyId = ids.get(faculty.email.toLowerCase());
    if (facultyId === undefined) continue;

    const { data: existing } = await supabase
      .from("faculty_assignments")
      .select("id")
      .eq("faculty_id", facultyId)
      .eq("course_id", course.id)
      .maybeSingle();
    if (existing === null) {
      const { error } = await supabase
        .from("faculty_assignments")
        .insert({ faculty_id: facultyId, course_id: course.id });
      if (error) throw new Error(`faculty_assignments: ${error.message}`);
      written += 1;
    }
  }
  console.log(`faculty assignments: ${written} written`);
}

/**
 * Enroll the students into semester 1.
 *
 * Done through the shared CSV parser, so the seeder reads the same file the
 * bulk-enroll upload reads — the file and the code path cannot drift.
 */
async function seedEnrollments(structure: Structure): Promise<void> {
  const sem1 = structure.semesters.find((s) => s.number === 1);
  if (sem1 === undefined) return;

  const { rows, errors } = parseEnrollCsv(enrollCsv(STUDENTS));
  if (errors.length > 0) {
    throw new Error(`the generated enrollment CSV did not parse: ${JSON.stringify(errors)}`);
  }

  const { data: students, error: studentsErr } = await supabase
    .from("student_profiles")
    .select("user_id, roll_number")
    .in("roll_number", rows.map((r) => r.rollNumber));
  if (studentsErr) throw new Error(`student_profiles: ${studentsErr.message}`);

  const byRoll = new Map<string, string>();
  for (const s of students ?? []) {
    const row = s as unknown as { user_id: string; roll_number: string };
    byRoll.set(row.roll_number, row.user_id);
  }

  const { data: existing, error: existingErr } = await supabase
    .from("student_enrollments")
    .select("student_id")
    .eq("sem_id", sem1.id);
  if (existingErr) throw new Error(`student_enrollments: ${existingErr.message}`);
  const already = new Set(
    (existing ?? []).map((r: unknown) => (r as { student_id: string }).student_id),
  );

  const toInsert: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const studentId = byRoll.get(r.rollNumber);
    if (studentId === undefined || already.has(studentId)) continue;
    toInsert.push({
      student_id: studentId,
      sem_id: sem1.id,
      batch_id: structure.batchId,
      program_id: structure.programId,
    });
    already.add(studentId);
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from("student_enrollments").insert(toInsert);
    if (error) throw new Error(`student_enrollments: ${error.message}`);
  }
  console.log(`enrollments: ${toInsert.length} written to semester 1`);
}

async function seedAttendanceAndMarks(
  structure: Structure,
  ids: Map<string, string>,
): Promise<void> {
  const course = structure.courses.find((c) => c.semNumber === 1 && c.code === "CS101");
  const sem1 = structure.semesters.find((s) => s.number === 1);
  if (course === undefined || sem1 === undefined) return;

  const faculty = FACULTY[0];
  const facultyId = faculty === undefined ? undefined : ids.get(faculty.email.toLowerCase());
  if (facultyId === undefined) return;

  const { data: enrolled, error: enrolledErr } = await supabase
    .from("student_enrollments")
    .select("student_id")
    .eq("sem_id", sem1.id);
  if (enrolledErr) throw new Error(`student_enrollments: ${enrolledErr.message}`);
  const studentIds = (enrolled ?? []).map((r: unknown) => (r as { student_id: string }).student_id);
  if (studentIds.length === 0) return;

  const attendance: Array<Record<string, unknown>> = [];
  for (const date of SESSION_DATES) {
    for (let i = 0; i < studentIds.length; i += 1) {
      const studentId = studentIds[i];
      if (studentId === undefined) continue;
      const slot = (i + SESSION_DATES.indexOf(date)) % 10;
      const status = slot < 7 ? "present" : slot < 9 ? "absent" : "late";
      attendance.push({
        course_id: course.id,
        student_id: studentId,
        session_date: date,
        status,
        recorded_by: facultyId,
      });
    }
  }
  const { error: attendanceErr } = await supabase.from("attendance").upsert(attendance, {
    onConflict: "course_id,student_id,session_date",
    ignoreDuplicates: true,
  });
  if (attendanceErr) throw new Error(`attendance: ${attendanceErr.message}`);

  const marks: Array<Record<string, unknown>> = [];
  for (let i = 0; i < studentIds.length; i += 1) {
    const studentId = studentIds[i];
    if (studentId === undefined) continue;
    marks.push({
      course_id: course.id,
      student_id: studentId,
      exam_type: "midterm",
      marks_obtained: (i * 7) % 46 + 4,
      max_marks: 50,
      entered_by: facultyId,
      status: "draft",
    });
  }
  const { error: marksErr } = await supabase.from("marks").upsert(marks, {
    onConflict: "course_id,student_id,exam_type",
    ignoreDuplicates: true,
  });
  if (marksErr) throw new Error(`marks: ${marksErr.message}`);

  console.log(
    `history: ${attendance.length} attendance rows over ${SESSION_DATES.length} sessions, ${marks.length} marks rows`,
  );
}

// -------------------------------------------------------------------- run ---

async function main(): Promise<void> {
  const flags = process.argv.slice(2);
  const csvOnly = flags.includes("--csv-only");
  const noCsv = flags.includes("--no-csv");

  if (!noCsv) {
    writeCsvFiles();
  }
  if (csvOnly) {
    console.log("\nCSV files written; nothing was sent to the database.");
    return;
  }

  console.log(`\nSeeding ${url}\n`);
  const existing = await listAuthUsers();
  const ids = await seedUsers(existing);
  await seedProfilesAndSatellites(ids);
  const structure = await seedStructure();
  await seedAssignments(structure, ids);
  await seedEnrollments(structure);
  await seedAttendanceAndMarks(structure, ids);

  const sem1 = structure.semesters.find((s) => s.number === 1);
  const sem2 = structure.semesters.find((s) => s.number === 2);
  const idsOut = {
    batchId: structure.batchId,
    programId: structure.programId,
    semesters: structure.semesters,
    courses: structure.courses,
    accounts: {
      students: STUDENTS.length,
      faculty: FACULTY.length,
      admins: ADMINS.length,
      password: PASSWORD,
      examples: {
        student: STUDENTS[0]?.email,
        faculty: FACULTY[0]?.email,
        admin: ADMINS[0]?.email,
      },
    },
  };
  writeFileSync(join(OUT_DIR, "ids.json"), JSON.stringify(idsOut, null, 2), "utf8");

  console.log(
    `\nDone. Sign in with any of them — password ${PASSWORD}\n` +
      `  student  ${STUDENTS[0]?.email}\n` +
      `  faculty  ${FACULTY[0]?.email}\n` +
      `  admin    ${ADMINS[0]?.email}\n` +
      `  semester 1 id ${sem1?.id ?? "(none)"} — enrol-sem2.csv goes into semester 2 ${sem2?.id ?? "(none)"}`,
  );
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
