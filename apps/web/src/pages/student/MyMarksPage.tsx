import { useMemo } from "react";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2, type MarksRow } from "@mark-matrix/shared";

interface Enrollment {
  id: string;
  semId: string;
  semester: { id: string; number: number; programId: string; batchId: string };
}

export function StudentMyMarksPage(): JSX.Element {
  const enrollments = useResource<{ data: Enrollment[] }>(ROUTES_CYCLE_2.studentEnrollment);
  const mySem = (enrollments.data?.data ?? []).map((e) => e.semester);

  return (
    <main className="my-marks">
      <h1>My Marks</h1>
      {mySem.length === 0 && <p>No enrollments yet.</p>}
      {mySem.map((s) => (
        <section key={s.id} className="my-marks__course">
          <h2>Semester {s.number}</h2>
          <p className="my-marks__hint">
            Showing marks per course you take in this semester.
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
  const courses = useResource<{ data: { id: string; code: string; title: string }[] }>(
    `${ROUTES_CYCLE_2.adminCourses}?semesterId=${semId}`,
  );

  return (
    <ul className="my-marks__course-list">
      {(courses.data?.data ?? []).map((c) => (
        <li key={c.id} className="my-marks__course-row">
          <strong>{c.code}</strong> — {c.title}
          <CourseMarks
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

function CourseMarks({
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
  const path = ROUTES_CYCLE_2.studentMarks("student", batchId, programId, semId, courseId);
  const rows = useResource<{ data: MarksRow[] }>(path);
  const list = useMemo(
    () => (rows.data?.data ?? []).slice().sort((a, b) => a.examType.localeCompare(b.examType)),
    [rows.data],
  );
  if (list.length === 0) {
    return <p className="my-marks__empty">No marks yet.</p>;
  }
  return (
    <ul className="my-marks__list">
      {list.map((r) => (
        <li key={r.id} className="my-marks__item">
          <span className="my-marks__exam">{r.examType}: </span>
          <span className="my-marks__score">
            {r.marksObtained} / {r.maxMarks}
          </span>
          <span className="my-marks__pct">
            {Math.round((r.marksObtained / r.maxMarks) * 100)}%
          </span>
          <span className={"my-marks__status my-marks__status--" + r.status}>
            {r.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
