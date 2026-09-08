import type { Role } from "@mark-matrix/shared";

export interface NavItem {
  label: string;
  to: string;
  roles: readonly Role[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard",    to: "/",                       roles: ["admin", "faculty", "student"] },
  { label: "Users",        to: "/admin/users",            roles: ["admin"] },
  { label: "Academic",     to: "/admin/academic",         roles: ["admin"] },
  { label: "Assignments",  to: "/admin/assignments",      roles: ["admin"] },
  { label: "Enrollments",  to: "/admin/enrollments",      roles: ["admin"] },
  { label: "My Courses",   to: "/faculty/courses",        roles: ["faculty"] },
  { label: "My Results",   to: "/student/results",        roles: ["student"] },
  { label: "My Attendance", to: "/student/attendance",    roles: ["student"] },
  { label: "My Marks",     to: "/student/marks",         roles: ["student"] },
] as const;