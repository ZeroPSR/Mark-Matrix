// Read-only faculty mounts for the roster.
//
// Faculty need to see which students are enrolled in the semesters they teach
// so they can take attendance and read the roster. RLS scopes the rows to
// those semesters — see `supabase/migrations/20261001000001_faculty_students_read.sql`.
//
// These mounts expose GET only. The write routes (create/delete a student
// profile or an enrollment) stay on the admin mounts, so a faculty session
// cannot mutate student or enrollment data through them.
import { Hono } from "hono";
import type { AppEnv } from "../../env.js";
import { listStudents } from "../admin/roleProfiles.js";
import { listEnrollments } from "../admin/enrollments.js";

export const facultyStudentsRoute = new Hono<AppEnv>().get("/", listStudents);

export const facultyEnrollmentsRoute = new Hono<AppEnv>().get("/", listEnrollments);
