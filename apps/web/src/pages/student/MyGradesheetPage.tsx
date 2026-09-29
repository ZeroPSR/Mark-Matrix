import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2, type GradesheetRow } from "@mark-matrix/shared";

interface GradesheetEnvelope {
  data: GradesheetRow | null;
}

export function MyGradesheetPage(): JSX.Element {
  const params = useParams<{ batchId: string; programId: string; semId: string }>();
  const { batchId = "", programId = "", semId = "" } = params;
  const apiPath = ROUTES_CYCLE_2.studentGradesheetPath("student", batchId, programId, semId);
  const gradesheet = useResource<GradesheetEnvelope>(apiPath);

  if (gradesheet.loading) {
    return (
      <main className="my-gradesheet">
        <h1>My Gradesheet</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (
    gradesheet.error === "not_found" ||
    gradesheet.data === null ||
    gradesheet.data?.data === null ||
    gradesheet.data?.data === undefined
  ) {
    return (
      <main className="my-gradesheet">
        <h1>My Gradesheet</h1>
        <p className="my-gradesheet__not-available">
          Gradesheet not available yet — your semester's results are still being finalised.
        </p>
      </main>
    );
  }

  const g = gradesheet.data.data;
  return (
    <main className="my-gradesheet">
      <h1>My Gradesheet — Semester {g.semId}</h1>
      <dl>
        <dt>Status</dt>
        <dd>{g.status}</dd>
        <dt>SGPA</dt>
        <dd>{g.sgpa?.toFixed(2) ?? "—"}</dd>
        <dt>Total credits</dt>
        <dd>{g.totalCredits ?? "—"}</dd>
        <dt>Courses graded</dt>
        <dd>{g.courseCount ?? "—"}</dd>
      </dl>
      {g.publishedAt !== null && <p>Published on {g.publishedAt}</p>}
    </main>
  );
}
