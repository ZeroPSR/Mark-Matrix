-- 20260820100012_gradesheets_full_lock_trigger.sql
-- Cycle 6 fix-wave-1 — broadens the gradesheets lock trigger and tightens
-- the faculty RLS policy. Companion to 20260820100011_results_approval.sql.
--
-- Fix 3 (broaden lock trigger):
--   The existing trigger `gradesheets_lock_when_locked` is declared with
--   `BEFORE UPDATE OF status ON public.gradesheets`, so it only fires when
--   the status column is updated. An admin or service-role caller could
--   mutate `sgpa`, `total_credits`, `course_count`, etc. on a locked
--   gradesheet without the trigger raising. Add a sibling trigger
--   `gradesheets_lock_data_when_locked` with NO OF list — it fires on every
--   UPDATE and raises P0001 `gradesheets_data_locked` if any data column
--   changes while status is locked. The unlock route already flips status
--   back to 'compiled' before re-compiling, so re-compiles will not
--   falsely trip the trigger.
--
-- Fix 4 (course-scoped faculty RLS):
--   The existing policy `gradesheets_faculty_select` lets faculty teaching
--   ANY course in a semester read EVERY student's gradesheet for that
--   semester, contradicting CLAUDE.md §4 (faculty see records for courses
--   they teach). DROP and recreate with course-scoped semantics: a faculty
--   member may read a gradesheet only if they teach at least one course
--   that the student has a cached course grade for (`course_grades` rows
--   exist per (course, student) pair after compile).

-- Fix 3 -------------------------------------------------------------------

create or replace function public.gradesheets_lock_data_when_locked()
returns trigger language plpgsql as $$
begin
  if old.status = 'locked' and (
    new.sgpa is distinct from old.sgpa or
    new.total_credits is distinct from old.total_credits or
    new.course_count is distinct from old.course_count or
    new.sem_id is distinct from old.sem_id or
    new.student_id is distinct from old.student_id
  ) then
    raise exception 'gradesheets_data_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger gradesheets_lock_data_when_locked
  before update on public.gradesheets
  for each row execute function public.gradesheets_lock_data_when_locked();

-- Fix 4 -------------------------------------------------------------------

drop policy if exists gradesheets_faculty_select on public.gradesheets;
create policy gradesheets_faculty_select on public.gradesheets
  for select to authenticated
  using (
    exists (
      select 1
        from public.course_grades cg
       where cg.student_id = gradesheets.student_id
         and cg.course_id in (
           select id from public.courses where public.teaches_course(id)
         )
    )
  );
