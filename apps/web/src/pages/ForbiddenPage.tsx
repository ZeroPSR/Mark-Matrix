export function ForbiddenPage(): JSX.Element {
  return (
    <section className="app-error">
      <h2>Forbidden</h2>
      <p>Your role does not have access to that page.</p>
    </section>
  );
}
