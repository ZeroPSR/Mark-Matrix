import type { Role } from "@mark-matrix/shared";
import { Badge } from "../Badge/Badge.js";
import { Button } from "../Button/Button.js";
import { Tooltip } from "../Tooltip/Tooltip.js";
import type { Theme } from "../../styles/theme.js";
import styles from "./Header.module.css";

export interface HeaderProps {
  role: Role;
  userName: string;
  onSignOut: () => void;
  onToggleTheme: () => void;
  currentTheme: Theme;
}

export function Header({ role, userName, onSignOut, onToggleTheme, currentTheme }: HeaderProps): JSX.Element {
  return (
    <header className={styles["header"]} data-print="hidden">
      <h1 className={styles["brand"]}>Mark-Matrix</h1>
      <Badge variant="submitted">{role}</Badge>
      <span className={styles["spacer"]} />
      <span className={styles["user"]}>{userName}</span>
      <Tooltip content={`Switch to ${currentTheme === "dark" ? "light" : "dark"} mode`}>
        <Button variant="ghost" size="sm" onClick={onToggleTheme} aria-label="Toggle theme">
          {currentTheme === "dark" ? "☾" : "☼"}
        </Button>
      </Tooltip>
      <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
    </header>
  );
}
