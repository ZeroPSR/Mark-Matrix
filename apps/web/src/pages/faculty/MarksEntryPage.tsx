import { useMemo, useState, type ChangeEvent } from "react";
import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2, type MarksRow } from "@mark-matrix/shared";

interface Course {
  id: string;
  code: string;
  title: string;
  semester: { id: string; number: number; programId: string; batchId: string };
}
interface Enrollment { id: string; studentId: string; semId: string }
interface StudentSat { userId: string; name: string; rollNumber?: string }
interface ExamType { examType: string; maxMarks: number }

/**
 * Faculty marks-entry page. Renders the course roster as a table where each
 * row is a student and each column is an exam type. Faculty can type marks
 * into the cells, then save as draft (POST /marks) or upload a CSV (POST
 * /marks/bulk). A separate Submit button flips all draft rows to submitted.
 */
export function FacultyMarksEntryPage(): JSX.Element {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId ?? "";

  const courses = useResource<{ data: Course[] }>(ROUTES_CYCLE_2.facultyCourses);
  const course = useMemo(
    () => (courses.data?.data ?? []).find((c) => c.id === courseId) ?? null,
    [courses.data, courseId],
  );

  const examTypesPath = courseId ? `/api/faculty/courses/${courseId}/exam-types` : null;
  const examTypesRes = useResource<{ data: ExamType[] }>(examTypesPath);
  const examTypes = examTypesRes.data?.data ?? [];

  const enrollments = useResource<{ data: Enrollment[] }>(
    course ? `${ROUTES_CYCLE_2.adminEnrollments}?semId=${course.semester.id}` : null,
  );
  const students = useResource<{ data: StudentSat[] }>(ROUTES_CYCLE_2.adminStudents);

  const studentById = useMemo(() => {
    const m = new Map<string, StudentSat>();
    for (const s of students.data?.data ?? []) m.set(s.userId, s);
    return m;
  }, [students.data]);

  const marksPath = course
    ? ROUTES_CYCLE_2.facultyMarks("faculty", course.semester.batchId, course.semester.programId, course.semester.id, course.id)
    : null;
  const existingMarks = useResource<{ data: MarksRow[] }>(marksPath);

  const isSubmitted = useMemo(() => {
    const rows = existingMarks.data?.data ?? [];
    return rows.length > 0 && rows.every((r) => r.status === "submitted");
  }, [existingMarks.data]);

  // Draft state: { [studentId]: { [examType]: string } }
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bulkErrors, setBulkErrors] = useState<
    { row: number; rollNumber?: string; reason: string }[]
  >([]);

  const roster = useMemo(() => {
    const list = enrollments.data?.data ?? [];
    return list.map((e) => ({
      studentId: e.studentId,
      label: studentById.get(e.studentId)?.name ?? e.studentId,
      rollNumber: studentById.get(e.studentId)?.rollNumber,
    }));
  }, [enrollments.data, studentById]);

  const updateCell = (studentId: string, examType: string, value: string): void => {
    setDraft((d) => ({
      ...d,
      [studentId]: { ...(d[studentId] ?? {}), [examType]: value },
    }));
  };

  const saveDraft = async (): Promise<void> => {
    if (!course || !marksPath) return;
    const entries: { studentId: string; examType: string; marksObtained: number }[] = [];
    for (const [studentId, cells] of Object.entries(draft)) {
      for (const [examType, val] of Object.entries(cells)) {
        if (val.trim() === "") continue;
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0) {
          setMessage(`Invalid marks for ${studentId}/${examType}`);
          return;
        }
        entries.push({ studentId, examType, marksObtained: n });
      }
    }
    if (entries.length === 0) {
      setMessage("Nothing to save.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch(marksPath, {
        method: "POST",
        body: JSON.stringify({ entries }),
      });
      setMessage("Draft saved.");
      setDraft({});
      window.location.reload();
    } catch (e) {
      setMessage((e as { body?: { detail?: string } }).body?.detail ?? "save_failed");
    } finally {
      setSubmitting(false);
    }
  };

  const submitCourse = async (): Promise<void> => {
    if (!course || !marksPath) return;
    if (!window.confirm("Submit all draft marks? Once submitted, you cannot edit them.")) return;
    setSubmitting(true);
    try {
      await apiFetch(`${marksPath}/submit`, { method: "POST", body: "{}" });
      setMessage("Submitted. Faculty edits are now locked.");
      window.location.reload();
    } catch (e) {
      setMessage((e as { body?: { detail?: string } }).body?.detail ?? "submit_failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onCsvChosen = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file || !marksPath) return;
    const csv = await file.text();
    setMessage(null);
    setBulkErrors([]);
    try {
      const res = await apiFetch<{
        succeeded: number;
        errors: { row: number; rollNumber?: string; reason: string }[];
      }>(`${marksPath}/bulk`, {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setBulkErrors(res.errors);
      setMessage(`CSV upload: ${res.succeeded} succeeded, ${res.errors.length} errors.`);
      window.location.reload();
    } catch (err) {
      setMessage((err as { body?: { detail?: string } }).body?.detail ?? "csv_failed");
    }
  };

  if (!course && courses.data !== null) return <p>Course not found.</p>;

  return (
    <main className="marks-entry">
      <h1>Enter Marks</h1>
      {course !== null && (
        <p>
          <strong>{course.code}</strong> — {course.title} (Semester {course.semester.number})
        </p>
      )}
      {isSubmitted && (
        <div className="marks-entry__banner">
          This course's marks are submitted. Faculty edits are locked.
        </div>
      )}
      <div className="marks-entry__actions">
        <button onClick={() => void saveDraft()} disabled={isSubmitted || submitting}>
          Save draft
        </button>
        <button onClick={() => void submitCourse()} disabled={isSubmitted || submitting}>
          Submit
        </button>
        <label className="marks-entry__csv">
          CSV upload:&nbsp;
          <input type="file" accept=".csv,text/csv" onChange={(e) => void onCsvChosen(e)} />
        </label>
      </div>
      {message !== null && <p className="marks-entry__msg">{message}</p>}
      {bulkErrors.length > 0 && (
        <details className="marks-entry__bulk-errors" open>
          <summary>CSV errors ({bulkErrors.length})</summary>
          <table>
            <thead>
              <tr><th>Row</th><th>Roll #</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {bulkErrors.map((er, i) => (
                <tr key={i}>
                  <td>{er.row}</td>
                  <td>{er.rollNumber ?? "—"}</td>
                  <td>{er.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <table className="marks-entry__table">
        <thead>
          <tr>
            <th>Roll</th>
            <th>Name</th>
            {examTypes.map((et) => (
              <th key={et.examType}>{et.examType} (max {et.maxMarks})</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <tr key={r.studentId}>
              <td>{r.rollNumber ?? "—"}</td>
              <td>{r.label}</td>
              {examTypes.map((et) => {
                const existing = (existingMarks.data?.data ?? []).find(
                  (m) => m.studentId === r.studentId && m.examType === et.examType,
                );
                const value =
                  draft[r.studentId]?.[et.examType] ?? (existing ? String(existing.marksObtained) : "");
                const submitted = existing?.status === "submitted";
                return (
                  <td key={et.examType}>
                    <input
                      type="number"
                      min={0}
                      max={et.maxMarks}
                      step={0.5}
                      disabled={isSubmitted || submitted}
                      value={value}
                      onChange={(e) => updateCell(r.studentId, et.examType, e.target.value)}
                    />
                    {submitted && <small className="marks-entry__locked">submitted</small>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
