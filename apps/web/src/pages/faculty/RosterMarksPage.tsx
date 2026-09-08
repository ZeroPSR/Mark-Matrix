import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2, type MarksRow } from "@mark-matrix/shared";

interface Course {
  id: string;
  code: string;
  title: string;
  semester: { id: string; number: number; programId: string; batchId: string };
}
interface Enrollment { id: string; studentId: string; semId: string }
interface StudentSat { userId: string; name: string; rollNumber?: string }

interface RosterMarksPageProps {
  /** "faculty" or "admin" — selects the right API mount. */
  role: "faculty" | "admin";
}

/**
 * Roster view of marks — same shape for faculty and admin. Faculty can patch
 * draft rows; admin sees the same data read-only.
 */
export function RosterMarksPage({ role }: RosterMarksPageProps): JSX.Element {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId ?? "";

  const courses = useResource<{ data: Course[] }>(ROUTES_CYCLE_2.facultyCourses);
  const course = useMemo(
    () => (courses.data?.data ?? []).find((c) => c.id === courseId) ?? null,
    [courses.data, courseId],
  );

  const enrollments = useResource<{ data: Enrollment[] }>(
    course ? `${ROUTES_CYCLE_2.adminEnrollments}?semId=${course.semester.id}` : null,
  );
  const students = useResource<{ data: StudentSat[] }>(ROUTES_CYCLE_2.adminStudents);

  const studentById = useMemo(() => {
    const m = new Map<string, StudentSat>();
    for (const s of students.data?.data ?? []) m.set(s.userId, s);
    return m;
  }, [students.data]);

  const path = course
    ? ROUTES_CYCLE_2[`${role}Marks`](role, course.semester.batchId, course.semester.programId, course.semester.id, course.id)
    : null;
  const rows = useResource<{ data: MarksRow[] }>(path);

  // Group: { [studentId]: { [examType]: MarksRow } }
  const grid = useMemo(() => {
    const g = new Map<string, Map<string, MarksRow>>();
    for (const r of rows.data?.data ?? []) {
      let inner = g.get(r.studentId);
      if (!inner) {
        inner = new Map();
        g.set(r.studentId, inner);
      }
      inner.set(r.examType, r);
    }
    return g;
  }, [rows.data]);

  const examTypes = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows.data?.data ?? []) s.add(r.examType);
    return [...s].sort();
  }, [rows.data]);

  if (!course && courses.data !== null) return <p>Course not found.</p>;

  return (
    <main className="roster-marks">
      <h1>Marks roster — {course?.code ?? "…"}</h1>
      {rows.loading && <p>Loading…</p>}
      {rows.error !== null && <p className="roster-marks__error">Error: {rows.error}</p>}
      <table className="roster-marks__table">
        <thead>
          <tr>
            <th>Roll</th>
            <th>Name</th>
            {examTypes.map((e) => <th key={e}>{e}</th>)}
          </tr>
        </thead>
        <tbody>
          {(enrollments.data?.data ?? []).map((e) => {
            const s = studentById.get(e.studentId);
            const byExam = grid.get(e.studentId);
            return (
              <tr key={e.studentId}>
                <td>{s?.rollNumber ?? "—"}</td>
                <td>{s?.name ?? e.studentId}</td>
                {examTypes.map((et) => {
                  const r = byExam?.get(et);
                  if (!r) return <td key={et}>—</td>;
                  return (
                    <td key={et}>
                      <span className="roster-marks__score">
                        {r.marksObtained} / {r.maxMarks}
                      </span>
                      <small className={"roster-marks__status--" + r.status}>
                        {r.status}
                      </small>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
