-- 20260820100001_academic_structure.sql
-- batch → program → sem → course hierarchy.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.batches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  start_year integer not null check (start_year between 2000 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger batches_set_updated_at
  before update on public.batches
  for each row execute function public.set_updated_at();

create table public.programs (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.batches(id) on delete restrict,
  code       text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, code),
  unique (id, batch_id)
);
create index programs_batch_id_idx on public.programs (batch_id);

create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

create table public.semesters (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  number     integer not null check (number between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, number),
  unique (id, program_id)
);
create index semesters_program_id_idx on public.semesters (program_id);

create trigger semesters_set_updated_at
  before update on public.semesters
  for each row execute function public.set_updated_at();

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  code        text not null,
  title       text not null,
  credits     integer not null check (credits between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (semester_id, code),
  unique (id, semester_id)
);
create index courses_semester_id_idx on public.courses (semester_id);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();
