-- 20260820100007_attendance.sql
-- Per-course attendance log. One row per (course, student, session_date);
-- re-marking the same student/session upserts.

create type public.attendance_status as enum ('present', 'absent', 'late');

create table public.attendance (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete restrict,
  student_id   uuid not null references public.student_profiles(user_id) on delete restrict,
  session_date date not null,
  status       public.attendance_status not null,
  recorded_by  uuid not null references public.profiles(user_id) on delete restrict,
  created_at   timestamptz not null default now(),
  unique (course_id, student_id, session_date)
);

create index attendance_course_date_idx on public.attendance (course_id, session_date);
create index attendance_student_idx     on public.attendance (student_id);

alter table public.attendance enable row level security;

-- Admin: full access.
create policy attendance_admin_all on public.attendance
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Faculty: read rows for courses they teach.
create policy attendance_faculty_select on public.attendance
  for select to authenticated
  using (public.teaches_course(course_id));

-- Faculty: insert rows for courses they teach; recorded_by must be self.
create policy attendance_faculty_insert on public.attendance
  for insert to authenticated
  with check (public.teaches_course(course_id) and recorded_by = auth.uid());

-- Faculty: correct rows for courses they teach.
create policy attendance_faculty_update on public.attendance
  for update to authenticated
  using (public.teaches_course(course_id))
  with check (public.teaches_course(course_id));

-- Student: read only own rows.
create policy attendance_student_select on public.attendance
  for select to authenticated
  using (student_id = auth.uid());
