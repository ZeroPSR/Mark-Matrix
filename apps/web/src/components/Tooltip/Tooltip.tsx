// apps/web/src/components/Tooltip/Tooltip.tsx
import { cloneElement, useId, useRef, useState, type ReactElement, type ReactNode, type MouseEvent as ReactMouseEvent, type FocusEvent as ReactFocusEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<{ onFocus?: (e: ReactFocusEvent<HTMLElement>) => void; onBlur?: (e: ReactFocusEvent<HTMLElement>) => void; onMouseEnter?: (e: ReactMouseEvent<HTMLElement>) => void; onMouseLeave?: (e: ReactMouseEvent<HTMLElement>) => void; "aria-describedby"?: string | undefined }>;
}

export function Tooltip({ content, children }: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const id = useId();
  const timer = useRef<number | null>(null);

  const show = (target: HTMLElement): void => {
    const r = target.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.bottom + 4 });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 400);
  };
  const hide = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setOpen(false);
  };

  const triggerEl = cloneElement(children, {
    onFocus: (e: ReactFocusEvent<HTMLElement>) => show(e.currentTarget),
    onBlur: hide,
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => show(e.currentTarget),
    onMouseLeave: hide,
    "aria-describedby": open ? id : undefined,
  });

  return (
    <>
      {triggerEl}
      {open && pos !== null && createPortal(
        <span
          role="tooltip"
          id={id}
          className={styles["tip"]}
          style={{ left: pos.x, top: pos.y, transform: "translateX(-50%)" }}
        >
          {content}
        </span>,
        document.body,
      )}
    </>
  );
}
