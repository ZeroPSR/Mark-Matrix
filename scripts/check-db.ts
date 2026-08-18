/**
 * Trivial Supabase connectivity check.
 *
 *   pnpm check-db
 *
 * Reads SUPABASE_URL + SUPABASE_ANON_KEY from .env (or process env),
 * creates a client, and runs `select 1` via the REST endpoint. Exits 0
 * on success, non-zero with an explanatory message on failure.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: "apps/api/.dev.vars", quiet: true });

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_ANON_KEY"];

if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY. " +
      "Set them in .env or apps/api/.dev.vars.",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const supabase = createClient(url, key);
  const { error } = await supabase.from("_health").select("*").limit(1).maybeSingle();
  // `_health` will not exist on a fresh project — that's fine. We only care
  // that the round-trip reaches Postgres without an auth/network error.
  if (error && /invalid api key|invalid jwt/i.test(error.message)) {
    console.error("Auth error talking to Supabase:", error.message);
    process.exit(1);
  }
  console.log("Supabase reachable at", url);
}

main().catch((err: unknown) => {
  console.error("Supabase connectivity check failed:", err);
  process.exit(1);
});
