import { Hono } from "hono";
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
import { facultyCoursesRoute } from "./routes/faculty/courses.js";
import { studentEnrollmentRoute } from "./routes/student/enrollment.js";
import type { AppEnv } from "./env.js";

const app = new Hono<AppEnv>();

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

app.use("/api/faculty/*", requireRole("faculty"));
app.route(ROUTES_CYCLE_2.facultyCourses, facultyCoursesRoute);

app.use("/api/student/*", requireRole("student"));
app.route(ROUTES_CYCLE_2.studentEnrollment, studentEnrollmentRoute);

export default app;