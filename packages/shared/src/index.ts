/**
 * Shared constants and types for the Mark-Matrix monorepo.
 *
 * Both apps/web (React) and apps/api (Hono) import from here so that
 * request/response shapes and role names stay in lock-step.
 */

export * from "./auth.js";

export const ROLES = ["admin", "faculty", "student"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const API_ROUTES = {
  health: "/health",
  me: "/api/me",
  login: "/login",
  forbidden: "/forbidden",
  adminUsers: "/api/admin/users",
} as const;

export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

/**
 * Two parallel hierarchies model the academic structure of Mark-Matrix:
 *
 *   batch/program/sem/course/{attendance, marks}    — per-course inputs
 *   batch/program/sem/{gradesheet, score/{sgpa, cgpa}}  — per-semester outputs
 */
export const DATA_HIERARCHY = ["batch", "program", "sem", "course"] as const;

export const DATA_LEAVES = [
  "attendance",
  "marks",
  "gradesheet",
  "score/sgpa",
  "score/cgpa",
] as const;

export * from "./routes.js";

export * from "./schemas.js";
