// apps/web/src/pages/admin/GradesheetAdminPage.tsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2, type GradesheetStatus } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Badge } from "../../components/Badge/Badge.js";
import { Button } from "../../components/Button/Button.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Empty } from "../../components/Empty/Empty.js";
import { Banner } from "../../components/Banner/Banner.js";
import { UnlockModal } from "./components/UnlockModal.js";
import { DownloadTranscriptButton } from "../../components/DownloadTranscriptButton.js";
import styles from "./GradesheetAdminPage.module.css";

interface CompileResponse {
  compiled: number;
  incompleteCourses: { courseId: string; courseCode: string }[];
  students: { studentId: string; sgpa: number; courseCount: number; totalCredits: number }[];
}

/**
 * What each lifecycle stage means on this page. The admin gradesheet route
 * exposes only its actions — compile, lock, publish, unlock — and no read of
 * the semester's gradesheet, so the stage shown is the one reached in this
 * session, and the note says so.
 */
const STAGE_NOTE: Record<GradesheetStatus, string> = {
  draft: "Not compiled in this session yet.",
  compiled: "Compiled in this session.",
  locked: "Locked in this session.",
  published: "Published in this session.",
};

interface Row extends Record<string, unknown> {
  studentId: string;
  sgpa: string;
  courseCount: number;
  totalCredits: number;
  transcript: JSX.Element;
}

export function GradesheetAdminPage(): JSX.Element {
  const params = useParams<{ batchId: string; programId: string; semId: string }>();
  const { batchId = "", programId = "", semId = "" } = params;
  const url = (action: "compile" | "lock" | "publish" | "unlock"): string =>
    ROUTES_CYCLE_2.adminSemGradesheetAction("admin", batchId, programId, semId, action);

  const [busy, setBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [showUnlock, setShowUnlock] = useState<boolean>(false);
  /**
   * The lifecycle stage this page has reached. The admin API exposes the
   * gradesheet only through its actions, so the stage follows the last
   * successful one: compile → compiled, lock → locked, publish → published,
   * unlock → compiled (an unlocked gradesheet is compiled again).
   */
  const [status, setStatus] = useState<GradesheetStatus>("draft");

  const post = async (action: "compile" | "lock" | "publish", body: unknown): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch<CompileResponse | { compiled?: number; locked?: number; published?: number }>(
        url(action),
        { method: "POST", body: JSON.stringify(body) },
      );
      if (action === "compile") {
        setResult(res as CompileResponse);
        setNotice({ text: `Compiled ${(res as CompileResponse).compiled} students.`, tone: "success" });
        setStatus("compiled");
      } else if (action === "lock") {
        setNotice({ text: `Locked ${(res as { locked: number }).locked} gradesheets.`, tone: "success" });
        setStatus("locked");
      } else {
        setNotice({ text: `Published ${(res as { published: number }).published} gradesheets.`, tone: "success" });
        setStatus("published");
      }
    } catch (e) {
      const body = (e as { body?: { error?: string; incompleteCourses?: { courseCode: string }[]; detail?: string } }).body;
      if (body?.error === "incomplete_sem" && body.incompleteCourses) {
        setNotice({ text: `Incomplete: ${body.incompleteCourses.map((c) => c.courseCode).join(", ")}`, tone: "error" });
      } else {
        setNotice({ text: body?.detail ?? `${action}_failed`, tone: "error" });
      }
    } finally {
      setBusy(false);
    }
  };

  const students = result?.students ?? [];
  const rows: Row[] = students.map((s) => ({
    studentId: s.studentId,
    sgpa: s.sgpa.toFixed(2),
    courseCount: s.courseCount,
    totalCredits: s.totalCredits,
    transcript: (
      <DownloadTranscriptButton
        url={ROUTES_CYCLE_2.studentTranscript("admin", batchId, programId, semId, s.studentId)}
        label="Download"
      />
    ),
  }));

  const columns: TableColumn<Row>[] = [
    { key: "studentId", header: "Student" },
    { key: "sgpa", header: "SGPA", align: "right", mono: true },
    { key: "courseCount", header: "Courses", align: "right", mono: true },
    { key: "totalCredits", header: "Credits", align: "right", mono: true },
    { key: "transcript", header: "Transcript" },
  ];

  return (
    <main className={styles["page"]}>
      <PageTitle
        eyebrow="Admin · Gradesheet"
        subtitle="Compile the semester's gradesheets, then lock and publish them."
      >
        Gradesheet — Semester {semId}
      </PageTitle>

      <div className={styles["row"]}>
        <Badge variant={status}>{status}</Badge>
        <span className={styles["note"]}>{STAGE_NOTE[status]}</span>
      </div>

      <dl className={styles["meta"]}>
        <dt>Batch</dt>            <dd>{batchId}</dd>
        <dt>Program</dt>          <dd>{programId}</dd>
        <dt>Semester</dt>         <dd>{semId}</dd>
        <dt>Students compiled</dt><dd>{result !== null ? result.compiled : "—"}</dd>
      </dl>

      {notice !== null && <Banner variant={notice.tone}>{notice.text}</Banner>}

      <div className={styles["actions"]}>
        <Button variant="primary" disabled={busy} onClick={() => void post("compile", {})}>
          1. Compile
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void post("lock", {})}>
          2. Lock
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void post("publish", {})}>
          3. Publish
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setShowUnlock(true)}>
          Unlock
        </Button>
      </div>

      {result === null ? (
        <Empty>Compile the semester to build its gradesheets.</Empty>
      ) : (
        <Table<Row>
          columns={columns}
          rows={rows}
          emptyMessage="No students were compiled for this semester."
        />
      )}

      <UnlockModal
        open={showUnlock}
        onClose={() => setShowUnlock(false)}
        title="Unlock gradesheet"
        onConfirm={async (reason) => {
          setBusy(true);
          try {
            await apiFetch(url("unlock"), { method: "POST", body: JSON.stringify({ reason }) });
            setNotice({ text: "Unlocked. You can re-compile and re-publish.", tone: "success" });
            setStatus("compiled");
            setShowUnlock(false);
          } catch (e) {
            setNotice({
              text: (e as { body?: { detail?: string } }).body?.detail ?? "unlock_failed",
              tone: "error",
            });
          } finally {
            setBusy(false);
          }
        }}
      />
    </main>
  );
}

export default GradesheetAdminPage;
