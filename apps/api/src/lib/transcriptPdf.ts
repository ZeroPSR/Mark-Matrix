import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface TranscriptCourse {
  code: string;
  title: string;
  credits: number;
  gradeLabel: string;
  gradePoint: number;
}

export interface TranscriptInput {
  institutionName: string;
  student: { fullName: string; rollNumber: string; programName: string; batchLabel: string };
  semester: { number: number; academicYear?: string };
  courses: TranscriptCourse[];
  sgpa: number;
  cgpa: number;
  totalCredits: number;
  generatedAt: string;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 60;

const COURSES_PER_PAGE = 14;
const TABLE_COLS_X = [0, 80, 330, 380, 440] as const;
const TABLE_HEADERS = ["Code", "Title", "Credits", "Grade", "Grade Pt"] as const;

/** Draws the institution header. Returns the next y position. */
const drawHeader = (
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  input: TranscriptInput,
): number => {
  page.drawText(input.institutionName, {
    x: MARGIN_X, y: A4_HEIGHT - MARGIN_TOP, size: 14, font: bold, color: rgb(0, 0, 0),
  });
  page.drawText("Transcript of Academic Record", {
    x: MARGIN_X, y: A4_HEIGHT - MARGIN_TOP - 18, size: 11, font, color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: MARGIN_X, y: A4_HEIGHT - MARGIN_TOP - 26 },
    end:   { x: A4_WIDTH - MARGIN_X, y: A4_HEIGHT - MARGIN_TOP - 26 },
    thickness: 0.5, color: rgb(0, 0, 0),
  });
  return A4_HEIGHT - MARGIN_TOP - 40;
};

const drawStudentBlock = (
  page: PDFPage,
  font: PDFFont,
  input: TranscriptInput,
  y: number,
): number => {
  const lines: [string, string][] = [
    ["Name",     input.student.fullName],
    ["Roll No.",  input.student.rollNumber],
    ["Program",   input.student.programName],
    ["Batch",     input.student.batchLabel],
    ["Semester",  `Semester ${input.semester.number}${input.semester.academicYear ? ` (${input.semester.academicYear})` : ""}`],
  ];
  for (const [label, value] of lines) {
    page.drawText(`${label}:`, { x: MARGIN_X, y, size: 11, font });
    page.drawText(value,        { x: MARGIN_X + 100, y, size: 11, font });
    y -= 16;
  }
  return y - 8;
};

const drawTableHeader = (page: PDFPage, bold: PDFFont, y: number): void => {
  for (let i = 0; i < TABLE_HEADERS.length; i++) {
    page.drawText(TABLE_HEADERS[i]!, { x: MARGIN_X + TABLE_COLS_X[i]!, y, size: 11, font: bold });
  }
  page.drawLine({
    start: { x: MARGIN_X, y: y - 4 },
    end:   { x: A4_WIDTH - MARGIN_X, y: y - 4 },
    thickness: 0.5,
  });
};

const drawFooter = (
  page: PDFPage,
  font: PDFFont,
  input: TranscriptInput,
  y: number,
): void => {
  page.drawText(`SGPA: ${input.sgpa.toFixed(2)}    CGPA: ${input.cgpa.toFixed(2)}    Total Credits: ${input.totalCredits}`, {
    x: MARGIN_X, y, size: 11, font,
  });
  const date = new Date(input.generatedAt);
  const dateStr = date.toISOString().slice(0, 10);
  page.drawText(`Generated on ${dateStr}`, {
    x: MARGIN_X, y: MARGIN_BOTTOM + 24, size: 9, font,
  });
  page.drawText("Authorized Signatory", {
    x: A4_WIDTH - MARGIN_X - 130, y: MARGIN_BOTTOM + 24, size: 9, font,
  });
  page.drawLine({
    start: { x: A4_WIDTH - MARGIN_X - 130, y: MARGIN_BOTTOM + 14 },
    end:   { x: A4_WIDTH - MARGIN_X, y: MARGIN_BOTTOM + 14 },
    thickness: 0.5,
  });
};

export async function renderTranscriptPdf(input: TranscriptInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = drawHeader(page, font, bold, input);
  y = drawStudentBlock(page, font, input, y);
  drawTableHeader(page, bold, y);
  y -= 18;

  let drawn = 0;
  for (const c of input.courses) {
    if (drawn > 0 && drawn % COURSES_PER_PAGE === 0) {
      page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
      y = drawHeader(page, font, bold, input);
      y -= 10;
      drawTableHeader(page, bold, y);
      y -= 18;
    }
    page.drawText(c.code,       { x: MARGIN_X + TABLE_COLS_X[0]!, y, size: 10, font });
    page.drawText(c.title.slice(0, 38), { x: MARGIN_X + TABLE_COLS_X[1]!, y, size: 10, font });
    page.drawText(String(c.credits),     { x: MARGIN_X + TABLE_COLS_X[2]!, y, size: 10, font });
    page.drawText(c.gradeLabel, { x: MARGIN_X + TABLE_COLS_X[3]!, y, size: 10, font });
    page.drawText(c.gradePoint.toFixed(2), { x: MARGIN_X + TABLE_COLS_X[4]!, y, size: 10, font });
    y -= 16;
    drawn += 1;
  }

  drawFooter(page, font, input, y - 8);
  return pdf.save();
}