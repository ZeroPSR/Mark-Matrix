import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { AuditLogListResponse, AuditLogRow } from "@mark-matrix/shared";
import { apiFetch, apiUrl } from "../../lib/api.js";
import { supabase } from "../../lib/supabase.js";
import { cn } from "../../lib/cn.js";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Badge, type BadgeVariant } from "../../components/Badge/Badge.js";
import { Button } from "../../components/Button/Button.js";
import { Field } from "../../components/Field/Field.js";
import { Select } from "../../components/Select/Select.js";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/Table/Table.js";
import tableStyles from "../../components/Table/Table.module.css";
import { Pagination } from "../../components/Pagination/Pagination.js";
import { Loading } from "../../components/Loading/Loading.js";
import { Empty } from "../../components/Empty/Empty.js";
import { Banner } from "../../components/Banner/Banner.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import styles from "./AuditLogPage.module.css";

const PAGE_SIZE = 50;

/** Entity filter values — the record types the audit log can carry. */
const ENTITY_OPTIONS = [
  { value: "", label: "All entities" },
  { value: "attendance", label: "attendance" },
  { value: "marks", label: "marks" },
  { value: "gradesheet", label: "gradesheet" },
  { value: "enrollment", label: "enrollment" },
  { value: "faculty_assignment", label: "faculty_assignment" },
  { value: "user", label: "user" },
  { value: "grade_scheme", label: "grade_scheme" },
];

/** Action filter values — the verbs the audit log records. */
const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "create", label: "create" },
  { value: "update", label: "update" },
  { value: "delete", label: "delete" },
  { value: "submit", label: "submit" },
  { value: "approve", label: "approve" },
  { value: "lock", label: "lock" },
  { value: "unlock", label: "unlock" },
  { value: "compile", label: "compile" },
  { value: "publish", label: "publish" },
];

/**
 * Audit-log action → Badge variant. The log is append-only, so a verb that
 * is not listed here simply renders as a neutral chip instead of breaking
 * the table.
 */
export const ACTION_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  approve: "approved",
  submit: "submitted",
  publish: "published",
  lock: "locked",
  create: "neutral",
  delete: "neutral",
  update: "neutral",
  unlock: "neutral",
};

/** The Badge variant for an action; unknown actions fall back to "neutral". */
export function actionBadgeVariant(action: string): BadgeVariant {
  return ACTION_BADGE_VARIANTS[action] ?? "neutral";
}

