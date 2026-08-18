import { useEffect, useState } from "react";
import { API_ROUTES, type HealthResponse } from "@mark-matrix/shared";

export function App(): JSX.Element {
  const [status, setStatus] = useState<string>("checking…");

  useEffect(() => {
    const origin = (import.meta.env["VITE_API_ORIGIN"] as string | undefined) ?? "";
    fetch(`${origin}${API_ROUTES.health}`)
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((body) => setStatus(body.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main className="app">
      <h1>Mark-Matrix</h1>
      <p>
        API status: <strong>{status}</strong>
      </p>
    </main>
  );
}
