// apps/web/src/pages/admin/ResultsReviewPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { apiFetch } from "../../lib/api.js";
import { ROUTES_CYCLE_2, type CourseListResponse, type CourseWithSemester, type MarksRow, type MarksStatus } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Badge } from "../../components/Badge/Badge.js";
import { Button } from "../../components/Button/Button.js";
import { Modal } from "../../components/Modal/Modal.js";
import { Table, type TableColumn } from "../../components/Table/Table.js";
import { Loading } from "../../components/Loading/Loading.js";
import { Empty } from "../../components/Empty/Empty.js";
import { ErrorState } from "../../components/ErrorState/ErrorState.js";
import { Banner } from "../../components/Banner/Banner.js";
import { UnlockModal } from "./components/UnlockModal.js";
import styles from "./ResultsReviewPage.module.css";

/**
 * The course list is read from the admin's hierarchy endpoint, not the CRUD
 * course list. The CRUD list returns a flat row with only a `semesterId`,
 * and every URL on this page — the per-course marks read and the
 * approve/lock/unlock actions — is built from the batch, program and
 * semester ids. `CourseWithSemester` is the shared declaration of what the
 * endpoint returns, so the page cannot drift from it.
 */
type Course = CourseWithSemester;

/**
 * The marks lifecycle, least advanced first. The record makes the order
 * exhaustive, so a status added to the type later fails to compile here
 * rather than silently ranking last.
 */
const MARKS_STATUS_RANK: Record<MarksStatus, number> = {
  draft: 0,
  submitted: 1,
  approved: 2,
  locked: 3,
};

/**
 * The most advanced status among a course's marks rows, or null when the
 * course has no marks rows at all — such a course has no status to show.
 */
function mostAdvancedStatus(statuses: readonly MarksStatus[]): MarksStatus | null {
  let best: MarksStatus | null = null;
  for (const status of statuses) {
    if (best === null || MARKS_STATUS_RANK[status] > MARKS_STATUS_RANK[best]) {
      best = status;
    }
  }
  return best;
}

interface Row extends Record<string, unknown> {
  code: string;
  title: string;
  semester: string;
  /** A Badge, the pending marker, or null — which the Table renders as "—". */
  status: JSX.Element | string | null;
  actions: JSX.Element;
}

