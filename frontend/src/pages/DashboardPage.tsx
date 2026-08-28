import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { RmgLogo } from "../components/RmgLogo";
import { UserMenu } from "../components/UserMenu";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../services/apiClient";
import { EventOption } from "../types";

export const DashboardPage: React.FC = () => {
  const { addEvent, currentUser, events, selectEvent } = useAuth();
  const navigate = useNavigate();
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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
        description: description.trim() || undefined,
      });

      const eventOption = {
        id: createdEvent.id,
        name: createdEvent.name,
        roleName: currentUser?.roleName ?? "administrator",
      };

      addEvent(eventOption);
      setName("");
      setDescription("");
      setIsCreateModalOpen(false);
      await selectEvent(eventOption);
      navigate(`/events/${createdEvent.id}/guests`);
    } catch (err) {
      setError("Не удалось создать мероприятие.");
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
            <UserMenu />
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
                <UserMenu variant="inline" />
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
              <span className="event-tile-icon">🎟️</span>
              <strong>{event.name}</strong>
              <span>{event.roleName}</span>
            </button>
          ))}
        </section>
      )}

      {isCreateModalOpen && (
        <Modal
          title="Создать мероприятие"
          description="Заполните название и описание. После создания откроется вкладка гостей."
          onClose={closeCreateModal}
        >
          {error && <div className="alert alert-error">{error}</div>}

          <form className="form" onSubmit={handleCreateEvent}>
            <label className="field">
              <span>Название</span>
              <input value={name} onChange={(event) => setName(event.target.value)} disabled={loading} required />
            </label>
            <label className="field">
              <span>Описание</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={loading} rows={5} />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeCreateModal} disabled={loading}>
                Закрыть
              </button>
              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? "Создаём..." : "Создать"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
};
