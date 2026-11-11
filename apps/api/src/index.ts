import { Hono } from "hono";
import { cors } from "hono/cors";
import { API_ROUTES, PROFILE_TABLE, ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { supabaseAuth } from "./middleware/auth.js";
import { requireRole } from "./middleware/requireRole.js";
import { generalRateLimit, bulkRateLimit } from "./middleware/rateLimit.js";
import { adminUsersRoute } from "./routes/admin/users.js";
import { adminBatchesRoute } from "./routes/admin/batches.js";
import { adminProgramsRoute } from "./routes/admin/programs.js";
import { adminSemestersRoute } from "./routes/admin/semesters.js";
import { adminCoursesRoute } from "./routes/admin/courses.js";
import { adminCourseHierarchyRoute } from "./routes/admin/courseHierarchy.js";
import { adminFacultyAssignmentsRoute } from "./routes/admin/facultyAssignments.js";
import { adminEnrollmentsRoute } from "./routes/admin/enrollments.js";
import { adminBulkEnrollRoute } from "./routes/admin/bulkEnroll.js";
import {
  adminStudentsRoute,
  adminFacultyRoute,
  adminAdminsRoute,
} from "./routes/admin/roleProfiles.js";
import { adminGradeSchemesRoute } from "./routes/admin/gradeSchemes.js";
import {
  gradesRoute,
  facultyGradesRoute,
  studentGradesRoute,
} from "./routes/grades/core.js";
import {
  sgpaRoute,
  facultySgpaRoute,
  studentSgpaRoute,
} from "./routes/grades/sgpa.js";
import {
  cgpaRoute,
  facultyCgpaRoute,
  studentCgpaRoute,
} from "./routes/grades/cgpa.js";
import { facultyCoursesRoute } from "./routes/faculty/courses.js";
import { courseExamTypesRoute } from "./routes/faculty/courseExamTypes.js";
import {
  facultyStudentsRoute,
  facultyEnrollmentsRoute,
} from "./routes/faculty/roster.js";
import { adminMarksLifecycleRoute } from "./routes/admin/marksLifecycle.js";
import { adminGradesheetsRoute } from "./routes/admin/gradesheets.js";
import { adminAuditLogRoute } from "./routes/admin/auditLog.js";
import { studentGradesheetRoute } from "./routes/student/gradesheet.js";
import { studentTranscriptRoute } from "./routes/student/transcript.js";
import { analyticsCourseRoute } from "./routes/analytics/course.js";
import { analyticsSemRoute } from "./routes/analytics/sem.js";
import { adminExportsRoute } from "./routes/admin/exports.js";
import { studentEnrollmentRoute } from "./routes/student/enrollment.js";
import {
  attendanceRoute,
  studentAttendanceRoute,
} from "./routes/attendance/core.js";
import {
  marksRoute,
  studentMarksRoute,
} from "./routes/marks/core.js";
import type { AppEnv } from "./env.js";

const app = new Hono<AppEnv>();

// CORS must run before any auth/requireRole so browser preflights succeed
// without sending credentials. The web app sends `Authorization: Bearer ...`
// (not cookies), so Allow-Credentials=false is safe.
const ALLOWED_ORIGINS: readonly string[] = [
  "https://mark-matrix-web.pages.dev",
  "https://mark-matrix-web.team-tractor.workers.dev",
];

/**
 * Is this a local development origin?
 *
 * The hostname is compared exactly, never by prefix: `startsWith("http://127.0.0.1")`
 * also matches `http://127.0.0.1.evil.test`, and that is a hostname its owner
 * can point at their own server — a page served from it would pass this check
 * and be able to read API responses.
 */
function isLocalOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

app.use(
  "*",
  cors({
    origin: (origin) =>
      origin !== undefined &&
      (ALLOWED_ORIGINS.includes(origin) || isLocalOrigin(origin))
        ? origin
        : "https://mark-matrix-web.pages.dev",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["authorization", "content-type"],
    maxAge: 600,
  }),
);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

/**
 * Every response this API sends is JSON.
 *
 * Hono's defaults are not: an unmatched path answers with a plain-text
 * "404 Not Found", and an unhandled throw answers with a plain-text
 * "Internal Server Error". The front end parses every response body as
 * JSON, so a plain-text answer arrives there as the opaque string
 * "parse_failed" — which says nothing about what actually went wrong.
 *
 * A missing worker secret used to hide exactly here: `getSupabase()` throws
 * "supabaseUrl is required.", the auth middleware throws with it, and the
 * browser saw "parse_failed" and blamed itself.
 */
app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  // An HTTPException carries its own response — a 400 with a validation
  // message, say. Hono's default handler passes those through; so does this.
  if ("getResponse" in err && typeof err.getResponse === "function") {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error("unhandled API error", err);
  return c.json({ error: "internal_error" }, 500);
});

