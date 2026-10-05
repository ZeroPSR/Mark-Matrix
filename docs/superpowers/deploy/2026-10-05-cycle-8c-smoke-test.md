# Cycle 8c Smoke Test

**Date:** 2026-10-05
**Purpose:** Manually verify the production deployment end-to-end.
**Prerequisites:**
- The frontend is deployed and reachable at the production URL.
- The API is deployed and reachable at the production URL.
- All 17 migrations are applied to the production Supabase project.
- At least one faculty user, one admin user, and one student user are seeded in the production Supabase (per cycle 1's `db:seed:admin` and `db:seed:test-users` scripts, adapted for prod).

**Pass/fail:** Each step has a checkbox. Any failure stops the rollout and triggers a rollback (see `2026-10-05-cycle-8c-rollback.md`).

## Steps

- [ ] **1. Open the frontend URL.**
  - Pass: HTTPS, no console errors, login page loads.
- [ ] **2. Sign in as a faculty user.**
  - Pass: Redirects to dashboard, role badge shows "faculty".
- [ ] **3. Mark attendance for a course.**
  - Pass: Persists across refresh. (Reload the page; attendance should still be there.)
- [ ] **4. Sign in as a different faculty user, enter marks for the same course.**
  - Pass: Marks appear in the course.
- [ ] **5. Sign in as admin, open Results Review, click Approve on the course.**
  - Pass: Status flips to "approved".
- [ ] **6. Click Lock.**
  - Pass: Status flips to "locked".
- [ ] **7. Click Compile.**
  - Pass: Gradesheet is generated. Open `/admin/audit-log` and verify rows for "update", "submit", "approve", "lock", "compile" appear with the correct timestamps and user_ids.
  - **Precondition:** steps 3-6 must have succeeded; without marks entered, the audit log will not have the expected rows.
- [ ] **8. Click Publish.**
  - Pass: Status flips to "published". Audit log has a "publish" row.
- [ ] **9. Sign in as a student, view the transcript.**
  - Pass: Published gradesheet shows. (Pre-condition: the student is enrolled in a course that was published in step 8.)
- [ ] **10. Download the transcript PDF.**
  - Pass: Renders with the student's data.
- [ ] **11. Try to log in with a wrong password 5 times.**
  - Pass: 6th attempt returns 429.
- [ ] **12. Sign in as faculty, try to access `/admin/audit-log`.**
  - Pass: 403 forbidden.

## Result

- [ ] All 12 steps passed → rollout is complete. Mark this doc with the date and time.
- [ ] Any step failed → stop, do not continue. Trigger a rollback (see `2026-10-05-cycle-8c-rollback.md`).
