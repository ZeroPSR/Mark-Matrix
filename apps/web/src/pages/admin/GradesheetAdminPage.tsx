import { useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { UnlockModal } from "./components/UnlockModal.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Gradesheet {
  id: string;
  studentId: string;
  status: "draft" | "compiled" | "locked" | "published";
  sgpa: number | null;
  courseCount: number | null;
  totalCredits: number | null;
}

interface CompileResponse {
  compiled: number;
  incompleteCourses: { courseId: string; courseCode: string }[];
  students: { studentId: string; sgpa: number; courseCount: number; totalCredits: number }[];
}

export function GradesheetAdminPage(): JSX.Element {
  const params = useParams<{ batchId: string; programId: string; semId: string }>();
  const { batchId = "", programId = "", semId = "" } = params;
  const url = (action: "compile" | "lock" | "publish" | "unlock"): string =>
    ROUTES_CYCLE_2.adminSemGradesheetAction("admin", batchId, programId, semId, action);

  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [showUnlock, setShowUnlock] = useState<boolean>(false);

  const post = async (action: "compile" | "lock" | "publish", body: unknown): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch<CompileResponse | { compiled?: number; locked?: number; published?: number }>(
        url(action),
        { method: "POST", body: JSON.stringify(body) },
      );
      if (action === "compile") {
        setResult(res as CompileResponse);
        setMessage(`Compiled ${(res as CompileResponse).compiled} students.`);
      } else if (action === "lock") {
        setMessage(`Locked ${(res as { locked: number }).locked} gradesheets.`);
      } else {
        setMessage(`Published ${(res as { published: number }).published} gradesheets.`);
      }
    } catch (e) {
      const body = (e as { body?: { error?: string; incompleteCourses?: { courseCode: string }[]; detail?: string } }).body;
      if (body?.error === "incomplete_sem" && body.incompleteCourses) {
        setMessage(`Incomplete: ${body.incompleteCourses.map((c) => c.courseCode).join(", ")}`);
      } else {
        setMessage(body?.detail ?? `${action}_failed`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="gradesheet-admin">
      <h1>Gradesheet — Semester {semId}</h1>
      {message !== null && <p className="gradesheet-admin__msg">{message}</p>}
      <div className="gradesheet-admin__actions">
        <button disabled={busy} onClick={() => void post("compile", {})}>1. Compile</button>
        <button disabled={busy} onClick={() => void post("lock", {})}>2. Lock</button>
        <button disabled={busy} onClick={() => void post("publish", {})}>3. Publish</button>
        <button disabled={busy} onClick={() => setShowUnlock(true)}>Unlock</button>
      </div>
      {result !== null && (
        <table className="gradesheet-admin__students">
          <thead><tr><th>Student</th><th>SGPA</th><th>Courses</th><th>Credits</th></tr></thead>
          <tbody>
            {result.students.map((s) => (
              <tr key={s.studentId}>
                <td>{s.studentId}</td>
                <td>{s.sgpa.toFixed(2)}</td>
                <td>{s.courseCount}</td>
                <td>{s.totalCredits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showUnlock && (
        <UnlockModal
          title="Unlock gradesheet"
          onCancel={() => setShowUnlock(false)}
          onConfirm={async (reason) => {
            setBusy(true);
            try {
              await apiFetch(url("unlock"), { method: "POST", body: JSON.stringify({ reason }) });
              setMessage("Unlocked. You can re-compile and re-publish.");
              setShowUnlock(false);
            } catch (e) {
              setMessage((e as { body?: { detail?: string } }).body?.detail ?? "unlock_failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </main>
  );
}
