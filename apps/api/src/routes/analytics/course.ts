import { Hono, type Context } from "hono";
import {
  formatZodError,
  topLimitSchema,
  attendanceThresholdSchema,
  type PassRateReport,
  type TopperRow,
  type AttendanceShortageRow,
} from "@mark-matrix/shared";
import {
  getPassRateForCourse,
  getToppersForCourse,
  getAttendanceShortageForCourse,
} from "../../lib/analyticsRepo.js";
import type { AppEnv } from "../../env.js";

type Ctx = Context<AppEnv>;

/**
 * The course id comes from the path the route is *mounted* with — see
 * apps/api/src/index.ts. It has to match: `req.param("c")` is always
 * undefined here, and every course-analytics request answers 400
 * missing_course.
 */
async function passRate(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const out: PassRateReport = await getPassRateForCourse(supabase, courseId);
  return c.json(out);
}

async function toppers(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const parsed = topLimitSchema.safeParse({ limit: c.req.query("limit") });
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const rows: TopperRow[] = await getToppersForCourse(supabase, courseId, parsed.data.limit);
  return c.json({ toppers: rows });
}

async function attendanceShortage(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const parsed = attendanceThresholdSchema.safeParse({ threshold: c.req.query("threshold") });
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const rows: AttendanceShortageRow[] = await getAttendanceShortageForCourse(
    supabase,
    courseId,
    parsed.data.threshold,
  );
  return c.json({ rows });
}

export const analyticsCourseRoute = new Hono<AppEnv>()
  .get("/pass-rate", passRate)
  .get("/toppers", toppers)
  .get("/attendance-shortage", attendanceShortage);