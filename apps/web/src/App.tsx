import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute.js";
import { AppShell } from "./shell/AppShell.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { ForbiddenPage } from "./pages/ForbiddenPage.js";
import { DashboardPlaceholder } from "./pages/DashboardPlaceholder.js";
import { UsersPlaceholder } from "./pages/admin/UsersPlaceholder.js";
import { FacultyPlaceholder } from "./pages/faculty/FacultyPlaceholder.js";
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
              <UsersPlaceholder />
            </ProtectedRoute>
          }
        />
        <Route
          path="faculty/courses"
          element={
            <ProtectedRoute roles={["faculty"]}>
              <FacultyPlaceholder />
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
