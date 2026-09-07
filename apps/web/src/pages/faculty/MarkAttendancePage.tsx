import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2, type AttendanceStatus } from "@mark-matrix/shared";

interface Course { id: string; code: string; title: string; semester: { id: string; number: number; programId: string; batchId: string } }
interface Enrollment { id: string; studentId: string; semId: string }
interface StudentSat { userId: string; name: string; rollNumber?: string }

const STATUSES: readonly AttendanceStatus[] = ["present", "absent", "late"];

export function FacultyMarkAttendancePage(): JSX.Element {
  const params = useParams<{ courseId: string }>();
  const path = { courseId: params.courseId ?? "" };
  const [sessionDate, setSessionDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const courses = useResource<{ data: Course[] }>(ROUTES_CYCLE_2.facultyCourses);
  const course = useMemo(
    () => (courses.data?.data ?? []).find((c) => c.id === path.courseId) ?? null,
    [courses.data, path.courseId],
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

  const roster = useMemo(() => {
    const list = enrollments.data?.data ?? [];
    return list.map((e) => ({
      studentId: e.studentId,
      label: studentById.get(e.studentId)?.name ?? e.studentId,
      rollNumber: studentById.get(e.studentId)?.rollNumber,
    }));
  }, [enrollments.data, studentById]);

  const allSet = roster.length > 0 && roster.every((r) => draft[r.studentId] !== undefined);

  const submit = async (): Promise<void> => {
    if (!course || !allSet) return;
    setSubmitting(true);
    setMessage(null);
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
      setMessage((e as { body?: { detail?: string } }).body?.detail ?? "save_failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!course && courses.data !== null) {
    return <p>Course not found.</p>;
  }

  return (
    <main className="mark-attendance">
      <h1>Mark attendance</h1>
      {course !== null && (
        <p>
          <strong>{course.code}</strong> — {course.title} (Semester {course.semester.number})
        </p>
      )}
      <label>
        Session date:&nbsp;
        <input
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
        />
      </label>
      {message !== null && <p className="mark-attendance__msg">{message}</p>}
      <table>
        <thead>
          <tr>
            <th>Roll</th>
            <th>Name</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <tr key={r.studentId}>
              <td>{r.rollNumber ?? "—"}</td>
              <td>{r.label}</td>
              <td>
                {STATUSES.map((s) => (
                  <label key={s} className={"mark-attendance__toggle" + (draft[r.studentId] === s ? " is-on" : "")}>
                    <input
                      type="radio"
                      name={`status-${r.studentId}`}
                      checked={draft[r.studentId] === s}
                      onChange={() => setDraft((d) => ({ ...d, [r.studentId]: s }))}
                    />
                    {s}
                  </label>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => void submit()}
        disabled={!allSet || submitting}
      >
        {submitting ? "Saving…" : "Submit"}
      </button>
    </main>
  );
}
