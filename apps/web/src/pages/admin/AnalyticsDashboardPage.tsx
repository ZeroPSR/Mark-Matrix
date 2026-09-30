import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { apiFetch } from "../../lib/api.js";

interface SummaryRow { courseId: string; courseCode: string; courseTitle: string; enrolled: number; graded: number; passing: number; passRate: number; avgPercentage: number; avgGradePoint: number; }
interface PassRate { total: number; passing: number; rate: number; }
interface Topper { studentId: string; rollNumber: string; totalObtained: number; totalMax: number; percentage: number; gradeLabel: string; gradePoint: number; }
interface AttendanceRow { studentId: string; rollNumber: string; presentCount: number; totalSessions: number; percentage: number; }

export function AnalyticsDashboardPage(): JSX.Element {
  const params = useParams<{ batchId: string; programId: string; semId: string }>();
  const { batchId = "b1", programId = "p1", semId = "s1" } = params;
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [passRate, setPassRate] = useState<PassRate | null>(null);
  const [toppers, setToppers] = useState<Topper[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = ROUTES_CYCLE_2.analyticsSemSummary("admin", batchId, programId, semId);
      const res = await apiFetch<{ courses: SummaryRow[] }>(url);
      if (cancelled) return;
      setSummary(res.courses);
      if (res.courses[0]) setActiveId(res.courses[0].courseId);
    })().catch(() => { /* surfaced via UI */ });
    return () => { cancelled = true; };
  }, [batchId, programId, semId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void (async () => {
      const [r1, r2, r3] = await Promise.all([
        apiFetch<PassRate>(ROUTES_CYCLE_2.analyticsPassRate("admin", batchId, programId, semId, activeId)),
        apiFetch<{ toppers: Topper[] }>(ROUTES_CYCLE_2.analyticsToppers("admin", batchId, programId, semId, activeId)),
        apiFetch<{ rows: AttendanceRow[] }>(ROUTES_CYCLE_2.analyticsAttendanceShortage("admin", batchId, programId, semId, activeId)),
      ]);
      if (cancelled) return;
      setPassRate(r1);
      setToppers(r2?.toppers ?? []);
      setAttendance(r3?.rows ?? []);
    })().catch(() => { /* surfaced via UI */ });
    return () => { cancelled = true; };
  }, [activeId, batchId, programId, semId]);

  const csvHref = (kind: "pass-rate" | "toppers" | "attendance-shortage" | "summary"): string => {
    const base = `/api/admin/batch/${batchId}/program/${programId}/sem/${semId}`;
    if (kind === "summary") return `${base}/analytics/summary/export.csv`;
    return `${base}/course/${activeId ?? "c0"}/analytics/${kind}/export.csv`;
  };

  return (
    <main className="analytics-dashboard">
      <h1>Analytics — Semester {semId}</h1>
      <section className="analytics-dashboard__summary">
        <h2>Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Course</th><th>Enrolled</th><th>Graded</th>
              <th>Passing</th><th>Pass rate</th><th>Avg GP</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.courseId} className={s.courseId === activeId ? "is-active" : ""} onClick={() => setActiveId(s.courseId)}>
                <td>{s.courseCode} — {s.courseTitle}</td>
                <td>{s.enrolled}</td>
                <td>{s.graded}</td>
                <td>{s.passing}</td>
                <td>{s.passRate.toFixed(2)}%</td>
                <td>{s.avgGradePoint.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href={csvHref("summary")} download>Download CSV</a>
      </section>
      <section className="analytics-dashboard__panel">
        <h2>Pass rate</h2>
        {passRate && <p>{passRate.passing} of {passRate.total} ({passRate.rate.toFixed(2)}%)</p>}
        <a href={csvHref("pass-rate")} download>Download CSV</a>
      </section>
      <section className="analytics-dashboard__panel">
        <h2>Toppers</h2>
        <table>
          <thead><tr><th>Roll</th><th>Total</th><th>%</th><th>Grade</th><th>GP</th></tr></thead>
          <tbody>
            {toppers.map((t) => (
              <tr key={t.studentId}>
                <td>{t.rollNumber}</td><td>{t.totalObtained}/{t.totalMax}</td>
                <td>{t.percentage.toFixed(2)}</td><td>{t.gradeLabel}</td>
                <td>{t.gradePoint.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href={csvHref("toppers")} download>Download CSV</a>
      </section>
      <section className="analytics-dashboard__panel">
        <h2>Attendance shortage</h2>
        <table>
          <thead><tr><th>Roll</th><th>Present</th><th>Sessions</th><th>%</th></tr></thead>
          <tbody>
            {attendance.map((a) => (
              <tr key={a.studentId}>
                <td>{a.rollNumber}</td><td>{a.presentCount}</td>
                <td>{a.totalSessions}</td><td>{a.percentage.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href={csvHref("attendance-shortage")} download>Download CSV</a>
      </section>
    </main>
  );
}