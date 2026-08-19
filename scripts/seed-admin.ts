import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: "apps/api/.dev.vars", quiet: true });

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const ADMIN_EMAIL = process.env["SEED_ADMIN_EMAIL"] ?? "admin@mark-matrix.local";
const ADMIN_PASSWORD = process.env["SEED_ADMIN_PASSWORD"] ?? "changeme";

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main(): Promise<void> {
  // Idempotent: skip if any admin already exists.
  const { data: existing, error: listErr } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1);
  if (listErr) throw new Error(`profile check failed: ${listErr.message}`);
  if (existing && existing.length > 0) {
    console.log("Admin already exists — skipping bootstrap.");
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Admin" },
  });
  if (error || !data.user) {
    throw new Error(`admin createUser failed: ${error?.message ?? "no user"}`);
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ role: "admin", name: "Admin" })
    .eq("user_id", data.user.id);
  if (updateErr) {
    throw new Error(`profile promote failed: ${updateErr.message}`);
  }

  console.log(`Admin user created: ${ADMIN_EMAIL}`);
  console.log("Sign in and change the password immediately.");
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
