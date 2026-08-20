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

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_USERS = [
  { email: "admin.test@mark-matrix.local",   password: "TestPass!1", name: "Admin Test",   role: "admin" },
  { email: "faculty.test@mark-matrix.local", password: "TestPass!1", name: "Faculty Test", role: "faculty" },
  { email: "student.test@mark-matrix.local", password: "TestPass!1", name: "Student Test", role: "student" },
] as const;

async function main(): Promise<void> {
  const userIds: Record<string, string> = {};
  for (const u of TEST_USERS) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
    const existing = list.users.find((x) => x.email === u.email);

    let userId: string;
    if (existing) {
      userId = existing.id;
      console.log(`User exists, skipping: ${u.email}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { name: u.name },
      });
      if (error || !data.user) {
        throw new Error(`createUser failed for ${u.email}: ${error?.message ?? "no user"}`);
      }
      userId = data.user.id;
      console.log(`Created user: ${u.email}`);
    }

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ role: u.role, name: u.name })
      .eq("user_id", userId);
    if (updateErr) {
      throw new Error(`profile update failed for ${u.email}: ${updateErr.message}`);
    }

    userIds[u.email.split("@")[0]!] = userId;
  }

  const satellites = [
    { userId: userIds["admin.test"],   table: "admin_profiles",   row: { employee_code: "TEST-ADMIN-001" } },
    { userId: userIds["faculty.test"], table: "faculty_profiles", row: { employee_code: "TEST-FAC-001", department: "CS", designation: "Lecturer" } },
    { userId: userIds["student.test"], table: "student_profiles", row: { roll_number: "TEST-23BCA001", admission_year: 2023 } },
  ] as const;

  for (const s of satellites) {
    const { error } = await supabase
      .from(s.table)
      .upsert({ user_id: s.userId, ...s.row }, { onConflict: "user_id" });
    if (error) throw new Error(`satellite upsert failed: ${error.message}`);
  }
  console.log("Test users seeded.");
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
