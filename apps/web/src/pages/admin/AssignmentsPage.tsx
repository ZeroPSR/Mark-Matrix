import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Button } from "../../components/Button/Button.js";
import { Select } from "../../components/Select/Select.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Pagination } from "../../components/Pagination/Pagination.js";
import { Loading } from "../../components/Loading/Loading.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import { Banner } from "../../components/Banner/Banner.js";
import styles from "./AssignmentsPage.module.css";

interface Assignment {
  id: string;
  facultyId: string;
  courseId: string;
  assignedDate: string;
}
interface Course {
  id: string;
  code: string;
  title: string;
}
interface FacultySat {
  userId: string;
  name: string;
  employeeCode?: string;
}

interface Row extends Record<string, unknown> {
  courseCode: string;
  facultyName: string;
  assignedDate: string;
  actions: JSX.Element;
}

const PAGE_SIZE = 25;

export function AssignmentsPage(): JSX.Element {
  const courses = useResource<{ data: Course[] }>(ROUTES_CYCLE_2.adminCourses);
  const faculty = useResource<{ data: FacultySat[] }>(ROUTES_CYCLE_2.adminFaculty);
  const assignments = useResource<{ data: Assignment[] }>(ROUTES_CYCLE_2.adminFacultyAssignments);
  const [facultyId, setFacultyId] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);

  const submit = async (): Promise<void> => {
    setError(null);
    setInfo(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminFacultyAssignments, {
        method: "POST",
        body: JSON.stringify({ facultyId, courseId }),
      });
      setInfo("Assignment created.");
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "assign_failed");
    }
  };

  const remove = async (id: string): Promise<void> => {
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminFacultyAssignmentById(id), { method: "DELETE" });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "delete_failed");
    }
  };

  const list = assignments.data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const courseById = new Map((courses.data?.data ?? []).map((c) => [c.id, c]));
  const facultyById = new Map((faculty.data?.data ?? []).map((f) => [f.userId, f]));

  const rows: Row[] = pageRows.map((a) => {
    const c = courseById.get(a.courseId);
    const f = facultyById.get(a.facultyId);
    return {
      courseCode: c ? `${c.code} — ${c.title}` : a.courseId,
      facultyName: f ? `${f.name}${f.employeeCode ? ` (${f.employeeCode})` : ""}` : a.facultyId,
      assignedDate: a.assignedDate,
      actions: (
        <Button variant="ghost" size="sm" onClick={() => void remove(a.id)}>
          Remove
        </Button>
      ),
    };
  });

  const columns: TableColumn<Row>[] = [
    { key: "facultyName", header: "Faculty" },
    { key: "courseCode", header: "Course", align: "right", mono: true },
    { key: "assignedDate", header: "Assigned" },
    { key: "actions", header: "Actions", align: "right" },
  ];

  return (
    <article className={styles["page"]}>
      <PageTitle eyebrow="Admin · Faculty assignments">Faculty Assignments</PageTitle>
      {error !== null && <ErrorState onRetry={() => setError(null)}>{error}</ErrorState>}
      {info !== null && <Banner variant="success">{info}</Banner>}
      <section className={styles["filterBar"]} role="group" aria-label="New assignment">
        <Select
          aria-label="Course"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          options={[
            { value: "", label: "— pick a course —" },
            ...(courses.data?.data ?? []).map((c) => ({
              value: c.id,
              label: `${c.code} — ${c.title}`,
            })),
          ]}
        />
        <Select
          aria-label="Faculty"
          value={facultyId}
          onChange={(e) => setFacultyId(e.target.value)}
          options={[
            { value: "", label: "— pick a faculty member —" },
            ...(faculty.data?.data ?? []).map((f) => ({
              value: f.userId,
              label: `${f.name}${f.employeeCode ? ` (${f.employeeCode})` : ""}`,
            })),
          ]}
        />
        <div className={styles["actions"]}>
          <Button
            variant="primary"
            size="md"
            disabled={!courseId || !facultyId}
            onClick={() => void submit()}
          >
            Assign
          </Button>
        </div>
      </section>
      {assignments.loading ? (
        <Loading />
      ) : (
        <>
          <Table<Row> columns={columns} rows={rows} emptyMessage="No faculty assignments yet." />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </article>
  );
}

export default AssignmentsPage;
