// apps/web/src/components/Pagination/Pagination.tsx
import { Button } from "../Button/Button.js";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps): JSX.Element {
  const first = page > 1;
  const last  = page < totalPages;
  return (
    <nav className={styles.wrap} aria-label="Pagination">
      <Button variant="ghost" size="sm" disabled={!first} onClick={() => onPageChange(1)} aria-label="First">«</Button>
      <Button variant="ghost" size="sm" disabled={!first} onClick={() => onPageChange(page - 1)} aria-label="Previous">‹</Button>
      <span className={styles.label}>Page {page} of {totalPages}</span>
      <Button variant="ghost" size="sm" disabled={!last}  onClick={() => onPageChange(page + 1)} aria-label="Next">›</Button>
      <Button variant="ghost" size="sm" disabled={!last}  onClick={() => onPageChange(totalPages)} aria-label="Last">»</Button>
    </nav>
  );
}
