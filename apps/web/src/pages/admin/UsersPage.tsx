import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { API_ROUTES, ROUTES_CYCLE_2 } from "@mark-matrix/shared";

interface Profile { user_id: string; name: string; role: "admin" | "faculty" | "student"; }

export function UsersPage() {
  const profiles = useResource<{ users: Profile[] }>(API_ROUTES.adminUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setRole = async (userId: string, role: "admin" | "faculty" | "student"): Promise<void> => {
    setBusy(userId);
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminUserById(userId), {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "role_change_failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="users-page">
      <h1>Users</h1>
      {error !== null && <p className="users-page__error">{error}</p>}
      <table>
        <thead>
          <tr><th>Name</th><th>Role</th><th>Set role</th></tr>
        </thead>
        <tbody>
          {(profiles.data?.users ?? []).map((u) => (
            <tr key={u.user_id}>
              <td>{u.name}</td>
              <td>{u.role}</td>
              <td>
                {(["admin", "faculty", "student"] as const).map((r) => (
                  <button
                    key={r}
                    disabled={busy === u.user_id || u.role === r}
                    onClick={() => setRole(u.user_id, r)}
                  >{r}</button>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}