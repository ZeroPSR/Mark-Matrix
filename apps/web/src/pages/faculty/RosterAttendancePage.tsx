import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2, type AttendanceStatus, type AttendanceRow, type AttendanceSummaryRow } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Banner } from "../../components/Banner/Banner.js";
import { Empty } from "../../components/Empty/Empty.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import { Loading } from "../../components/Loading/Loading.js";
import { Select, type SelectOption } from "../../components/Select/Select.js";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/Table/Table.js";
import tableStyles from "../../components/Table/Table.module.css";
import { cn } from "../../lib/cn.js";
import styles from "./RosterAttendancePage.module.css";

interface Course { id: string; code: string; title: string; semester: { id: string; number: number; programId: string; batchId: string } }
interface StudentSat { userId: string; name: string; rollNumber?: string }

interface RosterAttendancePageProps {
  /** "faculty" or "admin" — selects the right API mount. */
  role: "faculty" | "admin";
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: "present", label: "present" },
  { value: "absent", label: "absent" },
  { value: "late", label: "late" },
];

/**
 * Roster view of attendance — one row per student, one column per session
 * date. Faculty get an editable status control per cell; admin sees the same
 * grid read-only.
 */
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

  const showLoading = courses.loading && !course;
  const showError = courses.error !== null && !course;
  const courseMissing = !course && courses.data !== null;
  const rowsLoading = rows.loading && !rows.data;
  const rowsError = rows.error !== null && !rows.data;

  return (
    <main className={styles.page}>
      <PageTitle
        eyebrow={role === "faculty" ? "Faculty · Roster" : "Admin · Roster"}
        subtitle={course ? `${course.code} — ${course.title}` : undefined}
      >
        Attendance roster — {course?.code ?? "…"}
      </PageTitle>

      {showLoading && <Loading />}
      {showError && (
        <ErrorState onRetry={() => window.location.reload()}>{courses.error}</ErrorState>
      )}
      {courseMissing && <Empty>Course not found.</Empty>}

      {course !== null && !courseMissing && (
        <>
          {role === "faculty" ? (
            <Banner variant="info" title="Editable roster">
              Pick a status in any cell to record that student's attendance for
              the session. Each change is saved as soon as you choose one.
            </Banner>
          ) : (
            <Banner variant="warning" title="Read-only roster">
              This roster is shown for review only — attendance for this course is
              recorded by the course faculty.
            </Banner>
          )}

          {summary.data !== null && (
            <p className={styles.meta}>
              {summary.data.data.length} students with attendance records.
            </p>
          )}

          {rowsLoading && <Loading />}
          {rowsError && (
            <ErrorState onRetry={() => window.location.reload()}>{rows.error}</ErrorState>
          )}

          {!rowsLoading && !rowsError && grid.size === 0 && (
            <Empty>No attendance has been recorded for this course yet.</Empty>
          )}

          {!rowsLoading && !rowsError && grid.size > 0 && (
            <table
              className={cn(tableStyles.table, tableStyles.sticky)}
              aria-label="Attendance roster"
            >
              <TableHead>
                <TableHeaderCell>Roll</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                {sessionDates.map((d) => (
                  <TableHeaderCell key={d}>{d}</TableHeaderCell>
                ))}
                <TableHeaderCell align="right">%</TableHeaderCell>
              </TableHead>
              <TableBody>
                {[...grid.entries()].map(([studentId, byDate]) => {
                  const s = studentById.get(studentId);
                  const present = [...byDate.values()].filter((r) => r.status !== "absent").length;
                  const total = byDate.size;
                  const pct = total === 0 ? 0 : Math.round((present / total) * 10000) / 100;
                  const studentName = s?.name ?? studentId;
                  return (
                    <TableRow key={studentId}>
                      <TableCell mono>{s?.rollNumber ?? "—"}</TableCell>
                      <TableCell>{studentName}</TableCell>
                      {sessionDates.map((d) => {
                        const r = byDate.get(d);
                        if (!r) return <TableCell key={d}>—</TableCell>;
                        if (role === "faculty") {
                          return (
                            <TableCell key={d}>
                              <Select
                                aria-label={`Attendance status for ${studentName} on ${d}`}
                                options={STATUS_OPTIONS}
                                value={r.status}
                                disabled={patching === r.id}
                                onChange={(e) => void patch(r.id, e.target.value as AttendanceStatus)}
                              />
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={d}>
                            <span className={styles.status}>{r.status}</span>
                          </TableCell>
                        );
                      })}
                      <TableCell align="right" mono>{pct}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
