import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";

interface Assignment { id: string; facultyId: string; courseId: string; assignedDate: string; }
interface Course { id: string; code: string; title: string; }
interface FacultySat { userId: string; name: string; employeeCode?: string; }

export function AssignmentsPage() {
  const courses = useResource<{ data: Course[] }>(ROUTES_CYCLE_2.adminCourses);
  const faculty = useResource<{ data: FacultySat[] }>(ROUTES_CYCLE_2.adminFaculty);
  const assignments = useResource<{ data: Assignment[] }>(ROUTES_CYCLE_2.adminFacultyAssignments);
  const [facultyId, setFacultyId] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminFacultyAssignments, {
        method: "POST",
        body: JSON.stringify({ facultyId, courseId }),
      });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "assign_failed");
    }
  };

  const remove = async (id: string): Promise<void> => {
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminFacultyAssignmentById(id), { method: "DELETE" });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "delete_failed");
    }
  };

  return (
    <main className="assignments-page">
      <h1>Faculty Assignments</h1>
      {error !== null && <p className="assignments-page__error">{error}</p>}
      <div className="assignments-page__form">
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">— pick a course —</option>
          {(courses.data?.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
          ))}
        </select>
        <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
          <option value="">— pick a faculty member —</option>
          {(faculty.data?.data ?? []).map((f) => (
            <option key={f.userId} value={f.userId}>{f.name} ({f.employeeCode ?? "no code"})</option>
          ))}
        </select>
        <button onClick={submit} disabled={!courseId || !facultyId}>Assign</button>
      </div>
      <table>
        <thead><tr><th>Course</th><th>Faculty</th><th>Assigned</th><th>Actions</th></tr></thead>
        <tbody>
          {(assignments.data?.data ?? []).map((a) => (
            <tr key={a.id}>
              <td>{a.courseId}</td>
              <td>{a.facultyId}</td>
              <td>{a.assignedDate}</td>
              <td><button onClick={() => remove(a.id)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}