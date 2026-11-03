import { useMemo } from "react";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2, type MarksRow } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Banner } from "../../components/Banner/Banner.js";
import { Loading } from "../../components/Loading/Loading.js";
import { Empty } from "../../components/Empty/Empty.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import styles from "./MyMarksPage.module.css";

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

/** One table row per exam type. */
interface MarksTableRow extends Record<string, unknown> {
  examType: string;
  obtained: number;
  max: number;
  /** null renders as an em-dash — e.g. when maxMarks is 0. */
  percentage: string | null;
  status: string;
}

const columns: TableColumn<MarksTableRow>[] = [
  { key: "examType", header: "Exam type" },
  { key: "obtained", header: "Marks obtained", align: "right", mono: true },
  { key: "max", header: "Max", align: "right", mono: true },
  { key: "percentage", header: "Percentage", align: "right", mono: true },
  { key: "status", header: "Status" },
];

export function StudentMyMarksPage(): JSX.Element {
  const enrollments = useResource<{ data: Enrollment[] }>(ROUTES_CYCLE_2.studentEnrollment);
  const mySem = useMemo(
    () => (enrollments.data?.data ?? []).map((e) => e.semester),
    [enrollments.data],
  );

  const hasSemesters = mySem.length > 0;
  const showLoading = enrollments.loading && !hasSemesters;
  const showError = enrollments.error !== null && !hasSemesters;

  return (
    <main className={styles["page"]}>
      <PageTitle
        eyebrow="Student · Marks"
        subtitle="Marks for every course in the semesters you are enrolled in."
      >
        My Marks
      </PageTitle>

      {showLoading && <Loading />}
      {showError && (
        <ErrorState onRetry={() => window.location.reload()}>{enrollments.error}</ErrorState>
      )}

      {!showLoading &&
        !showError &&
        (hasSemesters ? (
          mySem.map((s) => (
            <section key={s.id} className={styles["semester"]}>
              <h2 className={styles["semesterHeading"]}>Semester {s.number}</h2>
              <CoursesInSemester batchId={s.batchId} programId={s.programId} semId={s.id} />
            </section>
          ))
        ) : (
          <Empty>You have no enrollments yet.</Empty>
        ))}
    </main>
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
  // courses endpoint filtered by semesterId — RLS scopes it to the student's
  // visible rows.
  const courses = useResource<{ data: Course[] }>(
    `${ROUTES_CYCLE_2.adminCourses}?semesterId=${semId}`,
  );
  const list = courses.data?.data ?? [];
  const showLoading = courses.loading && list.length === 0;
  const showError = courses.error !== null && list.length === 0;

  return (
    <>
      {showLoading && <Loading />}
      {showError && (
        <ErrorState onRetry={() => window.location.reload()}>{courses.error}</ErrorState>
      )}
      {!showLoading &&
        !showError &&
        (list.length === 0 ? (
          <Empty>No courses in this semester yet.</Empty>
        ) : (
          list.map((c) => (
            <section key={c.id} className={styles["course"]}>
              <h3 className={styles["courseHeading"]}>
                <span className={styles["courseCode"]}>{c.code}</span>
                <span className={styles["courseTitle"]}>{c.title}</span>
              </h3>
              <CourseMarks batchId={batchId} programId={programId} semId={semId} courseId={c.id} />
            </section>
          ))
        ))}
    </>
  );
}

function CourseMarks({
  batchId,
  programId,
  semId,
  courseId,
}: {
  batchId: string;
  programId: string;
  semId: string;
  courseId: string;
}): JSX.Element {
  const path = ROUTES_CYCLE_2.studentMarks("student", batchId, programId, semId, courseId);
  const rows = useResource<{ data: MarksRow[] }>(path);
  const list = useMemo(
    () => (rows.data?.data ?? []).slice().sort((a, b) => a.examType.localeCompare(b.examType)),
    [rows.data],
  );

  const tableRows: MarksTableRow[] = useMemo(
    () =>
      list.map((r) => ({
        examType: r.examType,
        obtained: r.marksObtained,
        max: r.maxMarks,
        // A maxMarks of 0 would divide by zero — leave the cell empty.
        percentage: r.maxMarks > 0 ? `${Math.round((r.marksObtained / r.maxMarks) * 100)}%` : null,
        status: r.status,
      })),
    [list],
  );

  const showLoading = rows.loading && list.length === 0;
  const showError = rows.error !== null && list.length === 0;

  if (showLoading) return <Loading />;
  if (showError)
    return <ErrorState onRetry={() => window.location.reload()}>{rows.error}</ErrorState>;
  if (list.length === 0) return <Empty>No marks yet.</Empty>;

  // Draft rows are still being edited by the faculty, so the student is
  // looking at provisional numbers.
  const provisional = list.some((r) => r.status === "draft");

  return (
    <>
      {provisional && (
        <Banner variant="warning" title="Provisional marks">
          These marks have not been finalised yet and may still change.
        </Banner>
      )}
      <Table<MarksTableRow> columns={columns} rows={tableRows} emptyMessage="No marks yet." />
    </>
  );
}
