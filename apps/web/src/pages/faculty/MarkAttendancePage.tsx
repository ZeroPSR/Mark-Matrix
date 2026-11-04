import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2, type AttendanceStatus } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Banner } from "../../components/Banner/Banner.js";
import { Button } from "../../components/Button/Button.js";
import { Empty } from "../../components/Empty/Empty.js";
import { Loading } from "../../components/Loading/Loading.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import { Field } from "../../components/Field/Field.js";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/Table/Table.js";
import tableStyles from "../../components/Table/Table.module.css";
import { cn } from "../../lib/cn.js";
import styles from "./MarkAttendancePage.module.css";

interface Course {
  id: string;
  code: string;
  title: string;
  semester: { id: string; number: number; programId: string; batchId: string };
}
interface Enrollment { id: string; studentId: string; semId: string }
interface StudentSat { userId: string; name: string; rollNumber?: string }

/** One line of the collapsible error block. */
interface BulkError { field: string; reason: string }

const STATUSES: readonly AttendanceStatus[] = ["present", "absent", "late"];

/** Capitalised labels for the session tally — the radio labels stay lowercase. */
const STATUS_LABELS: readonly { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
];

/** How many students are marked present / absent / late in the current draft. */
function countStatuses(
  roster: readonly { studentId: string }[],
  draft: Record<string, AttendanceStatus>,
): Record<AttendanceStatus, number> {
  const counts: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0 };
  for (const r of roster) {
    const status = draft[r.studentId];
    if (status !== undefined) counts[status] += 1;
  }
  return counts;
}

/**
 * Faculty marks a single attendance session for a course: picks a status per
 * student, then submits the whole roster for one session date.
 */
