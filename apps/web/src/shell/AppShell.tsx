import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { NAV_ITEMS } from "./navConfig.js";

export function AppShell(): JSX.Element {
  const { role, signOut } = useAuth();
  const items = NAV_ITEMS.filter((i) => role && i.roles.includes(role));

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <h1>Mark-Matrix</h1>
        <span className="app-shell__role">{role}</span>
        <button onClick={signOut}>Sign out</button>
      </header>
      <nav className="app-shell__nav">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === "/"}
            className={({ isActive }) => "app-shell__nav-item" + (isActive ? " is-active" : "")}
          >
            {i.label}
          </NavLink>
        ))}
      </nav>
      <main className="app-shell__main"><Outlet /></main>
    </div>
  );
}
