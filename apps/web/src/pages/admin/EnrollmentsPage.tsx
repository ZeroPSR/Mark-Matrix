import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { CsvEnrollUpload } from "./components/CsvEnrollUpload.js";

interface Semester { id: string; programId: string; number: number; }
interface StudentSat { userId: string; name: string; rollNumber?: string; }
interface Enrollment { id: string; studentId: string; semId: string; enrollmentDate: string; }

export function EnrollmentsPage() {
  const semesters = useResource<{ data: Semester[] }>(ROUTES_CYCLE_2.adminSemesters);
  const students = useResource<{ data: StudentSat[] }>(ROUTES_CYCLE_2.adminStudents);
  const enrollments = useResource<{ data: Enrollment[] }>(ROUTES_CYCLE_2.adminEnrollments);
  const [semId, setSemId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    try {
      await apiFetch(ROUTES_CYCLE_2.adminEnrollments, {
        method: "POST",
        body: JSON.stringify({ studentId, semId }),
      });
      window.location.reload();
    } catch (e) {
      setError((e as { body?: { detail?: string } }).body?.detail ?? "enroll_failed");
    }
  };

  return (
    <main className="enrollments-page">
      <h1>Enrollments</h1>
      {error !== null && <p className="enrollments-page__error">{error}</p>}
      <section className="enrollments-page__single">
        <h2>Single enrollment</h2>
        <select value={semId} onChange={(e) => setSemId(e.target.value)}>
          <option value="">— pick a semester —</option>
          {(semesters.data?.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>Semester {s.number}</option>
          ))}
        </select>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">— pick a student —</option>
          {(students.data?.data ?? []).map((s) => (
            <option key={s.userId} value={s.userId}>{s.name} ({s.rollNumber ?? "no roll"})</option>
          ))}
        </select>
        <button onClick={() => void submit()} disabled={!semId || !studentId}>Enroll</button>
      </section>
      <section className="enrollments-page__bulk">
        <h2>Bulk enroll (CSV)</h2>
        {semId !== "" ? (
          <CsvEnrollUpload semId={semId} onComplete={() => window.location.reload()} />
        ) : (
          <p>Pick a semester above to enable bulk upload.</p>
        )}
      </section>
      <table>
        <thead><tr><th>Student</th><th>Semester</th><th>Date</th></tr></thead>
        <tbody>
          {(enrollments.data?.data ?? []).map((e) => (
            <tr key={e.id}><td>{e.studentId}</td><td>{e.semId}</td><td>{e.enrollmentDate}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}