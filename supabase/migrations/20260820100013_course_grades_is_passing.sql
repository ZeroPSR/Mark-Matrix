-- 20260820100013_course_grades_is_passing.sql
-- Cycle 7 — add is_passing to course_grades so analytics queries don't need to
-- re-derive the grade band on every row. Populated at upsert time going
-- forward; backfilled once here from the matching grade_schemes band.

alter table public.course_grades
  add column if not exists is_passing boolean not null default false;

-- Backfill is_passing from the matching grade_schemes band. If the row's
-- grade_scheme has been deleted (the FK is ON DELETE RESTRICT so this should
-- never happen in practice, but be defensive), is_passing stays at the
-- default false rather than failing the migration.
update public.course_grades cg
   set is_passing = coalesce(gs.is_passing, false)
  from public.grade_schemes gs
 where gs.id = cg.grade_scheme_id
   and gs.grade_label = cg.grade_label
   and cg.is_passing = false;

create index if not exists course_grades_course_passing_idx
  on public.course_grades (course_id, is_passing);