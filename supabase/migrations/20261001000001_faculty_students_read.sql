-- 20261001000001_faculty_students_read.sql
-- Faculty need to read the students enrolled in the semesters they teach so
-- they can take attendance and read the roster. The existing policies on
-- `student_profiles` and `profiles` allow only admin or self-read, so the
-- roster query (which inner-joins `profiles`) returned nothing for faculty.
--
-- `student_enrollments` already has a faculty-select policy
-- (20260820100008_faculty_enrollments_read.sql), so enrollments are readable
-- once the API stops gating them behind the admin role.
--
-- The grant is deliberately narrow: a faculty member may read a student row
-- only if that student is enrolled in a semester in which the faculty member
-- teaches at least one course.

-- True when the given user is a student enrolled in a semester that the
-- calling user (auth.uid()) teaches. SECURITY DEFINER so the check reads
-- `student_enrollments` without being filtered by the caller's own RLS.
create or replace function public.teaches_any_student(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_enrollments se
    where se.student_id = p_user_id
      and public.teaches_any_in_semester(se.sem_id)
  );
$$;

revoke all on function public.teaches_any_student(uuid) from public;
grant execute on function public.teaches_any_student(uuid) to authenticated;

-- The satellite table: roll number and admission year.
create policy student_profiles_faculty_select on public.student_profiles
  for select to authenticated
  using (public.teaches_any_student(user_id));

-- The role table the roster query inner-joins for name and role.
create policy profiles_faculty_select on public.profiles
  for select to authenticated
  using (public.teaches_any_student(user_id));
