import { describe, it, expect } from "vitest";
import {
  computePassRate,
  topN,
  computeAttendancePct,
  topLimitSchema,
  attendanceThresholdSchema,
} from "./analytics.js";

describe("computePassRate", () => {
  it("returns 0/0/0 for empty input", () => {
    expect(computePassRate([])).toEqual({ total: 0, passing: 0, rate: 0 });
  });

  it("counts passing rows and computes the rate rounded to 2 decimals", () => {
    expect(computePassRate([
      { isPassing: true }, { isPassing: true }, { isPassing: true }, { isPassing: false },
    ])).toEqual({ total: 4, passing: 3, rate: 75 });
  });

  it("returns rate 0 when nobody passes", () => {
    expect(computePassRate([{ isPassing: false }, { isPassing: false }]))
      .toEqual({ total: 2, passing: 0, rate: 0 });
  });

  it("rounds to 2 decimals", () => {
    // 2 of 3 pass: 66.666... -> 66.67
    expect(computePassRate([{ isPassing: true }, { isPassing: true }, { isPassing: false }]))
      .toEqual({ total: 3, passing: 2, rate: 66.67 });
  });
});

describe("topN", () => {
  type Row = { id: string; score: number };
  it("returns the top N by score descending", () => {
    const rows: Row[] = [
      { id: "a", score: 10 },
      { id: "b", score: 30 },
      { id: "c", score: 20 },
    ];
    expect(topN(rows, (r) => r.score, 2).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("preserves input order on ties", () => {
    const rows: Row[] = [
      { id: "a", score: 10 },
      { id: "b", score: 10 },
      { id: "c", score: 5 },
    ];
    expect(topN(rows, (r) => r.score, 5).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when limit is 0 — capped by caller", () => {
    expect(topN<Row>([], () => 0, 0)).toEqual([]);
  });

  it("clamps to input length when limit > length", () => {
    const rows: Row[] = [{ id: "a", score: 1 }];
    expect(topN(rows, (r) => r.score, 10)).toEqual([{ id: "a", score: 1 }]);
  });
});

describe("computeAttendancePct", () => {
  it("returns 0 when total is 0", () => {
    expect(computeAttendancePct(0, 0)).toBe(0);
  });

  it("computes percentage to 2 decimals", () => {
    expect(computeAttendancePct(7, 10)).toBe(70);
    expect(computeAttendancePct(1, 3)).toBe(33.33);
  });
});

describe("topLimitSchema", () => {
  it("defaults to 5 when missing", () => {
    expect(topLimitSchema.parse(undefined)).toBe(5);
  });
  it("coerces strings to ints", () => {
    expect(topLimitSchema.parse("10")).toBe(10);
  });
  it("rejects 0 and >50", () => {
    expect(() => topLimitSchema.parse(0)).toThrow();
    expect(() => topLimitSchema.parse(51)).toThrow();
  });
});

describe("attendanceThresholdSchema", () => {
  it("defaults to 75 when missing", () => {
    expect(attendanceThresholdSchema.parse(undefined)).toBe(75);
  });
  it("accepts 0..100 inclusive", () => {
    expect(attendanceThresholdSchema.parse(0)).toBe(0);
    expect(attendanceThresholdSchema.parse(100)).toBe(100);
  });
  it("rejects out-of-range", () => {
    expect(() => attendanceThresholdSchema.parse(-1)).toThrow();
    expect(() => attendanceThresholdSchema.parse(101)).toThrow();
  });
});