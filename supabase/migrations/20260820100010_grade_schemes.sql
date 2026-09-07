-- 20260820100010_grade_schemes.sql
-- Configurable grading schemes + per-(course,student) cached grade row.
-- See docs/superpowers/specs/2026-09-07-grade-engine-design.md §3.

create type public.grade_scope as enum ('course', 'program');

create table public.grade_schemes (
  id            uuid primary key default gen_random_uuid(),
  scheme_group  text not null,
  scope         public.grade_scope not null,
  course_id     uuid references public.courses(id)   on delete cascade,
  program_id    uuid references public.programs(id)  on delete cascade,
  grade_label   text not null,
  min_marks     numeric(5,2) not null check (min_marks between 0 and 100),
  max_marks     numeric(5,2) not null check (max_marks between 0 and 100),
  grade_point   numeric(4,2) not null check (grade_point between 0 and 10),
  is_passing    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (
    (scope = 'course'  and course_id is not null and program_id is null) or
    (scope = 'program' and program_id is not null and course_id  is null)
  ),
  check (min_marks <= max_marks),
  unique (scheme_group, scope, coalesce(course_id, program_id), grade_label)
);

create index grade_schemes_course_idx  on public.grade_schemes (course_id)  where course_id  is not null;
create index grade_schemes_program_idx on public.grade_schemes (program_id) where program_id is not null;
create index grade_schemes_group_idx   on public.grade_schemes (scheme_group);

create trigger grade_schemes_set_updated_at
  before update on public.grade_schemes
  for each row execute function public.set_updated_at();

create table public.course_grades (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses(id) on delete cascade,
  student_id      uuid not null references public.student_profiles(user_id) on delete cascade,
  total_obtained  numeric(7,2) not null check (total_obtained >= 0),
  total_max       numeric(7,2) not null check (total_max > 0),
  percentage      numeric(5,2) not null check (percentage between 0 and 100),
  grade_label     text not null,
  grade_point     numeric(4,2) not null check (grade_point between 0 and 10),
  grade_scheme_id uuid not null references public.grade_schemes(id) on delete restrict,
  computed_at     timestamptz not null default now(),
  unique (course_id, student_id)
);

create index course_grades_course_idx  on public.course_grades (course_id);
create index course_grades_student_idx on public.course_grades (student_id);

create or replace function public.invalidate_course_grades_on_submit()
returns trigger language plpgsql as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    delete from public.course_grades where course_id = new.course_id;
  end if;
  return new;
end $$;

create trigger marks_invalidate_course_grades
  after update of status on public.marks
  for each row execute function public.invalidate_course_grades_on_submit();

alter table public.grade_schemes enable row level security;
alter table public.course_grades enable row level security;

-- grade_schemes: admin full; faculty can read schemes anchored to courses they
-- teach OR to programs that contain a course they teach; student can read
-- schemes for courses they have marks in (course scope) or any course in the
-- program (program scope).
create policy grade_schemes_admin_all on public.grade_schemes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy grade_schemes_faculty_select on public.grade_schemes
  for select to authenticated
  using (
    (scope = 'course'  and public.teaches_course(course_id)) or
    (scope = 'program' and exists (
      select 1
        from public.courses c
        join public.semesters s on s.id = c.semester_id
       where s.program_id = grade_schemes.program_id
         and public.teaches_course(c.id)
    ))
  );

create policy grade_schemes_student_select on public.grade_schemes
  for select to authenticated
  using (
    (scope = 'course' and exists (
      select 1 from public.marks m
       where m.course_id = grade_schemes.course_id
         and m.student_id = auth.uid()
    )) or
    (scope = 'program' and exists (
      select 1
        from public.marks m
        join public.courses c      on c.id = m.course_id
        join public.semesters s    on s.id = c.semester_id
       where s.program_id = grade_schemes.program_id
         and m.student_id = auth.uid()
    ))
  );

-- course_grades: admin full; faculty read for courses they teach; student
-- read only own.
create policy course_grades_admin_all on public.course_grades
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy course_grades_faculty_select on public.course_grades
  for select to authenticated
  using (public.teaches_course(course_id));

create policy course_grades_student_select on public.course_grades
  for select to authenticated
  using (student_id = auth.uid());