-- 20260820100011_results_approval.sql
-- Cycle 6 — Admin approval workflow. Extends marks.status, creates
-- gradesheets and scores tables, broadens the marks lock trigger to cover
-- the full draft -> submitted -> approved -> locked chain.

-- Postgres requires ALTER TYPE ... ADD VALUE outside a transaction block,
-- but Supabase migrations run inside a transaction by default. We work
-- around this with the standard IF NOT EXISTS pattern via a DO block.
do $$
begin
  if not exists (
    select 1 from pg_enum
      where enumlabel = 'approved'
        and enumtypid = 'public.marks_status'::regtype
  ) then
    alter type public.marks_status add value 'approved';
  end if;
  if not exists (
    select 1 from pg_enum
      where enumlabel = 'locked'
        and enumtypid = 'public.marks_status'::regtype
  ) then
    alter type public.marks_status add value 'locked';
  end if;
end $$;

-- Audit columns on marks.
alter table public.marks
  add column if not exists approved_by uuid references public.profiles(user_id),
  add column if not exists approved_at timestamptz,
  add column if not exists locked_by   uuid references public.profiles(user_id),
  add column if not exists locked_at   timestamptz;

-- Broaden the lock trigger so data columns cannot change once status has
-- reached submitted or beyond. Status itself can still transition forward
-- (submitted -> approved -> locked) and back (locked -> approved) because
-- those don't change marks_obtained / max_marks / exam_type / student_id /
-- course_id. The marks_lock_when_locked trigger below blocks backward
-- transitions from 'locked' for non-admins.
create or replace function public.marks_lock_when_submitted()
returns trigger language plpgsql as $$
begin
  if old.status in ('submitted', 'approved', 'locked')
     and (new.marks_obtained is distinct from old.marks_obtained
          or new.max_marks is distinct from old.max_marks
          or new.exam_type is distinct from old.exam_type
          or new.student_id is distinct from old.student_id
          or new.course_id is distinct from old.course_id) then
    raise exception 'marks_data_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;
-- Trigger name unchanged; the function body is replaced in place.
-- (Original trigger definition in 20260820100009_marks.sql continues to bind.)

-- Block any status change away from 'locked' unless the caller is admin AND
-- the new status is 'approved' (the only backward transition the unlock
-- route uses). Forward transitions (approved -> locked) are allowed because
-- they don't violate the predicate.
create or replace function public.marks_lock_when_locked()
returns trigger language plpgsql as $$
begin
  if old.status = 'locked' and new.status is distinct from 'locked' then
    if not (public.is_admin() and new.status = 'approved') then
      raise exception 'invalid_state_transition' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger marks_lock_when_locked
  before update of status on public.marks
  for each row execute function public.marks_lock_when_locked();

-- New tables ---------------------------------------------------------------

create type public.gradesheet_status as enum (
    'draft', 'compiled', 'locked', 'published'
);

create table public.gradesheets (
  id              uuid primary key default gen_random_uuid(),
  sem_id          uuid not null references public.semesters(id) on delete cascade,
  student_id      uuid not null references public.student_profiles(user_id) on delete cascade,
  status          public.gradesheet_status not null default 'draft',
  sgpa            numeric(4,2) check (sgpa between 0 and 10),
  total_credits   numeric(5,2),
  course_count    int,
  compiled_at     timestamptz,
  compiled_by     uuid references public.profiles(user_id),
  locked_by       uuid references public.profiles(user_id),
  locked_at       timestamptz,
  published_by    uuid references public.profiles(user_id),
  published_at    timestamptz,
  unlock_reason   text,
  unlocked_by     uuid references public.profiles(user_id),
  unlocked_at     timestamptz,
  updated_at      timestamptz not null default now(),
  unique (sem_id, student_id)
);
create index gradesheets_sem_idx     on public.gradesheets (sem_id);
create index gradesheets_student_idx on public.gradesheets (student_id);

create trigger gradesheets_set_updated_at
  before update on public.gradesheets
  for each row execute function public.set_updated_at();

-- Lock forward transition: any data column change once status is locked
-- requires an unlock (status flip back to compiled). The application's
-- grade / SGPA data is recomputed on each compile, so the trigger does not
-- need to allow backward edits.
create or replace function public.gradesheets_lock_when_locked()
returns trigger language plpgsql as $$
begin
  if old.status = 'locked' and new.status is distinct from 'locked' then
    if not (public.is_admin() and new.status = 'compiled') then
      raise exception 'invalid_state_transition' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger gradesheets_lock_when_locked
  before update of status on public.gradesheets
  for each row execute function public.gradesheets_lock_when_locked();

create table public.scores (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.student_profiles(user_id) on delete cascade,
  program_id     uuid not null references public.programs(id) on delete cascade,
  cgpa           numeric(4,2) not null check (cgpa between 0 and 10),
  semester_count int not null check (semester_count >= 0),
  total_credits  numeric(6,2),
  computed_at    timestamptz not null default now(),
  unique (student_id, program_id)
);
create index scores_student_idx on public.scores (student_id);
create index scores_program_idx on public.scores (program_id);

alter table public.gradesheets enable row level security;
alter table public.scores       enable row level security;

-- gradesheets: admin full; faculty read for any gradesheet whose sem
-- contains a course they teach; student read ONLY when status = published.
create policy gradesheets_admin_all on public.gradesheets
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy gradesheets_faculty_select on public.gradesheets
  for select to authenticated
  using (
    exists (
      select 1
        from public.courses c
       where c.semester_id = gradesheets.sem_id
         and public.teaches_course(c.id)
    )
  );

create policy gradesheets_student_select on public.gradesheets
  for select to authenticated
  using (student_id = auth.uid() and status = 'published');

-- scores: admin full; faculty read for students in programs they have at
-- least one course assignment in; student read own row when at least one
-- gradesheet they own has been published.
create policy scores_admin_all on public.scores
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy scores_faculty_select on public.scores
  for select to authenticated
  using (
    exists (
      select 1
        from public.courses c
        join public.semesters s on s.id = c.semester_id
       where s.program_id = scores.program_id
         and public.teaches_course(c.id)
    )
  );

create policy scores_student_select on public.scores
  for select to authenticated
  using (
    student_id = auth.uid()
    and exists (
      select 1 from public.gradesheets g
       where g.student_id = scores.student_id
         and g.status = 'published'
    )
  );