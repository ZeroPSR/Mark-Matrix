import { Hono, type Context } from "hono";
import { type SemSummaryRow } from "@mark-matrix/shared";
import { getSemSummary } from "../../lib/analyticsRepo.js";
import type { AppEnv } from "../../env.js";

type Ctx = Context<AppEnv>;

async function summary(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const semId = c.req.param("s");
  if (!semId) return c.json({ error: "missing_sem" }, 400);
  const courses: SemSummaryRow[] = await getSemSummary(supabase, semId);
  return c.json({ courses });
}

export const analyticsSemRoute = new Hono<AppEnv>()
  .get("/summary", summary);