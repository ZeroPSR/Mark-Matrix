// apps/web/src/components/Tabs/Tabs.tsx
import styles from "./Tabs.module.css";

export interface TabItem { id: string; label: string }
export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

export function Tabs({ items, activeId, onChange, ariaLabel }: TabsProps): JSX.Element {
  return (
    <div role="tablist" aria-label={ariaLabel} className={styles.tablist}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={it.id === activeId}
          className={styles.tab}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
