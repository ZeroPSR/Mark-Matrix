import { useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import { parseEnrollCsv, ROUTES_CYCLE_2, type ParsedEnrollCsv } from "@mark-matrix/shared";
import { Banner } from "../../../components/Banner/Banner.js";
import { Button } from "../../../components/Button/Button.js";
import { File as FilePicker } from "../../../components/File/File.js";
import styles from "./CsvEnrollUpload.module.css";

export interface CsvEnrollUploadProps {
  semId: string;
  onComplete?: () => void;
}

export function CsvEnrollUpload({ semId, onComplete }: CsvEnrollUploadProps): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedEnrollCsv | null>(null);
  const [serverReport, setServerReport] = useState<{ enrolled: number; errors: unknown[] } | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const onPick = async (f: File): Promise<void> => {
    setFile(f);
    const text = await f.text();
    setPreview(parseEnrollCsv(text));
    setServerReport(null);
  };

  // The File component reports `null` when the chosen file is removed.
  const onFileChange = (f: File | null): void => {
    if (f === null) {
      setFile(null);
      setPreview(null);
      setServerReport(null);
      return;
    }
    void onPick(f);
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

  const errorCount = serverReport?.errors.length ?? 0;

  return (
    <div className={styles["wrap"]}>
      <FilePicker label="CSV file" accept=".csv,text/csv" onChange={onFileChange} />
      {preview !== null && (
        <p className={styles["preview"]}>
          {preview.rows.length} valid rows, {preview.errors.length} parse errors
        </p>
      )}
      <Button
        variant="primary"
        onClick={() => void submit()}
        disabled={file === null || busy}
      >
        {busy ? "Uploading…" : "Upload"}
      </Button>
      {serverReport !== null && (
        <div className={styles["report"]}>
          {errorCount > 0 ? (
            <Banner variant="error" title="Bulk enrollment finished with errors">
              {serverReport.enrolled} enrolled, {errorCount} failed.
              <details className={styles["details"]}>
                <summary>Show error details</summary>
                <ul className={styles["errorList"]}>
                  {serverReport.errors.map((e, i) => <li key={i}>{JSON.stringify(e)}</li>)}
                </ul>
              </details>
            </Banner>
          ) : (
            <Banner variant="success" title="Bulk enrollment complete">
              {serverReport.enrolled} students enrolled.
            </Banner>
          )}
        </div>
      )}
    </div>
  );
}
