-- 20260820100003_academic_rls.sql
-- Helper functions and RLS policies for batches/programs/semesters/courses/
-- faculty_assignments/student_enrollments.

-- Helpers (must be SECURITY DEFINER — a non-definer policy that reads
-- faculty_assignments from inside courses' policy would recurse).
create or replace function public.teaches_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.faculty_assignments fa
    where fa.course_id = p_course_id
      and fa.faculty_id = auth.uid()
  );
$$;

create or replace function public.teaches_any_in_semester(p_semester_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.faculty_assignments fa
    join public.courses c on c.id = fa.course_id
    where c.semester_id = p_semester_id
      and fa.faculty_id = auth.uid()
  );
$$;

create or replace function public.teaches_any_in_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.faculty_assignments fa
    join public.courses c on c.id = fa.course_id
    join public.semesters s on s.id = c.semester_id
    where s.program_id = p_program_id
      and fa.faculty_id = auth.uid()
  );
$$;

create or replace function public.teaches_any_in_batch(p_batch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.faculty_assignments fa
    join public.courses c on c.id = fa.course_id
    join public.semesters s on s.id = c.semester_id
    join public.programs p on p.id = s.program_id
    where p.batch_id = p_batch_id
      and fa.faculty_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled_in_sem(p_sem_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_enrollments se
    where se.sem_id = p_sem_id
      and se.student_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled_in_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_enrollments se
    join public.semesters s on s.id = se.sem_id
    where s.program_id = p_program_id
      and se.student_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled_in_batch(p_batch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_enrollments se
    join public.semesters s on s.id = se.sem_id
    join public.programs p on p.id = s.program_id
    where p.batch_id = p_batch_id
      and se.student_id = auth.uid()
  );
$$;

revoke all on function public.teaches_course(uuid)              from public;
revoke all on function public.teaches_any_in_semester(uuid)    from public;
revoke all on function public.teaches_any_in_program(uuid)    from public;
revoke all on function public.teaches_any_in_batch(uuid)      from public;
revoke all on function public.is_enrolled_in_sem(uuid)        from public;
revoke all on function public.is_enrolled_in_program(uuid)    from public;
revoke all on function public.is_enrolled_in_batch(uuid)      from public;

grant execute on function public.teaches_course(uuid)           to authenticated;
grant execute on function public.teaches_any_in_semester(uuid) to authenticated;
grant execute on function public.teaches_any_in_program(uuid) to authenticated;
grant execute on function public.teaches_any_in_batch(uuid)   to authenticated;
grant execute on function public.is_enrolled_in_sem(uuid)     to authenticated;
grant execute on function public.is_enrolled_in_program(uuid) to authenticated;
grant execute on function public.is_enrolled_in_batch(uuid)   to authenticated;

-- Policies — OR-ed across roles per table.
alter table public.batches      enable row level security;
alter table public.programs     enable row level security;
alter table public.semesters    enable row level security;
alter table public.courses      enable row level security;
alter table public.faculty_assignments enable row level security;
alter table public.student_enrollments enable row level security;

create policy batches_admin_all on public.batches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy batches_faculty_select on public.batches
  for select to authenticated using (public.teaches_any_in_batch(id));
create policy batches_student_select on public.batches
  for select to authenticated using (public.is_enrolled_in_batch(id));

create policy programs_admin_all on public.programs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy programs_faculty_select on public.programs
  for select to authenticated using (public.teaches_any_in_program(id));
create policy programs_student_select on public.programs
  for select to authenticated using (public.is_enrolled_in_program(id));

create policy semesters_admin_all on public.semesters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy semesters_faculty_select on public.semesters
  for select to authenticated using (public.teaches_any_in_semester(id));
create policy semesters_student_select on public.semesters
  for select to authenticated using (public.is_enrolled_in_sem(id));

create policy courses_admin_all on public.courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy courses_faculty_select on public.courses
  for select to authenticated using (public.teaches_course(id));

create policy faculty_assignments_admin_all on public.faculty_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy faculty_assignments_select_own on public.faculty_assignments
  for select to authenticated using (faculty_id = auth.uid());

create policy student_enrollments_admin_all on public.student_enrollments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy student_enrollments_select_own on public.student_enrollments
  for select to authenticated using (student_id = auth.uid());