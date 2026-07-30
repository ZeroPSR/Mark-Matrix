# Mark-Matrix
### Online Result Processing System — High-Level Project Plan

---

## 1. Project Overview

**Mark-Matrix** is a web-based platform that digitizes and streamlines academic result processing — from attendance and marks entry by faculty to grade calculation and final result generation for students. It replaces manual, error-prone spreadsheet-based processes with a secure, role-based, auditable system.

**Core Goal:** Enable faculty to record attendance and marks securely, automate grade computation, and let students/stakeholders view verified results online — with role-based access control and centralized admin control over approval and publishing.

---

## 2. Objectives

1. Identify and formalize academic result processing requirements (subjects, exams, grading rules, semesters).
2. Design a secure, role-based access system separating faculty, students, and admin privileges.
3. Implement attendance tracking, marks entry, grade calculation, and result generation.
4. Centralize result approval and publishing control with Admin for integrity and auditability.

---

## 3. Stakeholders / User Roles

| Role | Key Permissions |
|---|---|
| **Admin** | Manage users, courses, subjects, exams, grading policy; **approve & lock results/gradesheets**; oversee audit logs |
| **Faculty** | Write attendance and marks for assigned course(s); view class-level reports |
| **Student** | Read own attendance, marks, gradesheet, SGPA/CGPA |

> **Change from earlier version:** Approval/locking of results is now an **Admin-only** capability (previously with an optional HOD/Result Committee role). Faculty submissions go into a "pending" state until Admin approves and locks them — after which they become immutable.

---

## 4. Data Hierarchy

Two parallel hierarchies model the academic structure and its outputs:

```
batch/
 └── program/
      └── sem/
           └── course/
                ├── attendance      (write: faculty | read: all)
                └── marks           (write: faculty | read: all*, lock: admin)

batch/
 └── program/
      └── sem/
           ├── gradesheet          (compiled per student, admin-locked)
           └── score/
                ├── sgpa           (per semester)
                └── cgpa           (cumulative)
```

- `course/attendance` and `course/marks` are scoped per course, written by the assigned faculty.
- `sem/gradesheet` and `sem/score/{sgpa,cgpa}` are compiled/derived one level up — aggregating all courses within that semester for a student.
- `*` Students can read only their own records; faculty can read records for courses/classes they teach; Admin has full read access across the hierarchy.

This hierarchy maps naturally to the database schema and to API route design, e.g.:
`/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks`
`/batch/:batchId/program/:programId/sem/:semId/gradesheet`

---

## 5. System Modules

### 5.1 Authentication & Role-Based Access Control (RBAC)
- Supabase Auth (email/password, magic link, or SSO) for login
- Supabase session management (Postgres-backed)
- Role claims (Admin / Faculty / Student) enforced via Row-Level Security (RLS) policies in Postgres + middleware checks in the Hono API
- Faculty scoped to assigned courses only; Students scoped to their own batch/program/sem records

### 5.2 Academic Structure Management (Admin)
- Manage batches, programs, semesters, courses
- Define exam types (Internal, Mid-term, Final) and weightage
- Assign faculty to courses
- Enroll/register students into batch/program/sem

### 5.3 Attendance Tracking Module (New)
- Faculty marks attendance per course session (present/absent/late)
- Attendance stored under `course/attendance`, scoped to that course
- **Write access:** faculty (only for their assigned course)
- **Read access:** all roles (students see their own; faculty/admin see full course roster)
- Attendance percentage auto-computed per student per course (useful for eligibility checks)

### 5.4 Marks Entry Module (Faculty)
- Faculty selects course → enters marks per student under `course/marks`
- Input validation (marks within max limits)
- Draft-save vs. Final-submit workflow (submission = "pending admin approval")
- Bulk upload via CSV/Excel with validation
- Edit locked once Admin approves/locks the course's marks

### 5.5 Grade Calculation Engine
- Configurable grading scheme (absolute or relative)
- Auto-computes, per course: total marks, grade, grade points
- Auto-computes, per semester (`sem/gradesheet`, `sem/score`): SGPA
- Auto-computes cumulative CGPA across semesters
- Rule engine so grading policy can change per semester without code changes

### 5.6 Approval, Locking & Result Publishing (Admin-only)
- Admin reviews faculty-submitted marks per course
- Admin **approves & locks** course marks → triggers gradesheet/SGPA/CGPA compilation for affected students
- Admin **locks the semester gradesheet** before it becomes visible to students
- Once locked, records become immutable (edits require an explicit Admin-initiated unlock + audit entry)
- Auto-generate downloadable grade card / transcript (PDF) after publishing

