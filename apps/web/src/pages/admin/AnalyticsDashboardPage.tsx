import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { apiFetch } from "../../lib/api.js";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Field } from "../../components/Field/Field.js";
import { Select } from "../../components/Select/Select.js";
import { Badge } from "../../components/Badge/Badge.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Empty } from "../../components/Empty/Empty.js";
import { KpiGrid, type KpiItem } from "../../components/KpiGrid/KpiGrid.js";
import { BarChart, type BarDatum } from "../../analytics/BarChart/BarChart.js";
import { Sparkline } from "../../analytics/Sparkline/Sparkline.js";
import { DotPlot } from "../../analytics/DotPlot/DotPlot.js";
import styles from "./AnalyticsDashboardPage.module.css";

interface SummaryRow { courseId: string; courseCode: string; courseTitle: string; enrolled: number; graded: number; passing: number; passRate: number; avgPercentage: number; avgGradePoint: number; }
interface PassRate { total: number; passing: number; rate: number; }
interface Topper { studentId: string; rollNumber: string; totalObtained: number; totalMax: number; percentage: number; gradeLabel: string; gradePoint: number; }
interface AttendanceShortage { studentId: string; rollNumber: string; presentCount: number; totalSessions: number; percentage: number; }

/** One row of the cross-course summary table. */
interface SummaryTableRow extends Record<string, unknown> {
  course: JSX.Element;
  enrolled: string;
  graded: string;
  passing: string;
  passRate: string;
  avgGradePoint: string;
}

/** One row of the top-scores table. */
interface TopperRow extends Record<string, unknown> {
  rollNumber: string;
  total: string;
  percentage: string;
  gradeLabel: string;
  gradePoint: string;
}

/** One row of the attendance-shortage table. */
interface AttendanceRow extends Record<string, unknown> {
  rollNumber: string;
  present: string;
  sessions: string;
  percentage: string;
}

const summaryColumns: TableColumn<SummaryTableRow>[] = [
  { key: "course", header: "Course" },
  { key: "enrolled", header: "Enrolled", align: "right", mono: true },
  { key: "graded", header: "Graded", align: "right", mono: true },
  { key: "passing", header: "Passing", align: "right", mono: true },
  { key: "passRate", header: "Pass rate", align: "right", mono: true },
  { key: "avgGradePoint", header: "Avg GP", align: "right", mono: true },
];

const topperColumns: TableColumn<TopperRow>[] = [
  { key: "rollNumber", header: "Roll", mono: true },
  { key: "total", header: "Total", align: "right", mono: true },
  { key: "percentage", header: "%", align: "right", mono: true },
  { key: "gradeLabel", header: "Grade" },
  { key: "gradePoint", header: "GP", align: "right", mono: true },
];

const attendanceColumns: TableColumn<AttendanceRow>[] = [
  { key: "rollNumber", header: "Roll", mono: true },
  { key: "present", header: "Present", align: "right", mono: true },
  { key: "sessions", header: "Sessions", align: "right", mono: true },
  { key: "percentage", header: "%", align: "right", mono: true },
];

