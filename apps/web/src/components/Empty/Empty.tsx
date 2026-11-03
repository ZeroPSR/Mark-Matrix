// apps/web/src/components/Empty/Empty.tsx
import type { ReactNode } from "react";
import styles from "./Empty.module.css";
export function Empty({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles["empty"]}>{children}</div>;
}
