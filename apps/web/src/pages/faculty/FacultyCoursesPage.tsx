import { Link } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Loading } from "../../components/Loading/Loading.js";
import { Empty } from "../../components/Empty/Empty.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import styles from "./FacultyCoursesPage.module.css";

interface FacultyCourseView {
  id: string;
  code: string;
  title: string;
  credits: number;
  semester: { id: string; number: number; programId: string; batchId: string };
}

type CourseRow = {
  code: string;
  title: string;
  credits: string;
  context: string;
  actions: JSX.Element;
};

export function FacultyCoursesPage(): JSX.Element {
  const courses = useResource<{ data: FacultyCourseView[] }>(ROUTES_CYCLE_2.facultyCourses);

  const list = courses.data?.data ?? [];

  const rows: CourseRow[] = list.map((c) => ({
    code: c.code,
    title: c.title,
    credits: String(c.credits),
    context: `Semester ${c.semester.number} · Batch ${c.semester.batchId} · Program ${c.semester.programId}`,
    actions: (
      <span className={styles["actions"]}>
        <Link to={`/faculty/marks/${c.id}`}>Enter marks</Link>
        <Link to={`/faculty/marks/${c.id}/roster`}>Marks roster</Link>
        <Link to={`/faculty/attendance/${c.id}`}>Mark attendance</Link>
        <Link to={`/faculty/attendance/${c.id}/roster`}>Attendance roster</Link>
      </span>
    ),
  }));

  const columns: TableColumn<CourseRow>[] = [
    { key: "code", header: "Code" },
    { key: "title", header: "Title" },
    { key: "credits", header: "Credits", align: "right", mono: true },
    { key: "context", header: "Context" },
    { key: "actions", header: "Actions" },
  ];

  const hasData = list.length > 0;
  const showLoading = courses.loading && !hasData;
  const showError = courses.error !== null && !hasData;

  return (
    <main className={styles["page"]}>
      <PageTitle eyebrow="Faculty" subtitle="Courses assigned to you this term">
        My Courses
      </PageTitle>

      {showLoading && <Loading />}
      {showError && (
        <ErrorState onRetry={() => window.location.reload()}>{courses.error}</ErrorState>
      )}
      {!showLoading && !showError && (
        hasData ? (
          <Table<CourseRow>
            columns={columns}
            rows={rows}
            emptyMessage="No courses assigned yet"
          />
        ) : (
          <Empty>You have no courses assigned yet.</Empty>
        )
      )}
    </main>
  );
}