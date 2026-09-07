import { describe, it, expect } from "vitest";
import {
  deriveGrade,
  computeCourseGrade,
  computeSgpa,
  computeCgpa,
  GradeInputError,
  GradeOutOfRangeError,
  GradeMissingCreditError,
  type GradeBand,
  type CourseMarks,
} from "./grades.js";

// Sample scheme: A+ [95,100]=10, A [85,95)=9, B [70,85)=8, C [55,70)=7,
// D [40,55)=6, F [0,40)=0 (not passing).
const bands: GradeBand[] = [
  { gradeLabel: "A+", minMarks: 95, maxMarks: 100, gradePoint: 10, isPassing: true },
  { gradeLabel: "A",  minMarks: 85, maxMarks: 95,  gradePoint: 9,  isPassing: true },
  { gradeLabel: "B",  minMarks: 70, maxMarks: 85,  gradePoint: 8,  isPassing: true },
  { gradeLabel: "C",  minMarks: 55, maxMarks: 70,  gradePoint: 7,  isPassing: true },
  { gradeLabel: "D",  minMarks: 40, maxMarks: 55,  gradePoint: 6,  isPassing: true },
  { gradeLabel: "F",  minMarks: 0,  maxMarks: 40,  gradePoint: 0,  isPassing: false },
];

describe("deriveGrade", () => {
  it("selects band at exact minMarks (boundary)", () => {
    expect(deriveGrade(95, bands).gradeLabel).toBe("A+");
    expect(deriveGrade(85, bands).gradeLabel).toBe("A");
    expect(deriveGrade(70, bands).gradeLabel).toBe("B");
  });

  it("selects band at exact maxMarks (boundary)", () => {
    expect(deriveGrade(100, bands).gradeLabel).toBe("A+");
    expect(deriveGrade(95, bands).gradeLabel).toBe("A+"); // 95 == A+ min AND A max → A+ wins (higher min)
    expect(deriveGrade(55, bands).gradeLabel).toBe("C");
  });

  it("selects band strictly between min and max", () => {
    expect(deriveGrade(78.5, bands).gradeLabel).toBe("B");
    expect(deriveGrade(62, bands).gradeLabel).toBe("C");
    expect(deriveGrade(35, bands).gradeLabel).toBe("F");
  });

  it("returns isPassing=false for F band", () => {
    expect(deriveGrade(35, bands).isPassing).toBe(false);
  });

  it("returns isPassing=true for D and above", () => {
    expect(deriveGrade(42, bands).isPassing).toBe(true);
  });

  it("throws GradeOutOfRangeError above 100", () => {
    expect(() => deriveGrade(101, bands)).toThrow(GradeOutOfRangeError);
  });

  it("throws GradeOutOfRangeError below 0", () => {
    expect(() => deriveGrade(-0.01, bands)).toThrow(GradeOutOfRangeError);
  });

  it("throws GradeInputError on empty bands", () => {
    expect(() => deriveGrade(50, [])).toThrow(GradeInputError);
  });

  it("throws GradeInputError if bands leave a gap above the top band", () => {
    const gappy: GradeBand[] = [
      { gradeLabel: "A", minMarks: 80, maxMarks: 90, gradePoint: 9, isPassing: true },
      { gradeLabel: "F", minMarks: 0,  maxMarks: 40, gradePoint: 0, isPassing: false },
    ];
    expect(() => deriveGrade(95, gappy)).toThrow(GradeInputError);
  });

  it("throws GradeInputError if bands have a gap inside [0,100]", () => {
    const gappy: GradeBand[] = [
      { gradeLabel: "A", minMarks: 80, maxMarks: 100, gradePoint: 9, isPassing: true },
      { gradeLabel: "C", minMarks: 50, maxMarks: 70, gradePoint: 7, isPassing: true },
      { gradeLabel: "F", minMarks: 0,  maxMarks: 40, gradePoint: 0, isPassing: false },
    ];
    expect(() => deriveGrade(75, gappy)).toThrow(GradeInputError);
  });
});