export function AnalyticsDashboardPage(): JSX.Element {
  const params = useParams<{ batchId: string; programId: string; semId: string }>();
  const { batchId = "b1", programId = "p1", semId = "s1" } = params;
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [passRate, setPassRate] = useState<PassRate | null>(null);
  const [toppers, setToppers] = useState<Topper[]>([]);
  const [attendance, setAttendance] = useState<AttendanceShortage[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = ROUTES_CYCLE_2.analyticsSemSummary("admin", batchId, programId, semId);
      const res = await apiFetch<{ courses: SummaryRow[] }>(url);
      if (cancelled) return;
      const courses = res.courses ?? [];
      setSummary(courses);
      if (courses[0]) setActiveId(courses[0].courseId);
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
        apiFetch<{ rows: AttendanceShortage[] }>(ROUTES_CYCLE_2.analyticsAttendanceShortage("admin", batchId, programId, semId, activeId)),
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

  const activeSummary = summary.find((s) => s.courseId === activeId) ?? null;

  const kpis: KpiItem[] = [
    { label: "Enrolled", value: activeSummary === null ? "—" : String(activeSummary.enrolled) },
    { label: "Graded", value: activeSummary === null ? "—" : String(activeSummary.graded) },
    { label: "Passed", value: activeSummary === null ? "—" : String(activeSummary.passing) },
    { label: "Pass rate", value: activeSummary === null ? "—" : `${activeSummary.passRate.toFixed(2)}%` },
    { label: "Avg score", value: activeSummary === null ? "—" : `${activeSummary.avgPercentage.toFixed(2)}%` },
    { label: "Avg grade point", value: activeSummary === null ? "—" : activeSummary.avgGradePoint.toFixed(2) },
  ];

  const coursePassRates: BarDatum[] = summary.map((s) => ({
    label: s.courseCode,
    value: s.passRate,
  }));
  const topperScores = toppers.map((t) => t.percentage);
  const attendancePercentages = attendance.map((a) => a.percentage);

  const summaryRows: SummaryTableRow[] = summary.map((s) => ({
    course: (
      <span className={styles["courseCell"]}>
        <span>{s.courseCode} — {s.courseTitle}</span>
        {s.courseId === activeId && <Badge variant="published">Active</Badge>}
      </span>
    ),
    enrolled: String(s.enrolled),
    graded: String(s.graded),
    passing: String(s.passing),
    passRate: `${s.passRate.toFixed(2)}%`,
    avgGradePoint: s.avgGradePoint.toFixed(2),
  }));

  const topperRows: TopperRow[] = toppers.map((t) => ({
    rollNumber: t.rollNumber,
    total: `${t.totalObtained}/${t.totalMax}`,
    percentage: t.percentage.toFixed(2),
    gradeLabel: t.gradeLabel,
    gradePoint: t.gradePoint.toFixed(2),
  }));

  const attendanceRows: AttendanceRow[] = attendance.map((a) => ({
    rollNumber: a.rollNumber,
    present: String(a.presentCount),
    sessions: String(a.totalSessions),
    percentage: a.percentage.toFixed(2),
  }));

  return (
    <main className={styles["page"]}>
      <PageTitle eyebrow="Admin · Analytics">Analytics — Semester {semId}</PageTitle>

      {summary.length > 0 && (
        <div className={styles["picker"]}>
          <Field label="Course" htmlFor="admin-analytics-course">
            <Select
              id="admin-analytics-course"
              aria-label="Course"
              value={activeId ?? ""}
              onChange={(e) => setActiveId(e.target.value)}
              options={summary.map((s) => ({ value: s.courseId, label: `${s.courseCode} — ${s.courseTitle}` }))}
            />
          </Field>
        </div>
      )}

      <KpiGrid label="Key figures" items={kpis} />

      <section className={styles["panel"]} aria-labelledby="admin-summary">
        <h2 id="admin-summary" className={styles["panelTitle"]}>Summary</h2>
        <Table<SummaryTableRow>
          columns={summaryColumns}
          rows={summaryRows}
          emptyMessage="No courses in this semester."
        />
        <a className={styles["download"]} href={csvHref("summary")} download>
          Download CSV — summary
        </a>
      </section>

      <section className={styles["panel"]} aria-labelledby="admin-pass-rate-by-course">
        <h2 id="admin-pass-rate-by-course" className={styles["panelTitle"]}>Pass rate by course</h2>
        {coursePassRates.length === 0 ? (
          <Empty>No course pass rates to plot yet.</Empty>
        ) : (
          <BarChart
            data={coursePassRates}
            max={100}
            ariaLabel={`Pass rate for each course in semester ${semId}`}
          />
        )}
      </section>

      <section className={styles["panel"]} aria-labelledby="admin-pass-rate">
        <h2 id="admin-pass-rate" className={styles["panelTitle"]}>Pass rate</h2>
        {passRate === null ? (
          <Empty>No pass rate to report for this course yet.</Empty>
        ) : (
          <p className={styles["figure"]}>
            {passRate.passing} of {passRate.total} ({passRate.rate.toFixed(2)}%)
          </p>
        )}
        <a className={styles["download"]} href={csvHref("pass-rate")} download>
          Download CSV — pass rate
        </a>
      </section>

      <section className={styles["panel"]} aria-labelledby="admin-top-scores">
        <h2 id="admin-top-scores" className={styles["panelTitle"]}>Top scores</h2>
        {topperScores.length === 0 ? (
          <Empty>No scores to plot yet.</Empty>
        ) : (
          <Sparkline
            values={topperScores}
            ariaLabel={`Score curve across the top ${topperScores.length} students`}
          />
        )}
        <Table<TopperRow>
          columns={topperColumns}
          rows={topperRows}
          emptyMessage="No top scores recorded."
        />
        <a className={styles["download"]} href={csvHref("toppers")} download>
          Download CSV — toppers
        </a>
      </section>

      <section className={styles["panel"]} aria-labelledby="admin-attendance-shortage">
        <h2 id="admin-attendance-shortage" className={styles["panelTitle"]}>Attendance shortage</h2>
        {attendancePercentages.length === 0 ? (
          <Empty>No attendance figures to plot yet.</Empty>
        ) : (
          <DotPlot
            values={attendancePercentages}
            ariaLabel="Attendance percentage per student below the threshold"
          />
        )}
        <Table<AttendanceRow>
          columns={attendanceColumns}
          rows={attendanceRows}
          emptyMessage="No attendance shortfalls recorded."
        />
        <a className={styles["download"]} href={csvHref("attendance-shortage")} download>
          Download CSV — attendance shortage
        </a>
      </section>
    </main>
  );
}
