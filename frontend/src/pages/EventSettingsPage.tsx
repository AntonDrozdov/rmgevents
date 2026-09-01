import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { RmgLogo } from "../components/RmgLogo";
import { UserMenu } from "../components/UserMenu";
import { useAuth } from "../contexts/AuthContext";

interface EventSettingsPageProps {
  children: React.ReactNode;
}

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  isActive ? "settings-tab active" : "settings-tab";

export const EventSettingsPage: React.FC<EventSettingsPageProps> = ({ children }) => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentEvent, currentUser, events } = useAuth();
  const navigate = useNavigate();
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((event) => String(event.id) === eventId) ?? null,
    [events, eventId]
  );

  const eventName = selectedEvent?.name ?? currentEvent?.name ?? "Мероприятие";
  const canOpenGroups = currentUser?.permissions.includes("create_group") ?? false;
  const canOpenUsers = currentUser?.permissions.includes("create_user") ?? false;
  const canOpenSettings = currentUser?.permissions.includes("create_event") ?? false;

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  if (!eventId) {
    return <Navigate to="/dashboard" replace />;
  }

  const goToDashboard = () => {
    setIsMobileMenuOpen(false);
    navigate("/dashboard");
  };

  const renderTabs = () => (
    <nav className="settings-tabs" aria-label="Разделы мероприятия">
      <NavLink className={tabClassName} to={`/events/${eventId}/guests`} onClick={() => setIsMobileMenuOpen(false)}>
        Гости
      </NavLink>
      {canOpenGroups && (
        <NavLink className={tabClassName} to={`/events/${eventId}/groups`} onClick={() => setIsMobileMenuOpen(false)}>
          Группы
        </NavLink>
      )}
      {canOpenUsers && (
        <NavLink className={tabClassName} to={`/events/${eventId}/users`} onClick={() => setIsMobileMenuOpen(false)}>
          Сотрудники
        </NavLink>
      )}
      {canOpenSettings && (
        <NavLink className={tabClassName} to={`/events/${eventId}/settings`} onClick={() => setIsMobileMenuOpen(false)}>
          Настройки
        </NavLink>
      )}
    </nav>
  );

  return (
    <main className="settings-page">
      <aside className="settings-sidebar">
        <RmgLogo />
        {renderTabs()}
      </aside>

      <section className="settings-content">
        <header className="page-header settings-mobile-header">
          <div className="settings-title-block">
            <div className="settings-mobile-brand">
              <RmgLogo />
            </div>
            <button className="settings-dashboard-button" type="button" onClick={goToDashboard}>
              ← Дашборд
            </button>
            <h2>{eventName}</h2>
          </div>

          <div className="settings-header-actions">
            <div className="settings-desktop-user">
              <UserMenu />
            </div>

            <div className="settings-mobile-menu" ref={mobileMenuRef}>
              <button
                className="mobile-menu-button"
                type="button"
                onClick={() => setIsMobileMenuOpen((value) => !value)}
                aria-expanded={isMobileMenuOpen}
                aria-label="Открыть меню"
              >
                <span />
                <span />
                <span />
              </button>

              {isMobileMenuOpen && (
                <div className="mobile-menu-panel">
                  <UserMenu variant="inline" />
                  <div className="mobile-menu-separator" />
                  {renderTabs()}
                </div>
              )}
            </div>
          </div>
        </header>

        {children}
      </section>
    </main>
  );
};
