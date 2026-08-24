import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import { CreateEventPage } from "./pages/CreateEventPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GroupsPage } from "./pages/GroupsPage";
import { GuestsPage } from "./pages/GuestsPage";
import { LoginPage } from "./pages/LoginPage";
import { UsersPage } from "./pages/UsersPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/create"
            element={
              <ProtectedRoute requiredPermission="create_event">
                <CreateEventPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId/guests"
            element={
              <ProtectedRoute>
                <GuestsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId/groups"
            element={
              <ProtectedRoute requiredPermission="create_group">
                <GroupsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId/users"
            element={
              <ProtectedRoute requiredPermission="create_user">
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
