import { useMemo, useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { API_ROUTES, ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Badge, type BadgeVariant } from "../../components/Badge/Badge.js";
import { Button } from "../../components/Button/Button.js";
import { Input } from "../../components/Input/Input.js";
import { Select } from "../../components/Select/Select.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Pagination } from "../../components/Pagination/Pagination.js";
import { Loading } from "../../components/Loading/Loading.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import styles from "./UsersPage.module.css";

interface Profile {
  user_id: string;
  name: string;
  role: "admin" | "faculty" | "student";
  email?: string | null;
  lastActiveAt?: string | null;
}

interface Row extends Record<string, unknown> {
  name: string;
  email: string;
  role: JSX.Element;
  lastActive: JSX.Element;
  actions: JSX.Element;
}

const PAGE_SIZE = 25;
const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "faculty", label: "Faculty" },
  { value: "student", label: "Student" },
];

const roleToBadge = (r: string): BadgeVariant =>
  r === "admin" ? "locked" : r === "faculty" ? "submitted" : "draft";

export function UsersPage(): JSX.Element {
  const profiles = useResource<{ users: Profile[] }>(API_ROUTES.adminUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  const setRoleOnUser = async (userId: string, nextRole: "admin" | "faculty" | "student"): Promise<void> => {
    setBusy(userId);
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminUserById(userId), {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "role_change_failed");
    } finally {
      setBusy(null);
    }
  };

  const list = profiles.data?.users ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((u) => {
      if (role !== "" && u.role !== role) return false;
      if (q === "") return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) === true ||
        u.user_id.toLowerCase().includes(q)
      );
    });
  }, [list, search, role]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const rows: Row[] = pageRows.map((u) => ({
    name: u.name,
    email: u.email ?? u.user_id,
    role: <Badge variant={roleToBadge(u.role)}>{u.role}</Badge>,
    lastActive: <small>{u.lastActiveAt ?? "—"}</small>,
    actions: (
      <div className={styles["roleSet"]}>
        {(["admin", "faculty", "student"] as const).map((r) => (
          <button
            key={r}
            type="button"
            disabled={busy === u.user_id || u.role === r}
            className={`${styles["roleBtn"]} ${u.role === r ? styles["roleBtnActive"] : ""}`}
            onClick={() => void setRoleOnUser(u.user_id, r)}
          >
            {r}
          </button>
        ))}
      </div>
    ),
  }));

  const columns: TableColumn<Row>[] = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role" },
    { key: "lastActive", header: "Last active" },
    { key: "actions", header: "Set role" },
  ];

  return (
    <article className={styles["page"]}>
      <PageTitle eyebrow="Admin · Users">Users</PageTitle>
      {error !== null && <ErrorState onRetry={() => setError(null)}>{error}</ErrorState>}
      <section className={styles["filterBar"]} role="group" aria-label="User filters">
        <Input
          aria-label="Search users"
          placeholder="Search by name, email, or ID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Select
          aria-label="Filter by role"
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1); }}
          options={ROLE_OPTIONS}
        />
        <div className={styles["actions"]}>
          <Button variant="ghost" size="md">Add user</Button>
        </div>
      </section>
      {profiles.loading ? (
        <Loading />
      ) : (
        <>
          <Table<Row>
            columns={columns}
            rows={rows}
            emptyMessage="No users match these filters."
          />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </article>
  );
}

export default UsersPage;