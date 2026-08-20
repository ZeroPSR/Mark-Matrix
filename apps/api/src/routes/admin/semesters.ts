import {
  createSemesterSchema,
  patchSemesterSchema,
  type CreateSemester,
  type PatchSemester,
} from "@mark-matrix/shared";
import { createCrudHandlers } from "../../lib/crudFactory.js";

export interface Semester {
  id: string;
  programId: string;
  number: number;
  createdAt: string;
  updatedAt: string;
}

type SemesterRow = {
  id: string;
  program_id: string;
  number: number;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: Record<string, unknown>): Semester => {
  const row = r as unknown as SemesterRow;
  return {
    id: row.id,
    programId: row.program_id,
    number: row.number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toRow = (c: CreateSemester): Record<string, unknown> => ({
  program_id: c.programId,
  number: c.number,
});

const toPatch = (p: PatchSemester): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (p.programId !== undefined) out["program_id"] = p.programId;
  if (p.number !== undefined) out["number"] = p.number;
  return out;
};

export const adminSemestersRoute = createCrudHandlers<Semester, CreateSemester, PatchSemester>({
  table: "semesters",
  createSchema: createSemesterSchema,
  updateSchema: patchSemesterSchema,
  scope: { column: "program_id", queryKey: "programId" },
  toRow,
  toPatch,
  fromRow,
});