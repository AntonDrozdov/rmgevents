import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { RmgLogo } from "../components/RmgLogo";
import { UserMenu } from "../components/UserMenu";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { EventOption } from "../types";

const getTodayInputValue = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  return new Date(today.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const formatEventDate = (value?: string) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value.slice(0, 10)}T00:00:00`));
};

const formatCreatedAt = (value?: string) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value));
};

export const DashboardPage: React.FC = () => {
  const { addEvent, currentUser, events, selectEvent } = useAuth();
  const navigate = useNavigate();
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(getTodayInputValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canCreateEvent = currentUser?.permissions.includes("create_event") ?? false;

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  const openEvent = async (event: EventOption) => {
    await selectEvent(event);
    navigate(`/events/${event.id}/guests`);
  };

  const closeCreateModal = () => {
    if (loading) return;
    setIsCreateModalOpen(false);
    setError("");
  };

  const handleCreateEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const createdEvent = await apiClient.createEvent({
        name: name.trim(),
        eventDate,
      });

      const eventOption = {
        id: createdEvent.id,
        name: createdEvent.name,
        roleName: "Administrator",
        eventDate: createdEvent.eventDate,
        createdAt: createdEvent.createdAt,
        createdByName: createdEvent.createdByName,
        logoImageId: createdEvent.logoImageId,
      };

      addEvent(eventOption);
      setName("");
      setEventDate(getTodayInputValue());
      setIsCreateModalOpen(false);
      await selectEvent(eventOption);
      navigate(`/events/${createdEvent.id}/guests`);
    } catch (err) {
      const responseData = axios.isAxiosError(err) ? err.response?.data : null;
      const serverMessage =
        typeof responseData === "string"
          ? responseData
          : responseData && typeof responseData.message === "string"
            ? responseData.message
            : null;
      setError(serverMessage ?? "Не удалось создать мероприятие.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="dashboard-page">
      <header className="dashboard-header dashboard-mobile-header">
        <div className="dashboard-title-block">
          <div className="dashboard-mobile-brand">
            <RmgLogo />
          </div>
        </div>

        <div className="dashboard-header-actions">
          <div className="dashboard-desktop-user">
            <UserMenu showRole={false} />
          </div>

          <div className="dashboard-mobile-menu" ref={mobileMenuRef}>
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
                <UserMenu variant="inline" showRole={false} />
              </div>
            )}
          </div>
        </div>
      </header>

      {canCreateEvent && (
        <div className="dashboard-create-row">
          <button className="primary-button create-action-button dashboard-create-button" onClick={() => setIsCreateModalOpen(true)}>
            Создать мероприятие
          </button>
        </div>
      )}

      {events.length === 0 ? (
        <section className="empty-state">
          <h2>Нет доступных мероприятий</h2>
          <p>
            После входа система должна вернуть список мероприятий, в которых у пользователя есть роль.
          </p>
        </section>
      ) : (
        <section className="events-grid" aria-label="Список мероприятий">
          {events.map((event) => (
            <button className="event-tile" key={event.id} onClick={() => openEvent(event)}>
              {event.logoImageId ? (
                <img
                  className="event-tile-cover"
                  src={apiClient.getImageUrl(event.logoImageId)}
                  alt=""
                />
              ) : (
                <span className="event-tile-icon">🎟️</span>
              )}
              <strong>{event.name}</strong>
              <span className="event-tile-role">{event.roleName}</span>
              <div className="event-tile-details">
                <span>
                  <small>Дата мероприятия</small>
                  <b>{formatEventDate(event.eventDate)}</b>
                </span>
                <span>
                  <small>Создано</small>
                  <b>{formatCreatedAt(event.createdAt)}</b>
                </span>
                <span>
                  <small>Создатель</small>
                  <b>{event.createdByName || "—"}</b>
                </span>
              </div>
            </button>
          ))}
        </section>
      )}

      {isCreateModalOpen && (
        <Modal
          title="Создать мероприятие"
          description="Укажите название и дату. После создания откроется вкладка гостей."
          onClose={closeCreateModal}
          className="employee-form-modal"
        >
          {error && <div className="alert alert-error">{error}</div>}

          <form className="form employee-form" onSubmit={handleCreateEvent}>
            <label className="field">
              <span>Название *</span>
              <input value={name} onChange={(event) => setName(event.target.value)} disabled={loading} required />
            </label>
            <label className="field">
              <span>Дата мероприятия *</span>
              <input
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
                disabled={loading}
                required
              />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeCreateModal} disabled={loading}>
                Закрыть
              </button>
              <button className="primary-button" type="submit" disabled={loading || !name.trim() || !eventDate}>
                {loading ? "Создаём..." : "Создать"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
};