describe("computeCourseGrade", () => {
  it("sums marks across exam types and computes percentage", () => {
    const marks: CourseMarks[] = [
      { marksObtained: 32, maxMarks: 40 },  // mid-sem 80%
      { marksObtained: 48, maxMarks: 60 },  // end-sem 80%
    ];
    const grade = computeCourseGrade(marks, bands);
    expect(grade.totalObtained).toBe(80);
    expect(grade.totalMax).toBe(100);
    expect(grade.percentage).toBe(80);
    expect(grade.gradeLabel).toBe("B"); // 80 → B band [70,85)
    expect(grade.gradePoint).toBe(8);
  });

  it("throws GradeInputError on empty marks", () => {
    expect(() => computeCourseGrade([], bands)).toThrow(GradeInputError);
  });

  it("rounds percentage to 2 decimals", () => {
    const marks: CourseMarks[] = [
      { marksObtained: 33, maxMarks: 40 },
      { marksObtained: 49, maxMarks: 60 },
    ];
    // total = 82/100 = 82.00
    expect(computeCourseGrade(marks, bands).percentage).toBe(82);
  });

  it("rounds percentage to 2 decimals when non-integer", () => {
    const marks: CourseMarks[] = [
      { marksObtained: 31, maxMarks: 40 }, // 77.5%
      { marksObtained: 49, maxMarks: 60 }, // 81.666...%
    ];
    // combined = 80/100 = 80.00
    expect(computeCourseGrade(marks, bands).percentage).toBe(80);
  });
});

describe("computeSgpa", () => {
  // 5 courses, varying credits:
  //   (4cr, gp 9) (3cr, gp 8) (3cr, gp 7) (2cr, gp 10) (4cr, gp 6)
  //   sum = 4+3+3+2+4 = 16 credits
  //   sum(credit*gp) = 36 + 24 + 21 + 20 + 24 = 125
  //   sgpa = 125 / 16 = 7.8125 → rounds to 7.81
  it("weighted by credits across 5 courses", () => {
    const grades = [
      { courseId: "c1", gradePoint: 9 },
      { courseId: "c2", gradePoint: 8 },
      { courseId: "c3", gradePoint: 7 },
      { courseId: "c4", gradePoint: 10 },
      { courseId: "c5", gradePoint: 6 },
    ];
    const credits = new Map([
      ["c1", 4], ["c2", 3], ["c3", 3], ["c4", 2], ["c5", 4],
    ]);
    expect(computeSgpa(grades, credits)).toBe(7.81);
  });

  it("returns 0 for empty input", () => {
    expect(computeSgpa([], new Map())).toBe(0);
  });

  it("throws GradeMissingCreditError if a course lacks credit", () => {
    const grades = [{ courseId: "c1", gradePoint: 9 }];
    const credits = new Map<string, number>(); // c1 missing
    expect(() => computeSgpa(grades, credits)).toThrow(GradeMissingCreditError);
  });

  it("throws GradeInputError on negative grade point", () => {
    const grades = [{ courseId: "c1", gradePoint: -1 }];
    const credits = new Map([["c1", 3]]);
    expect(() => computeSgpa(grades, credits)).toThrow(GradeInputError);
  });

  it("throws GradeInputError on NaN grade point", () => {
    const grades = [{ courseId: "c1", gradePoint: Number.NaN }];
    const credits = new Map([["c1", 3]]);
    expect(() => computeSgpa(grades, credits)).toThrow(GradeInputError);
  });
});

describe("computeCgpa", () => {
  it("arithmetic mean across 3 semesters", () => {
    // (8.4 + 7.8 + 9.1) / 3 = 25.3 / 3 = 8.4333... → 8.43
    expect(computeCgpa([8.4, 7.8, 9.1])).toBe(8.43);
  });

  it("returns 0 for empty input", () => {
    expect(computeCgpa([])).toBe(0);
  });

  it("throws GradeInputError on NaN", () => {
    expect(() => computeCgpa([8.0, Number.NaN])).toThrow(GradeInputError);
  });

  it("throws GradeInputError on negative", () => {
    expect(() => computeCgpa([8.0, -1])).toThrow(GradeInputError);
  });
});
