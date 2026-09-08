import { describe, it, expect } from "vitest";
import {
  marksStatusSchema,
  upsertMarksItemSchema,
  upsertMarksSchema,
  patchMarksSchema,
  bulkMarksSchema,
} from "./marks.js";

describe("marksStatusSchema", () => {
  it("accepts draft and submitted", () => {
    expect(marksStatusSchema.parse("draft")).toBe("draft");
    expect(marksStatusSchema.parse("submitted")).toBe("submitted");
  });
  it("rejects other values", () => {
    expect(() => marksStatusSchema.parse("approved")).toThrow();
    expect(() => marksStatusSchema.parse("")).toThrow();
  });
});

describe("upsertMarksItemSchema", () => {
  it("accepts a valid item", () => {
    const r = upsertMarksItemSchema.parse({
      studentId: "11111111-1111-1111-1111-111111111111",
      examType: "midterm",
      marksObtained: 27,
    });
    expect(r.examType).toBe("midterm");
    expect(r.marksObtained).toBe(27);
  });

  it("rejects negative marks_obtained", () => {
    expect(() =>
      upsertMarksItemSchema.parse({
        studentId: "11111111-1111-1111-1111-111111111111",
        examType: "midterm",
        marksObtained: -1,
      }),
    ).toThrow();
  });

  it("rejects NaN and Infinity", () => {
    expect(() =>
      upsertMarksItemSchema.parse({
        studentId: "11111111-1111-1111-1111-111111111111",
        examType: "midterm",
        marksObtained: Number.NaN,
      }),
    ).toThrow();
    expect(() =>
      upsertMarksItemSchema.parse({
        studentId: "11111111-1111-1111-1111-111111111111",
        examType: "midterm",
        marksObtained: Number.POSITIVE_INFINITY,
      }),
    ).toThrow();
  });

  it("accepts 0 marks", () => {
    expect(() =>
      upsertMarksItemSchema.parse({
        studentId: "11111111-1111-1111-1111-111111111111",
        examType: "midterm",
        marksObtained: 0,
      }),
    ).not.toThrow();
  });

  it("rejects blank exam_type", () => {
    expect(() =>
      upsertMarksItemSchema.parse({
        studentId: "11111111-1111-1111-1111-111111111111",
        examType: "   ",
        marksObtained: 10,
      }),
    ).toThrow();
  });

  it("rejects non-uuid studentId", () => {
    expect(() =>
      upsertMarksItemSchema.parse({
        studentId: "not-a-uuid",
        examType: "midterm",
        marksObtained: 10,
      }),
    ).toThrow();
  });
});

describe("upsertMarksSchema", () => {
  it("accepts a non-empty entries array", () => {
    const r = upsertMarksSchema.parse({
      entries: [
        {
          studentId: "11111111-1111-1111-1111-111111111111",
          examType: "midterm",
          marksObtained: 10,
        },
      ],
    });
    expect(r.entries).toHaveLength(1);
  });

  it("rejects an empty entries array", () => {
    expect(() => upsertMarksSchema.parse({ entries: [] })).toThrow();
  });

  it("rejects more than 500 entries", () => {
    const entries = Array.from({ length: 501 }, () => ({
      studentId: "11111111-1111-1111-1111-111111111111",
      examType: "midterm",
      marksObtained: 0,
    }));
    expect(() => upsertMarksSchema.parse({ entries })).toThrow();
  });
});

describe("patchMarksSchema", () => {
  it("accepts a non-negative marksObtained", () => {
    expect(patchMarksSchema.parse({ marksObtained: 12 }).marksObtained).toBe(12);
    expect(patchMarksSchema.parse({ marksObtained: 0 }).marksObtained).toBe(0);
  });
  it("rejects negative marksObtained", () => {
    expect(() => patchMarksSchema.parse({ marksObtained: -1 })).toThrow();
  });
});

describe("bulkMarksSchema", () => {
  it("requires non-empty csv string", () => {
    const r = bulkMarksSchema.parse({ csv: "roll_number,exam_type,marks_obtained\nA1,mid,10\n" });
    expect(r.csv.length).toBeGreaterThan(0);
  });
  it("rejects empty csv", () => {
    expect(() => bulkMarksSchema.parse({ csv: "" })).toThrow();
  });
});
