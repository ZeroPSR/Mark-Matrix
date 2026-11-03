import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn.js";
import styles from "./Nav.module.css";

export interface NavItem { to: string; label: string }
export interface NavProps { items: NavItem[] }

export function Nav({ items }: NavProps): JSX.Element {
  return (
    <nav className={styles["nav"]} data-print="hidden" aria-label="Primary">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.to === "/"}
          className={({ isActive }) => cn(styles["link"], isActive ? styles["active"] : undefined)}
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
