import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { cn } from "../../lib/cn.js";
import styles from "./AcademicStructurePage.module.css";

interface Batch { id: string; name: string; startYear: number; }
interface Program { id: string; batchId: string; code: string; name: string; }
interface Semester { id: string; programId: string; number: number; }
interface Course { id: string; semesterId: string; code: string; title: string; credits: number; }

export function AcademicStructurePage(): JSX.Element {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<string | null>(null);

  const batches = useResource<{ data: Batch[] }>(ROUTES_CYCLE_2.adminBatches);
  const programs = useResource<{ data: Program[] }>(
    batchId !== null ? `${ROUTES_CYCLE_2.adminPrograms}?batchId=${batchId}` : null,
  );
  const semesters = useResource<{ data: Semester[] }>(
    programId !== null ? `${ROUTES_CYCLE_2.adminSemesters}?programId=${programId}` : null,
  );
  const courses = useResource<{ data: Course[] }>(
    semesterId !== null ? `${ROUTES_CYCLE_2.adminCourses}?semesterId=${semesterId}` : null,
  );

  return (
    <article className="academic-page">
      <PageTitle eyebrow="Admin · Academic structure">Academic Structure</PageTitle>
      <div className={styles["grid"]}>
        <nav className={styles["col"]} aria-label="Batches">
          <h2>Batches</h2>
          <ul>
            {(batches.data?.data ?? []).map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={cn(b.id === batchId && styles["active"])}
                  onClick={() => { setBatchId(b.id); setProgramId(null); setSemesterId(null); }}
                >
                  {b.name} ({b.startYear})
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <nav className={styles["col"]} aria-label="Programs">
          <h2>Programs</h2>
          <ul>
            {(programs.data?.data ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={cn(p.id === programId && styles["active"])}
                  onClick={() => { setProgramId(p.id); setSemesterId(null); }}
                >
                  {p.code} — {p.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <nav className={styles["col"]} aria-label="Semesters">
          <h2>Semesters</h2>
          <ul>
            {(semesters.data?.data ?? []).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={cn(s.id === semesterId && styles["active"])}
                  onClick={() => setSemesterId(s.id)}
                >
                  Semester {s.number}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section className={styles["col"]} aria-label="Courses">
          <h2>Courses</h2>
          <ul>
            {(courses.data?.data ?? []).map((c) => (
              <li key={c.id}>
                <code>{c.code}</code>
                {c.title} <small>({c.credits} cr)</small>
              </li>
            ))}
            {courses.data?.data?.length === 0 && semesterId !== null && (
              <li>No courses yet for this semester.</li>
            )}
          </ul>
        </section>
      </div>
    </article>
  );
}

export default AcademicStructurePage;