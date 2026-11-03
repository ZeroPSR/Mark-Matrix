// apps/web/src/components/Modal/Modal.tsx
import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const sel =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]';
  const all = Array.from(root.querySelectorAll<HTMLElement>(sel));
  return all.filter((el) => el.getAttribute("tabindex") !== "-1");
}

export function Modal({ open, onClose, title, actions, children }: ModalProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog) {
      const focusables = getFocusable(dialog);
      (focusables[0] ?? dialog).focus();
    }
    return () => {
      previousFocus.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = getFocusable(dialogRef.current);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last  = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className={styles["backdrop"]} onMouseDown={onBackdropMouseDown} data-testid="modal-backdrop">
      <div
        className={styles["dialog"]}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className={styles["header"]}>
          {title !== undefined ? <h2 className={styles["title"]}>{title}</h2> : <span />}
          <button className={styles["close"]} aria-label="Close" tabIndex={-1} onClick={onClose}>×</button>
        </div>
        <div className={styles["body"]}>{children}</div>
        {actions !== undefined && <div className={styles["footer"]}>{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
