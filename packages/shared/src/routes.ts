// Cycle 2 route additions. The cycle-1 entries live in src/index.ts.
// Add this file and re-export it from src/index.ts.

export const ROUTES_CYCLE_2 = {
  // Admin — batch/program/sem/course CRUD
  adminBatches: "/api/admin/batches",
  adminBatchById: (id: string): string => `/api/admin/batches/${id}`,
  adminPrograms: "/api/admin/programs",
  adminProgramById: (id: string): string => `/api/admin/programs/${id}`,
  adminSemesters: "/api/admin/semesters",
  adminSemesterById: (id: string): string => `/api/admin/semesters/${id}`,
  adminCourses: "/api/admin/courses",
  adminCourseById: (id: string): string => `/api/admin/courses/${id}`,

  // Admin — users (PATCH :userId is the role-change endpoint)
  adminUsers: "/api/admin/users",
  adminUserById: (id: string): string => `/api/admin/users/${id}`,

  // Admin — role satellites
  adminStudents: "/api/admin/students",
  adminStudentById: (id: string): string => `/api/admin/students/${id}`,
  adminFaculty: "/api/admin/faculty",
  adminFacultyById: (id: string): string => `/api/admin/faculty/${id}`,
  adminAdmins: "/api/admin/admins",
  adminAdminById: (id: string): string => `/api/admin/admins/${id}`,

  // Admin — assignments
  adminFacultyAssignments: "/api/admin/faculty-assignments",
  adminFacultyAssignmentById: (id: string): string =>
    `/api/admin/faculty-assignments/${id}`,

  // Admin — enrollments
  adminEnrollments: "/api/admin/enrollments",
  adminEnrollmentById: (id: string): string =>
    `/api/admin/enrollments/${id}`,
  adminBulkEnroll: "/api/admin/enrollments/bulk",

  // Faculty
  facultyCourses: "/api/faculty/courses",

  // Student
  studentEnrollment: "/api/student/enrollment",
} as const;
