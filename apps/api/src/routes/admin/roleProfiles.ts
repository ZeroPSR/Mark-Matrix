import { Hono } from "hono";
import {
  createStudentProfileSchema,
  createFacultyProfileSchema,
  createAdminProfileSchema,
  formatZodError,
  type CreateStudentProfile,
  type CreateFacultyProfile,
  type CreateAdminProfile,
} from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";
import { mapPgError } from "../../lib/pgErrors.js";

export interface ProfileWithSatellite {
  userId: string;
  name: string;
  role: "admin" | "faculty" | "student";
  rollNumber?: string;
  admissionYear?: number;
  employeeCode?: string;
  department?: string;
  designation?: string;
}

interface StudentRow {
  user_id: string;
  roll_number: string;
  admission_year: number;
}
interface FacultyRow {
  user_id: string;
  employee_code: string;
  department: string | null;
  designation: string | null;
}
interface AdminRow {
  user_id: string;
  employee_code: string;
  designation: string | null;
}
interface ProfileJoinRow {
  name: string;
  role: "admin" | "faculty" | "student";
}

const buildSatellite = (
  p: ProfileJoinRow,
  s: StudentRow | FacultyRow | AdminRow | null,
): ProfileWithSatellite => {
  const base: ProfileWithSatellite = {
    userId: s ? s.user_id : "",
    name: p.name,
    role: p.role,
  };
  if (s && "roll_number" in s) {
    base.rollNumber = s.roll_number;
    base.admissionYear = s.admission_year;
  }
  if (s && "employee_code" in s) {
    base.employeeCode = s.employee_code;
    if ("department" in s && s.department) base.department = s.department;
    if ("designation" in s && s.designation) base.designation = s.designation;
  }
  return base;
};

const students = new Hono<AppEnv>();
students.get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("student_profiles")
    .select("user_id, roll_number, admission_year, profiles!inner(name, role)");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const out: ProfileWithSatellite[] = (data ?? []).map((row) => {
    const r = row as unknown as StudentRow & { profiles: ProfileJoinRow };
    return buildSatellite(r.profiles, r);
  });
  return c.json({ data: out });
});
students.post("/", async (c) => {
  const supabase = c.get("supabase");
  const body = await c.req.json().catch(() => null);
  const parsed = createStudentProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", fields: formatZodError(parsed.error) }, 400);
  }
  const d: CreateStudentProfile = parsed.data;
  const { data, error } = await supabase
    .from("student_profiles")
    .insert({ user_id: d.userId, roll_number: d.rollNumber, admission_year: d.admissionYear })
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data }, 201);
});
students.delete("/:userId", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.req.param("userId");
  const { error } = await supabase.from("student_profiles").delete().eq("user_id", userId);
  if (error) {
    const m = mapPgError(error, { hasDependents: true });
    return c.json(m.body, m.status);
  }
  return c.body(null, 204);
});

const faculty = new Hono<AppEnv>();
faculty.get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("faculty_profiles")
    .select("user_id, employee_code, department, designation, profiles!inner(name, role)");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const out: ProfileWithSatellite[] = (data ?? []).map((row) => {
    const r = row as unknown as FacultyRow & { profiles: ProfileJoinRow };
    return buildSatellite(r.profiles, r);
  });
  return c.json({ data: out });
});
faculty.post("/", async (c) => {
  const supabase = c.get("supabase");
  const body = await c.req.json().catch(() => null);
  const parsed = createFacultyProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", fields: formatZodError(parsed.error) }, 400);
  }
  const d: CreateFacultyProfile = parsed.data;
  const { data, error } = await supabase
    .from("faculty_profiles")
    .insert({
      user_id: d.userId,
      employee_code: d.employeeCode,
      department: d.department ?? null,
      designation: d.designation ?? null,
    })
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data }, 201);
});
faculty.delete("/:userId", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.req.param("userId");
  const { error } = await supabase.from("faculty_profiles").delete().eq("user_id", userId);
  if (error) {
    const m = mapPgError(error, { hasDependents: true });
    return c.json(m.body, m.status);
  }
  return c.body(null, 204);
});

const admins = new Hono<AppEnv>();
admins.get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("user_id, employee_code, designation, profiles!inner(name, role)");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const out: ProfileWithSatellite[] = (data ?? []).map((row) => {
    const r = row as unknown as AdminRow & { profiles: ProfileJoinRow };
    return buildSatellite(r.profiles, r);
  });
  return c.json({ data: out });
});
admins.post("/", async (c) => {
  const supabase = c.get("supabase");
  const body = await c.req.json().catch(() => null);
  const parsed = createAdminProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", fields: formatZodError(parsed.error) }, 400);
  }
  const d: CreateAdminProfile = parsed.data;
  const { data, error } = await supabase
    .from("admin_profiles")
    .insert({
      user_id: d.userId,
      employee_code: d.employeeCode,
      designation: d.designation ?? null,
    })
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ data }, 201);
});
admins.delete("/:userId", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.req.param("userId");
  const { error } = await supabase.from("admin_profiles").delete().eq("user_id", userId);
  if (error) {
    const m = mapPgError(error, { hasDependents: true });
    return c.json(m.body, m.status);
  }
  return c.body(null, 204);
});

export const adminStudentsRoute = students;
export const adminFacultyRoute = faculty;
export const adminAdminsRoute = admins;
