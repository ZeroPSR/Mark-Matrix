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
import { FacultyCoursesPage } from "./pages/faculty/FacultyCoursesPage.js";
import { StudentPlaceholder } from "./pages/student/StudentPlaceholder.js";

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
          path="faculty/courses"
          element={
            <ProtectedRoute roles={["faculty"]}>
              <FacultyCoursesPage />
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
      </Route>
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}