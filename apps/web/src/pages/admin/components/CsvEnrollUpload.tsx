import { useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import { parseEnrollCsv, ROUTES_CYCLE_2 } from "@mark-matrix/shared";

export interface CsvEnrollUploadProps {
  semId: string;
  onComplete?: () => void;
}

export function CsvEnrollUpload({ semId, onComplete }: CsvEnrollUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ rows: unknown[]; errors: unknown[] } | null>(null);
  const [serverReport, setServerReport] = useState<{ enrolled: number; errors: unknown[] } | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const onPick = async (f: File): Promise<void> => {
    setFile(f);
    const text = await f.text();
    setPreview(parseEnrollCsv(text));
    setServerReport(null);
  };

  const submit = async (): Promise<void> => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const report = await apiFetch<{ enrolled: number; errors: unknown[] }>(
        ROUTES_CYCLE_2.adminBulkEnroll,
        { method: "POST", body: JSON.stringify({ semId, csv: text }) },
      );
      setServerReport(report);
      onComplete?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="csv-enroll">
      <input
        type="file"
        accept=".csv,text/csv"
        data-testid="csv-input"
        onChange={(e) => { if (e.target.files?.[0]) void onPick(e.target.files[0]); }}
      />
      {preview && (
        <div className="csv-enroll__preview">
          <p>{preview.rows.length} valid rows, {preview.errors.length} parse errors</p>
        </div>
      )}
      <button onClick={() => void submit()} disabled={!file || busy}>Upload</button>
      {serverReport && (
        <div className="csv-enroll__report">
          <p>Enrolled: {serverReport.enrolled}</p>
          <ul>
            {serverReport.errors.map((e, i) => <li key={i}>{JSON.stringify(e)}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}