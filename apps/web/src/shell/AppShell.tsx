import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Header } from "../components/Header/Header.js";
import { Nav } from "../components/Nav/Nav.js";
import { NAV_ITEMS } from "./navConfig.js";
import { useAuth } from "../auth/AuthContext.js";
import { getStoredTheme, toggleTheme, type Theme } from "../styles/theme.js";

export function AppShell(): JSX.Element {
  const { role, userId, signOut } = useAuth();
  const items = NAV_ITEMS.filter((i) => role !== null && i.roles.includes(role));
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? "light");
  const navigate = useNavigate();

  useEffect(() => {
    const onStorage = (): void => setTheme(getStoredTheme() ?? "light");
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const onToggle = (): void => {
    toggleTheme();
    setTheme(getStoredTheme() ?? "light");
  };

  const onSignOut = (): void => {
    void signOut();
    navigate("/login");
  };

  if (role === null || userId === null) return <div className="app-loading">Loading…</div>;

  return (
    <div className="app-shell">
      <Header
        role={role}
        userName={userId}
        onSignOut={onSignOut}
        onToggleTheme={onToggle}
        currentTheme={theme}
      />
      <Nav items={items.map((i) => ({ to: i.to, label: i.label }))} />
      <main className="app-shell__main"><Outlet /></main>
    </div>
  );
}