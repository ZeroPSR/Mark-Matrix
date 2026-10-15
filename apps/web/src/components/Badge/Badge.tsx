// apps/web/src/components/Badge/Badge.tsx
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Badge.module.css";

export type BadgeVariant = "draft" | "submitted" | "published" | "locked" | "error";

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }): JSX.Element {
  return <span className={cn(styles.badge, styles[variant])}>{children}</span>;
}
