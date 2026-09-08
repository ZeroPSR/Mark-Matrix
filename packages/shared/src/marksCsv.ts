import { parseCsv } from "./csv.js";

export interface ParsedMarksRow {
  row: number;
  rollNumber: string;
  examType: string;
  marksObtained: number;
}

export interface ParsedMarksError {
  row: number;
  rollNumber?: string;
  reason:
    | "missing_required_column"
    | "validation_failed"
    | "invalid_marks";
}

export interface ParsedMarksCsv {
  rows: ParsedMarksRow[];
  errors: ParsedMarksError[];
}

const findColumn = (header: string[], name: string): number =>
  header.findIndex((h) => h.trim().toLowerCase() === name);

export function parseMarksCsv(text: string): ParsedMarksCsv {
  const all = parseCsv(text);
  if (all.length === 0) return { rows: [], errors: [] };

  const header = all[0] ?? [];
  const rollIdx = findColumn(header, "roll_number");
  const examIdx = findColumn(header, "exam_type");
  const marksIdx = findColumn(header, "marks_obtained");

  if (rollIdx === -1 || examIdx === -1 || marksIdx === -1) {
    return { rows: [], errors: [{ row: 1, reason: "missing_required_column" }] };
  }

  // Same "noise between rows" rule as the enroll parser.
  const hasData = all
    .slice(1)
    .some((line) => !(line.length === 1 && line[0] === ""));

  const out: ParsedMarksCsv = { rows: [], errors: [] };
  for (let r = 1; r < all.length; r++) {
    const line = all[r] ?? [];
    if (hasData && line.length === 1 && line[0] === "") continue;

    const rawRoll = line[rollIdx];
    const rawExam = line[examIdx];
    const rawMarks = line[marksIdx];

    const rollNumber = rawRoll !== undefined ? rawRoll.trim().toUpperCase() : "";
    const examType = rawExam !== undefined ? rawExam.trim() : "";

    if (rollNumber.length === 0 || examType.length === 0) {
      out.errors.push({ row: r + 1, reason: "validation_failed" });
      continue;
    }

    const parsedMarks = Number(rawMarks);
    if (rawMarks === undefined || !Number.isFinite(parsedMarks) || parsedMarks < 0) {
      out.errors.push({ row: r + 1, rollNumber, reason: "invalid_marks" });
      continue;
    }

    out.rows.push({
      row: r + 1,
      rollNumber,
      examType,
      marksObtained: parsedMarks,
    });
  }
  return out;
}
