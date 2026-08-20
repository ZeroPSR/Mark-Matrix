import {
  createCourseSchema,
  patchCourseSchema,
  type CreateCourse,
  type PatchCourse,
} from "@mark-matrix/shared";
import { createCrudHandlers } from "../../lib/crudFactory.js";

export interface Course {
  id: string;
  semesterId: string;
  code: string;
  title: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
}

type CourseRow = {
  id: string;
  semester_id: string;
  code: string;
  title: string;
  credits: number;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: Record<string, unknown>): Course => {
  const row = r as unknown as CourseRow;
  return {
    id: row.id,
    semesterId: row.semester_id,
    code: row.code,
    title: row.title,
    credits: row.credits,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toRow = (c: CreateCourse): Record<string, unknown> => ({
  semester_id: c.semesterId,
  code: c.code,
  title: c.title,
  credits: c.credits,
});

const toPatch = (p: PatchCourse): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (p.semesterId !== undefined) out["semester_id"] = p.semesterId;
  if (p.code !== undefined) out["code"] = p.code;
  if (p.title !== undefined) out["title"] = p.title;
  if (p.credits !== undefined) out["credits"] = p.credits;
  return out;
};

export const adminCoursesRoute = createCrudHandlers<Course, CreateCourse, PatchCourse>({
  table: "courses",
  createSchema: createCourseSchema,
  updateSchema: patchCourseSchema,
  scope: { column: "semester_id", queryKey: "semesterId" },
  toRow,
  toPatch,
  fromRow,
});