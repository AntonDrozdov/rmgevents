import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PermissionCode } from "../types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: PermissionCode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
}) => {
  const { token, currentUser } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermission && currentUser && !currentUser.permissions.includes(requiredPermission)) {
    return (
      <main className="page-shell">
        <section className="empty-state">
          <h1>Доступ запрещён</h1>
          <p>У вашей роли нет права для открытия этой страницы.</p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
};
