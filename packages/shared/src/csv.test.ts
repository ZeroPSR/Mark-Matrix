import { describe, it, expect } from "vitest";
import { parseCsv, parseEnrollCsv, toCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n4,5,6\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });
  it("handles quoted fields with embedded commas", () => {
    expect(parseCsv('a,b\n"1, 2",3\n')).toEqual([["a", "b"], ["1, 2", "3"]]);
  });
  it("handles quoted fields with embedded newlines", () => {
    expect(parseCsv('a,b\n"line1\nline2",x\n')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });
  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("strips a UTF-8 BOM if present", () => {
    expect(parseCsv("﻿a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
  it("returns a single-row result for header-only input", () => {
    expect(parseCsv("a,b,c\n")).toEqual([["a", "b", "c"]]);
  });
  it("preserves ragged trailing rows", () => {
    expect(parseCsv("a,b\n1,2,3\n4\n")).toEqual([
      ["a", "b"],
      ["1", "2", "3"],
      ["4"],
    ]);
  });
  it("treats double-quotes inside a quoted field as an escaped quote", () => {
    expect(parseCsv('a\n"he said ""hi"""\n')).toEqual([["a"], ['he said "hi"']]);
  });
});

describe("parseEnrollCsv", () => {
  it("returns the row index (1-based) and roll_number for valid rows", () => {
    const r = parseEnrollCsv("roll_number\n23BCA001\n23BCA002\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { row: 2, rollNumber: "23BCA001" },
      { row: 3, rollNumber: "23BCA002" },
    ]);
  });
  it("normalizes roll_number to uppercase and trims", () => {
    const r = parseEnrollCsv("roll_number\n  23bca001 \n");
    expect(r.rows[0]?.rollNumber).toBe("23BCA001");
  });
  it("matches the header case-insensitively by name", () => {
    const r = parseEnrollCsv("ROLL_NUMBER\n23BCA001\n");
    expect(r.rows).toHaveLength(1);
  });
  it("reports missing_required_column when no roll_number column exists", () => {
    const r = parseEnrollCsv("foo\n1\n");
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]?.reason).toBe("missing_required_column");
  });
  it("skips blank lines silently", () => {
    const r = parseEnrollCsv("roll_number\n\n23BCA001\n\n");
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
  });
  it("reports validation_failed for an empty roll number with a row number", () => {
    const r = parseEnrollCsv("roll_number\n\n");
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]?.reason).toBe("validation_failed");
    expect(r.errors[0]?.row).toBe(2);
  });
});

describe("toCsv", () => {
  it("writes a header row + data rows separated by CRLF with trailing CRLF", () => {
    const out = toCsv([
      ["name", "age"],
      ["alice", "30"],
      ["bob", "25"],
    ]);
    expect(out).toBe("name,age\r\nalice,30\r\nbob,25\r\n");
  });

  it("emits an empty string for an empty input array", () => {
    expect(toCsv([])).toBe("");
  });

  it("quotes and escapes a field with an embedded comma", () => {
    expect(toCsv([["a", "b,c"]])).toBe('a,"b,c"\r\n');
  });

  it("quotes and escapes a field with an embedded double-quote", () => {
    expect(toCsv([['he said "hi"']])).toBe('"he said ""hi"""\r\n');
  });

  it("quotes and escapes a field with an embedded newline", () => {
    expect(toCsv([["line1\nline2"]])).toBe('"line1\nline2"\r\n');
  });

  it("renders null as an empty field", () => {
    expect(toCsv([["a", null, "c"]])).toBe("a,,c\r\n");
  });

  it("renders numbers without quoting when safe", () => {
    expect(toCsv([["n", 42]])).toBe("n,42\r\n");
  });

  it("roundtrips with parseCsv for a typical analytics report", () => {
    const rows = [
      ["student", "percentage", "grade"],
      ["23BCA001", "92.5", "A"],
      ["23BCA002", "67.0", "C"],
    ];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed).toEqual(rows);
  });
});
