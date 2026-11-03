import { useCallback, useEffect, useMemo, useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2, type AttendanceRow, type AttendanceSummaryRow } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Loading } from "../../components/Loading/Loading.js";
import { Empty } from "../../components/Empty/Empty.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Banner } from "../../components/Banner/Banner.js";
import styles from "./MyAttendancePage.module.css";

interface Enrollment {
  id: string;
  semId: string;
  semester: { id: string; number: number; programId: string; batchId: string };
}

interface Course {
  id: string;
  code: string;
  title: string;
}

// A course is flagged when overall attendance falls below this fraction.
const LOW_ATTENDANCE_THRESHOLD = 75;

// Shared empty list so the fallback keeps a stable identity between renders.
const NO_ROWS: readonly AttendanceRow[] = [];

// What one course's attendance endpoints returned.
interface CourseAttendance {
  summary: AttendanceSummaryRow | null;
  history: readonly AttendanceRow[];
}

interface SummaryRow extends Record<string, unknown> {
  code: string;
  title: string;
  percent: string;
  counts: string;
}

interface HistoryRow extends Record<string, unknown> {
  date: string;
  course: string;
  status: string;
}

export function StudentMyAttendancePage(): JSX.Element {
  const enrollments = useResource<{ data: Enrollment[] }>(ROUTES_CYCLE_2.studentEnrollment);
  const mySem = useMemo(
    () => (enrollments.data?.data ?? []).map((e) => e.semester),
    [enrollments.data],
  );

  if (enrollments.loading) return <Loading />;
  if (enrollments.error !== null)
    return (
      <ErrorState onRetry={() => window.location.reload()}>
        Could not load your enrollments: {enrollments.error}
      </ErrorState>
    );

  return (
    <article className={styles.page}>
      <PageTitle eyebrow="Student · Attendance">My Attendance</PageTitle>

      {mySem.length === 0 && <Empty>No enrollments yet.</Empty>}

      {mySem.map((s) => (
        <section key={s.id} className={styles.semester}>
          <h2 className={styles.semesterTitle}>Semester {s.number}</h2>
          <p className={styles.hint}>Showing attendance per course you take in this semester.</p>
          <CoursesInSemester batchId={s.batchId} programId={s.programId} semId={s.id} />
        </section>
      ))}
    </article>
  );
}

function CoursesInSemester({
  batchId,
  programId,
  semId,
}: {
  batchId: string;
  programId: string;
  semId: string;
}): JSX.Element {
  // The student has no /api/student/courses endpoint yet, so we hit the admin
  // courses endpoint filtered by semesterId. RLS will scope to the student's
  // visible rows — they'll only see courses in semesters they're enrolled in.
  // (If the API rejects it, the per-course rows below just show "—".)
  const courses = useResource<{ data: Course[] }>(
    `${ROUTES_CYCLE_2.adminCourses}?semesterId=${semId}`,
  );

  const list = courses.data?.data ?? [];
  const hasData = list.length > 0;
  const showLoading = courses.loading && !hasData;
  const showError = courses.error !== null && !hasData;

  // Every course is fetched by its own <CourseAttendance /> child — one hook
  // per course — which reports back here so both semester tables can be
  // assembled from a single place.
  const [attendance, setAttendance] = useState<Record<string, CourseAttendance>>({});
  const report = useCallback((courseId: string, data: CourseAttendance) => {
    setAttendance((prev) => {
      const current = prev[courseId];
      if (
        current !== undefined &&
        current.summary === data.summary &&
        current.history === data.history
      ) {
        return prev;
      }
      return { ...prev, [courseId]: data };
    });
  }, []);

  return (
    <div className={styles.courses}>
      {showLoading && <Loading />}
      {showError && (
        <ErrorState onRetry={() => window.location.reload()}>
          Could not load courses: {courses.error}
        </ErrorState>
      )}
      {!showLoading && !showError && hasData && (
        <>
          {list.map((c) => (
            <CourseAttendance
              key={c.id}
              courseId={c.id}
              path={ROUTES_CYCLE_2.studentAttendance("student", batchId, programId, semId, c.id)}
              onLoaded={report}
            />
          ))}
          <SummaryTable courses={list} attendance={attendance} />
          <HistoryTable courses={list} attendance={attendance} />
        </>
      )}
    </div>
  );
}

// Fetches one course's summary + session history and hands both to the parent.
function CourseAttendance({
  courseId,
  path,
  onLoaded,
}: {
  courseId: string;
  path: string;
  onLoaded: (courseId: string, data: CourseAttendance) => void;
}): JSX.Element {
  const summary = useResource<{ data: AttendanceSummaryRow[] }>(`${path}/summary`);
  const history = useResource<{ data: AttendanceRow[] }>(path);

  const summaryRow = summary.data?.data[0] ?? null;
  const historyRows = history.data?.data ?? NO_ROWS;

  useEffect(() => {
    onLoaded(courseId, { summary: summaryRow, history: historyRows });
  }, [courseId, summaryRow, historyRows, onLoaded]);

  return <></>;
}

function SummaryTable({
  courses,
  attendance,
}: {
  courses: Course[];
  attendance: Record<string, CourseAttendance>;
}): JSX.Element {
  const rows: SummaryRow[] = courses.map((c) => {
    const row = attendance[c.id]?.summary ?? null;
    if (row === null) {
      return {
        code: c.code,
        title: c.title,
        percent: "—",
        counts: "—",
      };
    }
    return {
      code: c.code,
      title: c.title,
      percent: `${row.percent}%`,
      counts: `${row.present}P / ${row.late}L / ${row.absent}A of ${row.total}`,
    };
  });

  // Compute whether any course is below the threshold so we can surface a
  // single warning banner.
  const lowAttendance = courses
    .map((c) => attendance[c.id]?.summary ?? null)
    .filter((r): r is AttendanceSummaryRow => r !== null)
    .filter((r) => r.percent < LOW_ATTENDANCE_THRESHOLD);

  const columns: TableColumn<SummaryRow>[] = [
    { key: "code", header: "Code" },
    { key: "title", header: "Title" },
    { key: "counts", header: "Breakdown", align: "right", mono: true },
    { key: "percent", header: "Attendance", align: "right", mono: true },
  ];

  return (
    <div className={styles.block}>
      <h3 className={styles.subhead}>Summary</h3>
      {lowAttendance.length > 0 && (
        <Banner variant="warning">
          You are below the {LOW_ATTENDANCE_THRESHOLD}% attendance threshold in{" "}
          {lowAttendance.length} course{lowAttendance.length === 1 ? "" : "s"} this semester.
        </Banner>
      )}
      <Table<SummaryRow>
        columns={columns}
        rows={rows}
        emptyMessage="No courses to summarise yet."
      />
    </div>
  );
}

function HistoryTable({
  courses,
  attendance,
}: {
  courses: Course[];
  attendance: Record<string, CourseAttendance>;
}): JSX.Element {
  // We need session history per course to build a flat session list.
  const allRows: HistoryRow[] = courses
    .flatMap((c) =>
      (attendance[c.id]?.history ?? NO_ROWS)
        .slice()
        .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
        .map((r) => ({
          date: r.sessionDate,
          course: c.code,
          status: r.status,
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const columns: TableColumn<HistoryRow>[] = [
    { key: "date", header: "Session date", mono: true },
    { key: "course", header: "Course" },
    { key: "status", header: "Status" },
  ];

  return (
    <div className={styles.block}>
      <h3 className={styles.subhead}>Sessions</h3>
      <Table<HistoryRow> columns={columns} rows={allRows} emptyMessage="No sessions yet." />
    </div>
  );
}
