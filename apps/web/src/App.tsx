import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute.js";
import { AppShell } from "./shell/AppShell.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { ForbiddenPage } from "./pages/ForbiddenPage.js";
import { DashboardPlaceholder } from "./pages/DashboardPlaceholder.js";
import { UsersPage } from "./pages/admin/UsersPage.js";
import { AcademicStructurePage } from "./pages/admin/AcademicStructurePage.js";
import { AssignmentsPage } from "./pages/admin/AssignmentsPage.js";
import { EnrollmentsPage } from "./pages/admin/EnrollmentsPage.js";
import { ResultsReviewPage } from "./pages/admin/ResultsReviewPage.js";
import { GradesheetAdminPage } from "./pages/admin/GradesheetAdminPage.js";
import { FacultyCoursesPage } from "./pages/faculty/FacultyCoursesPage.js";
import { FacultyMarkAttendancePage } from "./pages/faculty/MarkAttendancePage.js";
import { RosterAttendancePage } from "./pages/faculty/RosterAttendancePage.js";
import { FacultyMarksEntryPage } from "./pages/faculty/MarksEntryPage.js";
import { RosterMarksPage } from "./pages/faculty/RosterMarksPage.js";
import { StudentPlaceholder } from "./pages/student/StudentPlaceholder.js";
import { StudentMyAttendancePage } from "./pages/student/MyAttendancePage.js";
import { StudentMyMarksPage } from "./pages/student/MyMarksPage.js";
import { MyGradesheetPage } from "./pages/student/MyGradesheetPage.js";

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPlaceholder />} />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute roles={["admin"]}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/academic"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AcademicStructurePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/assignments"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AssignmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/enrollments"
          element={
            <ProtectedRoute roles={["admin"]}>
              <EnrollmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/results"
          element={
            <ProtectedRoute roles={["admin"]}>
              <ResultsReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/gradesheets/:batchId/:programId/:semId"
          element={
            <ProtectedRoute roles={["admin"]}>
              <GradesheetAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="faculty/courses"
          element={
            <ProtectedRoute roles={["faculty"]}>
              <FacultyCoursesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="faculty/attendance/:courseId"
          element={
            <ProtectedRoute roles={["faculty"]}>
              <FacultyMarkAttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="faculty/attendance/:courseId/roster"
          element={
            <ProtectedRoute roles={["faculty"]}>
              <RosterAttendancePage role="faculty" />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/attendance/:courseId/roster"
          element={
            <ProtectedRoute roles={["admin"]}>
              <RosterAttendancePage role="admin" />
            </ProtectedRoute>
          }
        />
        <Route
          path="faculty/marks/:courseId"
          element={
            <ProtectedRoute roles={["faculty"]}>
              <FacultyMarksEntryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="faculty/marks/:courseId/roster"
          element={
            <ProtectedRoute roles={["faculty"]}>
              <RosterMarksPage role="faculty" />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/marks/:courseId/roster"
          element={
            <ProtectedRoute roles={["admin"]}>
              <RosterMarksPage role="admin" />
            </ProtectedRoute>
          }
        />
        <Route
          path="student/results"
          element={
            <ProtectedRoute roles={["student"]}>
              <StudentPlaceholder />
            </ProtectedRoute>
          }
        />
        <Route
          path="student/attendance"
          element={
            <ProtectedRoute roles={["student"]}>
              <StudentMyAttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="student/marks"
          element={
            <ProtectedRoute roles={["student"]}>
              <StudentMyMarksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="student/gradesheets/:batchId/:programId/:semId"
          element={
            <ProtectedRoute roles={["student"]}>
              <MyGradesheetPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}