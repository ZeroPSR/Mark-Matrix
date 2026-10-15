// apps/web/src/components/Table/Table.tsx
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Table.module.css";

export interface TableColumn<Row> {
  key: keyof Row & string;
  header: string;
  align?: "left" | "right";
  mono?: boolean;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: readonly Row[];
  emptyMessage?: string;
  stickyHeader?: boolean;
}

export function Table<Row extends Record<string, unknown>>({
  columns,
  rows,
  emptyMessage = "No data",
  stickyHeader = false,
}: TableProps<Row>): JSX.Element {
  if (rows.length === 0) {
    return (
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            <th className={styles.th} colSpan={columns.length}>·</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className={styles.empty}>{emptyMessage}</td></tr>
        </tbody>
      </table>
    );
  }
  return (
    <table className={cn(styles.table, stickyHeader ? styles.sticky : undefined)}>
      <thead className={styles.thead}>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={cn(styles.th, c.align === "right" ? styles.right : undefined)}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={styles.tr}>
            {columns.map((c) => {
              const v = row[c.key];
              const content: ReactNode = v === null || v === undefined || v === "" ? "—" : (v as ReactNode);
              return (
                <td
                  key={c.key}
                  className={cn(styles.td, c.align === "right" ? styles.right : undefined, c.mono ? styles.mono : undefined)}
                >
                  {content}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
