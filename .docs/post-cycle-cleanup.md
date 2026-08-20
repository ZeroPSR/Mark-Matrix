# Post-Cycle Cleanup — Deferred Trimming

**Not a spec.** A running list of things deliberately built ahead of their
consumer, to be audited and trimmed **after all development cycles are
complete** (post cycle 8), before the project is considered finished.

Nothing here is a bug. Each entry exists because building it early was cheaper
or safer than retrofitting it — the cost is that some of it will turn out never
to have been used. This file is the reminder to go back and check.

**Do not trim mid-cycle.** A column that looks unused during cycle 3 may be the
one cycle 6 depends on. The whole point of deferring is that the answer is only
knowable once every consumer exists.

---

## How to audit

Run these against a database that has carried realistic data through all
cycles — a freshly reset dev database will report almost everything as unused
and is worthless for this purpose.

**Indexes never used by a query:**

```sql
select schemaname, relname as table_name, indexrelname as index_name,
       idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) as size
from pg_stat_user_indexes
where schemaname = 'public' and idx_scan = 0
order by pg_relation_size(indexrelid) desc;
```

Beware two false positives: an index backing a `UNIQUE` or foreign-key
constraint reports `idx_scan = 0` while still being load-bearing, and
`pg_stat_user_indexes` counters reset on `pg_stat_reset()` or a restore.

**Columns that are null in every row** — a strong hint nothing ever writes them:

```sql
select 'select ''' || column_name || ''' where not exists (select 1 from '
       || table_name || ' where ' || column_name || ' is not null);'
from information_schema.columns
where table_schema = 'public' and is_nullable = 'YES';
```

**Unreferenced code:** `pnpm lint` with `no-unused-vars`, plus
`grep -rn "<symbol>" apps packages scripts` for each exported constant.

---

## Candidates

### Schema

| Item | Introduced | Trim if |
|---|---|---|
| `admin_profiles` (whole table) | cycle 2 | It holds only `employee_code` and `designation` and was created for symmetry with the other two satellites. If nothing ever reads it by cycle 8, it is pure ceremony. |
| `admin_profiles.designation`, `faculty_profiles.designation` | cycle 2 | Never displayed or filtered on. |
| `faculty_profiles.department` | cycle 2 | Intended for class-level reporting in cycle 4. If reports never group by department, drop. |
| `courses.unique (id, semester_id)` | cycle 2 | Added as a composite-FK target for attendance/marks in cycles 3–4. **If no later table actually references it, this is a redundant index beside the PK.** Verify before dropping — see the false-positive note above. |
| `student_enrollments.batch_id`, `.program_id` | cycle 2 | Both are derivable by walking `sem_id → semesters → programs`. They exist to keep the brief's tuple shape and to avoid a two-join lookup. If every real query joins anyway, they are denormalization that earns nothing. **The two composite FKs depend on these columns** — dropping them means dropping the tuple-integrity guarantee, which is a design reversal, not a cleanup. |
| `batches.start_year` | cycle 2 | Redundant if `batches.name` always encodes the year and nothing sorts or filters numerically. |

### Code

| Item | Introduced | Trim if |
|---|---|---|
| `getSupabase(env)` service-role overload | cycle 1 | **Currently unused.** Cycle 2 deliberately keeps it unused (decision D10 — all handlers use the RLS-bound client). If no cycle ever needs it, delete it: an unused service-role path is a standing invitation to bypass RLS by accident. |
| `DATA_HIERARCHY`, `DATA_LEAVES` in `packages/shared` | cycle 1 | Declared as the canonical hierarchy reference. Confirm something imports them rather than hardcoding the strings. |
| `scripts/check-db.ts` `_health` probe | cycle 1 | Queries a table that intentionally does not exist. Harmless, but once real tables exist, probing one of them is a more honest check. |
| `parseCsv` generality | cycle 2 | Written RFC4180-ish (quoted fields, embedded newlines). If bulk enroll is the only consumer and its files are always trivial, the quoting branches are untested surface area. |

### Config

| Item | Introduced | Trim if |
|---|---|---|
| `@tailwindcss/oxide` in `pnpm-workspace.yaml` `onlyBuiltDependencies` | cycle 1 | Tailwind is not a dependency anywhere. Also listed: `@swc/core`, `@biomejs/biome`, `better-sqlite3`, `core-js` — none are used. |
| `VITE_API_ORIGIN` | cycle 1 | Defined in `.env.example` but unread until cycle 2's `lib/api.ts`. Confirm it is actually consumed. |

---

## Things that look trimmable but are not

Recording these so a future cleanup pass does not "simplify" them back into
bugs:

- **`programs.unique (id, batch_id)` and `semesters.unique (id, program_id)`.**
  These look redundant beside each table's primary key and will report
  `idx_scan = 0`. They are the **required targets** for `student_enrollments`'
  composite foreign keys — PostgreSQL will not let a composite FK reference a
  column list without a matching unique constraint. Dropping either one drops
  the guarantee that a `(batch, program, sem)` tuple is internally consistent.
- **`assert_profile_role()` and `block_role_change_with_satellite()` triggers.**
  They fire rarely and never appear in query plans. They are the only thing
  preventing a wrong-role satellite row, which is a privilege-escalation path
  into faculty course reads. See §4.1 of the cycle-2 spec.
