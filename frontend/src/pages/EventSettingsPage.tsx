import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { RmgLogo } from "../components/RmgLogo";
import { UserMenu } from "../components/UserMenu";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { EventDetailDto } from "../types";

interface EventSettingsPageProps {
  children: React.ReactNode;
}

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  isActive ? "settings-tab active" : "settings-tab";

export const EventSettingsPage: React.FC<EventSettingsPageProps> = ({ children }) => {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { currentUser, currentEvent, events, selectEvent, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const [eventDetails, setEventDetails] = useState<EventDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((event) => String(event.id) === eventId) ?? null,
    [events, eventId]
  );

  const eventName = eventDetails?.name ?? selectedEvent?.name ?? "Мероприятие";
  const canOpenGroups = currentUser?.permissions.includes("create_group") ?? false;
  const canOpenUsers = currentUser?.permissions.includes("create_user") ?? false;

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  useEffect(() => {
    const loadEvent = async () => {
      if (!eventId) return;

      setLoading(true);
      setError("");

      try {
        if (selectedEvent && currentEvent?.id !== selectedEvent.id) {
          await selectEvent(selectedEvent);
        } else if (String(currentEvent?.id) === eventId) {
          await refreshProfile();
        }

        const details = await apiClient.getEvent(eventId);
        setEventDetails(details);
      } catch (err) {
        setError("Не удалось загрузить настройки мероприятия.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [eventId, selectedEvent?.id]);

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

        {error && <div className="alert alert-error">{error}</div>}
        {loading ? <div className="panel">Загрузка мероприятия...</div> : children}
      </section>
    </main>
  );
};
