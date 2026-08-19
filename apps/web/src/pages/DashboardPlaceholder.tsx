import { useAuth } from "../auth/AuthContext.js";

export function DashboardPlaceholder(): JSX.Element {
  const { userId, role } = useAuth();
  return (
    <section>
      <h2>Dashboard</h2>
      <p>Signed in as <code>{userId}</code> with role <code>{role}</code>.</p>
    </section>
  );
}
