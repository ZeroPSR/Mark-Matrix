import { useState } from "react";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";

interface Batch { id: string; name: string; startYear: number; }
interface Program { id: string; batchId: string; code: string; name: string; }
interface Semester { id: string; programId: string; number: number; }
interface Course { id: string; semesterId: string; code: string; title: string; credits: number; }

export function AcademicStructurePage() {
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
    <main className="academic-page">
      <h1>Academic Structure</h1>
      <div className="academic-page__grid">
        <nav className="academic-page__col">
          <h2>Batches</h2>
          <ul>
            {(batches.data?.data ?? []).map((b) => (
              <li key={b.id}>
                <button
                  className={b.id === batchId ? "active" : ""}
                  onClick={() => { setBatchId(b.id); setProgramId(null); setSemesterId(null); }}
                >{b.name} ({b.startYear})</button>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="academic-page__col">
          <h2>Programs</h2>
          <ul>
            {(programs.data?.data ?? []).map((p) => (
              <li key={p.id}>
                <button
                  className={p.id === programId ? "active" : ""}
                  onClick={() => { setProgramId(p.id); setSemesterId(null); }}
                >{p.code} — {p.name}</button>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="academic-page__col">
          <h2>Semesters</h2>
          <ul>
            {(semesters.data?.data ?? []).map((s) => (
              <li key={s.id}>
                <button
                  className={s.id === semesterId ? "active" : ""}
                  onClick={() => setSemesterId(s.id)}
                >Semester {s.number}</button>
              </li>
            ))}
          </ul>
        </nav>
        <section className="academic-page__col academic-page__col--wide">
          <h2>Courses</h2>
          <ul>
            {(courses.data?.data ?? []).map((c) => (
              <li key={c.id}>{c.code} — {c.title} ({c.credits} cr)</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}