import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cn(styles.btn, styles[variant], styles[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}