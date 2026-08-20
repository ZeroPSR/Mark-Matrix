import {
  createBatchSchema,
  patchBatchSchema,
  type CreateBatch,
  type PatchBatch,
} from "@mark-matrix/shared";
import { createCrudHandlers } from "../../lib/crudFactory.js";

export interface Batch {
  id: string;
  name: string;
  startYear: number;
  createdAt: string;
  updatedAt: string;
}

interface BatchRow {
  id: string;
  name: string;
  start_year: number;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Record<string, unknown>): Batch => {
  const row = r as unknown as BatchRow;
  return {
    id: row.id,
    name: row.name,
    startYear: row.start_year,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toRow = (c: CreateBatch): Record<string, unknown> => ({
  name: c.name,
  start_year: c.startYear,
});

const toPatch = (p: PatchBatch): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (p.name !== undefined) out["name"] = p.name;
  if (p.startYear !== undefined) out["start_year"] = p.startYear;
  return out;
};

export const adminBatchesRoute = createCrudHandlers<Batch, CreateBatch, PatchBatch>({
  table: "batches",
  createSchema: createBatchSchema,
  updateSchema: patchBatchSchema,
  toRow,
  toPatch,
  fromRow,
});