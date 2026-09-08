import { describe, it, expect } from "vitest";
import { parseMarksCsv } from "./marksCsv.js";

describe("parseMarksCsv", () => {
  it("returns the row index (1-based) plus parsed fields for valid rows", () => {
    const r = parseMarksCsv(
      "roll_number,exam_type,marks_obtained\n23BCA001,midterm,27\n23BCA002,midterm,30\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { row: 2, rollNumber: "23BCA001", examType: "midterm", marksObtained: 27 },
      { row: 3, rollNumber: "23BCA002", examType: "midterm", marksObtained: 30 },
    ]);
  });

  it("trims whitespace and uppercases roll_number but preserves exam_type case", () => {
    const r = parseMarksCsv(
      "roll_number,exam_type,marks_obtained\n  23bca001 ,Midterm , 27 \n",
    );
    expect(r.rows).toEqual([
      { row: 2, rollNumber: "23BCA001", examType: "Midterm", marksObtained: 27 },
    ]);
    expect(r.errors).toEqual([]);
  });

  it("matches the header case-insensitively", () => {
    const r = parseMarksCsv("ROLL_NUMBER,EXAM_TYPE,MARKS_OBTAINED\nA1,final,70\n");
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("reports missing_required_column when no roll_number column exists", () => {
    const r = parseMarksCsv("foo,bar\n1,2\n");
    expect(r.rows).toEqual([]);
    expect(r.errors[0]?.reason).toBe("missing_required_column");
  });

  it("reports missing_required_column when exam_type column is absent", () => {
    const r = parseMarksCsv("roll_number,marks_obtained\nA1,30\n");
    expect(r.rows).toEqual([]);
    expect(r.errors[0]?.reason).toBe("missing_required_column");
  });

  it("reports missing_required_column when marks_obtained column is absent", () => {
    const r = parseMarksCsv("roll_number,exam_type\nA1,midterm\n");
    expect(r.rows).toEqual([]);
    expect(r.errors[0]?.reason).toBe("missing_required_column");
  });

  it("reports invalid_marks when marks_obtained is not a number", () => {
    const r = parseMarksCsv(
      "roll_number,exam_type,marks_obtained\nA1,midterm,abc\n",
    );
    expect(r.rows).toEqual([]);
    expect(r.errors[0]?.row).toBe(2);
    expect(r.errors[0]?.reason).toBe("invalid_marks");
  });

  it("reports validation_failed when roll_number is blank", () => {
    const r = parseMarksCsv(
      "roll_number,exam_type,marks_obtained\n ,midterm,20\n",
    );
    expect(r.rows).toEqual([]);
    expect(r.errors[0]?.row).toBe(2);
    expect(r.errors[0]?.reason).toBe("validation_failed");
  });

  it("reports validation_failed when exam_type is blank", () => {
    const r = parseMarksCsv(
      "roll_number,exam_type,marks_obtained\nA1,,20\n",
    );
    expect(r.rows).toEqual([]);
    expect(r.errors[0]?.row).toBe(2);
    expect(r.errors[0]?.reason).toBe("validation_failed");
  });

  it("reports invalid_marks for negative marks", () => {
    const r = parseMarksCsv(
      "roll_number,exam_type,marks_obtained\nA1,midterm,-5\n",
    );
    expect(r.rows).toEqual([]);
    expect(r.errors[0]?.reason).toBe("invalid_marks");
  });

  it("accepts 0 marks_obtained", () => {
    const r = parseMarksCsv(
      "roll_number,exam_type,marks_obtained\nA1,midterm,0\n",
    );
    expect(r.rows).toEqual([
      { row: 2, rollNumber: "A1", examType: "midterm", marksObtained: 0 },
    ]);
    expect(r.errors).toEqual([]);
  });

  it("skips blank lines silently when there is data", () => {
    const r = parseMarksCsv(
      "roll_number,exam_type,marks_obtained\n\nA1,midterm,20\n\n",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("returns per-row errors so valid and invalid rows are not mixed in output", () => {
    const r = parseMarksCsv(
      "roll_number,exam_type,marks_obtained\nA1,midterm,20\nA2,midterm,xyz\nA3,midterm,25\n",
    );
    expect(r.rows).toHaveLength(2);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.row).toBe(3);
    expect(r.errors[0]?.reason).toBe("invalid_marks");
  });
});
