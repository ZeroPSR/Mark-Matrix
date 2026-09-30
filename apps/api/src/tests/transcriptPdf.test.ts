import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderTranscriptPdf, type TranscriptInput } from "../lib/transcriptPdf.js";

const sample: TranscriptInput = {
  institutionName: "Mark-Matrix Institute of Technology",
  student: { fullName: "Alice Anderson", rollNumber: "23BCA001", programName: "BCA", batchLabel: "2023-2026" },
  semester: { number: 1, academicYear: "2023-2024" },
  courses: [
    { code: "CS101", title: "Intro to Programming", credits: 4, gradeLabel: "A", gradePoint: 9 },
    { code: "CS102", title: "Discrete Maths",       credits: 3, gradeLabel: "B", gradePoint: 8 },
  ],
  sgpa: 8.67,
  cgpa: 8.67,
  totalCredits: 7,
  generatedAt: "2026-09-30T12:00:00Z",
};

describe("renderTranscriptPdf", () => {
  it("returns a non-empty Uint8Array", async () => {
    const bytes = await renderTranscriptPdf(sample);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("Review Focus 4 — output starts with %PDF- and parses via pdf-lib", async () => {
    const bytes = await renderTranscriptPdf(sample);
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    expect(head).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders to a single page when course count is small", async () => {
    const bytes = await renderTranscriptPdf(sample);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("splits to two pages when course count exceeds 14", async () => {
    const many: TranscriptInput = {
      ...sample,
      courses: Array.from({ length: 16 }, (_, i) => ({
        code: `CS${100 + i}`,
        title: `Course ${i + 1}`,
        credits: 3,
        gradeLabel: "A",
        gradePoint: 9,
      })),
    };
    const doc = await PDFDocument.load(await renderTranscriptPdf(many));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});