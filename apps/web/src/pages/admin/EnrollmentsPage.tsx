import { useMemo, useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Banner } from "../../components/Banner/Banner.js";
import { Button } from "../../components/Button/Button.js";
import { Field } from "../../components/Field/Field.js";
import { Select, type SelectOption } from "../../components/Select/Select.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Pagination } from "../../components/Pagination/Pagination.js";
import { Loading } from "../../components/Loading/Loading.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import { CsvEnrollUpload } from "./components/CsvEnrollUpload.js";
import styles from "./EnrollmentsPage.module.css";

interface Semester { id: string; programId: string; number: number; }
interface StudentSat { userId: string; name: string; rollNumber?: string; }
interface Enrollment { id: string; studentId: string; semId: string; enrollmentDate: string; }

interface Row extends Record<string, unknown> {
  student: string;
  roll: string;
  semester: string;
  date: string;
}

const PAGE_SIZE = 25;

export function EnrollmentsPage(): JSX.Element {
  const semesters = useResource<{ data: Semester[] }>(ROUTES_CYCLE_2.adminSemesters);
  const students = useResource<{ data: StudentSat[] }>(ROUTES_CYCLE_2.adminStudents);
  const enrollments = useResource<{ data: Enrollment[] }>(ROUTES_CYCLE_2.adminEnrollments);
  const [semId, setSemId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);

  const submit = async (): Promise<void> => {
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminEnrollments, {
        method: "POST",
        body: JSON.stringify({ studentId, semId }),
      });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "enroll_failed");
    }
  };

  const semesterOptions: SelectOption[] = useMemo(() => {
    const list = semesters.data?.data ?? [];
    return [
      { value: "", label: "— pick a semester —" },
      ...list.map((s) => ({ value: s.id, label: `Semester ${s.number}` })),
    ];
  }, [semesters.data]);

  const studentOptions: SelectOption[] = useMemo(() => {
    const list = students.data?.data ?? [];
    return [
      { value: "", label: "— pick a student —" },
      ...list.map((s) => ({
        value: s.userId,
        label: `${s.name} (${s.rollNumber ?? "no roll"})`,
      })),
    ];
  }, [students.data]);

  const studentById = useMemo(() => {
    const m = new Map<string, StudentSat>();
    for (const s of students.data?.data ?? []) m.set(s.userId, s);
    return m;
  }, [students.data]);

  const semesterById = useMemo(() => {
    const m = new Map<string, Semester>();
    for (const s of semesters.data?.data ?? []) m.set(s.id, s);
    return m;
  }, [semesters.data]);

  const list = enrollments.data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const rows: Row[] = pageRows.map((e) => {
    const student = studentById.get(e.studentId);
    const semester = semesterById.get(e.semId);
    return {
      student: student?.name ?? e.studentId,
      roll: student?.rollNumber ?? "",
      semester: semester !== undefined ? `Semester ${semester.number}` : e.semId,
      date: e.enrollmentDate,
    };
  });

  const columns: TableColumn<Row>[] = [
    { key: "student", header: "Student" },
    { key: "roll", header: "Roll", align: "right", mono: true },
    { key: "semester", header: "Semester" },
    { key: "date", header: "Date", mono: true },
  ];

  const showLoading = enrollments.loading && !enrollments.data;
  const showError = enrollments.error !== null && !enrollments.data;

  return (
    <article className={styles["page"]}>
      <PageTitle
        eyebrow="Admin · Enrollments"
        subtitle="Enroll students into a semester, one at a time or from a CSV file."
      >
        Enrollments
      </PageTitle>

      {error !== null && (
        <Banner variant="error" title="Enrollment failed">{error}</Banner>
      )}

      <section className={styles["section"]} aria-labelledby="single-enrollment-heading">
        <h2 id="single-enrollment-heading" className={styles["sectionTitle"]}>Single enrollment</h2>
        <div className={styles["form"]}>
          <Field label="Semester" htmlFor="enroll-semester">
            <Select
              id="enroll-semester"
              aria-label="Semester"
              value={semId}
              onChange={(e) => setSemId(e.target.value)}
              options={semesterOptions}
            />
          </Field>
          <Field label="Student" htmlFor="enroll-student">
            <Select
              id="enroll-student"
              aria-label="Student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              options={studentOptions}
            />
          </Field>
          <Button
            variant="primary"
            className={styles["enrollButton"]}
            onClick={() => void submit()}
            disabled={!semId || !studentId}
          >
            Enroll
          </Button>
        </div>
      </section>

      <section className={styles["section"]} aria-labelledby="bulk-enrollment-heading">
        <h2 id="bulk-enrollment-heading" className={styles["sectionTitle"]}>Bulk enroll (CSV)</h2>
        {semId !== "" ? (
          <CsvEnrollUpload semId={semId} onComplete={() => window.location.reload()} />
        ) : (
          <p className={styles["hint"]}>Pick a semester above to enable bulk upload.</p>
        )}
      </section>

      <section className={styles["section"]} aria-labelledby="current-enrollments-heading">
        <h2 id="current-enrollments-heading" className={styles["sectionTitle"]}>Current enrollments</h2>
        {showLoading ? (
          <Loading />
        ) : showError ? (
          <ErrorState onRetry={enrollments.refetch}>{enrollments.error}</ErrorState>
        ) : (
          <>
            <Table<Row>
              columns={columns}
              rows={rows}
              emptyMessage="No enrollments yet."
            />
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </section>
    </article>
  );
}

export default EnrollmentsPage;
