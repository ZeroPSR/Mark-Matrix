// apps/web/src/components/Input/Input.tsx
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  type?: "text" | "number" | "email" | "password" | "search" | "tel" | "url";
}

export function Input({ type = "text", className, ...rest }: InputProps): JSX.Element {
  return (
    <input
      type={type}
      className={cn(styles.input, type === "number" ? styles.mono : undefined, className)}
      {...rest}
    />
  );
}
