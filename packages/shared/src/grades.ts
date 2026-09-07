// Pure compute for the grade engine. No DB access. Fully unit-testable.
// See docs/superpowers/specs/2026-09-07-grade-engine-design.md §4.1.

export class GradeInputError extends Error {
  readonly code = "grade_input_error";
}
export class GradeOutOfRangeError extends Error {
  readonly code = "grade_out_of_range";
}
export class GradeMissingSchemeError extends Error {
  readonly code = "grade_missing_scheme";
}
export class GradeMissingCreditError extends Error {
  readonly code = "grade_missing_credit";
}

export interface GradeBand {
  gradeLabel: string;
  minMarks: number;   // inclusive, 0-100
  maxMarks: number;   // inclusive, 0-100
  gradePoint: number; // 0-10
  isPassing: boolean;
}

export interface CourseMarks {
  marksObtained: number;
  maxMarks: number;
}

export interface CourseGrade {
  totalObtained: number;
  totalMax: number;
  percentage: number;
  gradeLabel: string;
  gradePoint: number;
  isPassing: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Throws if any band is non-finite or out of [0,100] numeric bounds. */
function assertBandNumeric(b: GradeBand): void {
  for (const [name, v] of [
    ["minMarks", b.minMarks],
    ["maxMarks", b.maxMarks],
    ["gradePoint", b.gradePoint],
  ] as const) {
    if (!Number.isFinite(v)) {
      throw new GradeInputError(`band ${b.gradeLabel}: ${name} must be finite`);
    }
  }
  if (b.minMarks < 0 || b.maxMarks > 100 || b.minMarks > b.maxMarks) {
    throw new GradeInputError(`band ${b.gradeLabel}: out-of-range bounds`);
  }
}

/** Throws if bands do not cover [0, 100] contiguously. */
function assertBandsCoverAll(bands: readonly GradeBand[]): void {
  if (bands.length === 0) throw new GradeInputError("bands must be non-empty");
  for (const b of bands) assertBandNumeric(b);
  // Sort ascending by minMarks for gap detection.
  const sorted = [...bands].sort((a, b) => a.minMarks - b.minMarks);
  if (sorted[0]!.minMarks !== 0) {
    throw new GradeInputError("bands must cover from 0");
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    const nxt = sorted[i + 1]!;
    // Adjacent bands: cur.max must equal nxt.min - 1 epsilon-free? No — we want
    // inclusive on min and exclusive on max within the band ordering. Use
    // cur.max + 0.01 == nxt.min to allow one band's max to abut the next
    // band's min at a single percentage point (so 85 belongs to A or B but
    // not both; tie broken by the higher band).
    if (nxt.minMarks - cur.maxMarks > 0.01) {
      throw new GradeInputError(
        `gap between ${cur.gradeLabel} (max ${cur.maxMarks}) and ${nxt.gradeLabel} (min ${nxt.minMarks})`,
      );
    }
  }
  if (sorted[sorted.length - 1]!.maxMarks !== 100) {
    throw new GradeInputError("bands must cover up to 100");
  }
}

/**
 * Look up the grade for a percentage against the supplied bands.
 * Bands must cover [0,100] contiguously; higher minMarks wins on boundary
 * ties (callers pass bands sorted by minMarks descending, which the
 * implementation uses).
 */
export function deriveGrade(
  percentage: number,
  bands: readonly GradeBand[],
): { gradeLabel: string; gradePoint: number; isPassing: boolean } {
  if (!Number.isFinite(percentage)) {
    throw new GradeInputError("percentage must be finite");
  }
  if (percentage < 0 || percentage > 100) {
    throw new GradeOutOfRangeError(`percentage ${percentage} out of [0,100]`);
  }
  assertBandsCoverAll(bands);
  // Bands sorted by minMarks DESC: first band where percentage >= minMarks.
  const descending = [...bands].sort((a, b) => b.minMarks - a.minMarks);
  for (const b of descending) {
    if (percentage >= b.minMarks) {
      return { gradeLabel: b.gradeLabel, gradePoint: b.gradePoint, isPassing: b.isPassing };
    }
  }
  // Unreachable when assertBandsCoverAll passes — defensive.
  throw new GradeInputError("no band matched");
}

/**
 * Sum marks across exam types for one course, derive percentage, look up grade.
 */
export function computeCourseGrade(
  marks: readonly CourseMarks[],
  bands: readonly GradeBand[],
): CourseGrade {
  if (marks.length === 0) throw new GradeInputError("marks must be non-empty");
  let totalObtained = 0;
  let totalMax = 0;
  for (const m of marks) {
    if (!Number.isFinite(m.marksObtained) || !Number.isFinite(m.maxMarks)) {
      throw new GradeInputError("marks must be finite");
    }
    if (m.maxMarks <= 0) throw new GradeInputError("maxMarks must be > 0");
    totalObtained += m.marksObtained;
    totalMax += m.maxMarks;
  }
  const percentage = round2((totalObtained / totalMax) * 100);
  const { gradeLabel, gradePoint, isPassing } = deriveGrade(percentage, bands);
  return { totalObtained, totalMax, percentage, gradeLabel, gradePoint, isPassing };
}

function assertGradePoint(name: string, gp: number): void {
  if (!Number.isFinite(gp)) {
    throw new GradeInputError(`${name} must be finite`);
  }
  if (gp < 0) throw new GradeInputError(`${name} must be non-negative`);
}

/**
 * Credit-weighted SGPA. Returns 0 for empty input.
 * Throws GradeMissingCreditError if any courseId is missing from credits.
 */
export function computeSgpa(
  courseGrades: readonly { courseId: string; gradePoint: number }[],
  credits: ReadonlyMap<string, number>,
): number {
  if (courseGrades.length === 0) return 0;
  let weighted = 0;
  let totalCredits = 0;
  for (const g of courseGrades) {
    assertGradePoint(`grade point for ${g.courseId}`, g.gradePoint);
    const c = credits.get(g.courseId);
    if (c === undefined) {
      throw new GradeMissingCreditError(`no credit recorded for course ${g.courseId}`);
    }
    if (!Number.isFinite(c) || c <= 0) {
      throw new GradeInputError(`credit for ${g.courseId} must be > 0`);
    }
    weighted += g.gradePoint * c;
    totalCredits += c;
  }
  return round2(weighted / totalCredits);
}

/**
 * Arithmetic-mean CGPA. Returns 0 for empty input.
 */
export function computeCgpa(sgpas: readonly number[]): number {
  if (sgpas.length === 0) return 0;
  for (const s of sgpas) assertGradePoint("sgpa", s);
  return round2(sgpas.reduce((a, b) => a + b, 0) / sgpas.length);
}
