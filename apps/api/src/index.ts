import { Hono } from "hono";
import { cors } from "hono/cors";
import { API_ROUTES, ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { supabaseAuth } from "./middleware/auth.js";
import { requireRole } from "./middleware/requireRole.js";
import { adminUsersRoute } from "./routes/admin/users.js";
import { adminBatchesRoute } from "./routes/admin/batches.js";
import { adminProgramsRoute } from "./routes/admin/programs.js";
import { adminSemestersRoute } from "./routes/admin/semesters.js";
import { adminCoursesRoute } from "./routes/admin/courses.js";
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
import { studentEnrollmentRoute } from "./routes/student/enrollment.js";
import {
  attendanceRoute,
  studentAttendanceRoute,
} from "./routes/attendance/core.js";
import type { AppEnv } from "./env.js";

const app = new Hono<AppEnv>();

// CORS must run before any auth/requireRole so browser preflights succeed
// without sending credentials. The web app sends `Authorization: Bearer ...`
// (not cookies), so Allow-Credentials=false is safe.
const ALLOWED_ORIGINS: readonly string[] = [
  "https://mark-matrix-web.pages.dev",
  "https://mark-matrix-web.team-tractor.workers.dev",
];
app.use(
  "*",
  cors({
    origin: (origin) =>
      (origin !== undefined && ALLOWED_ORIGINS.includes(origin)) ||
      origin?.startsWith("http://127.0.0.1")
        ? origin
        : "https://mark-matrix-web.pages.dev",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["authorization", "content-type"],
    maxAge: 600,
  }),
);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/*", supabaseAuth);
app.get(API_ROUTES.me, (c) => c.json({ userId: c.get("userId"), role: c.get("role") }));

app.use("/api/admin/*", requireRole("admin"));
app.route(API_ROUTES.adminUsers, adminUsersRoute);
app.route(ROUTES_CYCLE_2.adminBatches, adminBatchesRoute);
app.route(ROUTES_CYCLE_2.adminPrograms, adminProgramsRoute);
app.route(ROUTES_CYCLE_2.adminSemesters, adminSemestersRoute);
app.route(ROUTES_CYCLE_2.adminCourses, adminCoursesRoute);
app.route(ROUTES_CYCLE_2.adminStudents, adminStudentsRoute);
app.route(ROUTES_CYCLE_2.adminFaculty, adminFacultyRoute);
app.route(ROUTES_CYCLE_2.adminAdmins, adminAdminsRoute);
app.route(ROUTES_CYCLE_2.adminFacultyAssignments, adminFacultyAssignmentsRoute);
app.route(ROUTES_CYCLE_2.adminEnrollments, adminEnrollmentsRoute);
app.route(ROUTES_CYCLE_2.adminBulkEnroll, adminBulkEnrollRoute);
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

app.use("/api/faculty/*", requireRole("faculty"));
app.route(ROUTES_CYCLE_2.facultyCourses, facultyCoursesRoute);
app.route(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/attendance",
  attendanceRoute,
);
app.route(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
  facultyGradesRoute,
);
app.route(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/score/sgpa",
  facultySgpaRoute,
);
app.route("/api/faculty/score/cgpa", facultyCgpaRoute);

app.use("/api/admin/*", requireRole("admin"));
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/attendance",
  attendanceRoute,
);

app.use("/api/student/*", requireRole("student"));
app.route(ROUTES_CYCLE_2.studentEnrollment, studentEnrollmentRoute);
app.route(
  "/api/student/batch/:batchId/program/:programId/sem/:semId/course/:courseId/attendance",
  studentAttendanceRoute,
);
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