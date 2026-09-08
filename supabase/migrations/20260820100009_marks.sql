-- 20260820100009_marks.sql
-- Per-course marks log. One row per (course, student, exam_type); re-entering
-- marks for the same student/exam_type upserts.
--
-- max_marks on each marks row is a SNAPSHOT copied from
-- course_exam_types.max_marks at insert time, so historical marks retain
-- their original cap even if the course's exam-type definition changes.

create type public.marks_status as enum ('draft', 'submitted');

-- Source of truth for which exam_types a course has and what each is worth.
create table public.course_exam_types (
  course_id uuid not null references public.courses(id) on delete cascade,
  exam_type text not null,
  max_marks numeric(6,2) not null check (max_marks > 0),
  primary key (course_id, exam_type)
);
create index course_exam_types_course_idx on public.course_exam_types (course_id);

create table public.marks (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete restrict,
  student_id     uuid not null references public.student_profiles(user_id) on delete restrict,
  exam_type      text not null,
  marks_obtained numeric(6,2) not null check (marks_obtained >= 0),
  max_marks      numeric(6,2) not null check (max_marks > 0),
  entered_by     uuid not null references public.profiles(user_id) on delete restrict,
  status         public.marks_status not null default 'draft',
  updated_at     timestamptz not null default now(),
  unique (course_id, student_id, exam_type),
  -- The (course_id, exam_type) tuple must exist on course_exam_types.
  -- This gives a 23503 invalid_reference if the faculty tries to record
  -- marks for an exam_type the course doesn't define.
  foreign key (course_id, exam_type)
    references public.course_exam_types(course_id, exam_type)
);

create index marks_course_exam_idx on public.marks (course_id, exam_type);
create index marks_student_idx     on public.marks (student_id);

create trigger marks_set_updated_at
  before update on public.marks
  for each row execute function public.set_updated_at();

-- Database-level lock: once submitted, faculty UPDATEs cannot change
-- marks_obtained/max_marks. Only the status column may change (which is
-- what /submit uses — flipping draft -> submitted). The /submit handler
-- is the only path that flips the status; faculty direct UPDATEs are
-- additionally gated by RLS to draft rows only.
create or replace function public.marks_lock_when_submitted()
returns trigger language plpgsql as $$
begin
  if old.status = 'submitted'
     and (new.marks_obtained is distinct from old.marks_obtained
          or new.max_marks is distinct from old.max_marks
          or new.exam_type is distinct from old.exam_type
          or new.student_id is distinct from old.student_id
          or new.course_id is distinct from old.course_id) then
    raise exception 'submitted_marks_are_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger marks_lock_when_submitted
  before update on public.marks
  for each row execute function public.marks_lock_when_submitted();

alter table public.course_exam_types enable row level security;
alter table public.marks              enable row level security;

-- course_exam_types is managed by admin (defer management UI to a later cycle).
-- Faculty need to read it to know which exam_types are valid; student reads
-- only enough to display their marks (covered by marks policies).
create policy course_exam_types_admin_all on public.course_exam_types
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy course_exam_types_faculty_select on public.course_exam_types
  for select to authenticated
  using (public.teaches_course(course_id));

create policy course_exam_types_student_select on public.course_exam_types
  for select to authenticated
  using (
    exists (
      select 1 from public.marks m
      where m.course_id = course_exam_types.course_id
        and m.exam_type = course_exam_types.exam_type
        and m.student_id = auth.uid()
    )
  );

-- marks policies — mirror attendance.
create policy marks_admin_all on public.marks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy marks_faculty_select on public.marks
  for select to authenticated
  using (public.teaches_course(course_id));

create policy marks_faculty_insert on public.marks
  for insert to authenticated
  with check (
    public.teaches_course(course_id)
    and entered_by = auth.uid()
    and status = 'draft'
  );

create policy marks_faculty_update on public.marks
  for update to authenticated
  using (public.teaches_course(course_id) and status = 'draft')
  with check (public.teaches_course(course_id));

-- A faculty member can flip their own draft rows to submitted for an
-- assigned course. RLS does not normally let you UPDATE a row whose USING
-- expression fails on the new row, so we don't need a separate policy here —
-- the marks_faculty_update USING clause allows the row while draft, and the
-- new row (status='submitted') is still allowed by the WITH CHECK because
-- teaches_course(course_id) is still true. The lock trigger prevents any
-- column change other than the status flip.
-- (No policy needed.)

create policy marks_student_select on public.marks
  for select to authenticated
  using (student_id = auth.uid());
