import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2, type GradesheetRow } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Badge } from "../../components/Badge/Badge.js";
import { Loading } from "../../components/Loading/Loading.js";
import { Empty } from "../../components/Empty/Empty.js";
import { DownloadTranscriptButton } from "../../components/DownloadTranscriptButton.js";
import styles from "./MyGradesheetPage.module.css";

interface GradesheetEnvelope { data: GradesheetRow | null }

export function MyGradesheetPage(): JSX.Element {
  const { batchId = "", programId = "", semId = "" } = useParams<{ batchId: string; programId: string; semId: string }>();
  const apiPath = ROUTES_CYCLE_2.studentGradesheetPath("student", batchId, programId, semId);
  const res = useResource<GradesheetEnvelope>(apiPath);

  if (res.loading) return <Loading />;
  if (res.error === "not_found" || res.data?.data === null || res.data?.data === undefined)
    return <Empty>Gradesheet not available yet — your semester's results are still being finalised.</Empty>;

  const g = res.data.data;
  const status = g.status;
  return (
    <article className="grd">
      <PageTitle eyebrow="Student · Gradesheet">My Gradesheet — Semester {g.semId}</PageTitle>
      <div className={styles["row"]}>
        <Badge variant={status === "published" ? "published" : status === "locked" ? "locked" : "draft"}>{status}</Badge>
        {g.publishedAt !== null && <span className={styles["published"]}>Published on {g.publishedAt}</span>}
      </div>
      <dl className={styles["meta"]}>
        <dt>SGPA</dt>             <dd>{g.sgpa?.toFixed(2) ?? "—"}</dd>
        <dt>Total credits</dt>    <dd>{g.totalCredits ?? "—"}</dd>
        <dt>Courses graded</dt>   <dd>{g.courseCount ?? "—"}</dd>
      </dl>
      <div className={styles["actions"]}>
        <DownloadTranscriptButton
          url={ROUTES_CYCLE_2.studentTranscript("student", batchId, programId, semId)}
          label="Download Transcript"
          disabled={status !== "published"}
        />
      </div>
    </article>
  );
}