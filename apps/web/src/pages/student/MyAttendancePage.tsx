import { useMemo } from "react";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2, type AttendanceRow, type AttendanceSummaryRow } from "@mark-matrix/shared";

interface Enrollment {
  id: string;
  semId: string;
  semester: { id: string; number: number; programId: string; batchId: string };
}

export function StudentMyAttendancePage(): JSX.Element {
  const enrollments = useResource<{ data: Enrollment[] }>(ROUTES_CYCLE_2.studentEnrollment);
  const mySem = (enrollments.data?.data ?? []).map((e) => e.semester);

  return (
    <main className="my-attendance">
      <h1>My Attendance</h1>
      {mySem.length === 0 && <p>No enrollments yet.</p>}
      {mySem.map((s) => (
        <section key={s.id} className="my-attendance__course">
          <h2>Semester {s.number}</h2>
          <p className="my-attendance__hint">
            Showing attendance per course you take in this semester.
          </p>
          <CoursesInSemester batchId={s.batchId} programId={s.programId} semId={s.id} />
        </section>
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
  // courses endpoint filtered by semesterId. RLS will scope to the student's
  // visible rows — they'll only see courses in semesters they're enrolled in.
  // (If the API rejects it, the per-course rows below just show "—".)
  const courses = useResource<{ data: { id: string; code: string; title: string }[] }>(
    `${ROUTES_CYCLE_2.adminCourses}?semesterId=${semId}`,
  );

  return (
    <ul className="my-attendance__course-list">
      {(courses.data?.data ?? []).map((c) => (
        <li key={c.id} className="my-attendance__course-row">
          <strong>{c.code}</strong> — {c.title}
          <CourseSummary
            batchId={batchId}
            programId={programId}
            semId={semId}
            courseId={c.id}
          />
          <CourseHistory
            batchId={batchId}
            programId={programId}
            semId={semId}
            courseId={c.id}
          />
        </li>
      ))}
    </ul>
  );
}

function CourseSummary({
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
  const path = ROUTES_CYCLE_2.studentAttendance("student", batchId, programId, semId, courseId);
  const summary = useResource<{ data: AttendanceSummaryRow[] }>(`${path}/summary`);
  const row = (summary.data?.data ?? [])[0];
  if (!row) return <span className="my-attendance__pct"> — </span>;
  return (
    <span className="my-attendance__pct">
      {row.percent}% ({row.present}P / {row.late}L / {row.absent}A of {row.total})
    </span>
  );
}

function CourseHistory({
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
  const path = ROUTES_CYCLE_2.studentAttendance("student", batchId, programId, semId, courseId);
  const rows = useResource<{ data: AttendanceRow[] }>(path);
  const list = useMemo(
    () => (rows.data?.data ?? []).slice().sort((a, b) => a.sessionDate.localeCompare(b.sessionDate)),
    [rows.data],
  );
  if (list.length === 0) {
    return <p className="my-attendance__history-empty">No sessions yet.</p>;
  }
  return (
    <ul className="my-attendance__history">
      {list.map((r) => (
        <li key={r.id} className={"my-attendance__chip my-attendance__chip--" + r.status}>
          {r.sessionDate}: {r.status}
        </li>
      ))}
    </ul>
  );
}
