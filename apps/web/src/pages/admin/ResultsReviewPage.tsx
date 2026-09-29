import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { UnlockModal } from "./components/UnlockModal.js";

interface Course {
  id: string;
  code: string;
  title: string;
  semester: { id: string; number: number; programId: string; batchId: string };
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface CourseStatus {
  courseId: string;
  status: "draft" | "submitted" | "approved" | "locked";
  approvedAt: string | null;
  lockedAt: string | null;
}

export function ResultsReviewPage(): JSX.Element {
  const coursesRes = useResource<{ data: Course[] }>("/api/admin/courses");
  const courses = coursesRes.data?.data ?? [];

  const [busyCourse, setBusyCourse] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<{ kind: "marks"; course: Course } | null>(null);

  const url = (course: Course, action: "approve" | "lock" | "unlock"): string =>
    ROUTES_CYCLE_2.adminCourseMarksAction("admin", course.semester.batchId, course.semester.programId, course.semester.id, course.id, action);

  const approve = async (course: Course): Promise<void> => {
    setBusyCourse(course.id);
    setMessage(null);
    try {
      await apiFetch(url(course, "approve"), { method: "POST", body: "{}" });
      setMessage(`Approved ${course.code}`);
      window.location.reload();
    } catch (e) {
      setMessage((e as { body?: { detail?: string } }).body?.detail ?? "approve_failed");
    } finally {
      setBusyCourse(null);
    }
  };

  const lock = async (course: Course): Promise<void> => {
    setBusyCourse(course.id);
    setMessage(null);
    try {
      await apiFetch(url(course, "lock"), { method: "POST", body: "{}" });
      setMessage(`Locked ${course.code}`);
      window.location.reload();
    } catch (e) {
      setMessage((e as { body?: { detail?: string } }).body?.detail ?? "lock_failed");
    } finally {
      setBusyCourse(null);
    }
  };

  return (
    <main className="results-review">
      <h1>Results — Course Approvals</h1>
      {message !== null && <p className="results-review__msg">{message}</p>}
      {courses.length === 0 && <p>No courses yet.</p>}
      <table className="results-review__table">
        <thead>
          <tr>
            <th>Code</th><th>Title</th><th>Semester</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id}>
              <td>{c.code}</td>
              <td>{c.title}</td>
              <td>Sem {c.semester.number}</td>
              <td>
                <button disabled={busyCourse === c.id} onClick={() => void approve(c)}>Approve</button>
                &nbsp;
                <button disabled={busyCourse === c.id} onClick={() => void lock(c)}>Lock</button>
                &nbsp;
                <button disabled={busyCourse === c.id} onClick={() => setUnlockTarget({ kind: "marks", course: c })}>Unlock</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {unlockTarget !== null && unlockTarget.kind === "marks" && (
        <UnlockModal
          title={`Unlock marks for ${unlockTarget.course.code}`}
          onCancel={() => setUnlockTarget(null)}
          onConfirm={async (reason) => {
            setBusyCourse(unlockTarget.course.id);
            try {
              await apiFetch(url(unlockTarget.course, "unlock"), {
                method: "POST",
                body: JSON.stringify({ reason }),
              });
              setMessage(`Unlocked ${unlockTarget.course.code}`);
              setUnlockTarget(null);
              window.location.reload();
            } catch (e) {
              setMessage((e as { body?: { detail?: string } }).body?.detail ?? "unlock_failed");
            } finally {
              setBusyCourse(null);
            }
          }}
        />
      )}
    </main>
  );
}