app.use("/api/*", supabaseAuth);
app.use("/api/*", generalRateLimit);
app.get(API_ROUTES.me, async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const role = c.get("role");
  // The display name. The `profiles` row is the authority on it — an admin
  // can rename a user, and that only updates `profiles.name`. The copy in
  // the sign-up metadata is whatever it was at sign-up.
  //
  // Read through the caller's own client, so RLS scopes this to their row.
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select("name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // A failed read has no trustworthy data: no name, and the caller falls
    // back to the copy in its session.
    console.error("me: profile read failed", error.message);
    return c.json({ userId, role, name: null });
  }
  return c.json({ userId, role, name: data?.name ?? null });
});

app.use("/api/admin/*", requireRole("admin"));
app.route(API_ROUTES.adminUsers, adminUsersRoute);
app.route(ROUTES_CYCLE_2.adminBatches, adminBatchesRoute);
app.route(ROUTES_CYCLE_2.adminPrograms, adminProgramsRoute);
app.route(ROUTES_CYCLE_2.adminSemesters, adminSemestersRoute);
// Mounted BEFORE the courses CRUD, whose `GET /:id` would otherwise match
// the literal id "hierarchy" and answer with a course-not-found.
app.route(ROUTES_CYCLE_2.adminCourseHierarchy, adminCourseHierarchyRoute);
app.route(ROUTES_CYCLE_2.adminCourses, adminCoursesRoute);
app.route(ROUTES_CYCLE_2.adminStudents, adminStudentsRoute);
app.route(ROUTES_CYCLE_2.adminFaculty, adminFacultyRoute);
app.route(ROUTES_CYCLE_2.adminAdmins, adminAdminsRoute);
app.route(ROUTES_CYCLE_2.adminFacultyAssignments, adminFacultyAssignmentsRoute);
app.route(ROUTES_CYCLE_2.adminEnrollments, adminEnrollmentsRoute);
app.route(ROUTES_CYCLE_2.adminBulkEnroll, adminBulkEnrollRoute);
app.use(ROUTES_CYCLE_2.adminBulkEnroll, bulkRateLimit);
app.route(ROUTES_CYCLE_2.adminGradeSchemes, adminGradeSchemesRoute);
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
  gradesRoute,
);
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/score/sgpa",
  sgpaRoute,
);
app.route("/api/admin/score/cgpa", cgpaRoute);
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/gradesheet",
  adminGradesheetsRoute,
);
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/analytics",
  analyticsCourseRoute,
);
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/analytics",
  analyticsSemRoute,
);
app.route("/api/admin/batch/:batchId/program/:programId/sem/:semId", adminExportsRoute);
app.route("/api/admin/audit-log", adminAuditLogRoute);

app.use("/api/faculty/*", requireRole("faculty"));
app.route(ROUTES_CYCLE_2.facultyCourses, facultyCoursesRoute);
app.route("/api/faculty/courses", courseExamTypesRoute);
// Read-only roster mounts. RLS scopes the rows to the semesters the caller
// teaches; the write routes stay on the admin mounts.
app.route(ROUTES_CYCLE_2.facultyStudents, facultyStudentsRoute);
app.route(ROUTES_CYCLE_2.facultyEnrollments, facultyEnrollmentsRoute);
app.route(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/attendance",
  attendanceRoute,
);
app.route(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
  marksRoute,
);
app.use(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks/bulk",
  bulkRateLimit,
);
app.route(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
  facultyGradesRoute,
);
app.route(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/analytics",
  analyticsCourseRoute,
);
app.route(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/score/sgpa",
  facultySgpaRoute,
);
app.route("/api/faculty/score/cgpa", facultyCgpaRoute);

app.use("/api/admin/*", requireRole("admin"));
app.route("/api/admin/courses", courseExamTypesRoute);
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/attendance",
  attendanceRoute,
);
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
  marksRoute,
);
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
  adminMarksLifecycleRoute,
);

app.use("/api/student/*", requireRole("student"));
app.route(ROUTES_CYCLE_2.studentEnrollment, studentEnrollmentRoute);
app.route(
  "/api/student/batch/:batchId/program/:programId/sem/:semId/course/:courseId/attendance",
  studentAttendanceRoute,
);
app.route(
  "/api/student/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
  studentMarksRoute,
);
app.route(
  "/api/student/batch/:batchId/program/:programId/sem/:semId/gradesheet",
  studentGradesheetRoute,
);
app.route("/api/student/batch/:batchId/program/:programId/sem/:semId", studentTranscriptRoute);
app.route(
  "/api/student/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
  studentGradesRoute,
);
app.route(
  "/api/student/batch/:batchId/program/:programId/sem/:semId/score/sgpa",
  studentSgpaRoute,
);
app.route("/api/student/score/cgpa", studentCgpaRoute);

export default app;