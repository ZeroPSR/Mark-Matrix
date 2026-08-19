import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { type Role } from "@mark-matrix/shared";
import { useAuth } from "./AuthContext.js";

interface Props {
  roles?: readonly Role[];
  children: ReactNode;
}

export function ProtectedRoute({ roles, children }: Props): JSX.Element {
  const { userId, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!userId) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && (!role || !roles.includes(role))) {
    return <Navigate to="/forbidden" replace />;
  }
  return <>{children}</>;
}