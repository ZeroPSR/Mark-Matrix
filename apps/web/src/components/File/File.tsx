// apps/web/src/components/File/File.tsx
import { useState, useId, type ChangeEvent } from "react";
import { Button } from "../Button/Button.js";
import styles from "./File.module.css";

export interface FileProps {
  label: string;
  accept?: string;
  onChange: (file: File | null) => void;
}

export function File({ label, accept, onChange }: FileProps): JSX.Element {
  const id = useId();
  const [name, setName] = useState<string | null>(null);

  const handle = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    setName(f?.name ?? null);
    onChange(f);
  };

  const clear = (): void => {
    setName(null);
    onChange(null);
  };

  return (
    <div className={styles.wrap}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <input
        id={id}
        type="file"
        accept={accept}
        className={styles.input}
        onChange={handle}
        aria-label={label}
      />
      {name !== null && (
        <span className={styles.filename}>{name} <Button variant="ghost" size="sm" onClick={clear}>Remove</Button></span>
      )}
    </div>
  );
}