export function ResultsReviewPage(): JSX.Element {
  const coursesRes = useResource<CourseListResponse>(ROUTES_CYCLE_2.adminCourseHierarchy);
  const courses = useMemo(() => coursesRes.data?.data ?? [], [coursesRes.data]);

  const [busyCourse, setBusyCourse] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<Course | null>(null);
  const [approveTarget, setApproveTarget] = useState<Course | null>(null);
  /**
   * The derived marks status of each course. A missing key means the
   * course's marks have not been read yet; a null value means the course has
   * no marks rows at all.
   */
  const [statuses, setStatuses] = useState<Record<string, MarksStatus | null>>({});

  /**
   * The course list is rebuilt on every render, so it cannot be an effect
   * dependency: keying the effect on it would re-read every course's marks
   * on every render, and because each read sets state, the reads would
   * never settle. The effect below therefore keys on the course ids and
   * takes the list itself from a ref, which is kept up to date here.
   */
  const courseIds = courses.map((c) => c.id).join(",");
  const coursesRef = useRef<Course[]>(courses);
  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  // The course-level marks status is derived, not authoritative: the admin
  // marks lifecycle exposes only its actions (approve/lock/unlock) and no
  // read of a course's status, so each course's marks rows are read and the
  // most advanced status among them wins. That is one request per course.
  useEffect(() => {
    const list = coursesRef.current;
    if (list.length === 0) return;
    let cancelled = false;
    void Promise.all(
      list.map(async (course): Promise<readonly [string, MarksStatus | null]> => {
        try {
          const res = await apiFetch<{ data: MarksRow[] }>(
            ROUTES_CYCLE_2.adminMarks(
              "admin",
              course.semester.batchId,
              course.semester.programId,
              course.semester.id,
              course.id,
            ),
          );
          return [course.id, mostAdvancedStatus((res.data ?? []).map((row) => row.status))];
        } catch {
          // The status is unreadable, so the course shows no status at all.
          return [course.id, null];
        }
      }),
    ).then((entries) => {
      if (!cancelled) setStatuses(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [courseIds]);

  const url = (course: Course, action: "approve" | "lock" | "unlock"): string =>
    ROUTES_CYCLE_2.adminCourseMarksAction(
      "admin",
      course.semester.batchId,
      course.semester.programId,
      course.semester.id,
      course.id,
      action,
    );

  const approve = async (course: Course): Promise<void> => {
    setBusyCourse(course.id);
    setNotice(null);
    try {
      await apiFetch(url(course, "approve"), { method: "POST", body: "{}" });
      setNotice({ text: `Approved ${course.code}`, tone: "success" });
      window.location.reload();
    } catch (e) {
      setNotice({
        text: (e as { body?: { detail?: string } }).body?.detail ?? "approve_failed",
        tone: "error",
      });
    } finally {
      setBusyCourse(null);
    }
  };

  const lock = async (course: Course): Promise<void> => {
    setBusyCourse(course.id);
    setNotice(null);
    try {
      await apiFetch(url(course, "lock"), { method: "POST", body: "{}" });
      setNotice({ text: `Locked ${course.code}`, tone: "success" });
      window.location.reload();
    } catch (e) {
      setNotice({
        text: (e as { body?: { detail?: string } }).body?.detail ?? "lock_failed",
        tone: "error",
      });
    } finally {
      setBusyCourse(null);
    }
  };

  const statusCell = (course: Course): JSX.Element | string | null => {
    const status = statuses[course.id];
    if (status === undefined) return "…";
    if (status === null) return null;
    return <Badge variant={status}>{status}</Badge>;
  };

  const rows: Row[] = courses.map((course) => ({
    code: course.code,
    title: course.title,
    semester: `Sem ${course.semester.number}`,
    status: statusCell(course),
    actions: (
      <div className={styles["actions"]}>
        <Button
          variant="primary"
          size="sm"
          aria-label={`Approve marks for ${course.code}`}
          disabled={busyCourse === course.id}
          onClick={() => setApproveTarget(course)}
        >
          Approve
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Lock marks for ${course.code}`}
          disabled={busyCourse === course.id}
          onClick={() => void lock(course)}
        >
          Lock
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Unlock marks for ${course.code}`}
          disabled={busyCourse === course.id}
          onClick={() => setUnlockTarget(course)}
        >
          Unlock
        </Button>
      </div>
    ),
  }));

  const columns: TableColumn<Row>[] = [
    { key: "code", header: "Code" },
    { key: "title", header: "Title" },
    { key: "semester", header: "Semester" },
    { key: "status", header: "Status" },
    { key: "actions", header: "Actions", align: "right" },
  ];

  const showLoading = coursesRes.loading && courses.length === 0;
  const showError = coursesRes.error !== null && courses.length === 0;

  return (
    <main className={styles["page"]}>
      <PageTitle
        eyebrow="Admin · Results"
        subtitle="Approve submitted marks, then lock a course to seal its results."
      >
        Results — Course Approvals
      </PageTitle>

      {notice !== null && <Banner variant={notice.tone}>{notice.text}</Banner>}

      {showLoading && <Loading />}
      {showError && <ErrorState onRetry={coursesRes.refetch}>{coursesRes.error}</ErrorState>}
      {!showLoading && !showError && courses.length === 0 && <Empty>No courses yet.</Empty>}
      {!showLoading && !showError && courses.length > 0 && (
        <Table<Row> columns={columns} rows={rows} emptyMessage="No courses yet." />
      )}

      <Modal
        open={approveTarget !== null}
        onClose={() => setApproveTarget(null)}
        title={approveTarget !== null ? `Approve marks for ${approveTarget.code}` : "Approve marks"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const target = approveTarget;
                if (target === null) return;
                setApproveTarget(null);
                void approve(target);
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p>
          Every submitted mark in {approveTarget?.code ?? "this course"} moves to approved. The
          change is recorded in the audit log.
        </p>
      </Modal>

      <UnlockModal
        open={unlockTarget !== null}
        onClose={() => setUnlockTarget(null)}
        title={unlockTarget !== null ? `Unlock marks for ${unlockTarget.code}` : "Unlock marks"}
        onConfirm={async (reason) => {
          if (unlockTarget === null) return;
          setBusyCourse(unlockTarget.id);
          try {
            await apiFetch(url(unlockTarget, "unlock"), {
              method: "POST",
              body: JSON.stringify({ reason }),
            });
            setNotice({ text: `Unlocked ${unlockTarget.code}`, tone: "success" });
            setUnlockTarget(null);
            window.location.reload();
          } catch (e) {
            setNotice({
              text: (e as { body?: { detail?: string } }).body?.detail ?? "unlock_failed",
              tone: "error",
            });
          } finally {
            setBusyCourse(null);
          }
        }}
      />
    </main>
  );
}

export default ResultsReviewPage;
