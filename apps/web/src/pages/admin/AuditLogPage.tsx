import { useEffect, useState, useMemo, useCallback } from "react";
import {
  auditLogListQuerySchema,
  type AuditLogRow,
  type AuditLogListResponse,
} from "@mark-matrix/shared";

const PAGE_SIZE = 50;

function buildQueryString(args: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return params.toString();
}

export function AuditLogPage(): JSX.Element {
  const [userId, setUserId] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [userMap, setUserMap] = useState<Record<string, { email: string | null; name: string }>>({});

  // Fetch users once for email lookup.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) return;
        const body = (await res.json()) as {
          users: { user_id: string; email: string | null; name: string }[];
        };
        if (cancelled) return;
        const map: Record<string, { email: string | null; name: string }> = {};
        for (const u of body.users) map[u.user_id] = { email: u.email, name: u.name };
        setUserMap(map);
      } catch {
        // Non-fatal; table falls back to user_id.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const queryString = useMemo(
    () =>
      buildQueryString({
        userId,
        entity,
        action,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [userId, entity, action, from, to, page],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/audit-log?${queryString}`);
        if (cancelled) return;
        if (!res.ok) {
          setError(`Failed to load audit log: ${res.status}`);
          setLoading(false);
          return;
        }
        const body = (await res.json()) as AuditLogListResponse;
        if (cancelled) return;
        setData(body.data);
        setTotal(body.total);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const onApply = useCallback(() => {
    setPage(1);
  }, []);

  const onReset = useCallback(() => {
    setUserId("");
    setEntity("");
    setAction("");
    setFrom("");
    setTo("");
    setPage(1);
  }, []);

  const onExport = useCallback(async () => {
    // Strip page/pageSize for the export (it returns all matching rows).
    const exportQs = buildQueryString({ userId, entity, action, from: from || undefined, to: to || undefined });
    const res = await fetch(`/api/admin/audit-log/export.csv?${exportQs}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [userId, entity, action, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1>Audit Log</h1>
      <div role="group" aria-label="filters">
        <label>
          User (uuid)
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="user_id (uuid)"
          />
        </label>
        <label>
          Entity
          <select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All</option>
            <option value="attendance">attendance</option>
            <option value="marks">marks</option>
            <option value="gradesheet">gradesheet</option>
            <option value="enrollment">enrollment</option>
            <option value="faculty_assignment">faculty_assignment</option>
            <option value="user">user</option>
            <option value="grade_scheme">grade_scheme</option>
          </select>
        </label>
        <label>
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All</option>
            <option value="create">create</option>
            <option value="update">update</option>
            <option value="delete">delete</option>
            <option value="submit">submit</option>
            <option value="approve">approve</option>
            <option value="lock">lock</option>
            <option value="unlock">unlock</option>
            <option value="compile">compile</option>
            <option value="publish">publish</option>
          </select>
        </label>
        <label>
          From
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={onApply}>Apply</button>
        <button onClick={onReset}>Reset</button>
        <button onClick={onExport}>Export CSV</button>
      </div>
      {error && <div role="alert">{error}</div>}
      {loading ? (
        <div>Loading…</div>
      ) : data.length === 0 ? (
        <div>No audit log rows match these filters.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const u = userMap[row.user_id];
              const userLabel = u?.email ?? row.user_id.slice(0, 8);
              const isExpanded = expandedId === row.id;
              return (
                <tr key={row.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      {row.created_at}
                    </button>
                  </td>
                  <td>{userLabel}</td>
                  <td>{row.action}</td>
                  <td>{row.entity}</td>
                  <td>{row.entity_id}</td>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5}>
                        <pre>{`old_value: ${JSON.stringify(row.old_value, null, 2)}`}</pre>
                        <pre>{`new_value: ${JSON.stringify(row.new_value, null, 2)}`}</pre>
                      </td>
                    </tr>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Prev
        </button>
        <span> Page {page} of {totalPages} </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default AuditLogPage;
