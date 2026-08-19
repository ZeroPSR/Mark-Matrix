import type { Role } from "@mark-matrix/shared";

export interface NavItem {
  label: string;
  to: string;
  roles: readonly Role[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard",  to: "/",                  roles: ["admin", "faculty", "student"] },
  { label: "Users",      to: "/admin/users",       roles: ["admin"] },
  { label: "My Courses", to: "/faculty/courses",   roles: ["faculty"] },
  { label: "My Results", to: "/student/results",   roles: ["student"] },
] as const;
