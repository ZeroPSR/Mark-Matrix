import { useAuth } from "../auth/AuthContext.js";
import { PageTitle } from "../components/PageTitle/PageTitle.js";

export function DashboardPlaceholder(): JSX.Element {
  const { userId, role } = useAuth();
  return (
    <article>
      <PageTitle eyebrow="Dashboard">Welcome, {userId ?? "there"}</PageTitle>
      {role === null ? (
        <p>You are not signed in.</p>
      ) : (
        <p>
          You are signed in as a <strong>{role}</strong>.
        </p>
      )}
    </article>
  );
}
