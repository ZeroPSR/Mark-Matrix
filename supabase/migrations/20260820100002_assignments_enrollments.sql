-- 20260820100002_assignments_enrollments.sql
-- faculty_assignments + student_enrollments with composite FKs enforcing
-- tuple integrity.

create table public.faculty_assignments (
  id            uuid primary key default gen_random_uuid(),
  faculty_id    uuid not null
                references public.faculty_profiles(user_id) on delete restrict,
  course_id     uuid not null
                references public.courses(id) on delete restrict,
  assigned_date timestamptz not null default now(),
  unique (faculty_id, course_id)
);
create index faculty_assignments_course_id_idx  on public.faculty_assignments (course_id);
create index faculty_assignments_faculty_id_idx on public.faculty_assignments (faculty_id);

create table public.student_enrollments (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null
                  references public.student_profiles(user_id) on delete restrict,
  batch_id        uuid not null,
  program_id      uuid not null,
  sem_id          uuid not null
                  references public.semesters(id) on delete restrict,
  enrollment_date timestamptz not null default now(),
  unique (student_id, sem_id),
  foreign key (sem_id, program_id)
    references public.semesters(id, program_id) on delete restrict,
  foreign key (program_id, batch_id)
    references public.programs(id, batch_id) on delete restrict
);
create index student_enrollments_student_id_idx on public.student_enrollments (student_id);
create index student_enrollments_sem_id_idx     on public.student_enrollments (sem_id);
