import {
  createProgramSchema,
  patchProgramSchema,
  type CreateProgram,
  type PatchProgram,
} from "@mark-matrix/shared";
import { createCrudHandlers } from "../../lib/crudFactory.js";

export interface Program {
  id: string;
  batchId: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

type ProgramRow = {
  id: string;
  batch_id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: Record<string, unknown>): Program => {
  const row = r as unknown as ProgramRow;
  return {
    id: row.id,
    batchId: row.batch_id,
    code: row.code,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toRow = (c: CreateProgram): Record<string, unknown> => ({
  batch_id: c.batchId,
  code: c.code,
  name: c.name,
});

const toPatch = (p: PatchProgram): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (p.batchId !== undefined) out["batch_id"] = p.batchId;
  if (p.code !== undefined) out["code"] = p.code;
  if (p.name !== undefined) out["name"] = p.name;
  return out;
};

export const adminProgramsRoute = createCrudHandlers<Program, CreateProgram, PatchProgram>({
  table: "programs",
  createSchema: createProgramSchema,
  updateSchema: patchProgramSchema,
  scope: { column: "batch_id", queryKey: "batchId" },
  toRow,
  toPatch,
  fromRow,
});