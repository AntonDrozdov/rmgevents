import React from "react";
import { useAuth } from "../contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
}) => {
  const { token, currentUser } = useAuth();

  if (!token) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2>Доступ запрещен</h2>
        <p>Пожалуйста, войдите в систему</p>
      </div>
    );
  }

  if (requiredPermission && currentUser && !currentUser.permissions.includes(requiredPermission)) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2>Доступ запрещен</h2>
        <p>У вас недостаточно прав для доступа к этой странице</p>
      </div>
    );
  }

  return <>{children}</>;
};
