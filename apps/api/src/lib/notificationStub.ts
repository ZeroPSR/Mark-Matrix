/**
 * Lightweight publish notification stub. Cycle 8 wires this to a real
 * in-app notification channel; for now it logs one structured line per
 * publish action. The shape is stable so tests can assert on it.
 */
export function notifyGradesheetPublished(args: {
  semId: string;
  studentCount: number;
  totalCredits: number;
}): void {
  // Single line, parseable in tests via grep.
  console.log(
    `[notify] gradesheet_published semId=${args.semId} studentCount=${args.studentCount} totalCredits=${args.totalCredits}`,
  );
}