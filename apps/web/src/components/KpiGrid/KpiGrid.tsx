// apps/web/src/components/KpiGrid/KpiGrid.tsx
import styles from "./KpiGrid.module.css";

export interface KpiItem {
  /** Short name of the figure, e.g. "Pass rate". */
  label: string;
  /** Pre-formatted value. Use an em dash when the figure is not available. */
  value: string;
}

export interface KpiGridProps {
  /** Accessible name for the group of tiles. */
  label: string;
  items: readonly KpiItem[];
}

/**
 * A row of headline figures. The tile pattern is shared by every analytics
 * surface so the faculty and admin pages read the same way.
 */
export function KpiGrid({ label, items }: KpiGridProps): JSX.Element {
  return (
    <dl className={styles["kpis"]} aria-label={label}>
      {items.map((item) => (
        <div key={item.label} className={styles["kpi"]}>
          <dt className={styles["kpiLabel"]}>{item.label}</dt>
          <dd className={styles["kpiValue"]}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
