// apps/web/src/components/Select/Select.tsx
import type { ChangeEvent } from "react";
import styles from "./Select.module.css";

export interface SelectOption { value: string; label: string }
export interface SelectProps {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  "aria-label": string;
  disabled?: boolean;
  id?: string;
}

export function Select({ options, ...rest }: SelectProps): JSX.Element {
  return (
    <select className={styles["select"]} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
