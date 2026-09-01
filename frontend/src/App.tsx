import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import { DashboardPage } from "./pages/DashboardPage";
import { EventSettingsPage } from "./pages/EventSettingsPage";
import { GroupsPage } from "./pages/GroupsPage";
import { GuestsPage } from "./pages/GuestsPage";
import { LoginPage } from "./pages/LoginPage";
import { UsersPage } from "./pages/UsersPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { EventInformationPage } from "./pages/EventInformationPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
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
              <ProtectedRoute>
                <Navigate to="/dashboard" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId"
            element={<Navigate to="guests" replace />}
          />
          <Route
            path="/events/:eventId/guests"
            element={
              <ProtectedRoute>
                <EventSettingsPage>
                  <GuestsPage />
                </EventSettingsPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId/groups"
            element={
              <ProtectedRoute requiredPermission="create_group">
                <EventSettingsPage>
                  <GroupsPage />
                </EventSettingsPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId/users"
            element={
              <ProtectedRoute requiredPermission="create_user">
                <EventSettingsPage>
                  <UsersPage />
                </EventSettingsPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId/settings"
            element={
              <ProtectedRoute requiredPermission="create_event">
                <EventSettingsPage>
                  <EventInformationPage />
                </EventSettingsPage>
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
