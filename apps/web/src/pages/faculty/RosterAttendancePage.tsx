import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2, type AttendanceStatus, type AttendanceRow, type AttendanceSummaryRow } from "@mark-matrix/shared";

interface Course { id: string; code: string; title: string; semester: { id: string; number: number; programId: string; batchId: string } }
interface StudentSat { userId: string; name: string; rollNumber?: string }

interface RosterAttendancePageProps {
  /** "faculty" or "admin" — selects the right API mount. */
  role: "faculty" | "admin";
}

export function RosterAttendancePage({ role }: RosterAttendancePageProps): JSX.Element {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId ?? "";
  const courses = useResource<{ data: Course[] }>(ROUTES_CYCLE_2.facultyCourses);
  const course = useMemo(
    () => (courses.data?.data ?? []).find((c) => c.id === courseId) ?? null,
    [courses.data, courseId],
  );

  const students = useResource<{ data: StudentSat[] }>(ROUTES_CYCLE_2.adminStudents);

  const path = course
    ? ROUTES_CYCLE_2[`${role}Attendance`](role, course.semester.batchId, course.semester.programId, course.semester.id, course.id)
    : null;
  const rows = useResource<{ data: AttendanceRow[] }>(path);
  const summary = useResource<{ data: AttendanceSummaryRow[] }>(path !== null ? `${path}/summary` : null);

  const [patching, setPatching] = useState<string | null>(null);

  const studentById = useMemo(() => {
    const m = new Map<string, StudentSat>();
    for (const s of students.data?.data ?? []) m.set(s.userId, s);
    return m;
  }, [students.data]);

  // Group rows: { [studentId]: { [sessionDate]: AttendanceRow } }.
  const grid = useMemo(() => {
    const g = new Map<string, Map<string, AttendanceRow>>();
    for (const r of rows.data?.data ?? []) {
      let inner = g.get(r.studentId);
      if (!inner) {
        inner = new Map();
        g.set(r.studentId, inner);
      }
      inner.set(r.sessionDate, r);
    }
    return g;
  }, [rows.data]);

  const sessionDates = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows.data?.data ?? []) s.add(r.sessionDate);
    return [...s].sort();
  }, [rows.data]);

  const patch = async (rowId: string, status: AttendanceStatus): Promise<void> => {
    if (!path || role !== "faculty") return;
    setPatching(rowId);
    try {
      await apiFetch(`${path}/${rowId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      // Re-fetch via refetch — but we don't have a refetch on rows. Use
      // window.location.reload as the simplest correct thing.
      window.location.reload();
    } finally {
      setPatching(null);
    }
  };

  if (!course && courses.data !== null) {
    return <p>Course not found.</p>;
  }

  return (
    <main className="roster-attendance">
      <h1>Roster — {course?.code ?? "…"}</h1>
      {summary.data && (
        <p>
          {summary.data.data.length} students with attendance records.
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Roll</th>
            <th>Name</th>
            {sessionDates.map((d) => <th key={d}>{d}</th>)}
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {[...grid.entries()].map(([studentId, byDate]) => {
            const s = studentById.get(studentId);
            const present = [...byDate.values()].filter((r) => r.status !== "absent").length;
            const total = byDate.size;
            const pct = total === 0 ? 0 : Math.round((present / total) * 10000) / 100;
            return (
              <tr key={studentId}>
                <td>{s?.rollNumber ?? "—"}</td>
                <td>{s?.name ?? studentId}</td>
                {sessionDates.map((d) => {
                  const r = byDate.get(d);
                  if (!r) return <td key={d}>—</td>;
                  if (role === "faculty") {
                    return (
                      <td key={d}>
                        <select
                          value={r.status}
                          disabled={patching === r.id}
                          onChange={(e) => void patch(r.id, e.target.value as AttendanceStatus)}
                        >
                          <option value="present">present</option>
                          <option value="absent">absent</option>
                          <option value="late">late</option>
                        </select>
                      </td>
                    );
                  }
                  return <td key={d}>{r.status}</td>;
                })}
                <td>{pct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