export function FacultyMarkAttendancePage(): JSX.Element {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId ?? "";

  const [sessionDate, setSessionDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bulkErrors, setBulkErrors] = useState<BulkError[]>([]);

  const courses = useResource<{ data: Course[] }>(ROUTES_CYCLE_2.facultyCourses);
  const course = useMemo(
    () => (courses.data?.data ?? []).find((c) => c.id === courseId) ?? null,
    [courses.data, courseId],
  );

  const enrollments = useResource<{ data: Enrollment[] }>(
    course ? `${ROUTES_CYCLE_2.facultyEnrollments}?semId=${course.semester.id}` : null,
  );
  const students = useResource<{ data: StudentSat[] }>(ROUTES_CYCLE_2.facultyStudents);

  const studentById = useMemo(() => {
    const m = new Map<string, StudentSat>();
    for (const s of students.data?.data ?? []) m.set(s.userId, s);
    return m;
  }, [students.data]);

  const roster = useMemo(() => {
    const list = enrollments.data?.data ?? [];
    return list.map((e) => ({
      studentId: e.studentId,
      label: studentById.get(e.studentId)?.name ?? e.studentId,
      rollNumber: studentById.get(e.studentId)?.rollNumber,
    }));
  }, [enrollments.data, studentById]);

  const allSet = roster.length > 0 && roster.every((r) => draft[r.studentId] !== undefined);
  const counts = countStatuses(roster, draft);

  const submit = async (): Promise<void> => {
    if (!course || !allSet) return;
    setSubmitting(true);
    setMessage(null);
    setBulkErrors([]);
    try {
      const path = ROUTES_CYCLE_2.facultyAttendance("faculty", course.semester.batchId, course.semester.programId, course.semester.id, course.id);
      const entries = roster.map((r) => ({
        studentId: r.studentId,
        status: draft[r.studentId]!,
      }));
      await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({ sessionDate, entries }),
      });
      setMessage("Saved.");
      setDraft({});
    } catch (e) {
      const body = (e as {
        body?: { error?: string; detail?: string; fields?: { path: string; message: string }[] };
      }).body;
      const detail = body?.detail;
      setMessage(detail ?? "save_failed");
      // The endpoint answers with a session-level failure, so the block lists
      // the offending field(s) rather than per-student rows.
      const fields = body?.fields ?? [];
      setBulkErrors(
        fields.length > 0
          ? fields.map((f) => ({ field: f.path, reason: f.message }))
          : [{ field: "session", reason: detail ?? body?.error ?? "save_failed" }],
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showLoading = courses.loading && !course;
  const showError = courses.error !== null && !course;
  const courseMissing = !course && courses.data !== null;
  const locked = false; // locked status not exposed by the attendance API yet

  return (
    <main className={styles["page"]}>
      <PageTitle eyebrow="Faculty · Attendance" subtitle={course ? `${course.code} — ${course.title}` : undefined}>
        Mark attendance
      </PageTitle>

      {showLoading && <Loading />}
      {showError && (
        <ErrorState onRetry={() => window.location.reload()}>{courses.error}</ErrorState>
      )}
      {courseMissing && <Empty>This course could not be found.</Empty>}

      {course !== null && !courseMissing && (
        <>
          {locked && (
            <Banner variant="info" title="Attendance locked">
              This session's attendance is closed. Contact an admin to unlock.
            </Banner>
          )}

          <p className={styles["meta"]}>Semester {course.semester.number}</p>

          <div className={styles["actions"]}>
            <div className={styles["dateField"]}>
              <Field label="Session date" htmlFor="session-date">
                <input
                  id="session-date"
                  type="date"
                  className={styles["dateInput"]}
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
              </Field>
            </div>

            {roster.length > 0 && (
              <dl className={styles["tally"]}>
                {STATUS_LABELS.map((s) => (
                  <div key={s.value} className={styles["tallyItem"]}>
                    <dt className={styles["tallyLabel"]}>{s.label}</dt>
                    <dd className={styles["tallyValue"]}>{counts[s.value]}</dd>
                  </div>
                ))}
              </dl>
            )}

            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={!allSet || submitting}
            >
              {submitting ? "Saving…" : "Submit"}
            </Button>
          </div>

          {message !== null && (
            <p className={bulkErrors.length > 0 ? styles["errorMessage"] : styles["message"]}>{message}</p>
          )}

          {bulkErrors.length > 0 && (
            <details className={styles["bulkErrors"]} open>
              <summary>Errors ({bulkErrors.length})</summary>
              <table className={tableStyles["table"]}>
                <TableHead>
                  <TableHeaderCell>Field</TableHeaderCell>
                  <TableHeaderCell>Reason</TableHeaderCell>
                </TableHead>
                <TableBody>
                  {bulkErrors.map((er, i) => (
                    <TableRow key={i}>
                      <TableCell mono>{er.field}</TableCell>
                      <TableCell>{er.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </details>
          )}

          {roster.length === 0 ? (
            <Empty>No students enrolled in this course yet.</Empty>
          ) : (
            <table
              className={cn(tableStyles["table"], tableStyles["sticky"])}
              aria-label="Attendance roster"
            >
              <TableHead>
                <TableHeaderCell>Roll</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableHead>
              <TableBody>
                {roster.map((r) => (
                  <TableRow key={r.studentId}>
                    <TableCell mono>{r.rollNumber ?? "—"}</TableCell>
                    <TableCell>{r.label}</TableCell>
                    <TableCell>
                      <div
                        className={styles["statusGroup"]}
                        role="radiogroup"
                        aria-label={`Attendance status for ${r.label}`}
                      >
                        {STATUSES.map((s) => (
                          <label
                            key={s}
                            className={cn(styles["toggle"], draft[r.studentId] === s ? styles["is-on"] : undefined)}
                          >
                            <input
                              type="radio"
                              name={`status-${r.studentId}`}
                              checked={draft[r.studentId] === s}
                              onChange={() => setDraft((d) => ({ ...d, [r.studentId]: s }))}
                              aria-label={`${s} for ${r.label}`}
                            />
                            {s}
                          </label>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
