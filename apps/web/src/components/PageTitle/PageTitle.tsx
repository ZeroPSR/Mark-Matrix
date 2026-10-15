import type { ReactNode } from "react";
import styles from "./PageTitle.module.css";

export interface PageTitleProps {
  eyebrow?: string;
  subtitle?: string;
  children: ReactNode;
}

export function PageTitle({ eyebrow, subtitle, children }: PageTitleProps): JSX.Element {
  return (
    <header className={styles.wrap}>
      {eyebrow !== undefined && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{children}</h1>
      {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
