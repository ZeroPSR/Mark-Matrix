import { useEffect, useState } from "react";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { apiFetch } from "../../lib/api.js";

interface CourseRow { id: string; code: string; title: string; }
interface PassRate { total: number; passing: number; rate: number; }
interface Topper { studentId: string; rollNumber: string; totalObtained: number; totalMax: number; percentage: number; gradeLabel: string; gradePoint: number; }
interface AttendanceRow { studentId: string; rollNumber: string; presentCount: number; totalSessions: number; percentage: number; }

export function AnalyticsPage(): JSX.Element {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [passRate, setPassRate] = useState<PassRate | null>(null);
  const [toppers, setToppers] = useState<Topper[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await apiFetch<{ courses?: CourseRow[] }>("/api/faculty/courses");
      if (cancelled) return;
      const list = res.courses ?? [];
      setCourses(list);
      if (list[0]) setActiveId(list[0].id);
    })().catch(() => { /* surfaced via UI */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void (async () => {
      const url = ROUTES_CYCLE_2.analyticsPassRate("faculty", "b1", "p1", "s1", activeId);
      const [r1, r2, r3] = await Promise.all([
        apiFetch<PassRate>(url),
        apiFetch<{ toppers: Topper[] }>(ROUTES_CYCLE_2.analyticsToppers("faculty", "b1", "p1", "s1", activeId)),
        apiFetch<{ rows: AttendanceRow[] }>(ROUTES_CYCLE_2.analyticsAttendanceShortage("faculty", "b1", "p1", "s1", activeId)),
      ]);
      if (cancelled) return;
      setPassRate(r1);
      setToppers(r2?.toppers ?? []);
      setAttendance(r3?.rows ?? []);
    })().catch(() => { /* surfaced via UI */ });
    return () => { cancelled = true; };
  }, [activeId]);

  return (
    <main className="analytics">
      <h1>Analytics</h1>
      <nav className="analytics__courses" aria-label="Course list">
        {courses.map((c) => (
          <button
            key={c.id}
            type="button"
            className={"analytics__course-btn" + (c.id === activeId ? " is-active" : "")}
            onClick={() => setActiveId(c.id)}
          >
            {c.code} — {c.title}
          </button>
        ))}
      </nav>
      <section className="analytics__panel">
        <h2>Pass rate</h2>
        {passRate && (
          <p>{passRate.passing} of {passRate.total} ({passRate.rate.toFixed(2)}%)</p>
        )}
      </section>
      <section className="analytics__panel">
        <h2>Toppers</h2>
        <table>
          <thead><tr><th>Roll</th><th>Total</th><th>%</th><th>Grade</th><th>GP</th></tr></thead>
          <tbody>
            {toppers.map((t) => (
              <tr key={t.studentId}>
                <td>{t.rollNumber}</td>
                <td>{t.totalObtained}/{t.totalMax}</td>
                <td>{t.percentage.toFixed(2)}</td>
                <td>{t.gradeLabel}</td>
                <td>{t.gradePoint.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="analytics__panel">
        <h2>Attendance shortage</h2>
        <table>
          <thead><tr><th>Roll</th><th>Present</th><th>Sessions</th><th>%</th></tr></thead>
          <tbody>
            {attendance.map((a) => (
              <tr key={a.studentId}>
                <td>{a.rollNumber}</td>
                <td>{a.presentCount}</td>
                <td>{a.totalSessions}</td>
                <td>{a.percentage.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}