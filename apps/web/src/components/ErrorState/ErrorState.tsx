// apps/web/src/components/ErrorState/ErrorState.tsx
import type { ReactNode } from "react";
import { Button } from "../Button/Button.js";
import styles from "./ErrorState.module.css";
export function ErrorState({ onRetry, children }: { onRetry: () => void; children: ReactNode }): JSX.Element {
  return (
    <div className={styles.wrap} role="alert">
      <span>{children}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
}
