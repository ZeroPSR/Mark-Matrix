// Cycle 2 route additions. The cycle-1 entries live in src/index.ts.
// Add this file and re-export it from src/index.ts.

// Generic URL builder for the batch/program/sem/course/{attendance,marks} mount.
// One router is exposed under three role prefixes; the leaf segment differs.
const courseLeafBase = (role: "faculty" | "admin" | "student") =>
  (batchId: string, programId: string, semId: string, courseId: string, leaf: string): string =>
    `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/${leaf}`;

const attendanceBase = courseLeafBase("faculty");
// attendanceBase(...) was historically defined with role as the first arg.
// Wrap to preserve the existing call signature: attendanceBase(role, b, p, s, c).
const attendanceUrl = (
  role: "faculty" | "admin" | "student",
  batchId: string,
  programId: string,
  semId: string,
  courseId: string,
): string => courseLeafBase(role)(batchId, programId, semId, courseId, "attendance");

const marksUrl = (
  role: "faculty" | "admin" | "student",
  batchId: string,
  programId: string,
  semId: string,
  courseId: string,
): string => courseLeafBase(role)(batchId, programId, semId, courseId, "marks");

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
  facultyAttendance: attendanceUrl,
  adminAttendance: attendanceUrl,
  studentAttendance: attendanceUrl,

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

  // Marks — three role-prefixed mounts of the same template.
  facultyMarks: marksUrl,
  adminMarks: marksUrl,
  studentMarks: marksUrl,

  // Cycle 6 — admin results approval workflow.
  adminCourseMarksAction: (
    role: "admin",
    batchId: string,
    programId: string,
    semId: string,
    courseId: string,
    action: "approve" | "lock" | "unlock",
  ): string =>
    `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/marks/${action}`,

  adminSemGradesheetAction: (
    role: "admin",
    batchId: string,
    programId: string,
    semId: string,
    action: "compile" | "lock" | "publish" | "unlock",
  ): string =>
    `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/gradesheet/${action}`,

  studentGradesheetPath: (
    role: "student",
    batchId: string,
    programId: string,
    semId: string,
  ): string =>
    `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/gradesheet`,
} as const;

// Silence "declared but never used" — attendanceBase is kept exported for
// downstream consumers that imported the inner helper directly.
export { attendanceBase };
