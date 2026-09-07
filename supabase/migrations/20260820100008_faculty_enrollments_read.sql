-- 20260820100008_faculty_enrollments_read.sql
-- Faculty need to see which students are enrolled in a course they're teaching
-- so they can take attendance. Existing policies only allow admin or self-read.

create policy student_enrollments_faculty_select on public.student_enrollments
  for select to authenticated
  using (public.teaches_any_in_semester(sem_id));