/** How an actor is named in the filter list: email, then name, then the id. */
function actorOptionLabel(userId: string, user: { email: string | null; name: string }): string {
  if (user.email !== null && user.email !== "") return user.email;
  return user.name !== "" ? user.name : userId;
}

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
  /** Set when the CSV export fails, so the admin sees why nothing downloaded. */
  const [exportError, setExportError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [userMap, setUserMap] = useState<Record<string, { email: string | null; name: string }>>({});
  /** Bumped by the error state's Retry button to re-run the query. */
  const [nonce, setNonce] = useState(0);

  // Fetch users once for email lookup.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await apiFetch<{
          users: { user_id: string; email: string | null; name: string }[];
        }>("/api/admin/users");
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
        const body = await apiFetch<AuditLogListResponse>(`/api/admin/audit-log?${queryString}`);
        if (cancelled) return;
        setData(body.data);
        setTotal(body.total);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        const status = (e as { status?: number }).status;
        setError(
          status !== undefined
            ? `Failed to load audit log: ${status}`
            : e instanceof Error
              ? e.message
              : "Unknown error",
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryString, nonce]);

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
    setExportError(null);
    // Strip page/pageSize for the export (it returns all matching rows).
    const exportQs = buildQueryString({ userId, entity, action, from: from || undefined, to: to || undefined });
    // The export is a blob, so it cannot go through apiFetch; it still needs
    // the session token the admin API expects, and it still has to be sent
    // to the API origin — a relative path would hit the web app in
    // production.
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token ?? "";
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/admin/audit-log/export.csv?${exportQs}`), {
        headers: token !== "" ? { authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // The request never reached the API; say so rather than swallow it.
      setExportError("The export failed: the API could not be reached.");
      return;
    }
    if (!res.ok) {
      // Never fail silently: the admin has to know the export did not run.
      setExportError(`The export failed (HTTP ${res.status}).`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [userId, entity, action, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const actorOptions = useMemo(() => {
    const options = Object.entries(userMap).map(([id, user]) => ({
      value: id,
      label: actorOptionLabel(id, user),
    }));
    // Keep a selected actor selectable even if the user list no longer has it.
    if (userId !== "" && !options.some((o) => o.value === userId)) {
      options.push({ value: userId, label: userId });
    }
    return [{ value: "", label: "All actors" }, ...options];
  }, [userMap, userId]);

  return (
    <article className={styles["page"]}>
      <PageTitle eyebrow="Admin · Audit log">Audit Log</PageTitle>

      {exportError !== null && (
        <Banner variant="error" title="Export failed">{exportError}</Banner>
      )}

      <section className={styles["filterBar"]} role="group" aria-label="Audit log filters">
        <Field label="Actor" htmlFor="audit-actor">
          <Select
            id="audit-actor"
            aria-label="Actor"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            options={actorOptions}
          />
        </Field>
        <Field label="Entity" htmlFor="audit-entity">
          <Select
            id="audit-entity"
            aria-label="Entity"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            options={ENTITY_OPTIONS}
          />
        </Field>
        <Field label="Action" htmlFor="audit-action">
          <Select
            id="audit-action"
            aria-label="Action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            options={ACTION_OPTIONS}
          />
        </Field>
        <Field label="From" htmlFor="audit-from">
          <input
            id="audit-from"
            type="datetime-local"
            className={styles["dateInput"]}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To" htmlFor="audit-to">
          <input
            id="audit-to"
            type="datetime-local"
            className={styles["dateInput"]}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <div className={styles["actions"]}>
          <Button variant="primary" onClick={onApply}>Apply</Button>
          <Button variant="secondary" onClick={onReset}>Reset</Button>
          <Button variant="ghost" onClick={() => void onExport()}>Export CSV</Button>
        </div>
      </section>

      {error !== null ? (
        <ErrorState onRetry={() => setNonce((n) => n + 1)}>{error}</ErrorState>
      ) : loading ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty>No audit log rows match these filters.</Empty>
      ) : (
        <table className={cn(tableStyles["table"], tableStyles["sticky"])} aria-label="Audit log entries">
          <TableHead>
            <TableHeaderCell>Timestamp</TableHeaderCell>
            <TableHeaderCell>Actor</TableHeaderCell>
            <TableHeaderCell>Action</TableHeaderCell>
            <TableHeaderCell>Entity</TableHeaderCell>
            <TableHeaderCell align="right">Target</TableHeaderCell>
          </TableHead>
          <TableBody>
            {data.map((row) => {
              const u = userMap[row.user_id];
              const userLabel = u?.email ?? row.user_id.slice(0, 8);
              const isExpanded = expandedId === row.id;
              return (
                <Fragment key={row.id}>
                  <TableRow>
                    <TableCell mono>
                      <button
                        type="button"
                        className={styles["timestampButton"]}
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        {row.created_at}
                      </button>
                    </TableCell>
                    <TableCell>{userLabel}</TableCell>
                    <TableCell>
                      <Badge variant={actionBadgeVariant(row.action)}>{row.action}</Badge>
                    </TableCell>
                    <TableCell>{row.entity}</TableCell>
                    <TableCell align="right" mono>{row.entity_id}</TableCell>
                  </TableRow>
                  {isExpanded && (
                    <tr className={styles["detailRow"]}>
                      <td colSpan={5} className={cn(tableStyles["td"], styles["detail"])}>
                        <pre>{`old_value: ${JSON.stringify(row.old_value, null, 2)}`}</pre>
                        <pre>{`new_value: ${JSON.stringify(row.new_value, null, 2)}`}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </table>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </article>
  );
}

export default AuditLogPage;
