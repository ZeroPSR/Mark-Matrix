import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { Link } from "react-router-dom";

interface FacultyCourseView {
  id: string;
  code: string;
  title: string;
  credits: number;
  semester: { id: string; number: number; programId: string; batchId: string };
}

export function FacultyCoursesPage() {
  const courses = useResource<{ data: FacultyCourseView[] }>(ROUTES_CYCLE_2.facultyCourses);
  return (
    <main className="faculty-courses">
      <h1>My Courses</h1>
      {courses.loading && <p>Loading…</p>}
      {courses.error !== null && <p>Error: {courses.error}</p>}
      <ul>
        {(courses.data?.data ?? []).map((c) => (
          <li key={c.id}>
            <strong>{c.code}</strong> — {c.title} ({c.credits} cr)
            <br />Semester {c.semester.number} · Batch {c.semester.batchId} · Program {c.semester.programId}
            <br />
            <Link to={`/faculty/marks/${c.id}`}>Enter marks</Link>
            {" · "}
            <Link to={`/faculty/marks/${c.id}/roster`}>Marks roster</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}