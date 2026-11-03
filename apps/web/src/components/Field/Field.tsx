import type { ReactNode } from "react";
import styles from "./Field.module.css";

export interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, children }: FieldProps): JSX.Element {
  return (
    <div className={styles["field"]}>
      <label htmlFor={htmlFor} className={styles["label"]}>{label}</label>
      {children}
      {error !== undefined && (
        <p role="alert" className={styles["error"]}>{error}</p>
      )}
    </div>
  );
}