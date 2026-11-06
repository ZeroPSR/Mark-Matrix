import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2, type CourseListResponse, type MarksRow } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Banner } from "../../components/Banner/Banner.js";
import { Loading } from "../../components/Loading/Loading.js";
import { Empty } from "../../components/Empty/Empty.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import { cn } from "../../lib/cn.js";
import styles from "./RosterMarksPage.module.css";

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

  const courses = useResource<CourseListResponse>(
    role === "admin" ? ROUTES_CYCLE_2.adminCourseHierarchy : ROUTES_CYCLE_2.facultyCourses,
  );
  const course = useMemo(
    () => (courses.data?.data ?? []).find((c) => c.id === courseId) ?? null,
    [courses.data, courseId],
  );

  const enrollments = useResource<{ data: Enrollment[] }>(
    course
      ? `${role === "admin" ? ROUTES_CYCLE_2.adminEnrollments : ROUTES_CYCLE_2.facultyEnrollments}?semId=${course.semester.id}`
      : null,
  );
  const students = useResource<{ data: StudentSat[] }>(
    role === "admin" ? ROUTES_CYCLE_2.adminStudents : ROUTES_CYCLE_2.facultyStudents,
  );

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

  const allSubmitted = useMemo(() => {
    const list = rows.data?.data ?? [];
    return list.length > 0 && list.every((r) => r.status === "submitted" || r.status === "approved" || r.status === "locked");
  }, [rows.data]);

  const isLocked = allSubmitted;
  const showLoading = rows.loading && !rows.data;
  const showError = rows.error !== null && !rows.data;
  const courseMissing = !course && courses.data !== null;
  const noEnrollments = rows.data !== null && (enrollments.data?.data ?? []).length === 0;

  return (
    <main className={styles["page"]}>
      <PageTitle
        eyebrow={role === "faculty" ? "Faculty · Marks roster" : "Admin · Marks roster"}
        subtitle={course ? `${course.code} — ${course.title}` : undefined}
      >
        Marks roster — {course?.code ?? "…"}
      </PageTitle>

      {courseMissing && <Empty>Course not found.</Empty>}
      {showLoading && <Loading />}
      {showError && (
        <ErrorState onRetry={() => window.location.reload()}>{rows.error}</ErrorState>
      )}

      {course !== null && !courseMissing && (
        <>
          {isLocked && (
            <Banner variant="info" title={role === "faculty" ? "Marks locked" : "Marks locked"}>
              Marks have been submitted for this course and cannot be edited until an unlock is recorded.
            </Banner>
          )}
          {noEnrollments && <Empty>No students are enrolled in this course yet.</Empty>}
          {!noEnrollments && (
            <table className={styles["table"]}>
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>Name</th>
                  {examTypes.map((e) => <th key={e} className={styles["right"]}>{e}</th>)}
                </tr>
              </thead>
              <tbody>
                {(enrollments.data?.data ?? []).map((e) => {
                  const s = studentById.get(e.studentId);
                  const byExam = grid.get(e.studentId);
                  return (
                    <tr key={e.studentId}>
                      <td className={styles["mono"]}>{s?.rollNumber ?? "—"}</td>
                      <td>{s?.name ?? e.studentId}</td>
                      {examTypes.map((et) => {
                        const r = byExam?.get(et);
                        if (!r) return <td key={et} className={styles["right"]}>—</td>;
                        return (
                          <td key={et} className={styles["right"]}>
                            <span className={styles["score"]}>{r.marksObtained} / {r.maxMarks}</span>
                            <small className={cn(styles["status"], styles[`status--${r.status}`])}>
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
          )}
        </>
      )}
    </main>
  );
}