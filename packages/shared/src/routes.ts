// Cycle 2 route additions. The cycle-1 entries live in src/index.ts.
// Add this file and re-export it from src/index.ts.

// Attendance — one URL template, three role-prefixed mounts.
const attendanceBase = (
  role: "faculty" | "admin" | "student",
  batchId: string,
  programId: string,
  semId: string,
  courseId: string,
): string =>
  `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/attendance`;

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

  // Attendance — three role-prefixed mounts of the same template.
  facultyAttendance: attendanceBase,
  adminAttendance: attendanceBase,
  studentAttendance: attendanceBase,

  // Cycle 5 — grade engine
  adminGradeSchemes: "/api/admin/grade-schemes",
  adminGradeSchemeById: (id: string) => `/api/admin/grade-schemes/${id}`,

  // Three role-prefixed mounts of the same template:
  //   /api/{role}/batch/:b/program/:p/sem/:s/course/:c/marks/:studentId/grade
  courseGradeUrl: (
    role: "admin" | "faculty" | "student",
    batchId: string,
    programId: string,
    semId: string,
    courseId: string,
    studentId: string,
  ): string =>
    `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/marks/${studentId}/grade`,

  //   /api/{role}/batch/:b/program/:p/sem/:s/score/sgpa
  semSgpaUrl: (
    role: "admin" | "faculty" | "student",
    batchId: string,
    programId: string,
    semId: string,
  ): string =>
    `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/score/sgpa`,

  //   /api/{role}/score/cgpa
  cgpaUrl: (role: "admin" | "faculty" | "student"): string =>
    `/api/${role}/score/cgpa`,
} as const;
