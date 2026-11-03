// apps/web/src/components/Banner/Banner.tsx
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Banner.module.css";

export type BannerVariant = "info" | "success" | "warning" | "error";

export interface BannerProps {
  variant: BannerVariant;
  title?: string;
  children: ReactNode;
}

export function Banner({ variant, title, children }: BannerProps): JSX.Element {
  const role = variant === "error" ? "alert" : variant === "success" ? "status" : undefined;
  return (
    <div className={cn(styles.banner, styles[variant])} role={role}>
      {title !== undefined && <p className={styles.title}>{title}</p>}
      {/* The body is a div, not a p: banners may carry block content
          (e.g. a collapsible <details> list), which a <p> cannot hold. */}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
