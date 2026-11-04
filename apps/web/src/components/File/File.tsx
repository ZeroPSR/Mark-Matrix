// apps/web/src/components/File/File.tsx
import { useState, useId, useRef, type ChangeEvent } from "react";
import { Button } from "../Button/Button.js";
import styles from "./File.module.css";

export interface FileProps {
  label: string;
  accept?: string;
  onChange: (file: File | null) => void;
}

export function File({ label, accept, onChange }: FileProps): JSX.Element {
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState<string | null>(null);

  const handle = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    setName(f?.name ?? null);
    onChange(f);
  };

  const clear = (): void => {
    // Reset the native input as well: a file input keeps its selection until
    // its value is cleared, and a browser fires no change event when the very
    // same file is picked again — which would strand the user.
    if (inputRef.current !== null) inputRef.current.value = "";
    setName(null);
    onChange(null);
  };

  return (
    <div className={styles["wrap"]}>
      <label htmlFor={id} className={styles["label"]}>{label}</label>
      <input
        id={id}
        type="file"
        accept={accept}
        className={styles["input"]}
        onChange={handle}
        aria-label={label}
        ref={inputRef}
      />
      {name !== null && (
        <span className={styles["filename"]}>{name} <Button variant="ghost" size="sm" onClick={clear}>Remove</Button></span>
      )}
    </div>
  );
}