### 5.7 Reporting & Analytics
- Class performance summary, pass percentage, toppers list
- Attendance shortage reports
- Subject-wise/faculty-wise analytics
- Exportable reports (CSV/PDF)

### 5.8 Audit & Security Logging
- Log every attendance/marks entry, edit, approval, and lock action with timestamp + user ID
- Immutable audit trail for result changes
- Admin dashboard to review activity and unlock history

---

## 6. High-Level Architecture

```
                 ┌──-─────────────────────────┐
                 │   Pages (React)            │
                 │   Cloudflare Workers/Pages │
                 └──────────────┬─────────────┘
                                │ HTTPS (REST/JSON)
                 ┌──────────────▼──--───────────┐
                 │   Compute (Hono)             │
                 │   Cloudflare Workers         │
                 │  - Auth/session verification │
                 │  - RBAC middleware           │
                 │  - Attendance Service        │
                 │  - Marks Service             │
                 │  - Grade/SGPA/CGPA Engine    │
                 │  - Approval & Lock Service   │
                 │  - Result/Gradesheet Service │
                 └──────────────┬───────────────┘
                                │
                 ┌──────────────▼───-───-─-─-─────┐
                 │   Supabase                     │
                 │   - Postgres DB                │
                 │   - Auth & Session             │
                 │   - Row-Level Security policies│
                 └────────────────────────────────┘
```

- **Frontend:** React, deployed as static pages on Cloudflare Pages/Workers
- **Backend/Compute:** Hono framework running on Cloudflare Workers (edge API layer)
- **Data, Auth & Sessions:** Supabase (Postgres) — handles authentication, session storage, and the relational data hierarchy above, with RLS enforcing per-role read/write access at the database level as a second line of defense behind the Hono middleware

---

## 7. Core Data Model (Entities)

- **User** (id, name, email, role) — managed via Supabase Auth
- **Batch / Program / Semester / Course**
- **FacultyAssignment** (faculty_id, course_id)
- **StudentEnrollment** (student_id, batch_id, program_id, sem_id)
- **Attendance** (student_id, course_id, session_date, status, recorded_by)
- **Marks** (student_id, course_id, exam_type, marks_obtained, entered_by, status: draft/submitted/approved/locked)
- **GradeScheme** (grade, min_marks, max_marks, grade_point)
- **Gradesheet** (student_id, sem_id, courses_summary, sgpa, status, locked_by, locked_at)
- **Score** (student_id, sem_id, sgpa, cgpa)
- **AuditLog** (action, entity, user_id, timestamp, old_value, new_value)

---

## 8. Security Design Highlights

- RBAC enforced at **two layers**: Hono middleware (API) and Supabase RLS policies (database) — defense in depth
- Faculty write access limited to `course/attendance` and `course/marks` for their assigned courses only
- Read access: attendance and marks readable by all roles per scoping rules (§4); gradesheet/score readable by the student themselves, their faculty, and Admin
- **Only Admin can approve, lock, or unlock** marks and gradesheets
- Locked records are immutable; any correction requires an explicit unlock action, logged in the audit trail
- Sessions and auth tokens managed by Supabase Auth (secure, HTTP-only cookies / JWT)
- Input validation and sanitization at the Hono API boundary

---

## 9. Tech Stack

| Layer | Choice |
|---|---|
| Frontend (Pages) | React, deployed on Cloudflare Pages/Workers |
| Backend (Compute) | Hono, running on Cloudflare Workers (edge) |
| Database | Postgres (via Supabase) |
| Auth & Session | Supabase Auth |
| Access Control | Supabase Row-Level Security + Hono middleware |
| PDF Generation | jsPDF / similar, invoked from Workers |
| Reports/Export | CSV/PDF export from compute layer |

---

## 10. Project Phases / Timeline (Sample)

| Phase | Activities |
|---|---|
| 1. Requirement Analysis | Grading rules, attendance policy, roles, hierarchy finalization |
| 2. System Design | Schema design (Supabase), RLS policies, Hono API routes, React wireframes |
| 3. Core Development | Auth/session, RBAC, Attendance module, Marks entry |
| 4. Grade Engine & Approval Flow | SGPA/CGPA computation, Admin approval & lock workflow |
| 5. Result Generation & Reports | Gradesheet compilation, PDF transcripts, analytics |
| 6. Testing | Unit, integration, RLS/security testing |
| 7. Deployment | Deploy to Cloudflare + Supabase |


---

## 11. Deliverables

- Functional requirement document
- Data hierarchy diagram & Postgres schema (with RLS policies)
- Working web application (Mark-Matrix): React pages + Hono API on Cloudflare Workers, Supabase backend
- Attendance tracking, marks entry, grade calculation, and admin-controlled result approval/publishing modules
- Test cases & security audit summary
- Final project report and presentation

---
