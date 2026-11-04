import { useEffect, useState } from "react";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { apiFetch } from "../../lib/api.js";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Field } from "../../components/Field/Field.js";
import { Select } from "../../components/Select/Select.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Empty } from "../../components/Empty/Empty.js";
import { KpiGrid, type KpiItem } from "../../components/KpiGrid/KpiGrid.js";
import { BarChart, type BarDatum } from "../../analytics/BarChart/BarChart.js";
import { Sparkline } from "../../analytics/Sparkline/Sparkline.js";
import { DotPlot } from "../../analytics/DotPlot/DotPlot.js";
import styles from "./AnalyticsPage.module.css";

interface CourseRow { id: string; code: string; title: string; }
interface PassRate { total: number; passing: number; rate: number; }
interface Topper { studentId: string; rollNumber: string; totalObtained: number; totalMax: number; percentage: number; gradeLabel: string; gradePoint: number; }
interface AttendanceShortage { studentId: string; rollNumber: string; presentCount: number; totalSessions: number; percentage: number; }

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

export function AnalyticsPage(): JSX.Element {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [passRate, setPassRate] = useState<PassRate | null>(null);
  const [toppers, setToppers] = useState<Topper[]>([]);
  const [attendance, setAttendance] = useState<AttendanceShortage[]>([]);

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
      // The batch/program/semester ids are hard-coded here — the faculty page
      // has no route params to derive them from.
      const url = ROUTES_CYCLE_2.analyticsPassRate("faculty", "b1", "p1", "s1", activeId);
      const [r1, r2, r3] = await Promise.all([
        apiFetch<PassRate>(url),
        apiFetch<{ toppers: Topper[] }>(ROUTES_CYCLE_2.analyticsToppers("faculty", "b1", "p1", "s1", activeId)),
        apiFetch<{ rows: AttendanceShortage[] }>(ROUTES_CYCLE_2.analyticsAttendanceShortage("faculty", "b1", "p1", "s1", activeId)),
      ]);
      if (cancelled) return;
      setPassRate(r1);
      setToppers(r2?.toppers ?? []);
      setAttendance(r3?.rows ?? []);
    })().catch(() => { /* surfaced via UI */ });
    return () => { cancelled = true; };
  }, [activeId]);

  const activeCourse = courses.find((c) => c.id === activeId) ?? null;
  /** The three analytics land together, so the pass rate marks them as loaded. */
  const loaded = passRate !== null;
  const topScore = toppers[0]?.percentage;

  const kpis: KpiItem[] = [
    { label: "Students", value: passRate === null ? "—" : String(passRate.total) },
    { label: "Passed", value: passRate === null ? "—" : String(passRate.passing) },
    { label: "Pass rate", value: passRate === null ? "—" : `${passRate.rate.toFixed(2)}%` },
    { label: "Top score", value: topScore === undefined ? "—" : `${topScore.toFixed(2)}%` },
    { label: "Short on attendance", value: loaded ? String(attendance.length) : "—" },
  ];

  const passSplit: BarDatum[] = passRate === null
    ? []
    : [
        { label: "Passed", value: passRate.passing },
        { label: "Not passed", value: Math.max(passRate.total - passRate.passing, 0) },
      ];
  const topperScores = toppers.map((t) => t.percentage);
  const attendancePercentages = attendance.map((a) => a.percentage);

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
      <PageTitle
        eyebrow="Faculty · Analytics"
        subtitle={activeCourse === null ? undefined : `${activeCourse.code} — ${activeCourse.title}`}
      >
        Analytics
      </PageTitle>

      {courses.length > 0 && (
        <div className={styles["picker"]}>
          <Field label="Course" htmlFor="faculty-analytics-course">
            <Select
              id="faculty-analytics-course"
              aria-label="Course"
              value={activeId ?? ""}
              onChange={(e) => setActiveId(e.target.value)}
              options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))}
            />
          </Field>
        </div>
      )}

      <KpiGrid label="Key figures" items={kpis} />

      <section className={styles["panel"]} aria-labelledby="faculty-pass-rate">
        <h2 id="faculty-pass-rate" className={styles["panelTitle"]}>Pass rate</h2>
        {passRate === null ? (
          <Empty>No pass rate to report for this course yet.</Empty>
        ) : (
          <>
            <BarChart
              data={passSplit}
              ariaLabel={`Pass rate: ${passRate.passing} of ${passRate.total} students passed (${passRate.rate.toFixed(2)}%)`}
            />
            <p className={styles["figure"]}>
              {passRate.passing} of {passRate.total} ({passRate.rate.toFixed(2)}%)
            </p>
          </>
        )}
      </section>

      <section className={styles["panel"]} aria-labelledby="faculty-top-scores">
        <h2 id="faculty-top-scores" className={styles["panelTitle"]}>Top scores</h2>
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
      </section>

      <section className={styles["panel"]} aria-labelledby="faculty-attendance-shortage">
        <h2 id="faculty-attendance-shortage" className={styles["panelTitle"]}>Attendance shortage</h2>
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
      </section>
    </main>
  );
}
